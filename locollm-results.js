/* LocoLLM capstone: the results explorer and the domain test.
 *
 * Every number here is from the team's client presentation and final report
 * (MGMT6052, October 2026): the 15-domain base-model test, the
 * accuracy of each training run on the sealed 170-question benchmark,
 * and the per-principle scores (correct answers out of 10).
 * Nothing is recalculated except the counts shown in tooltips.
 */
(function () {
  "use strict";

  var RUNS = [
    { id: "base", label: "Base model", short: "Base", single: 12, n: 15, multi: 5, trick: 45,
      change: "<strong>No training.</strong> The untrained Qwen3-4B model. It answered 15 of 130 one-principle questions (12%, the like-for-like figure in the final team report); the other two scores come from an earlier test. It knows privacy law exists but mixes up the principle numbers." },
    { id: "r1", label: "Run 1", short: "Run 1", step: "First adapter", single: 32, n: 42, multi: 34, trick: 90,
      change: "<strong>First adapter</strong>, trained on 615 examples. It learned the answer layout almost perfectly, but fell back on &ldquo;no principle applies&rdquo; 54 times, so the trick-question score looks better than it is." },
    { id: "r2", label: "Run 2", short: "Run 2", step: "New random seed", single: 32, n: 41, multi: 35, trick: 70,
      change: "<strong>Same data, same settings, new random seed.</strong> Almost the same score (41 against 42), yet about one answer in five flipped. Small gaps between runs can be luck." },
    { id: "r4", label: "Run 4", short: "Run 4", step: "Reasoning first", single: 38, n: 49, multi: 43, trick: 20,
      change: "<strong>Reasoning first, then the answer.</strong> Same data, new line order. Wrong &ldquo;no principle&rdquo; guesses fell from 54 to 5, but the model still named the wrong principle 78 times." },
    { id: "r5", label: "Run 5", short: "Run 5", step: "MLP layers trained too", single: 81, n: 105, multi: 65, trick: 85,
      change: "<strong>Train more of the model.</strong> One line of settings also trained the MLP layers, the part that stores knowledge. Wrong principles fell from 78 to 20." }
  ];

  var TYPES = [
    { key: "single", label: "One principle", sub: "130 questions" },
    { key: "multi", label: "Several principles", sub: "20, partial credit" },
    { key: "trick", label: "None applies", sub: "20 trick questions" }
  ];

  // Correct answers out of 10, per Australian Privacy Principle:
  // [base model, Run 2, Run 4, Run 5]
  var HEAT_RUNS = ["base", "r2", "r4", "r5"];
  var APPS = [
    ["APP 1", "Open management", [1, 5, 7, 7]],
    ["APP 2", "Anonymity", [0, 1, 2, 6]],
    ["APP 3", "Collecting data", [0, 2, 6, 6]],
    ["APP 4", "Unsolicited data", [0, 0, 1, 8]],
    ["APP 5", "Notification", [1, 0, 1, 8]],
    ["APP 6", "Use or disclosure", [0, 8, 3, 10]],
    ["APP 7", "Direct marketing", [0, 6, 7, 9]],
    ["APP 8", "Cross-border", [0, 7, 9, 10]],
    ["APP 9", "Government IDs", [0, 0, 0, 7]],
    ["APP 10", "Data quality", [1, 7, 6, 7]],
    ["APP 11", "Security", [0, 0, 5, 9]],
    ["APP 12", "Access", [0, 0, 2, 9]],
    ["APP 13", "Correction", [0, 5, 0, 9]]
  ];

  // Base-model test before the domain was chosen: correct out of 5.
  var DOMAINS = [
    ["Business writing", 5], ["Financial analysis", 5], ["Marketing strategy", 5],
    ["Statistics for business", 5], ["Project management", 5], ["Business and AI ethics", 5],
    ["Accounting concepts", 5], ["Supply chain and operations", 5], ["Entrepreneurship", 5],
    ["Research methods", 5], ["Information systems", 5], ["Customer service and CX", 4],
    ["Cybersecurity fundamentals", 3], ["HR and people management", 0],
    ["Compliance and privacy law", 0, true]
  ];

  function esc(s) { return String(s).replace(/&(?![a-z]+;)/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }
  function byId(id) { for (var i = 0; i < RUNS.length; i++) if (RUNS[i].id === id) return RUNS[i]; return null; }

  /* ---- a shared tooltip, positioned inside its container ------------- */
  function makeTip(box) {
    if (getComputedStyle(box).position === "static") box.style.position = "relative";
    var tip = document.createElement("div");
    tip.className = "ch-tip";
    tip.hidden = true;
    tip.setAttribute("aria-hidden", "true");
    box.appendChild(tip);
    box.addEventListener("pointermove", function (e) {
      var t = e.target.closest ? e.target.closest("[data-tip-label]") : null;
      if (!t || !box.contains(t)) { tip.hidden = true; return; }
      tip.innerHTML = '<span class="ch-tip-label">' + esc(t.getAttribute("data-tip-label")) + '</span><span class="ch-tip-value">' + esc(t.getAttribute("data-tip-value")) + "</span>";
      tip.hidden = false;
      var r = box.getBoundingClientRect();
      var x = e.clientX - r.left + 14, y = e.clientY - r.top + 14;
      var w = tip.offsetWidth, h = tip.offsetHeight;
      if (x + w > r.width) x = e.clientX - r.left - w - 14;
      if (y + h > r.height) y = e.clientY - r.top - h - 14;
      tip.style.left = Math.max(0, x) + "px";
      tip.style.top = Math.max(0, y) + "px";
    });
    box.addEventListener("pointerleave", function () { tip.hidden = true; });
  }

  /* ---- the domain test ---------------------------------------------- */
  var dom = document.getElementById("ll-domains");
  if (dom) {
    dom.innerHTML = '<div class="dash-bars">' + DOMAINS.map(function (d) {
      return '<div class="dash-row' + (d[2] ? " is-picked" : "") + '" data-tip-label="' + esc(d[0]) + '" data-tip-value="' + d[1] + ' of 5 correct">' +
        '<span class="dash-key">' + esc(d[0]) + (d[2] ? ' <span class="ll-flag">our choice</span>' : "") + "</span>" +
        '<span class="dash-track"><span class="dash-fill" style="width:' + (d[1] / 5 * 100) + '%"></span></span>' +
        '<span class="dash-val">' + d[1] + "/5</span></div>";
    }).join("") + "</div>";
    makeTip(dom);
  }

  /* ---- the results explorer ----------------------------------------- */
  var root = document.getElementById("ll-dash");
  if (!root) return;
  var state = { run: "r5" };

  root.innerHTML =
    '<div class="dash-slicers"><div class="dash-slicer"><span class="dash-slabel">Training run</span>' +
    '<div class="dash-schips" role="group" aria-label="Choose a training run">' +
    RUNS.map(function (r) { return '<button type="button" class="dash-chip" data-run="' + r.id + '">' + r.label + "</button>"; }).join("") +
    "</div></div></div>" +
    '<div class="dash-grid-wrap">' +
    '<section class="dash-panel"><h3>One-principle accuracy, run by run</h3>' +
    '<p class="dash-subtitle">130 single-answer questions in the sealed benchmark. Click a run.</p>' +
    '<div class="dash-cols ll-cols" id="ll-cols"></div>' +
    '<p class="ll-steps-title">What changed each run</p><ol class="ll-steps" id="ll-steps"></ol></section>' +
    '<section class="dash-panel"><h3 id="ll-type-title"></h3>' +
    '<p class="dash-subtitle">Share of answers correct, by question type.</p>' +
    '<div class="dash-bars ll-types" id="ll-types"></div><p class="ll-change" id="ll-change" aria-live="polite"></p></section>' +
    '<section class="dash-panel dash-wide"><h3>Which principles does it know?</h3>' +
    '<p class="dash-subtitle">Correct answers out of 10 for each Australian Privacy Principle. Per-principle scores were reported for the base model and Runs 2, 4 and 5.</p>' +
    '<div class="ll-heatwrap" id="ll-heat"></div>' +
    '<p class="ll-legend" aria-hidden="true">0 <i style="--v:0"></i><i style="--v:3"></i><i style="--v:6"></i><i style="--v:10"></i> 10 out of 10</p></section>' +
    "</div>";

  var chips = root.querySelectorAll(".dash-chip");
  var cols = root.querySelector("#ll-cols");
  var types = root.querySelector("#ll-types");
  var change = root.querySelector("#ll-change");
  var typeTitle = root.querySelector("#ll-type-title");
  var heat = root.querySelector("#ll-heat");

  cols.innerHTML = RUNS.map(function (r) {
    return '<button type="button" class="dash-col ll-col" data-run="' + r.id + '" data-tip-label="' + esc(r.label) + ' · one principle" data-tip-value="' + r.single + "% (" + r.n + ' of 130)" aria-label="' + esc(r.label) + ": " + r.single + '% correct">' +
      '<span class="dash-colval">' + r.single + '%</span><span class="dash-colbar" style="height:' + Math.max(r.single, 1.5) + '%"></span>' +
      '<span class="dash-collab">' + r.short + "</span></button>";
  }).join("");

  root.querySelector("#ll-steps").innerHTML = RUNS.slice(1).map(function (r, i) {
    var d = r.single - RUNS[i].single;
    return '<li><button type="button" class="ll-step" data-run="' + r.id + '"><span class="ll-step-run">' + r.short + '</span>' +
      '<span class="ll-step-what">' + r.step + '</span><span class="ll-step-delta">' + (d > 0 ? "+" : d < 0 ? "&minus;" : "&plusmn;") + Math.abs(d) + " pts</span></button></li>";
  }).join("");

  var head = '<table class="ll-heat"><caption class="sr-only">Correct answers out of 10 for each privacy principle, by training run</caption><thead><tr><th scope="col">Principle</th>' +
    HEAT_RUNS.map(function (id) { return '<th scope="col" data-col="' + id + '">' + byId(id).short + "</th>"; }).join("") + "</tr></thead><tbody>";
  heat.innerHTML = head + APPS.map(function (a) {
    return '<tr><th scope="row">' + a[0] + "<span>" + esc(a[1]) + "</span></th>" + a[2].map(function (v, i) {
      var r = byId(HEAT_RUNS[i]);
      return '<td data-col="' + r.id + '" style="--v:' + v + '" data-tip-label="' + a[0] + " · " + esc(a[1]) + " · " + r.label + '" data-tip-value="' + v + ' of 10 correct">' + v + "</td>";
    }).join("") + "</tr>";
  }).join("") + "</tbody></table>";

  function render() {
    var r = byId(state.run);
    var idx = RUNS.indexOf(r), prev = idx > 0 ? RUNS[idx - 1] : null;
    Array.prototype.forEach.call(chips, function (c) {
      var on = c.getAttribute("data-run") === state.run;
      c.classList.toggle("is-on", on);
      c.setAttribute("aria-pressed", on ? "true" : "false");
    });
    Array.prototype.forEach.call(root.querySelectorAll(".ll-col, .ll-step"), function (c) { c.classList.toggle("is-on", c.getAttribute("data-run") === state.run); });
    typeTitle.textContent = r.label + ", by question type";
    types.innerHTML = TYPES.map(function (t) {
      return '<div class="dash-row" data-tip-label="' + esc(r.label + " · " + t.label) + '" data-tip-value="' + r[t.key] + '% correct">' +
        '<span class="dash-key">' + t.label + '<span class="ll-sub">' + t.sub + "</span></span>" +
        '<span class="dash-track"><span class="dash-fill" style="width:' + r[t.key] + '%"></span></span>' +
        '<span class="dash-val">' + r[t.key] + "%</span></div>";
    }).join("");
    var delta = "";
    if (prev) {
      var d = r.single - prev.single;
      delta = '<span class="ll-delta">' + (d > 0 ? "+" : d < 0 ? "&minus;" : "&plusmn;") + Math.abs(d) + " points on one-principle questions against " + prev.label + "</span>";
    }
    change.innerHTML = r.change + delta;
    Array.prototype.forEach.call(heat.querySelectorAll("[data-col]"), function (c) { c.classList.toggle("is-on", c.getAttribute("data-col") === state.run); });
  }

  root.addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("[data-run]") : null;
    if (!b || !root.contains(b)) return;
    state.run = b.getAttribute("data-run");
    render();
  });

  makeTip(root);
  render();
})();
