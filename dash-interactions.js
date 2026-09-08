/* Shared dashboard motion.
 *
 * The dashboards rebuild their markup on every filter click, so bars are
 * rendered at zero and grown on the next frame. That way a re-slice animates
 * the same way the first paint does, which is how a Power BI visual behaves.
 * Panels only stagger in the first time they scroll into view.
 */
(function () {
  "use strict";

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* grow every bar and column from zero to its target size */
  window.dashGrow = function (root) {
    var fills = root.querySelectorAll("[data-w]");
    var cols = root.querySelectorAll("[data-h]");
    if (reduced) {
      fills.forEach(function (f) { f.style.width = f.getAttribute("data-w") + "%"; });
      cols.forEach(function (c) { c.style.height = c.getAttribute("data-h") + "%"; });
      return;
    }
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        fills.forEach(function (f) { f.style.width = f.getAttribute("data-w") + "%"; });
        cols.forEach(function (c) { c.style.height = c.getAttribute("data-h") + "%"; });
      });
    });
  };

  /* stagger the panels in the first time the dashboard is scrolled to */
  window.dashReveal = function (root) {
    if (reduced || !("IntersectionObserver" in window)) return;
    var panels = root.querySelectorAll(".dash-panel");
    panels.forEach(function (p, i) {
      p.classList.add("dash-enter");
      p.style.transitionDelay = Math.min(i * 70, 420) + "ms";
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-in");
        io.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.08 });
    panels.forEach(function (p) { io.observe(p); });
  };

  /* draw the line charts on, left to right */
  window.dashDrawLines = function (root) {
    if (reduced) return;
    root.querySelectorAll("polyline.dash-line, polyline.dash-linePrev").forEach(function (line) {
      var len;
      try { len = line.getTotalLength(); } catch (e) { return; }
      if (!len) return;
      line.style.strokeDasharray = len;
      line.style.strokeDashoffset = len;
      requestAnimationFrame(function () {
        line.style.transition = "stroke-dashoffset 1.1s cubic-bezier(.4,0,.2,1)";
        line.style.strokeDashoffset = 0;
      });
    });
  };
})();
