# Quiet Editorial Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the whole portfolio site in the "Quiet editorial" direction and cut the home page from 8 sections to 5, without changing any fact or breaking any demo.

**Architecture:** This is a restyle in place.
- Tokens, fonts and page chrome live in `site.css`; demo styling lives in `components.css` and `football-erd.css`.
- The markup changes are in `index.html`, the 7 project pages and `404.html`.
- Two checkers are written first and fail on today's site. Each task then makes part of them pass:
  - a Node script for the static rules
  - a browser script for accessibility and layout

**Tech Stack:** Static HTML, CSS and JS. Node for the static checker (no packages). Local preview with `npx http-server@14.1.1 -p 5173` (the `site` entry in `.claude/launch.json`). Edge headless for the og-card picture.

**Spec:** `docs/superpowers/specs/2026-10-27-quiet-editorial-redesign-design.md`. The reference mockup is kept outside the repo (`DesktopJOJO-CVsite-mockupsa-editorial.png`).

## Global Constraints

- No fact, number, date, claim or skill is added or changed. Text may only be shortened or moved.
- No photo anywhere, including `images/og-card.png`.
- Fonts:
  - Headings use **Newsreader**. All other text uses **Public Sans**.
  - **DM Mono** is allowed only for code (the SQL runner), ERD text and chart axes.
  - Fraunces and IBM Plex Sans are removed.
- Keep the colour tokens `--paper #f7f4ee`, `--ink #1c1b18`, `--muted #5d5a52`, `--accent #0f6b45` and the whole dark theme. `--highlight` (amber) is no longer used on figures.
- No uppercase monospace labels, no numbered section labels, and no `01`–`05` finding numbers.
- No arrow glyphs (→ ↗ ↓ `&rarr;` `&darr;`) in link or button text.
- Links that open a new tab or download a file say so in words, for example "CV (PDF)".
- Demos (Power BI iframes, the R forecast, the LocoLLM explorer, the football ERD and SQL, WeatherWise, the videos) keep their markup and JS. Only CSS changes for them.
- Accessibility must not regress:
  - text contrast of at least 4.5:1 (3:1 for large text) in both themes
  - tap targets of at least 24 px
  - no sideways scroll at 320, 375 and 414 px
  - one H1 per page, no skipped heading levels
  - skip link and focus ring kept
- Copy rules:
  - Say FreshMart "transaction lines", never "transactions".
  - No long dashes (—).
  - WeatherWise and football wording stays as it is.
- Site stays `noindex`. No SEO work.
- Commits are one line, with no AI attribution. Work on branch `redesign-quiet-editorial`. Do not push.

## Review Focus

1. **Dark theme after the restyle.** A new rule written only for light mode leaves grey-on-black text. Task 1's browser audit runs both themes on every page.
2. **Phone width with long words.** "Bancherdvanich" and long project titles must wrap, not scroll. The audit checks 320 px, the narrowest case, as well as 375 and 414.
3. **Demo state colours after the label restyle.** Active chips and tabs must stay readable in both themes. Task 7 re-runs the audit with a demo chip toggled on.
4. **Moved stories losing their facts.** Each of the six principle stories must arrive word for word on its page. Task 1's static check compares the exact paragraph text.
5. **Links pointing at removed sections.** `#approach`, `#certificates` and the capabilities anchor go away. The static check fails on any `href="#x"` or `index.html#x` with no matching `id`.

---

### Task 1: Checkers, branch and baseline

**Files:**
- Create: `tools/check-design.mjs`
- Create: `tools/audit-browser.js`

**Interfaces:**
- Produces:
  - `node tools/check-design.mjs`: prints one `FAIL <page>: <rule>` line per problem and `OK` when there are none. Exit code 1 on any failure.
  - `tools/audit-browser.js`: defines `window.auditSite(pages?: string[]) => Promise<{[page]: {light, dark, overflow320, overflow375, overflow414}}>`.

