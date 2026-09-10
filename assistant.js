/* A small guide that sits in the bottom-right corner.
 *
 * It is a cartoon rather than a real 3D model on purpose: the site ships no
 * libraries and no build step, so the depth here comes from SVG gradients and
 * a soft ground shadow instead of WebGL. That keeps it a few KB, crisp at any
 * size, and correct in both themes.
 *
 * What it says depends on the page, so it acts as a guide to the work rather
 * than decoration. Closing the bubble only folds it away — the character stays
 * as the way back in, and that choice lasts the session rather than forever.
 */
(function () {
  "use strict";

  var KEY = "wb-assistant-quiet";
  /* An earlier build hid this permanently. Clear that flag so anyone who
     dismissed it then gets the guide back. */
  try { localStorage.removeItem("wb-assistant-hidden"); } catch (e) { /* private mode */ }
  function quiet(v) {
    try {
      if (v === undefined) return sessionStorage.getItem(KEY) === "1";
      if (v) sessionStorage.setItem(KEY, "1"); else sessionStorage.removeItem(KEY);
    } catch (e) { /* private mode: fall back to showing it */ }
    return v;
  }

  /* ---- what it says, per page ----------------------------------------- */
  var page = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  var SCRIPTS = {
    "index.html": [
      "Hi, I'm Jo's guide. Every project here is interactive — you can actually use them, not just read about them.",
      "Try the FreshMart dashboard: 17,697 real sales rows, and clicking any bar re-slices the whole report.",
      "Jo is after a data analyst internship in Perth, graduating July 2027.",
      "Want to get in touch? jojowaranyu.career@gmail.com"
    ],
    "freshmart.html": [
      "This dashboard is rebuilt from the same five CSVs the Power BI report used.",
      "Click a bar — region, category, store — and every other visual re-filters around it.",
      "The totals reconcile with the published report to the dollar: $321,301 revenue, 28.67% margin.",
      "Before any of this worked, 13 category spellings had to become 6 and 93 orphaned rows had to be handled."
    ],
    "renewable.html": [
      "Australia's renewable share went from 9% in 2005 to 35% in 2024.",
      "The forecast lands at 44.6% by 2035 — well short of the 82%-by-2030 target.",
      "Switch country to see the ranking flip: China leads on volume, but not on share.",
      "The regression is real: R² ≈ 0.85, p < 0.001, refit in your browser."
    ],
    "football-database.html": [
      "That diagram is live — drag it around, and zoom in to read each table's columns.",
      "Click any table to trace exactly what it joins to.",
      "The eight queries below run on the real sample season: 8 clubs, 96 players, 154 goals.",
      "Every relationship is read from the Oracle DDL, not from the drawing."
    ],
    "weatherwise.html": [
      "The demo below runs on live weather data — type a city and ask it something.",
      "The Python version uses one OpenWeatherMap call and splits it into daily summaries.",
      "The interesting bug: 'tomorrow' was reading today's eight 3-hour blocks."
    ]
  };
  var lines = SCRIPTS[page] || SCRIPTS["index.html"];

  /* ---- markup ---------------------------------------------------------- */
  var host = document.createElement("div");
  host.className = "asst";
  host.innerHTML =
    '<div class="asst-bubble" role="status" aria-live="polite">' +
      '<p class="asst-text"></p>' +
      '<span class="asst-more">tap me for more</span>' +
    '</div>' +
    '<button type="button" class="asst-btn" aria-label="Jo\'s guide — tap for a tip">' +
      '<svg class="asst-bot" viewBox="0 0 100 116" aria-hidden="true">' +
        '<defs>' +
          '<linearGradient id="asstBody" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0" stop-color="var(--asst-hi)"/>' +
            '<stop offset="1" stop-color="var(--asst-lo)"/>' +
          '</linearGradient>' +
          '<linearGradient id="asstHead" x1=".2" y1="0" x2=".8" y2="1">' +
            '<stop offset="0" stop-color="var(--asst-hi)"/>' +
            '<stop offset="1" stop-color="var(--asst-lo)"/>' +
          '</linearGradient>' +
          '<radialGradient id="asstGlass" cx=".38" cy=".3" r=".85">' +
            '<stop offset="0" stop-color="var(--asst-glass-hi)"/>' +
            '<stop offset="1" stop-color="var(--asst-glass-lo)"/>' +
          '</radialGradient>' +
        '</defs>' +
        /* ground shadow, squashed so the figure reads as standing on something */
        '<ellipse class="asst-shadow" cx="50" cy="108" rx="26" ry="5"/>' +
        '<g class="asst-float">' +
          /* antenna */
          '<path class="asst-stroke" d="M50 22V12"/>' +
          '<circle class="asst-blip" cx="50" cy="9" r="4.5"/>' +
          /* arms behind the body */
          '<rect class="asst-limb asst-arm-l" x="8" y="58" width="10" height="26" rx="5"/>' +
          '<rect class="asst-limb asst-arm-r" x="82" y="58" width="10" height="26" rx="5"/>' +
          /* body */
          '<rect x="18" y="56" width="64" height="44" rx="16" fill="url(#asstBody)"/>' +
          '<rect class="asst-belly" x="30" y="70" width="40" height="18" rx="9"/>' +
          /* head */
          '<rect x="14" y="20" width="72" height="42" rx="18" fill="url(#asstHead)"/>' +
          /* visor */
          '<rect x="23" y="28" width="54" height="26" rx="13" fill="url(#asstGlass)"/>' +
          '<g class="asst-eyes">' +
            '<circle class="asst-eye" cx="39" cy="41" r="5"/>' +
            '<circle class="asst-eye" cx="61" cy="41" r="5"/>' +
          '</g>' +
          '<path class="asst-smile" d="M43 48q7 5 14 0"/>' +
          /* visor highlight, the thing that sells the roundness */
          '<path class="asst-gloss" d="M28 34q10-6 22-4"/>' +
        '</g>' +
      '</svg>' +
    '</button>' +
    '<button type="button" class="asst-close" aria-label="Hide the message">&times;</button>';
  document.body.appendChild(host);

  var textEl = host.querySelector(".asst-text");
  var bubble = host.querySelector(".asst-bubble");
  var i = 0;

  function say(n) {
    textEl.textContent = lines[n % lines.length];
    bubble.classList.remove("is-pop");
    /* restart the pop animation */
    void bubble.offsetWidth;
    bubble.classList.add("is-pop");
  }

  say(0);
  host.querySelector(".asst-btn").addEventListener("click", function () {
    /* if it was folded away, the first tap brings the message back */
    if (host.classList.contains("is-quiet")) { fold(false); return; }
    i++;
    say(i);
  });
  /* folding, not removing — the character stays as the way back in */
  function fold(on) {
    host.classList.toggle("is-quiet", on);
    quiet(on);
  }
  host.querySelector(".asst-close").addEventListener("click", function (e) {
    e.stopPropagation();
    fold(true);
  });
  if (quiet()) host.classList.add("is-quiet");

  /* say the next line every so often, but never while the reader is hovering */
  var paused = false;
  host.addEventListener("mouseenter", function () { paused = true; });
  host.addEventListener("mouseleave", function () { paused = false; });
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    setInterval(function () {
      if (paused || host.classList.contains("is-quiet")) return;
      i++;
      say(i);
    }, 9000);
  }
})();
