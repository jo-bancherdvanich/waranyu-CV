/* WeatherWise — live browser demo
 *
 * A JavaScript port of the WeatherWise notebook's forecast logic, so visitors
 * can try it without installing Python or signing up for anything.
 *
 * Weather comes from Open-Meteo, which needs no API key. The advice thresholds
 * and the question parser mirror the notebook exactly:
 *   get_temperature_advice()   -> temperatureAdvice()
 *   parse_weather_question()   -> parseQuestion()
 *   answer_from_rules()        -> answerFromRules()
 */
(function () {
  "use strict";

  var root = document.getElementById("ww-demo");
  if (!root) return;

  var GEO = "https://geocoding-api.open-meteo.com/v1/search";
  var FORECAST = "https://api.open-meteo.com/v1/forecast";

  // WMO weather codes -> plain English. Open-Meteo returns these numerically.
  var CODES = {
    0: "clear sky", 1: "mainly clear", 2: "partly cloudy", 3: "overcast",
    45: "fog", 48: "rime fog", 51: "light drizzle", 53: "drizzle",
    55: "heavy drizzle", 56: "freezing drizzle", 57: "freezing drizzle",
    61: "light rain", 63: "rain", 65: "heavy rain",
    66: "freezing rain", 67: "freezing rain",
    71: "light snow", 73: "snow", 75: "heavy snow", 77: "snow grains",
    80: "light showers", 81: "showers", 82: "violent showers",
    85: "snow showers", 86: "heavy snow showers",
    95: "thunderstorm", 96: "thunderstorm with hail", 99: "thunderstorm with hail"
  };
  var describe = function (c) { return CODES[c] || "unsettled"; };

  /* ---- the notebook's advice thresholds, unchanged ---------------------- */
  function temperatureAdvice(avg) {
    if (avg > 32) return "🔥 It's scorching. Best to stay indoors and keep cool.";
    if (avg >= 27) return "☀️ Quite warm. Light clothing and sunscreen are your friends.";
    if (avg >= 23) return "👍 Perfect weather. Enjoy your time outside!";
    if (avg >= 17) return "🧣 A bit chilly. Take a warm layer if you're heading out.";
    return "🥶 Cold out. Stay cosy and keep warm.";
  }

  /* ---- question parsing, mirroring parse_weather_question() ------------- */
  function parseQuestion(q) {
    var lower = q.toLowerCase();
    var parsed = { question: q, timePeriod: null, attribute: null, location: null };

    if (lower.indexOf("today") !== -1) parsed.timePeriod = "today";
    else if (lower.indexOf("tomorrow") !== -1) parsed.timePeriod = "tomorrow";
    else {
      var m = lower.match(/next\s+(\d+)\s+days?/);
      if (m) parsed.timePeriod = "next " + m[1] + " days";
    }

    // Most specific attribute wins, rather than last-match-wins.
    if (/rain|wet|umbrella|precipitation|shower/.test(lower)) parsed.attribute = "precipitation";
    else if (/wind|windy|gust/.test(lower)) parsed.attribute = "wind";
    else if (/temperature|hot|cold|warm|cool|degrees/.test(lower)) parsed.attribute = "temperature";

    // "in Perth" / "at Perth" / "for Perth"
    var loc = q.match(/\b(?:in|at|for)\s+([A-Z][a-zA-Z]+(?:[\s-][A-Z][a-zA-Z]+)*)/);
    if (loc) parsed.location = loc[1];

    return parsed;
  }

  /* ---- rule-based answering, mirroring answer_from_rules() -------------- */
  function answerFromRules(parsed, days, place) {
    if (!days || !days.length) return "Fetch a forecast first and I'll answer from it.";

    var idx = 0, when = "today";
    if (parsed.timePeriod === "tomorrow" && days.length > 1) { idx = 1; when = "tomorrow"; }

    var span = days;
    if (parsed.timePeriod && parsed.timePeriod.indexOf("next") === 0) {
      var n = parseInt(parsed.timePeriod.split(" ")[1], 10) || days.length;
      span = days.slice(0, Math.min(n, days.length));
      when = "over the next " + span.length + " days";
    } else {
      span = [days[idx]];
    }

    var avg = span.reduce(function (s, d) { return s + (d.tMax + d.tMin) / 2; }, 0) / span.length;
    var lo = Math.min.apply(null, span.map(function (d) { return d.tMin; }));
    var hi = Math.max.apply(null, span.map(function (d) { return d.tMax; }));
    var rain = span.reduce(function (s, d) { return s + d.rain; }, 0);
    var wind = Math.max.apply(null, span.map(function (d) { return d.wind; }));

    var lead;
    if (parsed.attribute === "precipitation") {
      if (rain > 5) lead = "Yes — about " + rain.toFixed(1) + " mm of rain is forecast for " + place + " " + when + ". Take a raincoat.";
      else if (rain > 0.5) lead = "Possibly — around " + rain.toFixed(1) + " mm of light rain for " + place + " " + when + ".";
      else lead = "No — no meaningful rain forecast for " + place + " " + when + ".";
    } else if (parsed.attribute === "wind") {
      lead = "Winds in " + place + " " + when + " peak around " + wind.toFixed(1) + " km/h.";
    } else if (parsed.attribute === "temperature") {
      lead = "In " + place + " " + when + ", expect around " + avg.toFixed(1) + "°C (low " + lo.toFixed(1) + "°, high " + hi.toFixed(1) + "°).";
    } else {
      lead = "In " + place + " " + when + ": " + span[0].desc + ", averaging " + avg.toFixed(1) +
        "°C (low " + lo.toFixed(1) + "°, high " + hi.toFixed(1) + "°), " + rain.toFixed(1) +
        " mm of rain, wind up to " + wind.toFixed(1) + " km/h.";
    }
    return lead + "\n" + temperatureAdvice(avg);
  }

  /* ---- tiny SVG charts, so there is no library to load ------------------ */
  function lineChart(days) {
    var W = 560, H = 170, PL = 38, PR = 12, PT = 14, PB = 30;
    var maxV = Math.max.apply(null, days.map(function (d) { return d.tMax; }));
    var minV = Math.min.apply(null, days.map(function (d) { return d.tMin; }));
    var pad = Math.max(1, (maxV - minV) * 0.15);
    maxV += pad; minV -= pad;
    var x = function (i) { return PL + i * (W - PL - PR) / Math.max(1, days.length - 1); };
    var y = function (v) { return PT + (maxV - v) * (H - PT - PB) / (maxV - minV); };

    var hi = days.map(function (d, i) { return x(i) + "," + y(d.tMax); }).join(" ");
    var lo = days.map(function (d, i) { return x(i) + "," + y(d.tMin); }).join(" ");
    var band = hi + " " + days.map(function (d, i) { return x(days.length - 1 - i) + "," + y(days[days.length - 1 - i].tMin); }).join(" ");

    var grid = "", ticks = 4;
    for (var g = 0; g <= ticks; g++) {
      var v = minV + (maxV - minV) * g / ticks;
      grid += '<line x1="' + PL + '" y1="' + y(v) + '" x2="' + (W - PR) + '" y2="' + y(v) + '" class="ww-grid"/>' +
        '<text x="' + (PL - 7) + '" y="' + (y(v) + 4) + '" class="ww-axis" text-anchor="end">' + v.toFixed(0) + '°</text>';
    }
    var labels = days.map(function (d, i) {
      return '<text x="' + x(i) + '" y="' + (H - 9) + '" class="ww-axis" text-anchor="middle">' + d.label + '</text>';
    }).join("");
    var dots = days.map(function (d, i) {
      return '<circle cx="' + x(i) + '" cy="' + y(d.tMax) + '" r="3.5" class="ww-dot"/>';
    }).join("");

    return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Five day temperature forecast">' +
      grid + '<polygon points="' + band + '" class="ww-band"/>' +
      '<polyline points="' + lo + '" class="ww-line ww-line-min"/>' +
      '<polyline points="' + hi + '" class="ww-line"/>' + dots + labels + '</svg>';
  }

  function barChart(days) {
    var W = 560, H = 150, PL = 38, PR = 12, PT = 14, PB = 30;
    var maxV = Math.max(1, Math.max.apply(null, days.map(function (d) { return d.rain; })));
    var bw = (W - PL - PR) / days.length * 0.55;
    var x = function (i) { return PL + (i + 0.5) * (W - PL - PR) / days.length; };
    var y = function (v) { return PT + (maxV - v) * (H - PT - PB) / maxV; };

    var grid = "", ticks = 3;
    for (var g = 0; g <= ticks; g++) {
      var v = maxV * g / ticks;
      grid += '<line x1="' + PL + '" y1="' + y(v) + '" x2="' + (W - PR) + '" y2="' + y(v) + '" class="ww-grid"/>' +
        '<text x="' + (PL - 7) + '" y="' + (y(v) + 4) + '" class="ww-axis" text-anchor="end">' + v.toFixed(0) + '</text>';
    }
    var bars = days.map(function (d, i) {
      var h = Math.max(0, y(0) - y(d.rain));
      return '<rect x="' + (x(i) - bw / 2) + '" y="' + y(d.rain) + '" width="' + bw + '" height="' + h + '" class="ww-bar"/>' +
        (d.rain > 0 ? '<text x="' + x(i) + '" y="' + (y(d.rain) - 5) + '" class="ww-axis" text-anchor="middle">' + d.rain.toFixed(1) + '</text>' : "");
    }).join("");
    var labels = days.map(function (d, i) {
      return '<text x="' + x(i) + '" y="' + (H - 9) + '" class="ww-axis" text-anchor="middle">' + d.label + '</text>';
    }).join("");

    return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Five day rainfall forecast">' +
      grid + bars + labels + '</svg>';
  }

  /* ---- wiring ----------------------------------------------------------- */
  var els = {
    form: root.querySelector(".ww-search"),
    input: root.querySelector(".ww-city"),
    status: root.querySelector(".ww-status"),
    panel: root.querySelector(".ww-panel"),
    place: root.querySelector(".ww-place"),
    temp: root.querySelector(".ww-temp"),
    desc: root.querySelector(".ww-desc"),
    high: root.querySelector(".ww-high"),
    low: root.querySelector(".ww-low"),
    humidity: root.querySelector(".ww-humidity"),
    wind: root.querySelector(".ww-wind"),
    legend: root.querySelector(".ww-legend"),
    advice: root.querySelector(".ww-advice"),
    tabs: root.querySelectorAll(".ww-tab"),
    chart: root.querySelector(".ww-chart"),
    qform: root.querySelector(".ww-qform"),
    qinput: root.querySelector(".ww-question"),
    answer: root.querySelector(".ww-answer"),
    chips: root.querySelectorAll(".ww-chip")
  };

  var state = { days: [], current: null, place: "", view: "temp" };

  function setStatus(msg, isError) {
    els.status.textContent = msg || "";
    els.status.className = "ww-status" + (isError ? " is-error" : "");
  }

  function renderChart() {
    if (!state.days.length) return;
    els.chart.innerHTML = state.view === "temp" ? lineChart(state.days) : barChart(state.days);
    els.legend.innerHTML = state.view === "temp"
      ? "<span>Daily high</span><span class=\"is-min\">Daily low</span>"
      : "<span>Rainfall (mm)</span>";

    if (window.attachChartHover && state.view === "temp") {
      // Same geometry as lineChart() so the crosshair lands on the drawn points.
      var W = 560, H = 170, PL = 38, PR = 12, PT = 14, PB = 30;
      var d = state.days;
      var maxV = Math.max.apply(null, d.map(function (v) { return v.tMax; }));
      var minV = Math.min.apply(null, d.map(function (v) { return v.tMin; }));
      var pad = Math.max(1, (maxV - minV) * 0.15);
      maxV += pad; minV -= pad;
      window.attachChartHover(els.chart, {
        top: PT,
        bottom: H - PB,
        points: d.map(function (v, i) {
          return {
            x: PL + i * (W - PL - PR) / Math.max(1, d.length - 1),
            y: PT + (maxV - v.tMax) * (H - PT - PB) / (maxV - minV),
            label: v.label,
            value: v.tMin.toFixed(1) + "° to " + v.tMax.toFixed(1) + "°"
          };
        })
      });
    }
    els.tabs.forEach(function (t) {
      var on = t.dataset.view === state.view;
      t.classList.toggle("is-active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
  }

  function render() {
    var d = state.days[0];
    var c = state.current;
    var nowTemp = c && typeof c.temp === "number" ? c.temp : (d.tMax + d.tMin) / 2;

    els.place.textContent = state.place;
    els.temp.textContent = Math.round(nowTemp) + "°C";
    els.desc.textContent = (c && c.desc) || d.desc;
    els.high.textContent = d.tMax.toFixed(1) + "°";
    els.low.textContent = d.tMin.toFixed(1) + "°";
    els.humidity.textContent = c && typeof c.humidity === "number" ? Math.round(c.humidity) + "%" : "—";
    els.wind.textContent =
      "Wind " + ((c && typeof c.wind === "number" ? c.wind : d.wind).toFixed(0)) +
      " km/h · rain today " + d.rain.toFixed(1) + " mm";

    els.advice.textContent = temperatureAdvice(nowTemp);
    els.panel.hidden = false;
    renderChart();
  }

  function load(name) {
    setStatus("Looking up " + name + "…");
    fetch(GEO + "?name=" + encodeURIComponent(name) + "&count=1")
      .then(function (r) { return r.json(); })
      .then(function (g) {
        if (!g.results || !g.results.length) throw new Error("I couldn't find a place called “" + name + "”. Try a city name, like Perth or Bangkok.");
        var p = g.results[0];
        state.place = p.name + (p.country ? ", " + p.country : "");
        setStatus("Fetching the forecast for " + state.place + "…");
        return fetch(FORECAST + "?latitude=" + p.latitude + "&longitude=" + p.longitude +
          "&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,weather_code" +
          "&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code" +
          "&timezone=auto&forecast_days=5");
      })
      .then(function (r) { return r.json(); })
      .then(function (f) {
        if (!f.daily || !f.daily.time) throw new Error("The weather service returned no forecast. Try again in a moment.");
        state.current = f.current ? {
          temp: f.current.temperature_2m,
          humidity: f.current.relative_humidity_2m,
          wind: f.current.wind_speed_10m,
          desc: describe(f.current.weather_code)
        } : null;
        state.days = f.daily.time.map(function (t, i) {
          return {
            date: t,
            label: i === 0 ? "Today" : new Date(t + "T00:00:00").toLocaleDateString(undefined, { weekday: "short" }),
            tMax: f.daily.temperature_2m_max[i],
            tMin: f.daily.temperature_2m_min[i],
            rain: f.daily.precipitation_sum[i] || 0,
            wind: f.daily.wind_speed_10m_max[i] || 0,
            desc: describe(f.daily.weather_code[i])
          };
        });
        setStatus("");
        render();
        els.answer.hidden = true;
      })
      .catch(function (e) {
        setStatus(e.message || "Something went wrong fetching the weather.", true);
      });
  }

  els.form.addEventListener("submit", function (e) {
    e.preventDefault();
    var v = els.input.value.trim();
    if (v) load(v);
  });

  els.chips.forEach(function (c) {
    c.addEventListener("click", function () {
      els.input.value = c.textContent;
      load(c.textContent);
    });
  });

  els.tabs.forEach(function (t) {
    t.addEventListener("click", function () { state.view = t.dataset.view; renderChart(); });
  });

  els.qform.addEventListener("submit", function (e) {
    e.preventDefault();
    var q = els.qinput.value.trim();
    if (!q) return;
    if (!state.days.length) {
      els.answer.textContent = "Search for a city first, then ask.";
      els.answer.hidden = false;
      return;
    }
    var parsed = parseQuestion(q);
    if (parsed.location && parsed.location.toLowerCase() !== state.place.split(",")[0].toLowerCase()) {
      els.qinput.value = q;
      load(parsed.location);
      setTimeout(function () {
        els.answer.textContent = answerFromRules(parsed, state.days, state.place);
        els.answer.hidden = false;
      }, 1200);
      return;
    }
    els.answer.textContent = answerFromRules(parsed, state.days, state.place);
    els.answer.hidden = false;
  });

  // Start on something, so the demo is never an empty box.
  load("Perth");
})();
