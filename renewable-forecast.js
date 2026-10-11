(function () {
  "use strict";

  var root = document.getElementById("rf-widget");
  if (!root) return;

  var DATA = [
    { y: 2005, twh: 20.405, share: 8.924 },
    { y: 2006, twh: 21.744, share: 9.339 },
    { y: 2007, twh: 21.186, share: 8.713 },
    { y: 2008, twh: 19.869, share: 8.169 },
    { y: 2009, twh: 18.645, share: 7.643 },
    { y: 2010, twh: 21.803, share: 8.746 },
    { y: 2011, twh: 26.524, share: 10.573 },
    { y: 2012, twh: 26.656, share: 10.677 },
    { y: 2013, twh: 33.199, share: 13.4 },
    { y: 2014, twh: 36.589, share: 14.692 },
    { y: 2015, twh: 34.036, share: 13.485 },
    { y: 2016, twh: 38.146, share: 14.818 },
    { y: 2017, twh: 40.455, share: 15.679 },
    { y: 2018, twh: 44.643, share: 17.101 },
    { y: 2019, twh: 52.024, share: 19.704 },
    { y: 2020, twh: 59.93, share: 22.6 },
    { y: 2021, twh: 70.798, share: 26.661 },
    { y: 2022, twh: 83.996, share: 30.934 },
    { y: 2023, twh: 92.589, share: 33.798 },
    { y: 2024, twh: 97.854, share: 34.984 }
  ];

  var T975_DF18 = 2.100922;
  var HORIZON = 2035;

  function fit(key) {
    var n = DATA.length;
    var xs = DATA.map(function (d) { return d.y - 2005; });
    var ys = DATA.map(function (d) { return d[key]; });
    var mx = 0, my = 0, i;
    for (i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; }
    mx /= n; my /= n;
    var sxx = 0, sxy = 0, syy = 0;
    for (i = 0; i < n; i++) {
      sxx += (xs[i] - mx) * (xs[i] - mx);
      sxy += (xs[i] - mx) * (ys[i] - my);
      syy += (ys[i] - my) * (ys[i] - my);
    }
    var slope = sxy / sxx;
    var intercept = my - slope * mx;
    var r2 = (sxy * sxy) / (sxx * syy);
    var s2 = (syy - slope * sxy) / (n - 2);
    var tStat = slope / Math.sqrt(s2 / sxx);
    var predict = function (year) { return intercept + slope * (year - 2005); };
    var interval = function (year) {
      var x = year - 2005;
      return T975_DF18 * Math.sqrt(s2 * (1 + 1 / n + (x - mx) * (x - mx) / sxx));
    };
    return { slope: slope, intercept: intercept, r2: r2, tStat: tStat, predict: predict, interval: interval };
  }

  var MODES = {
    share: { label: "Renewable share %", unit: "%", target: 82, fmt: function (v) { return v.toFixed(1) + "%"; } },
    twh: { label: "Generation TWh", unit: "TWh", target: null, fmt: function (v) { return v.toFixed(1) + " TWh"; } }
  };

  function draw(key) {
    var m = MODES[key];
    var f = fit(key);
    var W = 560, H = 240, PL = 44, PR = 66, PT = 16, PB = 28;

    var upper2035 = f.predict(HORIZON) + f.interval(HORIZON);
    var maxV = Math.max(upper2035, m.target || 0) * 1.06;
    var minV = 0;
    var x = function (yr) { return PL + (yr - 2005) * (W - PL - PR) / (HORIZON - 2005); };
    var yy = function (v) { return PT + (maxV - v) * (H - PT - PB) / (maxV - minV); };

    var grid = "", g;
    var step = maxV > 100 ? 40 : 20;
    for (g = 0; g <= maxV; g += step) {
      grid += '<line x1="' + PL + '" y1="' + yy(g) + '" x2="' + (W - PR) + '" y2="' + yy(g) + '" class="rf-grid"/>' +
        '<text x="' + (PL - 7) + '" y="' + (yy(g) + 4) + '" class="rf-axis" text-anchor="end">' + g + '</text>';
    }
    var labels = "";
    [2005, 2010, 2015, 2020, 2024, 2030, 2035].forEach(function (yr) {
      labels += '<text x="' + x(yr) + '" y="' + (H - 8) + '" class="rf-axis" text-anchor="middle">' + yr + '</text>';
    });

    var bandTop = "", bandBot = [];
    for (g = 2005; g <= HORIZON; g++) {
      bandTop += x(g) + "," + yy(f.predict(g) + f.interval(g)) + " ";
      bandBot.unshift(x(g) + "," + yy(Math.max(0, f.predict(g) - f.interval(g))));
    }
    var band = '<polygon points="' + bandTop + bandBot.join(" ") + '" class="rf-band"/>';

    var line = '<line x1="' + x(2005) + '" y1="' + yy(f.predict(2005)) + '" x2="' + x(HORIZON) + '" y2="' + yy(f.predict(HORIZON)) + '" class="rf-fit"/>';

    var dots = DATA.map(function (d) {
      return '<circle cx="' + x(d.y) + '" cy="' + yy(d[key]) + '" r="3.2" class="rf-dot"/>';
    }).join("");

    var target = "";
    if (m.target) {
      target = '<line x1="' + PL + '" y1="' + yy(m.target) + '" x2="' + (W - PR) + '" y2="' + yy(m.target) + '" class="rf-target"/>' +
        '<text x="' + (W - PR - 4) + '" y="' + (yy(m.target) - 5) + '" class="rf-target-label" text-anchor="end">82% target (2030)</text>';
    }

    var p35 = f.predict(HORIZON);
    var proj = '<circle cx="' + x(HORIZON) + '" cy="' + yy(p35) + '" r="4.5" class="rf-proj"/>' +
      '<text x="' + (x(HORIZON) + 8) + '" y="' + (yy(p35) + 4) + '" class="rf-proj-label">' + m.fmt(p35) + '</text>';

    var rfHost = root.querySelector(".rf-chart");
    rfHost.innerHTML =
      '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Linear forecast of Australian renewable electricity to 2035">' +
      grid + band + target + line + dots + proj + labels + "</svg>";

    if (window.attachChartHover) {
      window.attachChartHover(rfHost, {
        top: PT,
        bottom: H - PB,
        points: DATA.map(function (d) {
          return { x: x(d.y), y: yy(d[key]), label: d.y, value: m.fmt(d[key]) };
        })
      });
    }

    var eq = "y = " + f.slope.toFixed(2) + "x + " + f.intercept.toFixed(2);
    var p = f.tStat > 3.92 ? "p < 0.001" : "p = n.s.";
    root.querySelector(".rf-stats").textContent =
      eq + "   ·   R² = " + f.r2.toFixed(3) + "   ·   " + p + "   ·   n = 20   ·   2035 → " + m.fmt(p35);

    root.querySelectorAll(".rf-tab").forEach(function (t) {
      var on = t.dataset.mode === key;
      t.classList.toggle("is-active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
  }

  root.querySelectorAll(".rf-tab").forEach(function (t) {
    t.addEventListener("click", function () { draw(t.dataset.mode); });
  });

  draw("share");
})();
