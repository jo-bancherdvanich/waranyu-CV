# tools

The CV lives in one place: `cv-content.json`. Two scripts turn it into the
files on the site, in the same template (centred name, green section headings):

- `node tools/cv-docx.js Waranyu-Bancherdvanich-CV.docx` builds the Word CV
  (needs `npm install docx`).
- `node tools/cv-html.js` writes `cv-source.html`; open it in Chrome and
  print to PDF (A4, no headers or footers) over `../Waranyu-Bancherdvanich-CV.pdf`.
  Both use EB Garamond and Open Sans from `fonts/`; the Word file embeds them.

Edit the JSON, then run both, so the Word file and the PDF never drift apart.

`og-card.html` is the source of `../images/og-card.png`, the picture shown
when the site is shared. Open it in a browser at 1200 x 630 and screenshot.
