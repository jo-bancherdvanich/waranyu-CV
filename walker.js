/* A small figure that walks along the foot of the page.
 *
 * It is not only decoration: its position is the scroll progress, so it doubles
 * as the reading indicator. It walks while the page moves, faces the direction
 * of travel, and stands still when you stop. Anyone who has asked not to see
 * motion gets nothing at all.
 */
(function () {
  "use strict";

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  /* the strip would crowd a phone screen, and the progress is less useful there */
  if (window.innerWidth <= 760) return;

  var NS = "http://www.w3.org/2000/svg";
  var strip = document.createElement("div");
  strip.className = "walker";
  strip.setAttribute("aria-hidden", "true");

  /* Line art, in the same stroke style as the section motifs, carrying a small
     bar chart — the figure is meant to read as the analyst, not as a mascot. */
  strip.innerHTML =
    '<div class="walker-fig">' +
    '<svg viewBox="0 0 40 52" fill="none" stroke="currentColor" stroke-width="2.1"' +
    ' stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="20" cy="8" r="6"/>' +
      '<path d="M20 14v18"/>' +
      '<path class="wk-arm wk-arm-b" d="M20 19l-8 6"/>' +
      '<g class="wk-board">' +
        '<rect x="24" y="18" width="14" height="12" rx="1.5"/>' +
        '<path d="M27 27v-3M30.5 27v-6M34 27v-4.5"/>' +
      '</g>' +
      '<path class="wk-arm wk-arm-f" d="M20 19l6 3"/>' +
      '<path class="wk-leg wk-leg-b" d="M20 32l-6 10 -3 2"/>' +
      '<path class="wk-leg wk-leg-f" d="M20 32l6 10 3 2"/>' +
    '</svg>' +
    '</div>';
  document.body.appendChild(strip);

  var fig = strip.querySelector(".walker-fig");
  var stopTimer = null;
  var lastY = window.scrollY;
  var facing = 1;

  function scrollProgress() {
    var doc = document.documentElement;
    var max = doc.scrollHeight - window.innerHeight;
    if (max <= 0) return 0;
    return Math.min(1, Math.max(0, window.scrollY / max));
  }

  function place() {
    /* keep the figure inside the viewport at both ends */
    var pct = scrollProgress() * 100;
    fig.style.left = "calc(" + pct.toFixed(2) + "% - " + (pct / 100 * 40).toFixed(1) + "px)";
  }

  function onScroll() {
    var y = window.scrollY;
    if (y !== lastY) {
      var dir = y > lastY ? 1 : -1;
      if (dir !== facing) {
        facing = dir;
        fig.style.transform = "scaleX(" + facing + ")";
      }
      lastY = y;
    }
    place();
    strip.classList.add("is-walking");
    clearTimeout(stopTimer);
    stopTimer = setTimeout(function () { strip.classList.remove("is-walking"); }, 160);
  }

  place();
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", place);
})();