- [ ] **Step 1: Create the branch and save the pending fixes.**
  - Run `git checkout -b redesign-quiet-editorial`.
  - Commit the two pending `site.css` fixes (phone header wrap, 24 px tap targets) with the message `Site: fix phone header overflow and small tap targets`.
  - Then `git add docs` and commit `Docs: quiet editorial redesign spec and plan`.
- [ ] **Step 2: Write `tools/check-design.mjs`.** Use plain `fs` to read the pages `index.html, renewable.html, locollm.html, freshmart.html, football-database.html, weatherwise.html, infrastructure.html, streaming-concept.html, 404.html`. Rules, each its own named check:
  - `fonts`: the head contains `family=Newsreader` and `family=Public+Sans`, and does not contain `Fraunces` or `IBM+Plex+Sans`.
  - `no-photo`: no reference to the photo file in any page or in `tools/og-card.html`.
  - `no-mono-labels`: no `class="eyebrow`, `np-eyebrow`, `section-label`, `finding-number`, `card-top`, `key-numbers`, `mini-chart`, `hero-work`, `hero-tools` or `hero-facts`.
  - `no-arrows`: no `→ ↗ ↓ &rarr; &darr; &nearr;` inside any `<a …>…</a>` or `<button …>…</button>`.
  - `no-buttons`: no `class="button primary"` or `class="button text-button"`.
  - `home-sections`: the `<section` ids in index.html are exactly `top, projects, experience, education, contact`, in that order.
  - `no-locollm-experience`: the `#experience` section of index.html does not contain `LocoLLM`.
  - `anchors`: every `href="#x"` and `href="<page>.html#x"` has a matching `id="x"` in its target page.
  - `stories`: for each pair below, the exact `<h3>` title and its paragraph text, read from `git show main:index.html`'s `.principle-list`, appear in the target page and not in index.html:
    - Clean it before you model it → freshmart
    - Build the test before the result → locollm
    - Say what the analysis can't tell you → renewable
    - Know what one row means → weatherwise
    - Write the rules before the tables → football-database
    - Let the requirement decide, not the price → infrastructure
  - `no-long-dash`: no `—` or `&mdash;` in visible text.
  - `transaction-lines`: no `transactions` within 20 characters of `17,697`.
- [ ] **Step 3: Write `tools/audit-browser.js`.** Port the iframe audit used on 27 Oct:
  - It loads each page in an off-screen iframe at 1280 px with `data-theme` set to light and then dark (with `transition: none` forced), and at 320, 375 and 414 px for overflow.
  - It reports contrast failures, text under 12 px outside `svg` and `.dash-*` chart text, tap targets under 24 px (excluding links inside `p, li, td, dd, figcaption`), heading skips, and H1 count.
  - Parse `color(srgb r g b)` as well as `rgb()`. Fractions are multiplied by 255. The old version misread these and produced false 1.21 ratios.
- [ ] **Step 4: Run both checks and save the baseline.**
  - `node tools/check-design.mjs`. Expected: FAIL lines for `fonts`, `no-mono-labels`, `no-arrows`, `no-buttons`, `home-sections`, `no-locollm-experience` and `stories`, and exit code 1.
  - Start the `site` preview and inject the audit with `const s=document.createElement('script');s.src='/tools/audit-browser.js';document.head.append(s)`, then call `await auditSite()`. Expected: no contrast failures, `overflow320/375/414` false on every page, one H1 per page. If any of these fail on today's site, note it as a baseline, not a regression.
- [ ] **Step 5: Commit** `Tools: design and accessibility checkers for the redesign`.

### Task 2: Type and tokens

**Files:**
- Modify: `site.css:1-80` (header comment, base, headings, `.eyebrow/.mono`, `.lede`, `.hl`)
- Modify: the Google Fonts `<link>` lines in the head of all 9 pages, and `tools/og-card.html`

