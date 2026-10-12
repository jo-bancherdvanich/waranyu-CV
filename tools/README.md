# tools

`cv-source.html` is the source of `../Waranyu-Bancherdvanich-CV.pdf`. Edit the
wording here, then print it to PDF from Chrome (A4, background graphics on,
no headers or footers) and save over the PDF in the site root.

`og-card.html` is the source of `../images/og-card.png`, the picture shown
when the site is shared. Open it in a browser at 1200 x 630 and screenshot.

`cv-docx.js` builds `../Waranyu-Bancherdvanich-CV.docx`, the Word copy of
the same CV, with the `docx` npm package:
`npm install docx && node tools/cv-docx.js Waranyu-Bancherdvanich-CV.docx`.
Keep its wording in step with `cv-source.html`.
