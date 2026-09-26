/* Section navigator: a black button in the bottom-right corner that names the
 * section you are reading and opens a list of every section on the page.
 *
 * It builds itself from the page rather than from a hard-coded list, so the
 * landing page gets its numbered sections and each case study gets its own
 * blocks. No dependencies, no build step.
 */
(function () {
  "use strict";

  /* ---- which sections this page has ------------------------------------ */
  function slug(text) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }
  function label(el) {
    var h = el.querySelector("h2");
    // textContent of the heading only, without the icon or counter
    return h ? h.textContent.replace(/\s+/g, " ").trim() : "";
  }

  var targets = [];
  var isHome = !!document.querySelector(".intro");
  var candidates = isHome
    ? document.querySelectorAll("main > section.section, main > section.contact")
    : document.querySelectorAll(".case-block");

  candidates.forEach(function (el) {
    // The contact heading is a sentence; the menu just needs its name
    var text = el.classList.contains("contact") ? "Contact" : label(el);
    if (!text) return;
    if (!el.id) {
      var id = slug(text);
      if (!id || document.getElementById(id)) return;
      el.id = id;
    }
    targets.push({ el: el, id: el.id, text: text });
  });
  if (!targets.length) return;

  /* ---- markup ---------------------------------------------------------- */
  var host = document.createElement("div");
  host.className = "snav";
  var items = targets.map(function (t, n) {
    var num = n + 1 < 10 ? "0" + (n + 1) : String(n + 1);
    return '<li><a href="#' + t.id + '" data-id="' + t.id + '">' +
      '<span class="snav-num" aria-hidden="true">' + num + '</span>' +
      '<span class="snav-name"></span></a></li>';
  }).join("");
  var back = isHome
    ? '<li class="snav-extra"><a href="#top">Back to top</a></li>'
    : '<li class="snav-extra"><a href="index.html#projects">All projects</a></li>';

  host.innerHTML =
    '<nav class="snav-panel" id="snav-panel" aria-label="Sections on this page" hidden>' +
      '<ol class="snav-list">' + items + back + '</ol>' +
    '</nav>' +
    '<button type="button" class="snav-btn" aria-expanded="false" aria-controls="snav-panel">' +
      '<svg class="snav-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h10M4 17h13"/></svg>' +
      '<span class="snav-current">Sections</span>' +
    '</button>';
  document.body.appendChild(host);

  // Names go in as text, never as HTML
  host.querySelectorAll(".snav-name").forEach(function (span, n) {
    span.textContent = targets[n].text;
  });

  var btn = host.querySelector(".snav-btn");
  var panel = host.querySelector(".snav-panel");
  var current = host.querySelector(".snav-current");
  var links = host.querySelectorAll(".snav-list a[data-id]");

  /* ---- open and close -------------------------------------------------- */
  function setOpen(open, returnFocus) {
    panel.hidden = !open;
    host.classList.toggle("is-open", open);
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      var active = host.querySelector(".snav-list a.is-current") || host.querySelector(".snav-list a");
      if (active) active.focus();
    } else if (returnFocus) {
      btn.focus();
    }
  }
  btn.addEventListener("click", function (e) {
    e.stopPropagation();
    setOpen(panel.hidden);
  });
  panel.addEventListener("click", function (e) {
    if (e.target.closest("a")) setOpen(false);
  });
  document.addEventListener("click", function (e) {
    if (!panel.hidden && !host.contains(e.target)) setOpen(false);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !panel.hidden) setOpen(false, true);
  });

  /* ---- which section is on screen ------------------------------------- */
  // The current section is the last one whose top has passed 40% of the
  // viewport. Above the first one, the button just says "Sections".
  var queued = false;
  function spy() {
    queued = false;
    var line = window.innerHeight * 0.4;
    var found = -1;
    for (var k = 0; k < targets.length; k++) {
      if (targets[k].el.getBoundingClientRect().top <= line) found = k;
    }
    current.textContent = found < 0 ? "Sections" : targets[found].text;
    links.forEach(function (a, n) {
      var on = n === found;
      a.classList.toggle("is-current", on);
      if (on) a.setAttribute("aria-current", "location");
      else a.removeAttribute("aria-current");
    });
  }
  function queue() {
    if (!queued) { queued = true; requestAnimationFrame(spy); }
  }
  window.addEventListener("scroll", queue, { passive: true });
  window.addEventListener("resize", queue);
  spy();
})();