- [ ] **Step 1: Swap the fonts link on every page.** Use `family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&family=Public+Sans:ital,wght@0,400;0,500;0,600;1,400&family=DM+Mono:wght@400;500&display=swap`, in both the preload and the stylesheet link.
- [ ] **Step 2: Restyle the base type in `site.css`.**
  - `body`: font `"Public Sans", "Helvetica Neue", Arial, sans-serif`, 17 px, line-height 1.65.
  - `h1–h4`: `"Newsreader", Georgia, serif`, weight 400.
  - `h1`: `clamp(2.4rem, 5vw, 3.6rem)`, line-height 1.12.
  - `.mono`: no uppercase or letter-spacing, kept only for code.
  - `.hl`: weight 500, no colour.
  - Update the file's header comment so it names the new fonts.
- [ ] **Step 3: Run the static check.** Run `node tools/check-design.mjs`. Expected: the `fonts` rule passes; the other rules still fail.
- [ ] **Step 4: Run the browser audit** in both themes. Expected: no new contrast failures.
- [ ] **Step 5: Commit** `Site: Newsreader and Public Sans replace Fraunces and IBM Plex Sans`.

### Task 3: Header, footer and next-project link on every page

**Files:**
- Modify: the `<header class="topbar">`, `<a class="next-project">` and `<footer class="site-footer">` blocks in all 9 pages
- Modify: `site.css` (`.topbar*`, `.site-footer`, `.sf-*`); `components.css` (`.next-project`, `.np-*`)

- [ ] **Step 1: Header.** The markup becomes: wordmark, then `nav.topbar-right` with these links:
  - Work → `index.html#projects`
  - Experience → `index.html#experience`
  - Contact → `index.html#contact`
  - `CV (PDF)` → the PDF, with `download`
  - the theme toggle (unchanged)

  On project pages, the repo link becomes "Repository" inside the page's case links (Task 6), not in the header. At 860 px and under, keep the wordmark, CV (PDF) and the toggle.
- [ ] **Step 2: Footer.** Name, links (Work, Experience, Contact, LinkedIn, GitHub, Email) and a "Back to top" link, with no arrows. Keep the `.sf-totop` 24 px padding from the last fix.
- [ ] **Step 3: Next-project link and 404 label.**
  - Next-project link: remove the `np-eyebrow` span. The visible text is "Next project" (muted, sentence case) above the title.
  - 404.html: delete its `<p class="eyebrow">404</p>`. If its H1 doesn't already say the page wasn't found, add "(404)" to the H1.
- [ ] **Step 4: Run the static check.** Run `node tools/check-design.mjs`. Expected: no `no-arrows` or `anchors` failures from header or footer lines.
- [ ] **Step 5: Run the browser audit** at 320 px. Expected: overflow is false on every page.
- [ ] **Step 6: Commit** `Site: quiet header, footer and next-project link`.

### Task 4: Home intro and Selected work

**Files:**
- Modify: `index.html:68-231` (intro and projects sections); `site.css` (`.intro`, `.project-card*`, the `@media` blocks at the end)
- Delete: `home-charts.js` and its `<script>` tag (`index.html:455`), if nothing else references it (grep first)

- [ ] **Step 1: Intro.**
  - Keep `<p class="eyebrow">` out. Keep the H1 with the name.
  - Write one paragraph built only from the current two intro paragraphs and the "Looking for…" line.
  - Below it, the links Email, LinkedIn and `CV (PDF)`.
  - Remove the six-thumbnail mosaic (`.hero-work`), the tools line, the `7 / July 2027` facts and the green "See the projects" button.
- [ ] **Step 2: Project cards.** Every project card (7, plus the GitHub row) becomes:
  - its existing `img` or `video`, unchanged
  - an `h3` with a link to the case study
  - `p.meta`: "Tools · Project type", taken from the current card-top and copy, for example "Power BI, R · Academic project"
  - one or two sentences, taken from the current card text and bullets, keeping their numbers
  - `p.card-links`: "Read the case study", plus "Live demo" where one exists today

  Remove `.card-top`, `.key-numbers`, `.mini-chart`, `.project-detail` and the `project-card-featured` modifier.
