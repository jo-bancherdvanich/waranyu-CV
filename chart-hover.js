/* Shared chart interaction: crosshair + tooltip.
 *
 * Every line chart on this site is hand-drawn inline SVG, so rather than
 * repeat hover logic three times, each chart hands this module its plotted
 * points in viewBox coordinates and gets a crosshair and tooltip for free.
 *
 *   attachChartHover(container, {
 *     points: [{ x, y, label, value }],   // viewBox coordinates
 *     top, bottom                          // crosshair extent, viewBox units
 *   });
 */
(function () {
  "use strict";

  window.attachChartHover = function (container, opts) {
    if (!container || !opts || !opts.points || !opts.points.length) return;
    var svg = container.querySelector("svg");
    if (!svg) return;
    if (window.matchMedia("(pointer: coarse)").matches) return; // no hover on touch

    var points = opts.points;
    var top = opts.top != null ? opts.top : 0;
    var bottom = opts.bottom != null ? opts.bottom : 100;
    var NS = "http://www.w3.org/2000/svg";

    // Crosshair and highlight dot, added once and moved around after that.
    var cross = document.createElementNS(NS, "line");
    cross.setAttribute("class", "ch-cross");
    cross.setAttribute("y1", top);
    cross.setAttribute("y2", bottom);
    cross.style.opacity = 0;
    svg.appendChild(cross);

    var halo = document.createElementNS(NS, "circle");
    halo.setAttribute("class", "ch-halo");
    halo.setAttribute("r", 7);
    halo.style.opacity = 0;
    svg.appendChild(halo);

    var dot = document.createElementNS(NS, "circle");
    dot.setAttribute("class", "ch-dot");
    dot.setAttribute("r", 4);
    dot.style.opacity = 0;
    svg.appendChild(dot);

    var tip = document.createElement("div");
    tip.className = "ch-tip";
    tip.hidden = true;
    if (getComputedStyle(container).position === "static") container.style.position = "relative";
    container.appendChild(tip);

    var vb = svg.viewBox.baseVal;

    function nearest(vbx) {
      var best = points[0], bestD = Math.abs(points[0].x - vbx);
      for (var i = 1; i < points.length; i++) {
        var d = Math.abs(points[i].x - vbx);
        if (d < bestD) { bestD = d; best = points[i]; }
      }
      return best;
    }

    function move(e) {
      var rect = svg.getBoundingClientRect();
      if (!rect.width) return;
      var vbx = vb.x + (e.clientX - rect.left) / rect.width * vb.width;
      var p = nearest(vbx);

      cross.setAttribute("x1", p.x);
      cross.setAttribute("x2", p.x);
      cross.style.opacity = 1;
      halo.setAttribute("cx", p.x); halo.setAttribute("cy", p.y); halo.style.opacity = 1;
      dot.setAttribute("cx", p.x); dot.setAttribute("cy", p.y); dot.style.opacity = 1;

      tip.innerHTML = '<span class="ch-tip-label">' + p.label + '</span>' +
        '<span class="ch-tip-value">' + p.value + '</span>';
      tip.hidden = false;

      // Position in container pixels, flipping side near the right edge.
      var px = (p.x - vb.x) / vb.width * rect.width;
      var py = (p.y - vb.y) / vb.height * rect.height;
      var offset = svg.getBoundingClientRect().left - container.getBoundingClientRect().left;
      var tw = tip.offsetWidth;
      var left = px + offset + 14;
      if (left + tw > container.clientWidth) left = px + offset - tw - 14;
      tip.style.left = Math.max(0, left) + "px";
      tip.style.top = Math.max(0, py - tip.offsetHeight / 2) + "px";
    }

    function leave() {
      cross.style.opacity = 0;
      halo.style.opacity = 0;
      dot.style.opacity = 0;
      tip.hidden = true;
    }

    svg.addEventListener("pointermove", move);
    svg.addEventListener("pointerleave", leave);
  };
})();
