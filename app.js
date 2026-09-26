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
      try { localStorage.setItem("theme", next); } catch (e) { /* ignore */ }
      // The new theme spreads out in a circle from the button. Browsers
      // without view transitions, and reduced motion, simply switch.
      if (!document.startViewTransition || reduced) { apply(next); return; }
      var r = toggle.getBoundingClientRect();
      var x = r.left + r.width / 2, y = r.top + r.height / 2;
      var reach = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
      root.classList.add("theme-vt");
      var vt = document.startViewTransition(function () { apply(next); });
      vt.ready.then(function () {
        root.animate(
          { clipPath: ["circle(0px at " + x + "px " + y + "px)", "circle(" + reach + "px at " + x + "px " + y + "px)"] },
          { duration: 560, easing: "cubic-bezier(.4, 0, .2, 1)", pseudoElement: "::view-transition-new(root)" }
        );
      }).catch(function () { /* skipped transitions still apply the theme */ });
      vt.finished.finally(function () { root.classList.remove("theme-vt"); });
    });
  }

  /* ---- capability rows expand to say why the skill matters ------------ */
  // The skill name is a real <button> (keyboard and screen readers get it
  // for free); a click anywhere on the row does the same thing for the mouse.
  document.querySelectorAll(".capability-list li").forEach(function (li) {
    var btn = li.querySelector(".cap-toggle");
    if (!btn) return;
    li.addEventListener("click", function () {
      var open = li.classList.toggle("is-open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
  });

  /* ---- copy email ----------------------------------------------------- */
  // Not everyone has a mail app set up, so the address can be copied in one
  // click. The clipboard API needs a secure context; the textarea route
  // covers older browsers.
  document.querySelectorAll(".contact-copy").forEach(function (btn) {
    var label = btn.querySelector(".cc-label");
    var live = btn.querySelector("[aria-live]");
    var timer = null;
    function done(ok) {
      label.textContent = ok ? "Copied" : "Copy failed";
      live.textContent = ok ? "Email address copied" : "";
      btn.classList.toggle("is-done", ok);
      clearTimeout(timer);
      timer = setTimeout(function () {
        label.textContent = "Copy email";
        live.textContent = "";
        btn.classList.remove("is-done");
      }, 2200);
    }
    btn.addEventListener("click", function () {
      var text = btn.getAttribute("data-copy");
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(function () { done(true); }, fallback);
      } else {
        fallback();
      }
      function fallback() {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        var ok = false;
        try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
        document.body.removeChild(ta);
        done(ok);
      }
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

  /* ---- screenshot wall behind Selected work --------------------------- */
  // Built from the hero wall's own tracks rather than repeated in the HTML:
  // four columns across the section, alternating direction. Decorative only,
  // so it is hidden from assistive technology like the hero wall.
  var heroWall = document.querySelector(".hero-wall");
  var projects = document.getElementById("projects");
  if (heroWall && projects) {
    var tracks = heroWall.querySelectorAll(".wall-track");
    var wall = document.createElement("div");
    wall.className = "section-wall";
    wall.setAttribute("aria-hidden", "true");
    for (var c = 0; c < 4; c++) {
      var col = document.createElement("div");
      col.className = "wall-col" + (c % 2 ? " wall-col-rev" : "");
      col.appendChild(tracks[c % tracks.length].cloneNode(true));
      wall.appendChild(col);
    }
    projects.insertBefore(wall, projects.firstChild);
  }

  // Both walls stop moving while they are off screen, so a phone is not
  // animating two dozen images nobody can see.
  if ("IntersectionObserver" in window) {
    var wallIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        entry.target.classList.toggle("is-offscreen", !entry.isIntersecting);
      });
    });
    document.querySelectorAll(".hero-wall, .section-wall").forEach(function (w) { wallIO.observe(w); });
  }

  /* ---- project card light -------------------------------------------- */
  // A glow that follows the pointer across each project card. Only its
  // transform changes, and it is left out on touch screens and when the
  // visitor prefers less motion.
  if (!reduced && window.matchMedia("(hover: hover)").matches) {
    document.querySelectorAll(".project-card").forEach(function (card) {
      var glow = document.createElement("span");
      glow.className = "card-glow";
      glow.setAttribute("aria-hidden", "true");
      card.insertBefore(glow, card.firstChild);
      card.addEventListener("pointermove", function (e) {
        var r = card.getBoundingClientRect();
        glow.style.setProperty("--gx", (e.clientX - r.left) + "px");
        glow.style.setProperty("--gy", (e.clientY - r.top) + "px");
      });
    });
  }

  /* ---- hero headline entrance ----------------------------------------- */
  // Each word of the headline rises in turn, and the italic word lands last.
  // The words are wrapped in spans only here, so without JS (or with reduced
  // motion) the heading is exactly the plain HTML.
  var title = document.getElementById("intro-title");
  if (title && !reduced && document.querySelector(".intro")) {
    var w = 0;
    Array.prototype.slice.call(title.childNodes).forEach(function (node) {
      if (node.nodeType === 3) {
        var frag = document.createDocumentFragment();
        node.textContent.split(/(\s+)/).forEach(function (tok) {
          if (!tok) return;
          if (/^\s+$/.test(tok)) { frag.appendChild(document.createTextNode(tok)); return; }
          var span = document.createElement("span");
          span.className = "hw";
          span.style.setProperty("--w", w++);
          span.textContent = tok;
          frag.appendChild(span);
        });
        title.replaceChild(frag, node);
      } else if (node.nodeType === 1) {
        node.classList.add("hw", "hw-last");
      }
    });
    title.querySelectorAll(".hw-last").forEach(function (el) { el.style.setProperty("--w", w + 1); });
    title.classList.add("is-split");
  }

  /* ---- sticky top bar ------------------------------------------------ */
  // The bar is transparent at the top of the page and gains a backing once
  // the page has scrolled, so text never shows through it.
  var topbar = document.querySelector(".topbar");
  if (topbar) {
    var barQueued = false;
    var setBar = function () {
      barQueued = false;
      topbar.classList.toggle("is-scrolled", window.scrollY > 8);
    };
    window.addEventListener("scroll", function () {
      if (!barQueued) { barQueued = true; requestAnimationFrame(setBar); }
    }, { passive: true });
    setBar();
  }

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
