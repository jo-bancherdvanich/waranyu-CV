/* FreshMart — the dashboard measures, rebuilt in the browser.
 *
 * Every figure here is recomputed from the five source CSVs in the repository,
 * not typed in. The KPI row reconciles with the Power BI dashboard exactly:
 * $321,301 revenue, 28.67% gross margin, $92,128 gross profit.
 */
(function () {
  "use strict";

  var root = document.getElementById("fm-demo");
  if (!root || !window.FRESHMART_DATA) return;
  var D = window.FRESHMART_DATA;

  var money = function (v) { return "$" + v.toLocaleString(); };
  var short = function (v) { return v >= 1000 ? "$" + (v / 1000).toFixed(1) + "K" : "$" + v; };

  var VIEWS = {
    region: {
      label: "By region",
      note: "South carries the chain at " + short(D.region.South) + ". North trails at " + short(D.region.North) +
            " — a " + Math.round((1 - D.region.North / D.region.South) * 100) + "% gap on the same four-region footprint.",
      data: D.region, fmt: money, unit: "revenue"
    },
    category: {
      label: "By category",
      note: "Six categories after cleaning. Before cleaning there were 13, because the source spelled the same category several ways — including “Diary” for Dairy.",
      data: D.category, fmt: money, unit: "revenue"
    },
    month: {
      label: "By month",
      note: "Built from DateKey rather than the Date column, which arrives in two different formats and would silently mis-parse.",
      data: D.month, fmt: money, unit: "revenue"
    },
    dow: {
      label: "By day of week",
      note: "Units sold, not revenue — this is the view that informs staffing and stock rather than reporting.",
      data: D.dow, fmt: function (v) { return v.toLocaleString() + " units"; }, unit: "units"
    }
  };

  var els = {
    tabs: root.querySelectorAll(".fm-tab"),
    chart: root.querySelector(".fm-chart"),
    note: root.querySelector(".fm-note"),
    raw: root.querySelector(".fm-raw")
  };

  var state = { view: "region", showRaw: false };

  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }

  function bars(obj, fmt) {
    var keys = Object.keys(obj);
    var max = Math.max.apply(null, keys.map(function (k) { return obj[k]; }));
    return '<div class="fm-bars">' + keys.map(function (k) {
      var pct = max ? (obj[k] / max) * 100 : 0;
      return '<div class="fm-row">' +
        '<span class="fm-key">' + esc(k) + '</span>' +
        '<span class="fm-track"><span class="fm-fill" style="width:' + pct.toFixed(1) + '%"></span></span>' +
        '<span class="fm-val">' + fmt(obj[k]) + '</span>' +
        '</div>';
    }).join("") + "</div>";
  }

  function render() {
    var v = VIEWS[state.view];
    var data = (state.view === "category" && state.showRaw) ? D.categoryRaw : v.data;
    els.chart.innerHTML = bars(data, v.fmt);
    els.note.textContent = (state.view === "category" && state.showRaw)
      ? "This is the raw source: 13 category labels for 6 real categories. Dairy is split across “Dairy”, “dairy” and “Diary”, so any total by category is wrong before it is fixed."
      : v.note;
    els.raw.hidden = state.view !== "category";
    els.raw.textContent = state.showRaw ? "Show cleaned" : "Show raw source";
    els.tabs.forEach(function (t) {
      var on = t.dataset.view === state.view;
      t.classList.toggle("is-active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
    // let the bars grow in
    requestAnimationFrame(function () {
      root.querySelectorAll(".fm-fill").forEach(function (f) { f.classList.add("is-grown"); });
    });
  }

  els.tabs.forEach(function (t) {
    t.addEventListener("click", function () {
      state.view = t.dataset.view;
      state.showRaw = false;
      render();
    });
  });
  els.raw.addEventListener("click", function () { state.showRaw = !state.showRaw; render(); });

  /* ---- the cleaning, before and after ------------------------------- */
  var clean = document.getElementById("fm-clean");
  if (clean) {
    var q = D.quality;
    var fmt = Object.keys(q.dateFormatCounts || {})
      .map(function (k) { return k + " (" + q.dateFormatCounts[k].toLocaleString() + ")"; }).join(" · ");
    var rows = [
      { label: "Customer rows", before: q.customerRows, after: q.customerRows - q.duplicateIds,
        note: q.duplicateIds + " duplicate CustomerIDs removed" },
      { label: "Category labels", before: q.categories, after: 6,
        note: "dairy · Dairy · Diary all meant Dairy" },
      { label: "Date formats", before: Object.keys(q.dateFormatCounts || {}).length, after: 1,
        note: fmt + " — parsed from DateKey instead" },
      { label: "Rows with no customer", before: q.orphanRows, after: q.orphanRows, kept: true,
        note: "mapped to “Not Applicable”, never dropped" }
    ];
    clean.innerHTML = rows.map(function (r) {
      return '<div class="cl-row' + (r.kept ? " is-kept" : "") + '">' +
        '<span class="cl-label">' + r.label + '</span>' +
        '<span class="cl-before">' + r.before.toLocaleString() + '</span>' +
        '<span class="cl-arrow" aria-hidden="true">&rarr;</span>' +
        '<span class="cl-after">' + r.after.toLocaleString() + (r.kept ? " kept" : "") + '</span>' +
        '<span class="cl-note">' + r.note + '</span>' +
        '</div>';
    }).join("");
  }

  // KPI row, straight from the aggregate
  var kpi = root.querySelector(".fm-kpi");
  if (kpi) {
    kpi.innerHTML =
      '<div><span class="metric-number">' + short(D.kpi.revenue) + '</span><span>total revenue<br />across ' + D.kpi.lines.toLocaleString() + ' transaction lines</span></div>' +
      '<div><span class="metric-number">' + D.kpi.marginPct.toFixed(2) + '%</span><span>gross margin<br />' + short(D.kpi.grossProfit) + ' gross profit</span></div>' +
      '<div><span class="metric-number">' + D.kpi.units.toLocaleString() + '</span><span>units sold<br />across ' + D.quality.stores + ' stores</span></div>';
  }

  render();
})();
