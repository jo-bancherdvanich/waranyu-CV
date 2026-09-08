/* FreshMart — the Power BI report, rebuilt as a live dashboard.
 *
 * Every number is computed in the browser from the 17,697 transaction rows in
 * freshmart-rows.js. Slicers filter the rows; clicking a bar cross-filters the
 * rest of the report, the way a Power BI visual does. With no filters applied
 * the KPI row reconciles with the published dashboard to the dollar:
 * $321,301 revenue, 28.67% gross margin, $92,128 gross profit.
 */
(function () {
  "use strict";

  var root = document.getElementById("fm-dash");
  if (!root || !window.FRESHMART_ROWS) return;
  var R = window.FRESHMART_ROWS;

  /* ---- decode the columns ------------------------------------------- */
  var nums = function (s) {
    var parts = s.split(","), out = new Int32Array(parts.length), i;
    for (i = 0; i < parts.length; i++) out[i] = +parts[i];
    return out;
  };
  var cS = nums(R.cols.s), cP = nums(R.cols.p), cD = nums(R.cols.d),
      cQ = nums(R.cols.q), cR = nums(R.cols.r);
  var N = cS.length;

  /* day index -> year, month bucket, weekday. 2022-01-01 was a Saturday. */
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  var yr = new Int32Array(N), mo = new Int32Array(N), dw = new Int32Array(N);
  var monthLabels = [], i, d;
  for (i = 0; i < 36; i++) monthLabels.push(MONTHS[i % 12] + " " + (22 + Math.floor(i / 12)));
  for (i = 0; i < N; i++) {
    d = new Date(Date.UTC(2022, 0, 1 + cD[i]));
    yr[i] = d.getUTCFullYear();
    mo[i] = (yr[i] - 2022) * 12 + d.getUTCMonth();
    dw[i] = (cD[i] + 5) % 7;
  }

  /* per-row cogs in cents, derived: unit cost x quantity */
  var cC = new Int32Array(N);
  for (i = 0; i < N; i++) cC[i] = R.products[cP[i]].cost * cQ[i];

  /* ---- dimension lookups -------------------------------------------- */
  var uniq = function (arr) {
    var s = [];
    arr.forEach(function (v) { if (s.indexOf(v) < 0) s.push(v); });
    return s;
  };
  var regions = uniq(R.stores.map(function (s) { return s.r; }));
  var formats = uniq(R.stores.map(function (s) { return s.f; }));
  var cats = uniq(R.products.map(function (p) { return p.c; })).sort();
  var years = [2022, 2023, 2024];

  /* every subcategory, and which ones sit under each category */
  var subsByCat = {};
  R.products.forEach(function (p) {
    if (!subsByCat[p.c]) subsByCat[p.c] = [];
    if (subsByCat[p.c].indexOf(p.sub) < 0) subsByCat[p.c].push(p.sub);
  });
  Object.keys(subsByCat).forEach(function (k) { subsByCat[k].sort(); });
  var allSubs = uniq(R.products.map(function (p) { return p.sub; })).sort();

  var state = { year: null, region: null, format: null, category: null, subcategory: null, store: null };

  /* ---- aggregation --------------------------------------------------- */
  function compute() {
    var agg = {
      rev: 0, cogs: 0, units: 0, lines: 0,
      region: {}, category: {}, subcategory: {}, store: {},
      month: new Float64Array(36), dow: new Float64Array(7)
    };
    regions.forEach(function (k) { agg.region[k] = 0; });
    cats.forEach(function (k) { agg.category[k] = 0; });
    (state.category ? subsByCat[state.category] : allSubs).forEach(function (k) { agg.subcategory[k] = 0; });
    R.stores.forEach(function (s) { agg.store[s.n] = 0; });

    for (var i = 0; i < N; i++) {
      var st = R.stores[cS[i]], pr = R.products[cP[i]];
      if (state.year && yr[i] !== state.year) continue;
      if (state.region && st.r !== state.region) continue;
      if (state.format && st.f !== state.format) continue;
      if (state.category && pr.c !== state.category) continue;
      if (state.subcategory && pr.sub !== state.subcategory) continue;
      if (state.store && st.n !== state.store) continue;

      var rev = cR[i];
      agg.rev += rev;
      agg.cogs += cC[i];
      agg.units += cQ[i];
      agg.lines++;
      agg.region[st.r] += rev;
      agg.category[pr.c] += rev;
      if (agg.subcategory[pr.sub] !== undefined) agg.subcategory[pr.sub] += rev;
      agg.store[st.n] += rev;
      agg.month[mo[i]] += rev;
      agg.dow[dw[i]] += cQ[i];
    }
    return agg;
  }

  /* ---- formatting ---------------------------------------------------- */
  var dollars = function (c) { return "$" + Math.round(c / 100).toLocaleString(); };
  var shortD = function (c) {
    var v = c / 100;
    return v >= 1000 ? "$" + (v / 1000).toFixed(1) + "K" : "$" + Math.round(v);
  };
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  }

  /* ---- chart builders ------------------------------------------------ */
  function bars(obj, opts) {
    opts = opts || {};
    var keys = Object.keys(obj);
    if (opts.sort) keys.sort(function (a, b) { return obj[b] - obj[a]; });
    if (opts.top) keys = keys.slice(0, opts.top);
    var max = Math.max.apply(null, keys.map(function (k) { return obj[k]; })) || 1;
    return '<div class="dash-bars">' + keys.map(function (k) {
      var pct = (obj[k] / max) * 100;
      var on = opts.dim && state[opts.dim] === k;
      var dimmed = opts.dim && state[opts.dim] && !on;
      return '<button type="button" class="dash-row is-clickable' +
        (on ? " is-picked" : "") + (dimmed ? " is-dimmed" : "") + '"' +
        ' data-dim="' + opts.dim + '" data-key="' + esc(k) + '"' +
        ' aria-pressed="' + (on ? "true" : "false") + '">' +
        '<span class="dash-key">' + esc(k) + '</span>' +
        '<span class="dash-track"><span class="dash-fill is-grown" style="width:' + pct.toFixed(1) + '%"></span></span>' +
        '<span class="dash-val">' + (opts.fmt || shortD)(obj[k]) + '</span>' +
        '</button>';
    }).join("") + '</div>';
  }

  function lineChart(vals, labels) {
    var W = 640, H = 170, PL = 46, PR = 8, PT = 12, PB = 26;
    var max = Math.max.apply(null, Array.prototype.slice.call(vals)) || 1;
    var n = vals.length;
    var x = function (i) { return PL + (i / (n - 1)) * (W - PL - PR); };
    var y = function (v) { return PT + (1 - v / max) * (H - PT - PB); };
    var pts = [], i;
    for (i = 0; i < n; i++) pts.push(x(i).toFixed(1) + " " + y(vals[i]).toFixed(1));
    var area = "M " + x(0).toFixed(1) + " " + (H - PB) + " L " + pts.join(" L ") +
               " L " + x(n - 1).toFixed(1) + " " + (H - PB) + " Z";
    var grid = "";
    [0, max / 2, max].forEach(function (t) {
      var yy = y(t).toFixed(1);
      grid += '<line x1="' + PL + '" y1="' + yy + '" x2="' + (W - PR) + '" y2="' + yy + '" class="dash-grid"/>' +
              '<text x="' + (PL - 6) + '" y="' + (+yy + 3.5) + '" class="dash-axis" text-anchor="end">' + shortD(t) + '</text>';
    });
    var xlab = "";
    [0, 12, 24, 35].forEach(function (idx) {
      xlab += '<text x="' + x(idx).toFixed(1) + '" y="' + (H - 8) + '" class="dash-axis" text-anchor="middle">' +
              labels[idx] + '</text>';
    });
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="dash-svg" role="img" aria-label="Revenue by month">' +
      grid + '<path d="' + area + '" class="dash-area"/>' +
      '<polyline points="' + pts.join(" ") + '" class="dash-line"/>' + xlab + '</svg>';
  }

  function columns(vals, labels, fmt) {
    var max = Math.max.apply(null, Array.prototype.slice.call(vals)) || 1;
    return '<div class="dash-cols">' + labels.map(function (l, i) {
      return '<div class="dash-col">' +
        '<span class="dash-colval">' + fmt(vals[i]) + '</span>' +
        '<span class="dash-colbar" style="height:' + ((vals[i] / max) * 100).toFixed(1) + '%"></span>' +
        '<span class="dash-collab">' + l.slice(0, 3) + '</span>' +
        '</div>';
    }).join("") + '</div>';
  }

  /* ---- slicers -------------------------------------------------------- */
  function slicer(dim, label, values) {
    return '<div class="dash-slicer"><span class="dash-slabel">' + label + '</span>' +
      '<div class="dash-schips">' +
      '<button type="button" class="dash-chip' + (state[dim] === null ? " is-on" : "") +
      '" data-dim="' + dim + '" data-key="">All</button>' +
      values.map(function (v) {
        return '<button type="button" class="dash-chip' + (state[dim] === v ? " is-on" : "") +
          '" data-dim="' + dim + '" data-key="' + esc(v) + '">' + esc(v) + '</button>';
      }).join("") + '</div></div>';
  }

  /* ---- render --------------------------------------------------------- */
  var TOTAL_REV = null;

  function render() {
    var a = compute();
    if (TOTAL_REV === null) TOTAL_REV = a.rev;
    var margin = a.rev ? ((a.rev - a.cogs) / a.rev) * 100 : 0;
    var filtered = state.year || state.region || state.format || state.category || state.subcategory || state.store;
    var share = TOTAL_REV ? (a.rev / TOTAL_REV) * 100 : 100;

    var active = [];
    [["year", "Year"], ["region", "Region"], ["format", "Format"], ["category", "Category"], ["subcategory", "Subcategory"], ["store", "Store"]]
      .forEach(function (p) { if (state[p[0]]) active.push({ dim: p[0], label: p[1], val: state[p[0]] }); });

    root.innerHTML =
      '<div class="dash-slicers">' +
        slicer("year", "Year", years) +
        slicer("region", "Region", regions) +
        slicer("format", "Store format", formats) +
        slicer("category", "Category", cats) +
      '</div>' +

      (active.length
        ? '<div class="dash-active"><span class="dash-alabel">Filtered by</span>' +
          active.map(function (f) {
            return '<button type="button" class="dash-pill" data-clear="' + f.dim + '">' +
              esc(f.label) + ': <strong>' + esc(f.val) + '</strong> <span aria-hidden="true">&times;</span></button>';
          }).join("") +
          '<button type="button" class="dash-clear" data-clear="all">Clear all</button></div>'
        : '<div class="dash-active is-empty"><span class="dash-alabel">No filters applied. Click a chip or any bar to slice the whole report.</span></div>') +

      '<div class="metrics dash-kpi">' +
        '<div><span class="metric-number">' + dollars(a.rev) + '</span><span>revenue<br />' +
          a.lines.toLocaleString() + ' transaction lines</span></div>' +
        '<div><span class="metric-number">' + margin.toFixed(2) + '%</span><span>gross margin<br />' +
          dollars(a.rev - a.cogs) + ' gross profit</span></div>' +
        '<div><span class="metric-number">' + a.units.toLocaleString() + '</span><span>units sold<br />' +
          (filtered ? share.toFixed(1) + "% of total revenue" : "across all 12 stores") + '</span></div>' +
      '</div>' +

      '<div class="dash-grid-wrap">' +
        '<div class="dash-panel"><h3>Revenue by region</h3>' + bars(a.region, { dim: "region", sort: true }) + '</div>' +
        '<div class="dash-panel"><h3>Revenue by category</h3>' + bars(a.category, { dim: "category", sort: true }) + '</div>' +
        '<div class="dash-panel dash-wide"><h3>Revenue by subcategory' +
          (state.category ? ' <span class="dash-sub">within ' + esc(state.category) + '</span>'
                          : ' <span class="dash-sub">top 8 of 28</span>') + '</h3>' +
          bars(a.subcategory, { dim: "subcategory", sort: true, top: state.category ? 10 : 8 }) + '</div>' +
        '<div class="dash-panel dash-wide"><h3>Revenue by month</h3>' + lineChart(a.month, monthLabels) + '</div>' +
        '<div class="dash-panel"><h3>Units by day of week</h3>' +
          columns(a.dow, DAYS, function (v) { return Math.round(v).toLocaleString(); }) + '</div>' +
        '<div class="dash-panel"><h3>Top stores by revenue</h3>' + bars(a.store, { dim: "store", sort: true, top: 6 }) + '</div>' +
      '</div>';
  }

  /* ---- interaction ----------------------------------------------------- */
  root.addEventListener("click", function (e) {
    var t = e.target.closest("[data-dim], [data-clear]");
    if (!t) return;
    if (t.hasAttribute("data-clear")) {
      if (t.getAttribute("data-clear") === "all") {
        state = { year: null, region: null, format: null, category: null, subcategory: null, store: null };
      } else {
        state[t.getAttribute("data-clear")] = null;
      }
      return render();
    }
    var dim = t.getAttribute("data-dim"), key = t.getAttribute("data-key");
    if (dim === "category") state.subcategory = null;
    if (key === "") {
      state[dim] = null;
    } else {
      var val = dim === "year" ? +key : key;
      state[dim] = state[dim] === val ? null : val;
    }
    render();
  });

  render();
})();
