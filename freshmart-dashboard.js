/* FreshMart Sales Performance Dashboard — the Power BI report, rebuilt as a
 * live dashboard, visual for visual.
 *
 * The visuals mirror the published report: YTD against the same period last
 * year, sales volume by month and by day of week, and revenue broken out by
 * region, store, category and subcategory. Every number is computed in the
 * browser from the 17,697 transaction rows in freshmart-rows.js. Slicers filter
 * the rows; clicking a bar cross-filters the rest of the report, the way a
 * Power BI visual does. With no filters applied the KPI row reconciles with the
 * published dashboard to the dollar: $321,301 revenue, 28.67% gross margin,
 * $92,128 gross profit.
 */
(function () {
  "use strict";

  var root = document.getElementById("fm-dash");
  if (!root || !window.FRESHMART_ROWS) return;
  var R = window.FRESHMART_ROWS;

  /* Chart geometry is responsive. The SVGs scale to their container, so on a
   * phone a 640-unit viewBox squeezed into ~316px rendered 9px axis labels at
   * about 4px — unreadable. A narrower viewBox raises the scale factor, and
   * .is-narrow bumps the label size in viewBox units on top of that. */
  function narrow() { return window.innerWidth <= 720; }
  function vbW() { return narrow() ? 400 : 640; }
  function svgCls() { return "dash-svg" + (narrow() ? " is-narrow" : ""); }

  /* ---- decode the columns ------------------------------------------- */
  var nums = function (s) {
    var parts = s.split(","), out = new Int32Array(parts.length), i;
    for (i = 0; i < parts.length; i++) out[i] = +parts[i];
    return out;
  };
  var cS = nums(R.cols.s), cP = nums(R.cols.p), cD = nums(R.cols.d),
      cQ = nums(R.cols.q), cR = nums(R.cols.r);
  var N = cS.length;

  /* day index -> year, month of year, weekday. 2022-01-01 was a Saturday. */
  var MONTHS = ["January", "February", "March", "April", "May", "June",
                "July", "August", "September", "October", "November", "December"];
  var DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  var yr = new Int32Array(N), moy = new Int32Array(N), dw = new Int32Array(N);
  var i, d;
  for (i = 0; i < N; i++) {
    d = new Date(Date.UTC(2022, 0, 1 + cD[i]));
    yr[i] = d.getUTCFullYear();
    moy[i] = d.getUTCMonth();
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

  var subsByCat = {};
  R.products.forEach(function (p) {
    if (!subsByCat[p.c]) subsByCat[p.c] = [];
    if (subsByCat[p.c].indexOf(p.sub) < 0) subsByCat[p.c].push(p.sub);
  });
  Object.keys(subsByCat).forEach(function (k) { subsByCat[k].sort(); });
  var allSubs = uniq(R.products.map(function (p) { return p.sub; })).sort();

  /* Categorical scale. The index comes from a fixed list rather than the
     sorted order, so Meat stays the same colour whatever it is filtered to.
     Time series keep the single page accent — colour there would imply a
     grouping that does not exist. */
  var SCALE = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)", "var(--c6)"];
  var storeOrder = R.stores.map(function (st) { return st.n; }).sort();
  function hue(dim, key) {
    var list = dim === "category" ? cats
             : dim === "region" ? regions
             : dim === "subcategory" ? allSubs
             : dim === "store" ? storeOrder : null;
    if (!list) return null;
    var i = list.indexOf(key);
    return i < 0 ? null : SCALE[i % SCALE.length];
  }

  var state = { year: null, region: null, format: null, category: null, subcategory: null, store: null };

  /* ---- aggregation --------------------------------------------------- */
  function compute() {
    var a = {
      rev: 0, cogs: 0, units: 0, lines: 0,
      region: {}, category: {}, subcategory: {}, store: {},
      unitsByMonth: new Float64Array(12), dow: new Float64Array(7),
      revThis: new Float64Array(12), revPrev: new Float64Array(12)
    };
    regions.forEach(function (k) { a.region[k] = 0; });
    cats.forEach(function (k) { a.category[k] = 0; });
    (state.category ? subsByCat[state.category] : allSubs).forEach(function (k) { a.subcategory[k] = 0; });
    R.stores.forEach(function (s) { a.store[s.n] = 0; });

    /* the YTD comparison needs a "this year" even when no year is picked */
    var thisYear = state.year || years[years.length - 1];
    var prevYear = thisYear - 1;

    for (var i = 0; i < N; i++) {
      var st = R.stores[cS[i]], pr = R.products[cP[i]];
      if (state.region && st.r !== state.region) continue;
      if (state.format && st.f !== state.format) continue;
      if (state.category && pr.c !== state.category) continue;
      if (state.subcategory && pr.sub !== state.subcategory) continue;
      if (state.store && st.n !== state.store) continue;

      /* the two YTD series ignore the year slicer by design: that is the
         comparison the visual exists to make */
      if (yr[i] === thisYear) a.revThis[moy[i]] += cR[i];
      else if (yr[i] === prevYear) a.revPrev[moy[i]] += cR[i];

      if (state.year && yr[i] !== state.year) continue;

      a.rev += cR[i];
      a.cogs += cC[i];
      a.units += cQ[i];
      a.lines++;
      a.region[st.r] += cR[i];
      a.category[pr.c] += cR[i];
      if (a.subcategory[pr.sub] !== undefined) a.subcategory[pr.sub] += cR[i];
      a.store[st.n] += cR[i];
      a.unitsByMonth[moy[i]] += cQ[i];
      a.dow[dw[i]] += cQ[i];
    }

    /* cumulative, so the visual reads as year to date */
    a.ytd = []; a.pytd = [];
    var rt = 0, rp = 0;
    for (i = 0; i < 12; i++) {
      rt += a.revThis[i]; rp += a.revPrev[i];
      a.ytd.push(rt); a.pytd.push(rp);
    }
    a.thisYear = thisYear;
    a.prevYear = prevYear;
    a.hasPrev = rp > 0;
    return a;
  }

  /* ---- formatting ---------------------------------------------------- */
  var dollars = function (c) { return "$" + Math.round(c / 100).toLocaleString(); };
  var shortD = function (c) {
    var v = c / 100;
    return v >= 1000 ? "$" + (v / 1000).toFixed(1) + "K" : "$" + Math.round(v);
  };
  var kShort = function (c) { return (c / 100000).toFixed(1) + "K"; };
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  }

  /* points handed to the shared crosshair/tooltip module after each render */
  var hoverData = {};

  /* ---- charts --------------------------------------------------------- */
  function bars(obj, opts) {
    opts = opts || {};
    var keys = Object.keys(obj);
    if (opts.sort) keys.sort(function (x, y) { return obj[y] - obj[x]; });
    if (opts.top) keys = keys.slice(0, opts.top);
    if (!keys.length) return '<p class="dash-empty">Nothing in this selection.</p>';
    var vals = keys.map(function (k) { return obj[k]; });
    var max = Math.max.apply(null, vals) || 1;
    var min = Math.min.apply(null, vals);

    /* When every bar is within a few per cent of the others, a zero baseline
     * draws seven identical bars and hides the ranking the visual exists to
     * show. Truncate the axis in that case, and say so underneath, so the
     * shortened baseline is stated rather than implied. */
    var base = 0;
    if (keys.length > 1 && min / max > 0.6) {
      var span = max - min;
      var mag = Math.pow(10, Math.floor(Math.log(span) / Math.LN10));
      base = Math.max(0, Math.floor((min - span * 0.6) / mag) * mag);
    }
    var note = base > 0
      ? "Axis starts at " + (opts.fmt || shortD)(base) + ", not zero"
      : (opts.axis || "");

    return '<div class="dash-bars">' + keys.map(function (k) {
      var on = opts.dim && state[opts.dim] === k;
      var dimmed = opts.dim && state[opts.dim] && !on;
      var w = max > base ? ((obj[k] - base) / (max - base)) * 100 : 0;
      return '<button type="button" class="dash-row is-clickable' +
        (on ? " is-picked" : "") + (dimmed ? " is-dimmed" : "") + '"' +
        ' data-dim="' + opts.dim + '" data-key="' + esc(k) + '"' +
        ' aria-pressed="' + (on ? "true" : "false") + '">' +
        '<span class="dash-key">' + esc(k) + '</span>' +
        '<span class="dash-track"><span class="dash-fill" style="width:0' +
        (opts.colour && hue(opts.dim, k) ? ";background:" + hue(opts.dim, k) : "") +
        '" data-w="' + Math.max(1.5, w).toFixed(1) + '"></span></span>' +
        '<span class="dash-val">' + (opts.fmt || shortD)(obj[k]) + '</span>' +
        '</button>';
    }).join("") + '</div>' + (note ? '<p class="dash-axistitle">' + note + '</p>' : "");
  }

  /* two-series line, for revenue this year against the same period last year */
  function dualLine(sA, sB, labelA, labelB, showB) {
    var W = vbW(), H = 210, PL = 52, PR = 12, PT = 30, PB = 30;
    var all = showB ? sA.concat(sB) : sA;
    var max = Math.max.apply(null, all) * 1.1 || 1;
    var x = function (k) { return PL + (k / 11) * (W - PL - PR); };
    var y = function (v) { return PT + (1 - v / max) * (H - PT - PB); };
    var path = function (s) { return s.map(function (v, k) { return x(k).toFixed(1) + "," + y(v).toFixed(1); }).join(" "); };

    var grid = "";
    [0, max / 2, max].forEach(function (t) {
      var yy = y(t).toFixed(1);
      grid += '<line x1="' + PL + '" y1="' + yy + '" x2="' + (W - PR) + '" y2="' + yy + '" class="dash-grid"/>' +
              '<text x="' + (PL - 6) + '" y="' + (+yy + 3.5) + '" class="dash-axis" text-anchor="end">' +
              kShort(t) + '</text>';
    });
    var xlab = "";
    (narrow() ? [2, 5, 8, 11] : [0, 3, 6, 9, 11]).forEach(function (k) {
      xlab += '<text x="' + x(k).toFixed(1) + '" y="' + (H - 10) + '" class="dash-axis" text-anchor="middle">' +
              MONTHS[k].slice(0, 3) + '</text>';
    });
    /* on a phone the full series names do not fit, and the year is the part
       that actually distinguishes them */
    var legA = narrow() ? labelA.split(" ").pop() : labelA;
    var legB = narrow() ? labelB.split(" ").pop() : labelB;
    var gap = narrow() ? 64 : 128;
    var legend =
      (showB ? '<rect x="' + PL + '" y="8" width="9" height="9" rx="2" class="dash-colA"/>' +
               '<text x="' + (PL + 14) + '" y="16" class="dash-axis">' + legB + '</text>' : "") +
      '<rect x="' + (PL + (showB ? gap : 0)) + '" y="8" width="9" height="9" rx="2" class="dash-colB"/>' +
      '<text x="' + (PL + (showB ? gap + 14 : 14)) + '" y="16" class="dash-axis">' + legA + '</text>';

    hoverData.ytd = {
      top: PT, bottom: H - PB,
      points: sA.map(function (v, k) {
        return {
          x: x(k), y: y(v), label: MONTHS[k],
          value: dollars(v) + (showB ? " · " + labelB.split(" ").pop() + " " + dollars(sB[k]) : "")
        };
      })
    };
    return '<div class="dash-chart" data-hover="ytd">' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" class="' + svgCls() + '" role="img" aria-label="' +
      labelA + (showB ? " against " + labelB : "") + '">' + grid + legend +
      (showB ? '<polyline points="' + path(sB) + '" class="dash-line dash-linePrev"/>' : "") +
      '<polyline points="' + path(sA) + '" class="dash-line"/>' + xlab + '</svg></div>' +
      '<p class="dash-axistitle">Revenue ($)</p>';
  }

  /* single-series line, for sales volume by month */
  function volumeLine(vals) {
    var W = vbW(), H = 190, PL = 52, PR = 12, PT = 18, PB = 30;
    var lo = Math.min.apply(null, Array.prototype.slice.call(vals));
    var hi = Math.max.apply(null, Array.prototype.slice.call(vals));
    var pad = (hi - lo) * 0.35 || hi * 0.1 || 1;
    var min = Math.max(0, lo - pad), max = hi + pad;
    var x = function (k) { return PL + (k / 11) * (W - PL - PR); };
    var y = function (v) { return PT + (1 - (v - min) / (max - min)) * (H - PT - PB); };
    var pts = Array.prototype.slice.call(vals).map(function (v, k) {
      return x(k).toFixed(1) + " " + y(v).toFixed(1);
    });
    var grid = "";
    [min, (min + max) / 2, max].forEach(function (t) {
      var yy = y(t).toFixed(1);
      grid += '<line x1="' + PL + '" y1="' + yy + '" x2="' + (W - PR) + '" y2="' + yy + '" class="dash-grid"/>' +
              '<text x="' + (PL - 6) + '" y="' + (+yy + 3.5) + '" class="dash-axis" text-anchor="end">' +
              Math.round(t).toLocaleString() + '</text>';
    });
    var xlab = "";
    (narrow() ? [2, 5, 8, 11] : [0, 3, 6, 9, 11]).forEach(function (k) {
      xlab += '<text x="' + x(k).toFixed(1) + '" y="' + (H - 10) + '" class="dash-axis" text-anchor="middle">' +
              MONTHS[k].slice(0, 3) + '</text>';
    });
    hoverData.vol = {
      top: PT, bottom: H - PB,
      points: Array.prototype.slice.call(vals).map(function (v, k) {
        return { x: x(k), y: y(v), label: MONTHS[k], value: Math.round(v).toLocaleString() + " units" };
      })
    };
    return '<div class="dash-chart" data-hover="vol">' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" class="' + svgCls() + '" role="img" aria-label="Sales volume by month">' +
      grid + '<polyline points="' + pts.join(" ") + '" class="dash-line"/>' + xlab + '</svg></div>' +
      '<p class="dash-axistitle">Units Sold</p>';
  }

  /* Day-of-week columns on a truncated axis.
   *
   * The seven days sit within about 15% of each other, so a zero baseline
   * flattens them into seven identical bars and hides the pattern the visual
   * exists to show. The published report truncates the axis for the same
   * reason. The axis is drawn with its baseline labelled so the truncation is
   * visible rather than implied. */
  function columns(vals, labels) {
    var W = vbW(), H = 230, PL = 46, PR = 10, PT = 26, PB = 34;
    var arr = Array.prototype.slice.call(vals);
    var lo = Math.min.apply(null, arr), hi = Math.max.apply(null, arr);
    var step = hi - lo > 4000 ? 2000 : hi - lo > 1500 ? 1000 : 500;
    var base = Math.max(0, Math.floor(lo / step) * step - (hi - lo < step ? step : 0));
    var top = Math.ceil(hi / step) * step;
    if (top <= base) top = base + step;
    var band = (W - PL - PR) / arr.length;
    var bw = Math.min(46, band * 0.56);
    var y = function (v) { return PT + (1 - (v - base) / (top - base)) * (H - PT - PB); };

    var grid = "";
    for (var t = base; t <= top + 0.5; t += step) {
      var yy = y(t).toFixed(1);
      grid += '<line x1="' + PL + '" y1="' + yy + '" x2="' + (W - PR) + '" y2="' + yy + '" class="dash-grid"/>' +
              '<text x="' + (PL - 6) + '" y="' + (+yy + 3.5) + '" class="dash-axis" text-anchor="end">' +
              (t / 1000).toFixed(0) + 'K</text>';
    }

    var body = arr.map(function (v, k) {
      var cx = PL + band * k + band / 2;
      var h = Math.max(1, (H - PT - PB) * ((v - base) / (top - base)));
      return '<rect x="' + (cx - bw / 2).toFixed(1) + '" y="' + (H - PB - h).toFixed(1) +
             '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="3" class="dash-colB">' +
             '<title>' + labels[k] + ": " + Math.round(v).toLocaleString() + ' units</title></rect>' +
             '<text x="' + cx.toFixed(1) + '" y="' + (H - PB - h - 5).toFixed(1) +
             '" class="dash-axis dash-collabel" text-anchor="middle">' + (v / 1000).toFixed(1) + 'K</text>' +
             '<text x="' + cx.toFixed(1) + '" y="' + (H - 12) + '" class="dash-axis" text-anchor="middle">' +
             labels[k].slice(0, 3) + '</text>';
    }).join("");

    return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="' + svgCls() + '" role="img" ' +
      'aria-label="Sales volume by day of week">' + grid + body + '</svg>' +
      '<p class="dash-axistitle">Units Sold · axis starts at ' + (base / 1000).toFixed(0) + 'K</p>';
  }

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

  function panel(title, chart, wide) {
    return '<div class="dash-panel' + (wide ? " dash-wide" : "") + '"><h3>' + title + '</h3>' + chart + '</div>';
  }

  /* ---- render --------------------------------------------------------- */
  function render() {
    var a = compute();
    var margin = a.rev ? ((a.rev - a.cogs) / a.rev) * 100 : 0;

    var active = [];
    [["year", "Year"], ["region", "Region"], ["format", "Store format"], ["category", "Product category"],
     ["subcategory", "Subcategory"], ["store", "Store"]]
      .forEach(function (p) { if (state[p[0]]) active.push({ dim: p[0], label: p[1], val: state[p[0]] }); });

    root.innerHTML =
      '<div class="dash-head">' +
        '<div><h3 class="dash-title">FreshMart Sales Performance Dashboard</h3>' +
        '<p class="dash-subtitle">Executive overview of sales, profitability, product mix, and store performance</p></div>' +
        '<p class="dash-meta">Waranyu Bancherdvanich<br />Data to 31 December 2024</p>' +
      '</div>' +

      '<div class="dash-slicers">' +
        slicer("year", "Select Year", years) +
        slicer("region", "Select Region", regions) +
        slicer("category", "Select Product Category", cats) +
        slicer("format", "Select Store Format", formats) +
      '</div>' +

      (active.length
        ? '<div class="dash-active"><span class="dash-alabel">Filtered by</span>' +
          active.map(function (f) {
            return '<button type="button" class="dash-pill" data-clear="' + f.dim + '">' +
              esc(f.label) + ': <strong>' + esc(f.val) + '</strong> <span aria-hidden="true">&times;</span></button>';
          }).join("") +
          '<button type="button" class="dash-clear" data-clear="all">Clear all</button></div>'
        : '<div class="dash-active is-empty"><span class="dash-alabel">No filters applied. Click a chip or any bar to slice the whole report.</span></div>') +

      '<div class="dash-grid-wrap">' +
        panel("Revenue This Year vs Same Period Last Year",
          dualLine(a.ytd, a.pytd, "Revenue YTD " + a.thisYear, "Revenue PYTD " + a.prevYear, a.hasPrev), true) +

        panel("Sales Volume by Month", volumeLine(a.unitsByMonth), true) +

        panel("Revenue by Region", bars(a.region, { dim: "region", sort: true, colour: true })) +
        panel("Revenue by Store", bars(a.store, { dim: "store", sort: true, top: 6, colour: true })) +

        panel("Revenue by Product Category", bars(a.category, { dim: "category", sort: true, colour: true })) +
        panel("Revenue by Subcategory" +
          (state.category ? ' <span class="dash-sub">within ' + esc(state.category) + '</span>'
                          : ' <span class="dash-sub">top 6 of 28</span>'),
          bars(a.subcategory, { dim: "subcategory", sort: true, top: state.category ? 8 : 6, colour: true })) +

        panel("Sales Volume by Day of Week",
          columns(a.dow, DAYS, function (v) { return Math.round(v).toLocaleString(); }), true) +
      '</div>' +

      '<div class="dash-kpirow">' +
        '<div class="dash-kpicard"><span class="dash-kpilabel">Total Revenue</span>' +
          '<span class="dash-kpivalue">' + kShort(a.rev) + '</span>' +
          '<span class="dash-kpinote">' + a.lines.toLocaleString() + ' transaction lines</span></div>' +
        '<div class="dash-kpicard"><span class="dash-kpilabel">Gross Margin %</span>' +
          '<span class="dash-kpivalue">' + margin.toFixed(2) + '%</span>' +
          '<span class="dash-kpinote">' + a.units.toLocaleString() + ' units sold</span></div>' +
        '<div class="dash-kpicard"><span class="dash-kpilabel">Gross Profit</span>' +
          '<span class="dash-kpivalue">' + kShort(a.rev - a.cogs) + '</span>' +
          '<span class="dash-kpinote">' + dollars(a.rev) + ' revenue</span></div>' +
      '</div>';

    afterRender();
  }

  var revealed = false;
  function afterRender() {
    if (window.dashGrow) window.dashGrow(root);
    if (window.dashDrawLines) window.dashDrawLines(root);
    if (window.attachChartHover) {
      root.querySelectorAll("[data-hover]").forEach(function (el) {
        window.attachChartHover(el, hoverData[el.getAttribute("data-hover")]);
      });
    }
    if (!revealed && window.dashReveal) { window.dashReveal(root); revealed = true; }
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

  var wasNarrow = narrow();
  window.addEventListener("resize", function () {
    if (narrow() === wasNarrow) return;
    wasNarrow = narrow();
    render();
  });

  render();
})();
