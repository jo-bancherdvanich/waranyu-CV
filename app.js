/* Site behaviour: footer year, theme toggle, scroll reveal, counting numbers.
 * No dependencies, no build step.
 */
(function () {
  "use strict";

  var root = document.documentElement;
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- footer year ---------------------------------------------------- */
  var year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();

  /* ---- theme ---------------------------------------------------------- */
  // The stored choice wins; otherwise follow the operating system.
  function apply(theme) {
    if (theme === "light") root.setAttribute("data-theme", "light");
    else root.removeAttribute("data-theme");
    var btn = document.querySelector(".theme-toggle");
    if (btn) {
      var isLight = theme === "light";
      btn.textContent = isLight ? "☾" : "☀";
      btn.setAttribute("aria-label", isLight ? "Switch to dark theme" : "Switch to light theme");
      btn.setAttribute("aria-pressed", isLight ? "true" : "false");
    }
  }

  var stored = null;
  try { stored = localStorage.getItem("theme"); } catch (e) { /* private mode */ }
  var prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
  apply(stored || (prefersLight ? "light" : "dark"));

  var toggle = document.querySelector(".theme-toggle");
  if (toggle) {
    toggle.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
      apply(next);
      try { localStorage.setItem("theme", next); } catch (e) { /* ignore */ }
    });
  }

  /* ---- capability rows expand to say why the skill matters ------------ */
  document.querySelectorAll(".capability-list li[role='button']").forEach(function (li) {
    function toggle() {
      var open = li.classList.toggle("is-open");
      li.setAttribute("aria-expanded", open ? "true" : "false");
    }
    li.addEventListener("click", toggle);
    li.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
    });
  });

  /* ---- count up ------------------------------------------------------- */
  // Only plain integers animate. "R² 0.85" and "9% → 35%" are left alone.
  function countUp(el) {
    var raw = el.textContent.trim();
    if (!/^[\d,]+$/.test(raw)) return;
    var target = parseInt(raw.replace(/,/g, ""), 10);
    if (!isFinite(target) || target === 0) return;
    var started = null, dur = 1100;
    function step(ts) {
      if (started === null) started = ts;
      var p = Math.min(1, (ts - started) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased).toLocaleString();
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = raw;
    }
    requestAnimationFrame(step);
  }

  /* ---- scroll reveal and counting ------------------------------------- */
  // The case-study hero already animates itself on load, so it is left out of
  // the reveal set — two competing opacity rules would flicker.
  var reveals = document.querySelectorAll(".section, .banner, .contact, .metrics:not(.case-metrics)");
  var counters = document.querySelectorAll(".metrics");

  if (reduced || !("IntersectionObserver" in window)) {
    reveals.forEach(function (t) { t.classList.add("is-visible"); });
    return;
  }

  reveals.forEach(function (t) { t.classList.add("reveal"); });

  var revealIO = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      revealIO.unobserve(entry.target);
    });
  }, { rootMargin: "0px 0px -12% 0px", threshold: 0.08 });
  reveals.forEach(function (t) { revealIO.observe(t); });

  var countIO = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.querySelectorAll(".metric-number").forEach(countUp);
      countIO.unobserve(entry.target);
    });
  }, { threshold: 0.3 });
  counters.forEach(function (t) { countIO.observe(t); });
})();
