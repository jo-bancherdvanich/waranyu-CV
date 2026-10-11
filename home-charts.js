/* Two small charts on the home page, drawn from the projects' own data so
 * the "runs on real data" claim is visible before anyone clicks through.
 *
 *  - share:   Australia's renewable share of electricity, 2005-2024, the
 *             series behind the renewable dashboard (DCCEEW, via the
 *             project workbook).
 *  - revenue: FreshMart revenue by month for 2024, summed from the same
 *             17,697 transaction lines the live dashboard reads.
 *
 * Both are single-series, so the accent colour carries no identity and no
 * legend is needed; the title names the series. chart-hover.js adds the
 * crosshair and tooltip.
 */
(function () {
  "use strict";
  var SHARE = { years: [2005, 2006, 2007, 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024],
    values: [8.924, 9.339, 8.713, 8.169, 7.643, 8.746, 10.573, 10.677, 13.4, 14.692, 13.485, 14.818, 15.679, 17.101, 19.704, 22.6, 26.661, 30.934, 33.798, 34.984] };
  // dollars, January to December 2024
  var REVENUE = [8870.11, 8723.26, 9028.19, 9454.32, 8660.83, 8303.97, 7714.80, 9845.32, 9557.57, 8741.10, 9246.35, 8207.54];
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var NS = "http://www.w3.org/2000/svg";
  var W = 360, H = 130, L = 8, R = 44, T = 14, B = 24;

  function el(name, attrs, text) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }
  function fmtPct(v) { return v.toFixed(1) + "%"; }
  function fmtDollars(v) { return "$" + Math.round(v).toLocaleString("en-AU"); }

  function shareChart(fig) {
    var svg = el("svg", { viewBox: "0 0 " + W + " " + H, class: "mc-svg", role: "img", "aria-label": "Renewable share of electricity, 2005 to 2024, rising from 8.9% to 35.0%" });
    var n = SHARE.values.length, max = 40;
    var X = function (i) { return L + (i / (n - 1)) * (W - L - R); };
    var Y = function (v) { return T + (1 - v / max) * (H - T - B); };
    [0, 20, 40].forEach(function (g) {
      svg.appendChild(el("line", { class: "mc-grid", x1: L, x2: W - R, y1: Y(g), y2: Y(g) }));
      svg.appendChild(el("text", { class: "mc-axis", x: W - R + 6, y: Y(g) + 3 }, g + "%"));
    });
    var d = SHARE.values.map(function (v, i) { return (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1); }).join(" ");
    svg.appendChild(el("path", { class: "mc-line", d: d }));
    var last = n - 1;
    svg.appendChild(el("circle", { class: "mc-end", cx: X(last), cy: Y(SHARE.values[last]), r: 3.5 }));
    svg.appendChild(el("text", { class: "mc-axis", x: L, y: H - 6 }, "2005"));
    svg.appendChild(el("text", { class: "mc-axis mc-right", x: W - R, y: H - 6 }, "2024"));
    fig.insertBefore(svg, fig.firstChild);
    if (window.attachChartHover) {
      window.attachChartHover(fig, {
        points: SHARE.values.map(function (v, i) { return { x: X(i), y: Y(v), label: String(SHARE.years[i]), value: fmtPct(v) }; }),
        top: T, bottom: H - B,
      });
    }
  }

  function revenueChart(fig) {
    var svg = el("svg", { viewBox: "0 0 " + W + " " + H, class: "mc-svg", role: "img", "aria-label": "FreshMart revenue by month in 2024, between $7,700 and $9,900 a month" });
    var n = REVENUE.length, max = 10000;
    var slot = (W - L - R) / n, bw = slot - 4;
    var Y = function (v) { return T + (1 - v / max) * (H - T - B); };
    [0, 5000, 10000].forEach(function (g) {
      svg.appendChild(el("line", { class: "mc-grid", x1: L, x2: W - R, y1: Y(g), y2: Y(g) }));
      svg.appendChild(el("text", { class: "mc-axis", x: W - R + 6, y: Y(g) + 3 }, g ? "$" + g / 1000 + "k" : "0"));
    });
    var top = REVENUE.indexOf(Math.max.apply(null, REVENUE));
    REVENUE.forEach(function (v, i) {
      var x = L + i * slot + 2, y = Y(v), h = Y(0) - y;
      svg.appendChild(el("rect", { class: "mc-bar" + (i === top ? " is-top" : ""), x: x, y: y, width: bw, height: h, rx: 2 }));
      if (i % 3 === 0) svg.appendChild(el("text", { class: "mc-axis", x: x + bw / 2, y: H - 6, "text-anchor": "middle" }, MONTHS[i]));
    });
    svg.appendChild(el("text", { class: "mc-axis mc-ink", x: L + top * slot + 2 + bw / 2, y: Y(REVENUE[top]) - 5, "text-anchor": "middle" }, fmtDollars(REVENUE[top])));
    fig.insertBefore(svg, fig.firstChild);
    if (window.attachChartHover) {
      window.attachChartHover(fig, {
        points: REVENUE.map(function (v, i) { return { x: L + i * slot + 2 + bw / 2, y: Y(v), label: MONTHS[i] + " 2024", value: fmtDollars(v) }; }),
        top: T, bottom: H - B,
      });
    }
  }

  document.querySelectorAll(".mini-chart[data-chart]").forEach(function (fig) {
    if (fig.getAttribute("data-chart") === "share") shareChart(fig);
    else if (fig.getAttribute("data-chart") === "revenue") revenueChart(fig);
  });
})();
