/* Site behaviour: footer year, theme toggle, capability rows, phone
 * navigation, the sticky top bar and the case-study video. No dependencies,
 * no build step. Nothing here animates content into view: the page is
 * complete as plain HTML.
 */
(function () {
  "use strict";

  var root = document.documentElement;
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- footer year ---------------------------------------------------- */
  var year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();

  /* ---- theme ---------------------------------------------------------- */
  // The stored choice wins; otherwise follow the operating system. The
  // stylesheet is light by default and dark under data-theme="dark".
  function apply(theme) {
    root.setAttribute("data-theme", theme);
    var btn = document.querySelector(".theme-toggle");
    if (btn) {
      var isDark = theme === "dark";
      btn.setAttribute("aria-label", isDark ? "Switch to light theme" : "Switch to dark theme");
      btn.setAttribute("aria-pressed", isDark ? "true" : "false");
    }
  }

  var stored = null;
  try { stored = localStorage.getItem("theme"); } catch (e) { /* private mode */ }
  var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  apply(stored === "light" || stored === "dark" ? stored : (prefersDark ? "dark" : "light"));

  var toggle = document.querySelector(".theme-toggle");
  if (toggle) {
    toggle.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      try { localStorage.setItem("theme", next); } catch (e) { /* ignore */ }
      apply(next);
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

  /* ---- project details fold on phones --------------------------------- */
  // The bullets ship open (correct without JS and on wide screens); on a
  // phone they start folded so four cards do not fill half the page.
  var narrowQ = window.matchMedia("(max-width: 720px)");
  function foldDetails() {
    document.querySelectorAll(".project-more").forEach(function (d) {
      if (narrowQ.matches) { if (!d.hasAttribute("data-user")) d.open = false; }
      else d.open = true;
    });
  }
  document.querySelectorAll(".project-more").forEach(function (d) {
    d.addEventListener("toggle", function () { if (narrowQ.matches) d.setAttribute("data-user", "1"); });
  });
  foldDetails();
  if (narrowQ.addEventListener) narrowQ.addEventListener("change", foldDetails);


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
})();

/* ---- case-study video ---------------------------------------------------
 * Plays muted on loop once it is on screen and pauses when it scrolls away.
 * The button pauses and resumes it; reduced motion keeps it on the poster
 * frame until the reader presses play. */
(function () {
  "use strict";
  var fig = document.querySelector(".case-video");
  if (!fig) return;
  var v = fig.querySelector("video"), btn = fig.querySelector(".cv-toggle"), label = fig.querySelector(".cv-label");
  var captions = fig.querySelector(".cv-captions");
  if (captions && v.textTracks && v.textTracks.length) {
    var track = v.textTracks[0];
    captions.addEventListener("click", function () {
      var on = track.mode !== "showing";
      track.mode = on ? "showing" : "hidden";
      captions.setAttribute("aria-pressed", on ? "true" : "false");
      captions.textContent = on ? "Captions off" : "Captions on";
    });
  }
  var sound = fig.querySelector(".cv-sound");
  if (sound) {
    // Autoplay has to start muted; the narration comes on when asked for
    sound.addEventListener("click", function () {
      v.muted = !v.muted;
      sound.setAttribute("aria-pressed", v.muted ? "false" : "true");
      sound.textContent = v.muted ? "Sound on" : "Sound off";
      if (v.paused && !v.muted) { userPaused = false; tryPlay(); }
    });
  }
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var userPaused = reduced;
  function sync() {
    var paused = v.paused;
    btn.setAttribute("aria-pressed", paused ? "true" : "false");
    label.textContent = paused ? "Play" : "Pause";
    btn.setAttribute("aria-label", (paused ? "Play" : "Pause") + " the overview video");
  }
  function tryPlay() { var p = v.play(); if (p && p.catch) p.catch(function () { sync(); }); }
  btn.addEventListener("click", function () {
    if (v.paused) { userPaused = false; tryPlay(); } else { userPaused = true; v.pause(); }
  });
  v.addEventListener("play", sync); v.addEventListener("pause", sync);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting && !userPaused) tryPlay();
        else if (!e.isIntersecting && !v.paused) v.pause();
      });
    }, { threshold: 0.35 }).observe(v);
  } else if (!userPaused) { tryPlay(); }
  sync();
})();