- [ ] **Step 3: Card layout in CSS.**
  - Grid columns `minmax(0, 1.2fr) minmax(0, 1fr)`, gap 56 px, media on the left.
  - 72 px vertical space between cards, with no rule lines between them.
  - Stack to one column at 860 px and under.
  - The section heading "Selected work" is plain body sans at 15 px in `--muted`, with no number.
- [ ] **Step 4: Run the static check.** Expected: no FAIL lines on index.html for `no-mono-labels`, `no-arrows` or `no-buttons`.
- [ ] **Step 5: Run the browser audit.** Expected: tap targets of at least 24 px, no overflow, and the same in dark mode.
- [ ] **Step 6: Compare against the mockup.** Screenshot the home page at 1440 px and compare it side by side with mockup A. The intro and the first two cards should read the same way.
- [ ] **Step 7: Commit** `Site: home intro and project cards in the quiet editorial layout`.

### Task 5: Home Experience, Education and Contact; remove three sections

**Files:**
- Modify: `index.html:232-433`; `site.css` (`.timeline*`, `.contact*`)

- [ ] **Step 1: Experience.** Keep Hockey WA, Six Senses and Like Me exactly as worded. Delete the LocoLLM timeline item. Tag chips under items become one muted line ("Financial modelling, sensitivity analysis, Excel…") or are dropped. That's the builder's call; their text must not grow.
- [ ] **Step 2: Education.** Keep Curtin and Thammasat as they are. Add two short lines under Curtin's block, using the certificate wording exactly:
  - "Google Data Analytics Certificate courses, Coursera and Google, May 2026"
  - "Best Business Case Pitch, NSO Data Camp, Thailand, 2023: 'Branding is All About Counting'"

  Delete the `#certificates` section.
- [ ] **Step 3: Delete the Capabilities and `#approach` sections.** Keep a copy of the six principle `<li>` blocks for Task 6. They also remain readable through `git show main:index.html`.
- [ ] **Step 4: Remove section numbers and arrows.** Delete the `<span>0N</span>` from each `.section-label`, rename the class `section-head`, and remove the arrows in Contact.
- [ ] **Step 5: Run the static check.** Run `node tools/check-design.mjs`. Expected: `home-sections` and `no-locollm-experience` pass. `stories` still fails until Task 6.
- [ ] **Step 6: Commit** `Site: home keeps five sections; capabilities, principles and certificates removed`.

### Task 6: Project pages

**Files:**
- Modify: renewable, locollm, freshmart, football-database, weatherwise, infrastructure and streaming-concept `.html`; `site.css` (`.case*`, `.metrics`, `.metric-number`); `components.css:554` (`.finding-number`)

