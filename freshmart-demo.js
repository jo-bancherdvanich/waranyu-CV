/* FreshMart — what the cleaning changed, before and after.
 *
 * Figures come from the data quality audit of the five source CSVs. The
 * dashboard itself is built separately in freshmart-dashboard.js.
 */
(function () {
  "use strict";

  if (!window.FRESHMART_DATA) return;
  var D = window.FRESHMART_DATA;
  var clean = document.getElementById("fm-clean");
  if (!clean) return;

  var q = D.quality;
  var fmt = Object.keys(q.dateFormatCounts || {})
    .map(function (k) { return k + " (" + q.dateFormatCounts[k].toLocaleString() + ")"; })
    .join(" · ");

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
})();
