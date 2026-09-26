/* Section dock: a dark pill fixed to the bottom of the screen with one icon
 * per section and a round contact button at the end. The icon for the
 * section on screen lights up as you scroll.
 *
 * It builds itself from the page rather than from a hard-coded list. On the
 * landing page each section's own heading icon is reused, so the dock and the
 * headings always match; on a case study the blocks are numbered instead.
 * No dependencies, no build step.
 */
(function () {
  "use strict";

  var ICONS = {
    top: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="4.5" width="19" height="15" rx="2.5"/><path d="M3 7l9 6 9-6"/></svg>'
  };

  function slug(text) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }
  function headingText(el) {
    var h = el.querySelector("h2");
    return h ? h.textContent.replace(/\s+/g, " ").trim() : "";
  }

  /* ---- which sections this page has ------------------------------------ */
  var isHome = !!document.querySelector(".intro");
  var items = [];   // { el, href, label, icon }

  if (isHome) {
    items.push({ el: document.getElementById("top"), href: "#top", label: "Top", icon: ICONS.top });
    document.querySelectorAll("main > section.section").forEach(function (el) {
      var text = headingText(el);
      if (!text) return;
      if (!el.id) el.id = slug(text);
      var ico = el.querySelector(".h2-ico svg");
      items.push({ el: el, href: "#" + el.id, label: text, icon: ico ? ico.outerHTML : null });
    });
  } else {
    items.push({ el: null, href: "index.html#projects", label: "All projects", icon: ICONS.back });
    var n = 0;
    document.querySelectorAll(".case-block").forEach(function (el) {
      var text = headingText(el);
      if (!text) return;
      if (!el.id) {
        var id = slug(text);
        if (!id || document.getElementById(id)) return;
        el.id = id;
      }
      n++;
      items.push({ el: el, href: "#" + el.id, label: text, num: n < 10 ? "0" + n : String(n) });
    });
  }
  if (items.length < 2) return;

  var contact = document.getElementById("contact");
  var contactHref = contact ? "#contact" : "index.html#contact";

  /* ---- markup ---------------------------------------------------------- */
  var nav = document.createElement("nav");
  nav.className = "dock";
  nav.setAttribute("aria-label", "Sections on this page");

  var html = '<ul class="dock-list">';
  items.forEach(function (it, k) {
    html += '<li><a class="dock-link" href="' + it.href + '" data-k="' + k + '">' +
      (it.icon ? '<span class="dock-ico" aria-hidden="true">' + it.icon + '</span>'
               : '<span class="dock-num" aria-hidden="true">' + it.num + '</span>') +
      '<span class="dock-tip"></span></a></li>';
  });
  html += '</ul><span class="dock-sep" aria-hidden="true"></span>' +
    '<a class="dock-contact" href="' + contactHref + '">' +
      '<span class="dock-ico" aria-hidden="true">' + ICONS.mail + '</span>' +
      '<span class="dock-tip">Contact</span></a>';
  nav.innerHTML = html;
  document.body.appendChild(nav);

  // Labels go in as text, never as HTML. The tip doubles as the accessible
  // name, so screen readers hear "Education" rather than nothing.
  var links = nav.querySelectorAll(".dock-link");
  links.forEach(function (a, k) {
    a.querySelector(".dock-tip").textContent = items[k].label;
  });
  var contactLink = nav.querySelector(".dock-contact");

  /* ---- which section is on screen ------------------------------------- */
  // The current section is the last one whose top has passed 40% of the
  // viewport. Contact lights its own round button instead.
  var watched = items.filter(function (it) { return it.el; });
  var queued = false;
  function spy() {
    queued = false;
    var line = window.innerHeight * 0.4;
    var found = null;
    watched.forEach(function (it) {
      if (it.el.getBoundingClientRect().top <= line) found = it;
    });
    var onContact = !!(contact && contact.getBoundingClientRect().top <= line);
    links.forEach(function (a, k) {
      var on = !onContact && items[k] === found;
      a.classList.toggle("is-current", on);
      if (on) a.setAttribute("aria-current", "location");
      else a.removeAttribute("aria-current");
    });
    contactLink.classList.toggle("is-current", onContact);
    if (onContact) contactLink.setAttribute("aria-current", "location");
    else contactLink.removeAttribute("aria-current");
  }
  function queue() {
    if (!queued) { queued = true; requestAnimationFrame(spy); }
  }
  window.addEventListener("scroll", queue, { passive: true });
  window.addEventListener("resize", queue);
  spy();
})();
