// Static checks for the quiet editorial redesign
// (docs/superpowers/specs/2026-10-27-quiet-editorial-redesign-design.md).
// Run from the repo root: node tools/check-design.mjs
// Prints one "FAIL <page>: <rule> ..." line per problem, or "OK".
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

const PAGES = ["index.html", "renewable.html", "locollm.html", "freshmart.html", "football-database.html",
  "weatherwise.html", "infrastructure.html", "streaming-concept.html", "404.html"];
// Pages linked from the CVs and cover letters already sent to employers.
const SENT = ["index.html", "football-database.html", "freshmart.html", "infrastructure.html", "locollm.html",
  "renewable.html", "streaming-concept.html", "weatherwise.html", "Waranyu-Bancherdvanich-CV.pdf", "images/og-card.png"];
// The home page's "How I think about data" stories, read from the commit before the redesign.
const BEFORE = "12e7f63";
const STORY_PAGES = {
  "Clean it before you model it": "freshmart.html",
  "Build the test before the result": "locollm.html",
  "Say what the analysis can't tell you": "renewable.html",
  "Know what one row means": "weatherwise.html",
  "Write the rules before the tables": "football-database.html",
  "Let the requirement decide, not the price": "infrastructure.html",
};

// The exact Google Fonts query every page loads; a malformed one silently falls back to Georgia and Arial.
const FONT_QUERY = "family=DM+Mono:wght@400;500&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&family=Public+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap";

const html = Object.fromEntries(PAGES.map((p) => [p, readFileSync(p, "utf8")]));
const fails = [];
const fail = (page, rule, detail = "") => fails.push(`FAIL ${page}: ${rule}${detail ? " " + detail : ""}`);

const text = (s) => s.replace(/<[^>]+>/g, " ").replace(/&rsquo;|&#8217;|’/g, "'").replace(/&[a-z]+;/g, " ")
  .replace(/\s+/g, " ").trim();
const head = (s) => s.slice(0, s.indexOf("</head>"));
const body = (s) => s.slice(s.indexOf("<body"));
const ids = (s) => new Set([...s.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));

for (const [page, src] of Object.entries(html)) {
  const h = head(src), b = body(src);

  if (!h.includes("family=Newsreader") || !h.includes("family=Public+Sans") || /Fraunces|IBM\+Plex\+Sans/.test(h))
    fail(page, "fonts");
  for (const m of h.matchAll(/fonts\.googleapis\.com\/css2\?([^"]+)"/g))
    if (m[1] !== FONT_QUERY) fail(page, "font-url", m[1].slice(0, 60));

  if (src.includes("portrait")) fail(page, "no-photo");

  const mono = ["eyebrow", "np-eyebrow", "section-label", "finding-number", "card-top", "key-numbers",
    "mini-chart", "hero-work", "hero-tools", "hero-facts"].filter((c) => new RegExp(`class="(?:[^"]* )?${c}[ "]`).test(b));
  if (mono.length) fail(page, "no-mono-labels", mono.join(", "));

  const arrows = [...b.matchAll(/<(a|button)\b[^>]*>([\s\S]*?)<\/\1>/g)]
    .filter((m) => /→|↗|↓|&rarr;|&darr;|&nearr;/.test(m[2])).map((m) => text(m[2]).slice(0, 30));
  if (arrows.length) fail(page, "no-arrows", JSON.stringify(arrows));

  if (/<a class="button (primary|text-button)/.test(b)) fail(page, "no-buttons");

  if (/—|&mdash;/.test(text(b.replace(/<script[\s\S]*?<\/script>/g, "")))) fail(page, "no-long-dash");

  if (/17,697.{0,20}transactions|transactions.{0,20}17,697/.test(text(b))) fail(page, "transaction-lines");

  for (const m of b.matchAll(/href="([a-z0-9-]*\.html)?#([^"]+)"/g)) {
    const target = m[1] || page;
    if (!html[target]) continue;
    if (!ids(html[target]).has(m[2])) fail(page, "anchors", `${target}#${m[2]}`);
  }
}

const home = html["index.html"];
const sections = [...home.matchAll(/<section\b[^>]*\sid="([^"]+)"/g)].map((m) => m[1]);
if (sections.join(",") !== "top,projects,experience,education,contact")
  fail("index.html", "home-sections", sections.join(","));

const exp = home.match(/id="experience"[\s\S]*?<\/section>/);
if (exp && exp[0].includes("LocoLLM")) fail("index.html", "no-locollm-experience");

const before = execSync(`git show ${BEFORE}:index.html`, { encoding: "utf8" });
for (const [title, page] of Object.entries(STORY_PAGES)) {
  const li = before.match(new RegExp(`<h3>${title.replace(/'/g, "(?:'|&rsquo;)")}</h3>\\s*<p>([\\s\\S]*?)</p>`));
  if (!li) { fail("baseline", "stories", `cannot find "${title}" in ${BEFORE}`); continue; }
  const story = text(li[1]);
  if (!text(html[page]).includes(story)) fail(page, "stories", `missing "${title}"`);
  if (text(home).includes(story)) fail("index.html", "stories", `still has "${title}"`);
}

for (const f of SENT) if (!existsSync(f)) fail(f, "sent-links", "file missing");

// Committed docs reach the GitHub repo: no employer names and no photo mockups.
const tracked = execSync("git ls-files docs", { encoding: "utf8" }).split("\n").filter(Boolean);
for (const f of tracked) {
  if (/\.(png|jpe?g|webp)$/.test(f) && !f.endsWith("0-current.png")) fail(f, "private-docs", "image in docs");
  if (/\.(md|html)$/.test(f) && /\b(BDO|SLB|Capgemini|HIVE|ICP|Orelogy)\b|portrait/.test(readFileSync(f, "utf8")))
    fail(f, "private-docs", "names an employer or the photo");
}

if (fails.length) { console.log(fails.join("\n")); process.exit(1); }
console.log("OK");
