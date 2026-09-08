/* Australia's renewable transition — the Power BI report, rebuilt as a live
 * dashboard.
 *
 * Every figure is computed in the browser from the cleaned galaxy-schema
 * workbook in the repository: 480 generation facts across four countries and
 * fourteen sources, plus total generation for the share calculation. The
 * headline numbers reconcile with the published dashboard exactly:
 * Australia 34.98% renewable share in 2024, 97.9 TWh, solar 48.6 TWh.
 */
(function () {
  "use strict";

  var root = document.getElementById("re-dash");
  if (!root || !window.RENEWABLE_ROWS) return;
  var R = window.RENEWABLE_ROWS;

  var nums = function (s) { return s.split(",").map(Number); };
  var fC = nums(R.cols.c), fY = nums(R.cols.y), fS = nums(R.cols.s), fG = nums(R.cols.g);
  var N = fC.length;

  var countryNames = R.countries.map(function (c) { return c.n; });
  var LATEST = R.years.length - 1;
  var TARGET = { share: 82, year: 2030 };

  var state = { country: "Australia", period: null, group: null };

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  }
  var twh = function (gwh) {
    if (gwh > 0 && gwh < 50) return "<0.1";
    return (gwh / 1000).toFixed(1);
  };
  var pct = function (v) { return v.toFixed(1) + "%"; };

  /* ---- aggregation ---------------------------------------------------- */
  function compute() {
    var ci = countryNames.indexOf(state.country);
    var yearsOn = R.years.map(function (y, i) {
      return !state.period || R.yearPeriod[i] === state.period;
    });

    var a = {
      byYear: R.years.map(function () { return 0; }),      // selected country, filtered sources
      bySource: {}, byGroup: {},
      byCountryLatest: {}, shareByCountry: {},
      firstIdx: yearsOn.indexOf(true),
      lastIdx: yearsOn.lastIndexOf(true)
    };
    R.sources.forEach(function (s, i) {
      if (!state.group || R.sourceGroup[i] === state.group) a.bySource[s] = 0;
    });
    R.groups.forEach(function (g) { a.byGroup[g] = 0; });
    countryNames.forEach(function (c) { a.byCountryLatest[c] = 0; });

    for (var i = 0; i < N; i++) {
      var yIdx = fY[i], sIdx = fS[i], grp = R.sourceGroup[sIdx];
      if (!yearsOn[yIdx]) continue;
      if (state.group && grp !== state.group) continue;

      if (yIdx === a.lastIdx) a.byCountryLatest[countryNames[fC[i]]] += fG[i];
      if (fC[i] !== ci) continue;

      a.byYear[yIdx] += fG[i];
      if (a.bySource[R.sources[sIdx]] !== undefined) a.bySource[R.sources[sIdx]] += fG[i];
      a.byGroup[grp] += fG[i];
    }

    /* share of total generation, per year, for the selected country */
    a.shareByYear = R.years.map(function (y, i) {
      var tot = R.totals[ci][i];
      return tot ? (a.byYear[i] / tot) * 100 : 0;
    });
    countryNames.forEach(function (c, idx) {
      var tot = R.totals[idx][a.lastIdx];
      a.shareByCountry[c] = tot ? (a.byCountryLatest[c] / tot) * 100 : 0;
    });

    a.latestRenewable = a.byYear[a.lastIdx];
    a.latestTotal = R.totals[ci][a.lastIdx];
    a.latestShare = a.shareByYear[a.lastIdx];
    a.firstShare = a.shareByYear[a.firstIdx];
    return a;
  }

  /* ---- charts ---------------------------------------------------------- */
  function bars(obj, opts) {
    opts = opts || {};
    var keys = Object.keys(obj).filter(function (k) { return opts.keepZero || obj[k] > 0; });
    if (opts.sort) keys.sort(function (x, y) { return obj[y] - obj[x]; });
    if (opts.top) keys = keys.slice(0, opts.top);
    var max = Math.max.apply(null, keys.map(function (k) { return obj[k]; })) || 1;
    if (!keys.length) return '<p class="dash-empty">Nothing in this selection.</p>';
    return '<div class="dash-bars">' + keys.map(function (k) {
      var on = opts.dim && state[opts.dim] === k;
      var dimmed = opts.dim && state[opts.dim] && !on;
      return '<button type="button" class="dash-row' + (opts.dim ? " is-clickable" : "") +
        (on ? " is-picked" : "") + (dimmed ? " is-dimmed" : "") + '"' +
        (opts.dim ? ' data-dim="' + opts.dim + '" data-key="' + esc(k) + '"' : " disabled") +
        '><span class="dash-key">' + esc(k) + '</span>' +
        '<span class="dash-track"><span class="dash-fill is-grown" style="width:' +
        ((obj[k] / max) * 100).toFixed(1) + '%"></span></span>' +
        '<span class="dash-val">' + opts.fmt(obj[k]) + '</span></button>';
    }).join("") + '</div>';
  }

  function shareLine(vals, a) {
    var W = 640, H = 250, PL = 40, PR = 10, PT = 16, PB = 26;
    var idx = [];
    R.years.forEach(function (y, i) { if (i >= a.firstIdx && i <= a.lastIdx) idx.push(i); });
    var showTarget = state.country === "Australia" && !state.group;
    var max = Math.max(Math.max.apply(null, idx.map(function (i) { return vals[i]; })),
                       showTarget ? TARGET.share : 0) * 1.08 || 1;
    var x = function (k) { return PL + (k / (idx.length - 1)) * (W - PL - PR); };
    var y = function (v) { return PT + (1 - v / max) * (H - PT - PB); };
    var pts = idx.map(function (i, k) { return x(k).toFixed(1) + " " + y(vals[i]).toFixed(1); });
    var area = "M " + x(0).toFixed(1) + " " + (H - PB) + " L " + pts.join(" L ") +
               " L " + x(idx.length - 1).toFixed(1) + " " + (H - PB) + " Z";
    var grid = "";
    [0, max / 2, max].forEach(function (t) {
      var yy = y(t).toFixed(1);
      grid += '<line x1="' + PL + '" y1="' + yy + '" x2="' + (W - PR) + '" y2="' + yy + '" class="dash-grid"/>' +
              '<text x="' + (PL - 6) + '" y="' + (+yy + 3.5) + '" class="dash-axis" text-anchor="end">' +
              t.toFixed(0) + '%</text>';
    });
    var target = "";
    if (showTarget) {
      var ty = y(TARGET.share).toFixed(1);
      target = '<line x1="' + PL + '" y1="' + ty + '" x2="' + (W - PR) + '" y2="' + ty + '" class="dash-target"/>' +
               '<text x="' + (W - PR) + '" y="' + (+ty - 5) + '" class="dash-axis dash-targetlab" text-anchor="end">' +
               TARGET.share + '% target (' + TARGET.year + ')</text>';
    }
    var xlab = "";
    [0, Math.floor((idx.length - 1) / 2), idx.length - 1].forEach(function (k) {
      xlab += '<text x="' + x(k).toFixed(1) + '" y="' + (H - 8) + '" class="dash-axis" text-anchor="middle">' +
              R.years[idx[k]] + '</text>';
    });
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="dash-svg" role="img" aria-label="Renewable share over time">' +
      grid + target + '<path d="' + area + '" class="dash-area"/>' +
      '<polyline points="' + pts.join(" ") + '" class="dash-line"/>' + xlab + '</svg>';
  }

  function yearColumns(a) {
    var idx = [];
    R.years.forEach(function (y, i) { if (i >= a.firstIdx && i <= a.lastIdx) idx.push(i); });
    var max = Math.max.apply(null, idx.map(function (i) { return a.byYear[i]; })) || 1;
    return '<div class="dash-cols" style="grid-template-columns:repeat(' + idx.length + ',minmax(0,1fr))">' +
      idx.map(function (i) {
        return '<div class="dash-col" title="' + R.years[i] + ": " + twh(a.byYear[i]) + ' TWh">' +
          '<span class="dash-colbar" style="height:' + ((a.byYear[i] / max) * 100).toFixed(1) + '%"></span>' +
          '<span class="dash-collab">' + String(R.years[i]).slice(2) + '</span></div>';
      }).join("") + '</div>';
  }

  function slicer(dim, label, values, allLabel) {
    var chips = allLabel
      ? ['<button type="button" class="dash-chip' + (state[dim] === null ? " is-on" : "") +
         '" data-dim="' + dim + '" data-key="">' + allLabel + "</button>"]
      : [];
    return '<div class="dash-slicer"><span class="dash-slabel">' + label + '</span>' +
      '<div class="dash-schips">' + chips.concat(values.map(function (v) {
        return '<button type="button" class="dash-chip' + (state[dim] === v ? " is-on" : "") +
          '" data-dim="' + dim + '" data-key="' + esc(v) + '">' + esc(v) + "</button>";
      })).join("") + "</div></div>";
  }

  /* ---- render ---------------------------------------------------------- */
  function render() {
    var a = compute();
    var c = R.countries[countryNames.indexOf(state.country)];
    var span = R.years[a.firstIdx] + "–" + R.years[a.lastIdx];
    var delta = a.latestShare - a.firstShare;
    var scope = state.group ? state.group.toLowerCase() + " only" : "all renewables";

    var active = [];
    if (state.period) active.push({ dim: "period", label: "Period", val: state.period });
    if (state.group) active.push({ dim: "group", label: "Source", val: state.group });

    root.innerHTML =
      '<div class="dash-slicers">' +
        slicer("country", "Country", countryNames, null) +
        slicer("period", "Period", R.periods, "All years") +
        slicer("group", "Source group", R.groups, "All sources") +
      '</div>' +

      (active.length
        ? '<div class="dash-active"><span class="dash-alabel">Filtered by</span>' +
          active.map(function (f) {
            return '<button type="button" class="dash-pill" data-clear="' + f.dim + '">' +
              esc(f.label) + ': <strong>' + esc(f.val) + '</strong> <span aria-hidden="true">&times;</span></button>';
          }).join("") +
          '<button type="button" class="dash-clear" data-clear="all">Clear all</button></div>'
        : '<div class="dash-active is-empty"><span class="dash-alabel">Showing ' + esc(state.country) +
          ', ' + span + ', ' + scope + '. Click a country or a source to change the view.</span></div>') +

      '<div class="metrics dash-kpi">' +
        '<div><span class="metric-number">' + pct(a.latestShare) + '</span><span>renewable share in ' +
          R.years[a.lastIdx] + '<br />' + (delta >= 0 ? "up " : "down ") + Math.abs(delta).toFixed(1) +
          ' points since ' + R.years[a.firstIdx] + '</span></div>' +
        '<div><span class="metric-number">' + twh(a.latestRenewable) + '</span><span>TWh renewable<br />' +
          scope + ', ' + R.years[a.lastIdx] + '</span></div>' +
        '<div><span class="metric-number">' + twh(a.latestTotal) + '</span><span>TWh generated in total<br />' +
          esc(c.region) + ' · net zero by ' + esc(c.netZero) + '</span></div>' +
      '</div>' +

      '<div class="dash-grid-wrap">' +
        '<div class="dash-panel dash-wide"><h3>Renewable share of generation ' +
          '<span class="dash-sub">' + esc(state.country) + ", " + span + '</span></h3>' +
          shareLine(a.shareByYear, a) + '</div>' +

        '<div class="dash-panel"><h3>Renewable share by country ' +
          '<span class="dash-sub">' + R.years[a.lastIdx] + '</span></h3>' +
          bars(a.shareByCountry, { dim: "country", sort: true, fmt: pct }) + '</div>' +

        '<div class="dash-panel"><h3>Generation by source group ' +
          '<span class="dash-sub">' + esc(state.country) + '</span></h3>' +
          bars(a.byGroup, { dim: "group", sort: true, fmt: function (v) { return twh(v) + " TWh"; } }) + '</div>' +

        '<div class="dash-panel dash-wide"><h3>Renewable generation by year ' +
          '<span class="dash-sub">' + esc(state.country) + ', TWh</span></h3>' +
          yearColumns(a) + '</div>' +

        '<div class="dash-panel dash-wide"><h3>Generation by individual source ' +
          '<span class="dash-sub">' + esc(state.country) + ", " + span + ' total</span></h3>' +
          bars(a.bySource, { sort: true, fmt: function (v) { return twh(v) + " TWh"; } }) + '</div>' +
      '</div>' +

      '<p class="dash-foot">' + esc(c.policy) + ', from ' + c.policyYear + '.</p>';
  }

  root.addEventListener("click", function (e) {
    var t = e.target.closest("[data-dim], [data-clear]");
    if (!t) return;
    if (t.hasAttribute("data-clear")) {
      var w = t.getAttribute("data-clear");
      if (w === "all") { state.period = null; state.group = null; }
      else { state[w] = null; }
      return render();
    }
    var dim = t.getAttribute("data-dim"), key = t.getAttribute("data-key");
    if (dim === "country") { state.country = key || state.country; }
    else if (key === "") { state[dim] = null; }
    else { state[dim] = state[dim] === key ? null : key; }
    render();
  });

  render();
})();
