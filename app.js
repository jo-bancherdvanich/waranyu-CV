/* Site behaviour: footer year, theme toggle, scroll progress, scroll reveal,
 * staggered items, counting numbers.
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

  /* ---- mobile navigation ---------------------------------------------- */
  // Below 720px the nav collapses behind a button. Closing on link click,
  // outside click and Escape keeps it from stranding the reader.
  var navToggle = document.querySelector(".nav-toggle");
  var primaryNav = document.getElementById("primary-nav");
  if (navToggle && primaryNav) {
    var setNavOpen = function (open) {
      primaryNav.classList.toggle("is-open", open);
      navToggle.setAttribute("aria-expanded", open ? "true" : "false");
      navToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    };
    navToggle.addEventListener("click", function (e) {
      e.stopPropagation();
      setNavOpen(!primaryNav.classList.contains("is-open"));
    });
    primaryNav.addEventListener("click", function (e) {
      if (e.target.closest("a")) setNavOpen(false);
    });
    document.addEventListener("click", function (e) {
      if (!primaryNav.contains(e.target) && !navToggle.contains(e.target)) setNavOpen(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") setNavOpen(false);
    });
  }

  /* ---- project cards ---------------------------------------------------- */
  // The cards carry two real links now, so the card itself is no longer an
  // anchor. Clicking the surrounding area still opens the case study, but a
  // click that landed on a link or a button is left alone.
  document.querySelectorAll(".project-card[data-href]").forEach(function (card) {
    card.addEventListener("click", function (e) {
      if (e.target.closest("a, button")) return;
      if (window.getSelection && String(window.getSelection())) return;
      window.location.href = card.getAttribute("data-href");
    });
  });

  /* ---- scroll progress ---------------------------------------------- */
  // A direct readout of scroll position, like a scrollbar, so it runs even
  // with reduced motion. Only transform changes.
  var progress = document.querySelector(".scroll-progress");
  if (progress) {
    var ticking = false;
    var paint = function () {
      ticking = false;
      var max = document.documentElement.scrollHeight - window.innerHeight;
      var p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      progress.style.transform = "scaleX(" + p + ")";
    };
    var queue = function () {
      if (!ticking) { ticking = true; requestAnimationFrame(paint); }
    };
    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    paint();
  }

  /* ---- count up ------------------------------------------------------- */
  // The final value is already in the HTML, so the page is correct without
  // JS. data-count holds the number and data-dp its decimal places; anything
  // around the number in the text (a % sign) is kept as it is.
  function fmt(v, dp) {
    return v.toLocaleString("en-AU", { minimumFractionDigits: dp, maximumFractionDigits: dp });
  }
  function countUp(el) {
    var target = parseFloat(el.getAttribute("data-count"));
    var dp = parseInt(el.getAttribute("data-dp") || "0", 10);
    if (!isFinite(target)) return;
    var final = el.textContent;
    var at = final.indexOf(fmt(target, dp));
    if (at < 0) return;
    var before = final.slice(0, at);
    var after = final.slice(at + fmt(target, dp).length);
    // Hold the finished width so the sentence around it never reflows.
    el.style.minWidth = el.getBoundingClientRect().width + "px";
    var started = null, dur = 1200;
    function step(ts) {
      if (started === null) started = ts;
      var p = Math.min(1, (ts - started) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = before + fmt(target * eased, dp) + after;
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = final;
    }
    requestAnimationFrame(step);
  }
  // The case-study metric strips predate data-count; plain integers there
  // are given one so they count the same way.
  document.querySelectorAll(".metrics .metric-number:not([data-count])").forEach(function (el) {
    var raw = el.textContent.trim();
    if (/^[\d,]+$/.test(raw)) el.setAttribute("data-count", raw.replace(/,/g, ""));
  });

  /* ---- scroll reveal, stagger and counting ---------------------------- */
  // The case-study hero (eyebrow, h1, lede, actions, metrics, screenshot)
  // animates itself on load, so it stays out of the reveal set — two competing
  // opacity rules would flicker. Everything below it reveals on scroll.
  var STAGGER = ".project-card, .capability-list li, .timeline-item, .principle-list li";
  var reveals = document.querySelectorAll(
    ".section, .banner, .contact, .case-block, .case-meta, .metrics:not(.case-metrics)"
  );
  var items = document.querySelectorAll(STAGGER);
  var counters = document.querySelectorAll("[data-count]");

  if (reduced) {
    // CSS already stops the marquee under reduced motion; this covers any
    // browser that honours the setting in JS but not in the media query.
    document.querySelectorAll(".tools-marquee").forEach(function (m) { m.classList.add("is-static"); });
  }
  if (reduced || !("IntersectionObserver" in window)) {
    reveals.forEach(function (t) { t.classList.add("is-visible"); });
    return;
  }

  // A section whose items stagger in does not also fade as a block: the two
  // fades on top of each other read as mush.
  reveals.forEach(function (t) {
    if (!t.querySelector(STAGGER)) t.classList.add("reveal");
  });

  var revealIO = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      revealIO.unobserve(entry.target);
    });
  }, { rootMargin: "0px 0px -12% 0px", threshold: 0.08 });
  reveals.forEach(function (t) { revealIO.observe(t); });

  // Items that arrive together go in document order, 80ms apart, and the
  // delay starts again every six so a long batch never keeps anyone waiting.
  var staggerIO = new IntersectionObserver(function (entries) {
    var n = 0;
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      var el = entry.target;
      var delay = (n++ % 6) * 80;
      staggerIO.unobserve(el);
      el.style.setProperty("--stagger-delay", delay + "ms");
      el.classList.add("is-in");
      setTimeout(function () {
        el.classList.remove("stagger", "is-in");
        el.style.removeProperty("--stagger-delay");
      }, delay + 650);
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
  items.forEach(function (el) {
    el.classList.add("stagger");
    staggerIO.observe(el);
  });

  var countIO = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      countUp(entry.target);
      countIO.unobserve(entry.target);
    });
  }, { threshold: 0.6 });
  counters.forEach(function (t) { countIO.observe(t); });
})();
