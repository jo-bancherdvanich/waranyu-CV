/* Australia's renewable transition — the Power BI report, rebuilt as a live
 * dashboard, visual for visual.
 *
 * The four visuals mirror the published report: the share trend with the 2015
 * LRET marker, a clustered column comparing the source mix between the first
 * and last year, and the two country comparisons that disagree with each other
 * — China leads on volume, but not on share.
 *
 * Every figure is computed in the browser from the cleaned galaxy-schema
 * workbook in the repository: 480 generation facts across four countries and
 * fourteen sources, plus total generation for the share calculation. The
 * headline numbers reconcile with the published dashboard exactly:
 * Australia 34.98% share in 2024, 97.9 TWh, solar 48.6 TWh, wind 31.0 TWh.
 *
 * Slicers are scoped the way the report scopes them: picking one year re-cuts
 * the KPIs, the mix and the country comparisons, but the trend line keeps its
 * full run of years, because a trend chart of one point answers nothing.
 */
(function () {
  "use strict";

  var root = document.getElementById("re-dash");
  if (!root || !window.RENEWABLE_ROWS) return;
  var R = window.RENEWABLE_ROWS;

  /* Chart geometry is responsive. The SVGs scale to their container, so on a
   * phone a 640-unit viewBox squeezed into ~316px rendered 9px axis labels at
   * about 4px — unreadable. A narrower viewBox raises the scale factor, and
   * .is-narrow bumps the label size in viewBox units on top of that. */
  function narrow() { return window.innerWidth <= 720; }
  function vbW() { return narrow() ? 400 : 640; }
  function svgCls() { return "dash-svg" + (narrow() ? " is-narrow" : ""); }

  var nums = function (s) { return s.split(",").map(Number); };
  var fC = nums(R.cols.c), fY = nums(R.cols.y), fS = nums(R.cols.s), fG = nums(R.cols.g);
  var N = fC.length;

  var countryNames = R.countries.map(function (c) { return c.n; });
  var LATEST = R.years.length - 1;
  var LRET = { year: 2015, label: "LRET target revised" };

  var state = { country: "Australia", year: null, group: null };

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  }
  var twh = function (g) { return g >= 100 ? (g / 1000).toFixed(1) : (g / 1000).toFixed(1); };
  var pct = function (v) { return v.toFixed(1) + "%"; };

  /* ---- aggregation ---------------------------------------------------- */
  function compute() {
    var ci = countryNames.indexOf(state.country);
    var selIdx = state.year ? R.years.indexOf(state.year) : LATEST;

    var a = {
      selIdx: selIdx,
      byYear: R.years.map(function () { return 0; }),
      mixFirst: {}, mixSel: {},          // source group, first year vs selected year
      groupYear: {},                     // source group across every year

      bySource: {},
      volByCountry: {}, shareByCountry: {}
    };
    R.groups.forEach(function (g) {
      a.mixFirst[g] = 0; a.mixSel[g] = 0;
      a.groupYear[g] = R.years.map(function () { return 0; });
    });
    R.sources.forEach(function (s, i) {
      if (!state.group || R.sourceGroup[i] === state.group) a.bySource[s] = 0;
    });
    countryNames.forEach(function (c) { a.volByCountry[c] = 0; });

    for (var i = 0; i < N; i++) {
      var yIdx = fY[i], sIdx = fS[i], grp = R.sourceGroup[sIdx];
      if (state.group && grp !== state.group) continue;

      if (yIdx === selIdx) a.volByCountry[countryNames[fC[i]]] += fG[i];
      if (fC[i] !== ci) continue;

      a.byYear[yIdx] += fG[i];
      a.groupYear[grp][yIdx] += fG[i];
      if (yIdx === 0) a.mixFirst[grp] += fG[i];
      if (yIdx === selIdx) a.mixSel[grp] += fG[i];
      if ((!state.year || yIdx === selIdx) && a.bySource[R.sources[sIdx]] !== undefined) {
        a.bySource[R.sources[sIdx]] += fG[i];
      }
    }

    a.shareByYear = R.years.map(function (y, i) {
      var tot = R.totals[ci][i];
      return tot ? (a.byYear[i] / tot) * 100 : 0;
    });
    countryNames.forEach(function (c, idx) {
      var tot = R.totals[idx][selIdx];
      a.shareByCountry[c] = tot ? (a.volByCountry[c] / tot) * 100 : 0;
    });

    a.selRenewable = a.byYear[selIdx];
    a.selTotal = R.totals[ci][selIdx];
    a.selShare = a.shareByYear[selIdx];
    a.baseIdx = state.year ? Math.max(0, selIdx - 1) : 0;
    a.baseShare = a.shareByYear[a.baseIdx];
    return a;
  }

  /* points handed to the shared crosshair/tooltip module after each render */
  var hoverData = {};

  /* ---- colour: the selected country, then China as the comparison anchor -- */
  function countryFill(name) {
    if (name === state.country) return "var(--accent)";
    if (name === "China") return "var(--c4)";
    return "var(--muted)";
  }

  /* ---- horizontal bars, coloured per country ---------------------------- */
  function hbars(obj, opts) {
    var keys = Object.keys(obj).filter(function (k) { return obj[k] > 0; });
    keys.sort(function (x, y) { return obj[y] - obj[x]; });
    if (!keys.length) return '<p class="dash-empty">Nothing in this selection.</p>';
    var max = Math.max.apply(null, keys.map(function (k) { return obj[k]; })) || 1;
    return '<div class="dash-bars">' + keys.map(function (k) {
      var on = state.country === k;
      return '<button type="button" class="dash-row is-clickable' + (on ? " is-picked" : "") + '"' +
        ' data-dim="country" data-key="' + esc(k) + '">' +
        '<span class="dash-key">' + esc(k) + '</span>' +
        '<span class="dash-track"><span class="dash-fill" style="width:0;background:' + countryFill(k) + '" data-w="' +
        ((obj[k] / max) * 100).toFixed(1) + '"></span></span>' +
        '<span class="dash-val">' + opts.fmt(obj[k]) + '</span></button>';
    }).join("") + '</div>' +
      '<p class="dash-axistitle">' + opts.axis + '</p>';
  }

  /* ---- the share trend, with the 2015 LRET marker ----------------------- */
  function shareLine(a) {
    var W = vbW(), H = 220, PL = 40, PR = 12, PT = 16, PB = 26;
    var vals = a.shareByYear, n = vals.length;
    var max = Math.max.apply(null, vals) * 1.18 || 1;
    var x = function (k) { return PL + (k / (n - 1)) * (W - PL - PR); };
    var y = function (v) { return PT + (1 - v / max) * (H - PT - PB); };
    var pts = vals.map(function (v, k) { return x(k).toFixed(1) + " " + y(v).toFixed(1); });
    var area = "M " + x(0).toFixed(1) + " " + (H - PB) + " L " + pts.join(" L ") +
               " L " + x(n - 1).toFixed(1) + " " + (H - PB) + " Z";

    var grid = "";
    var step = max > 60 ? 20 : max > 30 ? 10 : 5;
    for (var t = 0; t <= max; t += step) {
      var yy = y(t).toFixed(1);
      grid += '<line x1="' + PL + '" y1="' + yy + '" x2="' + (W - PR) + '" y2="' + yy + '" class="dash-grid"/>' +
              '<text x="' + (PL - 6) + '" y="' + (+yy + 3.5) + '" class="dash-axis" text-anchor="end">' +
              t + '%</text>';
    }

    var lret = "";
    var li = R.years.indexOf(LRET.year);
    if (li >= 0) {
      var lx = x(li).toFixed(1);
      lret = '<line x1="' + lx + '" y1="' + PT + '" x2="' + lx + '" y2="' + (H - PB) + '" class="dash-event"/>' +
             '<text x="' + (+lx - 6) + '" y="' + (PT + 10) + '" class="dash-axis dash-eventlab" text-anchor="end">' +
             LRET.label + '</text>' +
             '<circle cx="' + lx + '" cy="' + y(vals[li]).toFixed(1) + '" r="3.2" class="dash-eventdot"/>';
    }

    var marker = "";
    if (state.year) {
      var mx = x(a.selIdx).toFixed(1), my = y(vals[a.selIdx]).toFixed(1);
      marker = '<line x1="' + mx + '" y1="' + PT + '" x2="' + mx + '" y2="' + (H - PB) + '" class="dash-marker"/>' +
               '<circle cx="' + mx + '" cy="' + my + '" r="4" class="dash-dot"/>' +
               '<text x="' + mx + '" y="' + (+my - 9) + '" class="dash-axis dash-markerlab" text-anchor="middle">' +
               pct(vals[a.selIdx]) + '</text>';
    }

    var xlab = "";
    (narrow() ? [3, 9, 15, n - 1] : [0, 5, 10, 15, n - 1]).forEach(function (k) {
      xlab += '<text x="' + x(k).toFixed(1) + '" y="' + (H - 8) + '" class="dash-axis" text-anchor="middle">' +
              R.years[k] + '</text>';
    });
    hoverData.share = {
      top: PT, bottom: H - PB,
      points: vals.map(function (v, k) {
        return { x: x(k), y: y(v), label: String(R.years[k]),
                 value: pct(v) + ' · ' + twh(a.byYear[k]) + ' TWh' };
      })
    };
    return '<div class="dash-chart" data-hover="share">' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" class="' + svgCls() + '" role="img" ' +
      'aria-label="Renewable share of generation, ' + esc(state.country) + ', 2005 to 2024">' +
      grid + '<path d="' + area + '" class="dash-area"/>' +
      '<polyline points="' + pts.join(" ") + '" class="dash-line"/>' + lret + marker + xlab + '</svg></div>';
  }

  /* ---- clustered columns: first year against the selected year ---------- */
  function clustered(first, second, labelA, labelB) {
    var keys = Object.keys(second).filter(function (k) { return second[k] > 0 || first[k] > 0; });
    keys.sort(function (x, y) { return second[x] - second[y]; });
    var W = vbW(), H = 240, PL = 46, PR = 10, PT = 34, PB = 34;
    var max = Math.max(
      Math.max.apply(null, keys.map(function (k) { return first[k]; })),
      Math.max.apply(null, keys.map(function (k) { return second[k]; }))
    ) * 1.18 || 1;
    var band = (W - PL - PR) / keys.length;
    var bw = Math.min(26, band * 0.3);
    var y = function (v) { return PT + (1 - v / max) * (H - PT - PB); };

    var grid = "";
    var top = max / 1000, tstep = top > 400 ? 200 : top > 150 ? 100 : top > 60 ? 25 : top > 20 ? 10 : 5;
    for (var tv = 0; tv <= top; tv += tstep) {
      var yy = y(tv * 1000).toFixed(1);
      grid += '<line x1="' + PL + '" y1="' + yy + '" x2="' + (W - PR) + '" y2="' + yy + '" class="dash-grid"/>' +
              '<text x="' + (PL - 6) + '" y="' + (+yy + 3.5) + '" class="dash-axis" text-anchor="end">' +
              tv + '</text>';
    }

    var body = keys.map(function (k, i) {
      var cx = PL + band * i + band / 2;
      var x1 = cx - bw - 2, x2 = cx + 2;
      var out = "";
      [[first[k], x1, "dash-colA", labelA], [second[k], x2, "dash-colB", labelB]].forEach(function (p) {
        var h = Math.max(1, (H - PT - PB) * (p[0] / max));
        /* two value labels per band will not fit side by side on a phone, so
           only the later year is labelled there — it is the one the title is
           making a claim about, and the earlier bar is still drawn */
        var showVal = !narrow() || p[2] === "dash-colB";
        out += '<rect x="' + p[1].toFixed(1) + '" y="' +
               (H - PB - h).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) +
               '" rx="2" class="' + p[2] + '"/>' +
               (showVal
                 ? '<text x="' + (p[1] + bw / 2).toFixed(1) + '" y="' + (H - PB - h - 4).toFixed(1) +
                   '" class="dash-axis dash-collabel" text-anchor="middle">' + (p[0] / 1000).toFixed(1) + '</text>'
                 : "");
      });
      out += '<text x="' + cx.toFixed(1) + '" y="' + (H - 10) + '" class="dash-axis" text-anchor="middle">' +
             esc(narrow() ? k.slice(0, 4) : k) + '</text>';
      return out;
    }).join("");

    var legend =
      '<rect x="' + PL + '" y="10" width="9" height="9" rx="2" class="dash-colA"/>' +
      '<text x="' + (PL + 14) + '" y="18" class="dash-axis">' + labelA + '</text>' +
      '<rect x="' + (PL + 52) + '" y="10" width="9" height="9" rx="2" class="dash-colB"/>' +
      '<text x="' + (PL + 66) + '" y="18" class="dash-axis">' + labelB + '</text>';

    return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="' + svgCls() + '" role="img" ' +
      'aria-label="Generation by source, ' + labelA + ' against ' + labelB + '">' +
      grid + legend + body + '</svg>' +
      '<p class="dash-axistitle">Generation (TWh)</p>';
  }

  /* ---- one line per source group, across every year --------------------- */
  function sourceLines(groupYear) {
    var W = vbW(), H = 250, PL = 42, PR = 96, PT = 16, PB = 28;
    var keys = Object.keys(groupYear).filter(function (g) {
      return groupYear[g].some(function (v) { return v > 0; });
    });
    keys.sort(function (x, y) {
      return groupYear[y][LATEST] - groupYear[x][LATEST];
    });
    if (!keys.length) return '<p class="dash-empty">Nothing in this selection.</p>';

    var n = R.years.length;
    var max = 0;
    keys.forEach(function (g) { groupYear[g].forEach(function (v) { if (v > max) max = v; }); });
    max = (max * 1.1) / 1000 || 1;                       // work in TWh
    var x = function (k) { return PL + (k / (n - 1)) * (W - PL - PR); };
    var y = function (v) { return PT + (1 - v / max) * (H - PT - PB); };

    var grid = "";
    var step = max > 200 ? 100 : max > 80 ? 25 : max > 30 ? 10 : 5;
    for (var t = 0; t <= max; t += step) {
      var yy = y(t).toFixed(1);
      grid += '<line x1="' + PL + '" y1="' + yy + '" x2="' + (W - PR) + '" y2="' + yy + '" class="dash-grid"/>' +
              '<text x="' + (PL - 6) + '" y="' + (+yy + 3.5) + '" class="dash-axis" text-anchor="end">' + t + '</text>';
    }

    var lines = keys.map(function (g, gi) {
      var pts = groupYear[g].map(function (v, k) { return x(k).toFixed(1) + "," + y(v / 1000).toFixed(1); });
      var endY = y(groupYear[g][LATEST] / 1000);
      return '<polyline points="' + pts.join(" ") + '" class="dash-line dash-s' + (gi % 5) + '"/>' +
             '<circle cx="' + x(n - 1).toFixed(1) + '" cy="' + endY.toFixed(1) + '" r="2.6" class="dash-sdot dash-s' + (gi % 5) + '"/>' +
             (narrow() && gi > 2 ? '' :
             '<text x="' + (W - PR + 8) + '" y="' + (endY + 3).toFixed(1) + '" class="dash-axis dash-slabel-' + (gi % 5) + '">' +
             esc(g) + (narrow() ? "" : " " + (groupYear[g][LATEST] / 1000).toFixed(1)) + '</text>');
    }).join("");

    var xlab = "";
    (narrow() ? [3, 9, 15, n - 1] : [0, 5, 10, 15, n - 1]).forEach(function (k) {
      xlab += '<text x="' + x(k).toFixed(1) + '" y="' + (H - 8) + '" class="dash-axis" text-anchor="middle">' +
              R.years[k] + '</text>';
    });

    hoverData.sources = {
      top: PT, bottom: H - PB,
      points: R.years.map(function (yrv, k) {
        return {
          x: x(k), y: y(groupYear[keys[0]][k] / 1000), label: String(yrv),
          value: keys.map(function (g) {
            return esc(g) + " " + (groupYear[g][k] / 1000).toFixed(1);
          }).join("<br />")
        };
      })
    };

    return '<div class="dash-chart" data-hover="sources">' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" class="' + svgCls() + '" role="img" ' +
      'aria-label="Generation by source group over time, ' + esc(state.country) + '">' +
      grid + lines + xlab + '</svg></div>' +
      '<p class="dash-axistitle">Generation (TWh)</p>';
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

  function panel(title, sub, chart, wide) {
    return '<div class="dash-panel' + (wide ? " dash-wide" : "") + '">' +
      '<h3>' + title + '</h3><p class="dash-subtitle">' + sub + '</p>' + chart + '</div>';
  }

  /* ---- render ---------------------------------------------------------- */
  function render() {
    var a = compute();
    var c = R.countries[countryNames.indexOf(state.country)];
    var selYear = R.years[a.selIdx];
    var firstYear = R.years[0];
    var scope = state.group ? state.group.toLowerCase() + " only" : "all renewables";
    var span = state.year ? String(state.year) : firstYear + "–" + R.years[LATEST];
    var delta = a.selShare - a.baseShare;

    /* headline statements, computed rather than typed, so they stay true
       whichever country and year are selected */
    /* with a source group picked, these are that source's numbers, not all renewables */
    var metric = state.group ? state.group.toLowerCase() : "renewable";
    var rose = a.selShare >= a.shareByYear[0] ? "rose" : "fell";
    var t1 = esc(state.country) + "'s " + metric + " share " + rose + " from " +
             Math.round(a.shareByYear[0]) + "% to " + Math.round(a.selShare) + "% since " + firstYear;

    var growth = Object.keys(a.mixSel).map(function (k) {
      return { k: k, d: a.mixSel[k] - a.mixFirst[k] };
    }).sort(function (x, y) { return y.d - x.d; });
    var movers = growth.filter(function (g) { return g.d > 0; }).slice(0, 2).map(function (g) { return g.k; });
    var t2 = (movers.length ? movers.join(" and ") : "The mix") + " reshape" +
             (movers.length === 1 ? "s" : "") + " " + esc(state.country) + "'s renewable mix";

    var volRank = Object.keys(a.volByCountry).sort(function (x, y) { return a.volByCountry[y] - a.volByCountry[x]; });
    var shareRank = Object.keys(a.shareByCountry).sort(function (x, y) { return a.shareByCountry[y] - a.shareByCountry[x]; });
    var t3 = esc(volRank[0]) + " leads " + metric + " generation by volume";
    var myShare = shareRank.indexOf(state.country);
    var t4 = myShare === 0
      ? esc(state.country) + " leads on " + metric + " share"
      : myShare < shareRank.length - 1
        ? esc(state.country) + " edges " + esc(shareRank[myShare + 1]) + " on " + metric + " share"
        : esc(state.country) + " trails on " + metric + " share";

    var active = [];
    if (state.year) active.push({ dim: "year", label: "Year", val: state.year });
    if (state.group) active.push({ dim: "group", label: "Source", val: state.group });

    root.innerHTML =
      '<div class="dash-slicers">' +
        slicer("country", "Country", countryNames, null) +
        slicer("year", "Year", R.years, "All years") +
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
          ', ' + span + ', ' + scope + '. Click a country, a year or a source to change the view.</span></div>') +

      '<div class="metrics dash-kpi">' +
        '<div><span class="metric-number">' + pct(a.selShare) + '</span><span>renewable share in ' + selYear +
          '<br />' + (delta >= 0 ? "up " : "down ") + Math.abs(delta).toFixed(1) + ' points on ' +
          R.years[a.baseIdx] + '</span></div>' +
        '<div><span class="metric-number">' + twh(a.selRenewable) + '</span><span>TWh renewable<br />' +
          scope + ', ' + selYear + '</span></div>' +
        '<div><span class="metric-number">' + twh(a.selTotal) + '</span><span>TWh generated in total<br />' +
          esc(c.region) + ' · net zero by ' + esc(c.netZero) + '</span></div>' +
      '</div>' +

      '<div class="dash-grid-wrap">' +
        panel(t1,
          "Growth accelerated after the 2015 LRET revision targeted an extra 33,000 GWh annually by 2020.",
          shareLine(a), true) +

        panel(t2,
          "Generation by source group in " + firstYear + " against " + selYear + ", in TWh.",
          clustered(a.mixFirst, a.mixSel, String(firstYear), String(selYear)), true) +

        panel(esc(state.country) + "'s mix over time",
          "Each source group's generation, " + R.years[0] + "–" + R.years[LATEST] + ", in TWh.",
          sourceLines(a.groupYear), true) +

        panel(t3,
          "Volume reflects the size of a country's grid, not how clean it is.",
          hbars(a.volByCountry, { fmt: function (v) { return twh(v); }, axis: "Generation (TWh), " + selYear })) +

        panel(t4,
          "Share shows which countries actually rely on renewable energy.",
          hbars(a.shareByCountry, { fmt: pct, axis: (state.group ? state.group : "Renewable") + " share (%), " + selYear })) +
      '</div>' +

      '<p class="dash-foot">' + esc(c.policy) + ', from ' + c.policyYear + '.</p>';

    afterRender();
  }

  var revealed = false;
  function afterRender() {
    if (window.dashGrow) window.dashGrow(root);
    if (window.dashDrawLines) window.dashDrawLines(root);
    if (window.attachChartHover) {
      root.querySelectorAll('[data-hover]').forEach(function (el) {
        window.attachChartHover(el, hoverData[el.getAttribute('data-hover')]);
      });
    }
    if (!revealed && window.dashReveal) { window.dashReveal(root); revealed = true; }
  }

  root.addEventListener("click", function (e) {
    var t = e.target.closest("[data-dim], [data-clear]");
    if (!t) return;
    if (t.hasAttribute("data-clear")) {
      var w = t.getAttribute("data-clear");
      if (w === "all") { state.year = null; state.group = null; }
      else { state[w] = null; }
      return render();
    }
    var dim = t.getAttribute("data-dim"), key = t.getAttribute("data-key");
    if (dim === "country") { state.country = key || state.country; }
    else if (key === "") { state[dim] = null; }
    else if (dim === "year") { state.year = state.year === +key ? null : +key; }
    else { state[dim] = state[dim] === key ? null : key; }
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