- [ ] **Step 1: Case header.** Delete `<p class="eyebrow">` on each page. The `.case-actions` buttons become a `p.case-links` line of plain underlined links:
  - "Explore the dashboard" (or the page's existing first-action wording)
  - "Repository (GitHub)", opening in a new tab
  - "All projects"

  Remove the arrow spans.
- [ ] **Step 2: Metrics.** `.metric-number` changes to Newsreader 2 rem in `--ink`, with no `--highlight`. The markup is unchanged.
- [ ] **Step 3: Findings.** Delete every `<span class="finding-number">…</span>` and its CSS. Each finding keeps its `<strong>` lead.
- [ ] **Step 4: Move the six stories.**
  - On each page from the Task 1 table, add `<section class="case-block" id="approach-note">` with `<h2>How I worked</h2>`, then the story's `h3` and paragraph copied exactly.
  - Place it after that page's findings block and before the next-project link.
  - streaming-concept gets none.
- [ ] **Step 5: Hide the pipeline-flow icons and case-meta icons.** They are already `display: none`; leave the markup.
- [ ] **Step 6: Run the static check.** Run `node tools/check-design.mjs`. Expected: `OK` and exit code 0, or only rules owned by Tasks 7–8.
- [ ] **Step 7: Run the browser audit** on all 7 pages in both themes. Expected: no contrast failures, one H1 each, no heading skips (the new `h2 > h3` keeps the order).
- [ ] **Step 8: Commit** `Site: project pages lose labels, numbers and buttons, and gain their how-I-worked note`.

### Task 7: Demo labels, CSS only

**Files:**
- Modify: `components.css` (`.dash-slabel`, `.dash-alabel`, `.dash-clear`, `.ch-tip-label`, `.dg-h`, `.sq-tab`, `.erd-legend`, `.erd-zoom`, `.erd-btn-wide`, `.ww-card-sub`, `.ww-tile-label`, `.ll-flag`, `.sq-count`, and any other selector setting `text-transform: uppercase` with DM Mono); `football-erd.css`

- [ ] **Step 1: List the selectors.** Grep `text-transform: uppercase` in both files and list every match. For each one that is not code, an ERD text node or an SVG axis: set `font-family: "Public Sans", sans-serif; text-transform: none; letter-spacing: 0`, at no smaller than 12 px (0.75rem).
- [ ] **Step 2: Run the browser audit.** Load each demo page in light, dark and 375 px with one chip, tab or run toggled on (LocoLLM "Run 5", football "Top goal scorers", WeatherWise a city). Expected: no contrast failures and no overflow.
- [ ] **Step 3: Check the demos still work.** Click through each demo once: SQL runs and shows rows, ERD zoom and Reset work, the LocoLLM run switch updates the chart, the R forecast slider recalculates, and the videos play. Expected: the same behaviour as on `main`.
- [ ] **Step 4: Commit** `Site: demo labels in sentence case`.

### Task 8: LinkedIn preview picture without the photo

**Files:**
- Modify: `tools/og-card.html`
- Regenerate: `images/og-card.png` (1200 × 630)

- [ ] **Step 1: Edit `tools/og-card.html`.**
  - Remove the `.photo` block and its CSS.
  - Switch to Newsreader and Public Sans.
  - Keep the existing name, role and tool text.
- [ ] **Step 2: Render the picture.** Run `& $edge --headless=new --disable-gpu --hide-scrollbars --window-size=1200,630 "--screenshot=$PWD\images\og-card.png" "file:///$PWD/tools/og-card.html"`. Expected: a 1200 × 630 PNG with no photo. Check it by viewing the image.
- [ ] **Step 3: Run the static check.** Run `node tools/check-design.mjs`. Expected: `no-photo` passes.
- [ ] **Step 4: Commit** `Site: LinkedIn preview picture without the photo`.

### Task 9: Clean up and final check

**Files:**
- Modify: `site.css`, `components.css` (delete selectors no page uses any more)

- [ ] **Step 1: Delete unused selectors.** For each class selector in `site.css` and `components.css`, grep all `.html` and `.js` files. Delete the selector if no file uses the class, keeping any that JS adds at run time (`is-on`, `is-open`, `is-active`, `is-narrow`, `is-empty`).
- [ ] **Step 2: Run the static check.** Run `node tools/check-design.mjs`. Expected: `OK` and exit code 0.
- [ ] **Step 3: Run the full browser audit.** Run `auditSite()` over all 9 pages. Expected: no contrast failures in either theme, no overflow at 320, 375 or 414 px, and no targets under 24 px.
- [ ] **Step 4: Send screenshots.** Take screenshots of home, one project page and a phone view, and send them to the user. Report anything still off.
- [ ] **Step 5: Commit** `Site: remove CSS the redesign no longer uses`. Do not push or merge; the user decides.
