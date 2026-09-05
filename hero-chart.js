/* Hero chart — Australia's renewable electricity share, 2005 to 2024.
 *
 * The same DCCEEW series the renewable case study uses, drawn as an inline SVG
 * that animates itself on load. No library: the line is a <path> whose dash
 * offset is animated from its own length down to zero.
 */
(function () {
  "use strict";

  var host = document.getElementById("hero-chart");
  if (!host) return;

  var DATA = [
    [2005, 8.924], [2006, 9.339], [2007, 8.713], [2008, 8.169], [2009, 7.643],
    [2010, 8.746], [2011, 10.573], [2012, 10.677], [2013, 13.4], [2014, 14.692],
    [2015, 13.485], [2016, 14.818], [2017, 15.679], [2018, 17.101], [2019, 19.704],
    [2020, 22.6], [2021, 26.661], [2022, 30.934], [2023, 33.798], [2024, 34.984]
  ];
  var FORECAST_2035 = 44.6;
  var TARGET = 82;

  var W = 640, H = 400, PL = 46, PR = 22, PT = 34, PB = 42;
  var X0 = 2005, X1 = 2035, Y1 = 90;

  var x = function (yr) { return PL + (yr - X0) * (W - PL - PR) / (X1 - X0); };
  var y = function (v) { return PT + (Y1 - v) * (H - PT - PB) / Y1; };

  // Gridlines and y labels
  var grid = "";
  [0, 20, 40, 60, 80].forEach(function (v) {
    grid += '<line x1="' + PL + '" y1="' + y(v) + '" x2="' + (W - PR) + '" y2="' + y(v) + '" class="hc-grid"/>' +
      '<text x="' + (PL - 9) + '" y="' + (y(v) + 4) + '" class="hc-axis" text-anchor="end">' + v + '%</text>';
  });
  [2005, 2015, 2024, 2035].forEach(function (yr) {
    grid += '<text x="' + x(yr) + '" y="' + (H - 14) + '" class="hc-axis" text-anchor="middle">' + yr + '</text>';
  });

  // Historical line + the area beneath it
  var pts = DATA.map(function (d) { return x(d[0]) + "," + y(d[1]); });
  var linePath = "M" + pts.join(" L");
  var areaPath = linePath + " L" + x(2024) + "," + y(0) + " L" + x(2005) + "," + y(0) + " Z";

  // Forecast continuation, drawn dashed
  var forecastPath = "M" + x(2024) + "," + y(34.984) + " L" + x(2035) + "," + y(FORECAST_2035);

  var dots = DATA.filter(function (_, i) { return i % 3 === 0 || i === DATA.length - 1; })
    .map(function (d) { return '<circle cx="' + x(d[0]) + '" cy="' + y(d[1]) + '" r="3" class="hc-dot"/>'; }).join("");

  host.innerHTML =
    '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" ' +
    'aria-label="Australia\'s renewable electricity share rose from 8.9 percent in 2005 to 35 percent in 2024, with a linear forecast reaching 44.6 percent by 2035, well short of the 82 percent target">' +
      grid +
      '<line x1="' + PL + '" y1="' + y(TARGET) + '" x2="' + (W - PR) + '" y2="' + y(TARGET) + '" class="hc-target"/>' +
      '<text x="' + (W - PR) + '" y="' + (y(TARGET) - 9) + '" class="hc-target-label" text-anchor="end">82% target (2030)</text>' +
      '<path d="' + areaPath + '" class="hc-area"/>' +
      '<path d="' + linePath + '" class="hc-line"/>' +
      '<path d="' + forecastPath + '" class="hc-forecast"/>' +
      dots +
      '<circle cx="' + x(2035) + '" cy="' + y(FORECAST_2035) + '" r="4" class="hc-end"/>' +
      '<text x="' + (x(2035) - 6) + '" y="' + (y(FORECAST_2035) - 12) + '" class="hc-end-label" text-anchor="end">44.6% by 2035</text>' +
    '</svg>';

  // Animate the stroke drawing itself, unless the visitor asked for less motion.
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var line = host.querySelector(".hc-line");
  var fc = host.querySelector(".hc-forecast");
  var area = host.querySelector(".hc-area");
  if (!line || !line.getTotalLength) return;

  var len = line.getTotalLength();
  var fcLen = fc.getTotalLength();
  line.style.strokeDasharray = len;
  line.style.strokeDashoffset = len;
  fc.style.strokeDasharray = "6 5";
  fc.style.opacity = 0;
  area.style.opacity = 0;
  host.querySelectorAll(".hc-dot, .hc-end, .hc-end-label").forEach(function (el) { el.style.opacity = 0; });

  requestAnimationFrame(function () {
    line.style.transition = "stroke-dashoffset 1.8s cubic-bezier(.4,0,.2,1)";
    line.style.strokeDashoffset = 0;
    area.style.transition = "opacity 1.4s ease .5s";
    area.style.opacity = 1;
    fc.style.transition = "opacity .6s ease 1.7s";
    fc.style.opacity = 1;
    host.querySelectorAll(".hc-dot").forEach(function (el, i) {
      el.style.transition = "opacity .4s ease " + (0.4 + i * 0.12) + "s";
      el.style.opacity = 1;
    });
    host.querySelectorAll(".hc-end, .hc-end-label").forEach(function (el) {
      el.style.transition = "opacity .5s ease 2.2s";
      el.style.opacity = 1;
    });
  });
})();
