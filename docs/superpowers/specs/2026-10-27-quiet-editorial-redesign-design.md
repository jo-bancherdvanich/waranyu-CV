# Quiet editorial redesign of the portfolio

Date: 2026-10-27
Site: https://waranyu-cv.vercel.app (static HTML, CSS and JS, no build step, deployed by Vercel from `main`)

## Intent

The site is the link on Waranyu's CV. Recruiters at the firms he has just applied to and anyone reading his LinkedIn will open it. He wants it to look as if a real designer made it, not an AI or a template, and to stop repeating itself.

He picked direction **A, Quiet editorial**, from three mockups. Its traits: the cream paper, a serif for headings and one plain sans for everything else, generous space, one large image and a short paragraph per project, plain underlined links, and no decoration.

Reference files:
- Mockup A: kept outside the repo, in `DesktopJOJO-CVsite-mockups`, because it shows a photo
- The site before the redesign: `mockups/0-current.png`

Ignore the photo in the mockup. It is ruled out (see Anti-goals), and its headline sentence was placeholder wording.

## Goals

- Remove the "AI portfolio" signals across every page:
  - small uppercase monospace labels (eyebrows such as "01 / ENERGY · ACADEMIC", "SHARE IN 2024")
  - numbered section labels (01 Selected work, 02 Experience, …)
  - rows of three big stat numbers on cards
  - arrows on links ("→", "↗", "↓"), except where an arrow is the only cue that a link opens a new tab or downloads a file; there, words do the job instead ("PDF", "opens GitHub")
- Shorten the home page from 8 sections to 5 and remove the repetition.
- Keep one consistent look on the home page, all 7 project pages and the 404 page.

## Non-goals

- No change to the facts, numbers or claims on any page. Wording is shortened or moved, never extended with new claims.
- No change to how the interactive pieces work: the embedded Power BI reports (Renewable, FreshMart), the R forecast widget, the LocoLLM results explorer, the football ERD and SQL runner, the WeatherWise demo, and the videos.
- No SEO work. The site stays `noindex` (vercel.json) by Waranyu's choice.
- No new pages, no framework, no build tools.

## Anti-goals (a failure even if it works)

- Any invented fact, number, date or skill.
- Waranyu's photo anywhere on the site, including the LinkedIn preview picture. It is a CV website, and Australian CVs leave the photo out.
- A broken interactive demo, or a demo that loses its styling.
- Worse accessibility than today: the site currently passes contrast in both themes, has skip links, visible focus, alt text, ordered headings, 24 px tap targets and no sideways scrolling on phones.
- Losing dark mode.

## Decisions

### Approach (picked by Waranyu)

Three ways were considered:

1. **Restyle in place (chosen).** Edit the existing pages and the shared `site.css` / `components.css`. Every page changes together, and every demo keeps working. Cost: careful work in an older stylesheet, possibly a second pass on odd details.
2. Rebuild only the home page from scratch. Rejected: the project pages would keep the old look, so the site would show two designs.
3. Rebuild the whole site from scratch. Rejected: much bigger, and it risks breaking the demos.

### Home page content (agreed with Waranyu)

The order becomes:

1. **Intro.** Name, one plain paragraph (what he studies, what he builds, that he is looking for a Perth data analyst internship now and graduate roles from July 2027), and links: Email, LinkedIn, Download CV (PDF). No photo. The six-thumbnail project mosaic is removed.
2. **Selected work.** All 7 projects, plus the GitHub "everything else" row. Each project gets:
   - its existing image or video
   - its title
   - one meta line (tools · project type)
   - one or two sentences built from the card's current text
   - one or two text links (case study, plus a live demo where one exists)

   The stat-number rows, the mini charts and the bullet lists are removed from the cards.
3. **Experience.** Hockey WA (Curtin Consulting Group), Six Senses Gourmet, and Like Me Co. LocoLLM is removed from Experience because it is already a project.
4. **Education.** Curtin and Thammasat. The Google Data Analytics certificate courses and the NSO Data Camp Best Business Case Pitch fold in here as short lines, and the separate Certificates section goes.
5. **Contact.**

Removed sections:

- **Capabilities.** It only maps tools to projects, which the project cards already show.
- **How I think about data.** It leaves the home page. Each of its six stories moves, with its wording kept, onto the project page it is about:

| Story | Moves to |
|---|---|
| Clean it before you model it | freshmart.html |
| Build the test before the result | locollm.html |
| Say what the analysis can't tell you | renewable.html |
| Know what one row means | weatherwise.html |
| Write the rules before the tables | football-database.html |
| Let the requirement decide, not the price | infrastructure.html |

### Look (Claude's calls, from mockup A, for Waranyu to check)

- **Fonts.** Headings use Newsreader (serif). All other text uses Public Sans. DM Mono stays only inside code and data: the SQL runner, the ERD and chart axes. Fraunces and IBM Plex Sans are removed. Fonts load from Google Fonts as today.
- **Colour.** Keep the current paper, ink and green accent tokens and the dark theme. They already pass contrast. The amber highlight on key figures goes, because stat rows go.
- **Labels.** Labels that remain become sentence case in the body sans, in the muted colour (for example "Power BI, R · Academic project").
- **Section headings.** Plain small headings in the body sans, in the muted colour, as in the mockup ("Selected work"), with no numbers.
- **Home layout, as in the mockup.**
  - Every project card has the same weight, so Renewable is no longer a featured card.
  - The image or video sits on the left at about 55% width, with the text on the right. Cards stack on phones.
  - The intro is one text column, with the links underneath it.
  - The header has the name on the left and four links on the right: Work, Experience, Contact, CV. Each points at a section that still exists, or at the PDF.
  - Contact and the footer follow the same quiet rules: plain links and no labels.
- **Project pages.** They keep their structure, and the same type, label, number and arrow rules apply to them. Specifically:
  - The "Project at a glance" figure rows stay, because they hold facts, but they're restyled in ink with no amber.
  - The `01` to `05` numbers on findings are removed. The findings themselves stay.
  - Filled buttons ("View on GitHub", "Back to all projects") become plain underlined links.
  - The "next project" footer loses its uppercase eyebrow.
- **Interactive demos.** Their labels, tooltips and small buttons are restyled with CSS only (sentence case, body sans, muted colour). Their markup and JavaScript stay untouched. Code, ERD text and chart axes keep DM Mono. After the change, every demo is retested in both themes and at 375 px.
- **LinkedIn preview picture.** `images/og-card.png` is regenerated from `tools/og-card.html` with the photo removed and the new fonts.

## Constraints

- Static files only. The test is the local preview (`npx http-server`, set up in `.claude/launch.json`) in light theme, dark theme, and at 375 px phone width.
- Text rules from earlier work still apply:
  - FreshMart counts "transaction lines", not transactions.
  - Do not re-embellish WeatherWise.
  - The football claims stay as corrected.
  - No long dashes.
- Commits are one line, with no AI attribution.

## Left to the builder

- Exact sizes, spacing and breakpoints, within the mockup A feel.
- Deleting dead CSS that the removed sections leave behind (for example `.capability-list`, `.principle-list`, `.key-numbers`, `.mini-chart`, `.hero-work`), and `home-charts.js` if nothing uses it any more.
- Where each moved story sits on its project page. Near the findings or limits section reads best.
- Whether the two existing videos on the home cards stay as videos or become poster images that link to the case study.
