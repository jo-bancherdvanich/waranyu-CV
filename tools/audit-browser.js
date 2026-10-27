// Accessibility and layout audit for the quiet editorial redesign.
// In the local preview: inject this file, then run `await auditSite()`.
// Each page loads in an off-screen iframe; results list only problems.
window.auditSite = async function (pages) {
  pages = pages || ["/", "/renewable.html", "/locollm.html", "/freshmart.html", "/football-database.html",
    "/weatherwise.html", "/infrastructure.html", "/streaming-concept.html", "/404.html"];

  const parse = (c) => {
    const srgb = c.match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/);
    if (srgb) return { rgb: srgb.slice(1, 4).map((v) => +v * 255), a: srgb[4] ? +srgb[4] : 1 };
    const m = c.match(/[\d.]+/g);
    if (!m) return null;
    return { rgb: m.slice(0, 3).map(Number), a: m.length > 3 ? +m[3] : 1 };
  };
  const lum = (rgb) => {
    const [r, g, b] = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  async function load(path, width, theme) {
    const f = document.createElement("iframe");
    f.style.cssText = `position:absolute;left:-10000px;top:0;width:${width}px;height:900px;border:0`;
    document.body.appendChild(f);
    await new Promise((r) => { f.onload = r; f.src = path; });
    const doc = f.contentDocument;
    const s = doc.createElement("style");
    s.textContent = "*,*::before,*::after{transition:none!important;animation:none!important}";
    doc.head.appendChild(s);
    if (theme) doc.documentElement.setAttribute("data-theme", theme);
    await new Promise((r) => setTimeout(r, 400));
    return f;
  }

  function audit(f) {
    const win = f.contentWindow, doc = f.contentDocument, cs = (e) => win.getComputedStyle(e);
    const bgOf = (el) => {
      for (; el; el = el.parentElement) { const p = parse(cs(el).backgroundColor); if (p && p.a > 0.9) return p.rgb; }
      return parse(cs(doc.body).backgroundColor).rgb;
    };
    const out = { contrast: [], small: [], targets: [], headings: [], brokenImages: [], h1: doc.querySelectorAll("h1").length };
    const seen = new Set();
    for (const el of doc.querySelectorAll("body *")) {
      if (el.closest("svg, iframe, .skip-link, .sr-only")) continue;
      const s = cs(el);
      if (s.display === "none" || s.visibility === "hidden" || !el.getClientRects().length) continue;
      const t = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent.trim()).join(" ");
      if (!t) continue;
      const fg = parse(s.color), bg = bgOf(el), fs = parseFloat(s.fontSize);
      const ratio = (Math.max(lum(fg.rgb), lum(bg)) + 0.05) / (Math.min(lum(fg.rgb), lum(bg)) + 0.05);
      const large = fs >= 24 || (fs >= 18.66 && +s.fontWeight >= 700);
      const key = el.tagName + el.className;
      if (ratio < (large ? 3 : 4.5) && !seen.has("c" + key)) { seen.add("c" + key); out.contrast.push([el.tagName + "." + el.className, ratio.toFixed(2), t.slice(0, 30)]); }
      if (fs < 12 && !el.closest("[class*='dash-'], .erd, .ll-heat") && !seen.has("s" + key)) { seen.add("s" + key); out.small.push([el.tagName + "." + el.className, fs, t.slice(0, 20)]); }
    }
    for (const a of doc.querySelectorAll("a, button, [role=button], input, select")) {
      if (a.classList.contains("skip-link") || a.closest("p, li, td, dd, figcaption, .sr-only")) continue;
      const r = a.getBoundingClientRect();
      if (r.width && r.height && (r.width < 24 || r.height < 24))
        out.targets.push([a.tagName + "." + a.className, (a.textContent || a.getAttribute("aria-label") || "").trim().slice(0, 20), Math.round(r.width) + "x" + Math.round(r.height)]);
    }
    let last = 0;
    for (const h of doc.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
      const n = +h.tagName[1];
      if (last && n > last + 1) out.headings.push(`${h.tagName} "${h.textContent.trim().slice(0, 25)}" after h${last}`);
      last = n;
    }
    for (const i of doc.querySelectorAll("img")) if (i.complete && !i.naturalWidth && i.loading !== "lazy") out.brokenImages.push(i.getAttribute("src"));
    return out;
  }

  async function brokenLinks(f, path) {
    const doc = f.contentDocument, bad = [];
    const hrefs = new Set([...doc.querySelectorAll("a[href], img[src], source[src], video[poster]")]
      .map((e) => e.getAttribute("href") || e.getAttribute("src") || e.getAttribute("poster"))
      .filter((h) => h && !/^(https?:|mailto:|tel:|#|javascript:)/.test(h)).map((h) => h.split("#")[0]).filter(Boolean));
    for (const h of hrefs) {
      const url = new URL(h, location.origin + path).href;
      const r = await fetch(url, { method: "HEAD" }).catch(() => null);
      if (!r || !r.ok) bad.push(h);
    }
    return bad;
  }

  const result = {};
  for (const p of pages) {
    const res = {};
    for (const theme of ["light", "dark"]) {
      const f = await load(p, 1280, theme);
      res[theme] = audit(f);
      if (theme === "light") res.brokenLinks = await brokenLinks(f, p);
      f.remove();
    }
    for (const w of [320, 375, 414]) {
      const f = await load(p, w, "light");
      const d = f.contentDocument.documentElement;
      res["overflow" + w] = d.scrollWidth > d.clientWidth + 1 ? d.scrollWidth : false;
      f.remove();
    }
    result[p] = res;
  }
  return result;
};

// Compact summary: only pages and keys that have problems.
window.auditProblems = async function (pages) {
  const r = await window.auditSite(pages), out = {};
  for (const [p, v] of Object.entries(r)) {
    const probs = {};
    for (const t of ["light", "dark"]) for (const k of ["contrast", "small", "targets", "headings", "brokenImages"])
      if (v[t][k].length) probs[t + "." + k] = v[t][k];
    if (v.light.h1 !== 1) probs.h1 = v.light.h1;
    if (v.brokenLinks.length) probs.brokenLinks = v.brokenLinks;
    for (const w of [320, 375, 414]) if (v["overflow" + w]) probs["overflow" + w] = v["overflow" + w];
    if (Object.keys(probs).length) out[p] = probs;
  }
  return out;
};
