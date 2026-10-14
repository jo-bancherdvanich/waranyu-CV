// Builds the Word CV from tools/cv-content.json, in the same template as the
// PDF (tools/cv-html.js): a centred EB Garamond name over a green rule, a
// centred italic contact block, green Open Sans section headings with a
// black rule, bold titles with bold dates on the right, and green italic
// organisation lines. Both fonts are embedded (tools/fonts/, SIL OFL), so
// the file looks the same on a computer that does not have them.
// usage: npm install docx && node tools/cv-docx.js Waranyu-Bancherdvanich-CV.docx
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, ExternalHyperlink, AlignmentType,
  BorderStyle, LevelFormat, TabStopType, CharacterSet,
} = require("docx");

const C = JSON.parse(fs.readFileSync(path.join(__dirname, "cv-content.json"), "utf8"));
const font = (f) => fs.readFileSync(path.join(__dirname, "fonts", f));
const SANS = "Open Sans", SERIF = "EB Garamond", GREEN = "278067", INK = "000000";
const PAGE_W = 11906, SIDE = 964, TOPBOT = 680, CONTENT = PAGE_W - 2 * SIDE;   // A4, 17 mm sides, 12 mm top and bottom
const SZ = 19;                                                                 // 9.5 pt

const run = (text, o = {}) => new TextRun({ text, font: SANS, size: SZ, color: INK, ...o });
const link = (text, url, o = {}) => new ExternalHyperlink({ link: url, children: [run(text, o)] });
const right = [{ type: TabStopType.RIGHT, position: CONTENT }];
const children = [];

// name over a green rule, then the contact block
children.push(new Paragraph({
  alignment: AlignmentType.CENTER, spacing: { after: 110, line: 240 },
  border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: GREEN, space: 3 } },
  children: [new TextRun({ text: C.name, font: SERIF, size: 64, color: INK })],
}));
const contact = C.contact.filter((c) => c.url);
const contactLine = (items, after) => {
  const kids = [];
  items.forEach((c, i) => {
    if (i) kids.push(run(" | ", { italics: true, size: 22 }));
    kids.push(link(c.text, c.url, { italics: true, size: 22, underline: {} }));
  });
  return new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after }, children: kids });
};
children.push(contactLine(contact.slice(0, 2), 0));
children.push(contactLine(contact.slice(2), 120));

// professional summary: a centred black heading, italic text
children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60, after: 40 },
  children: [run("PROFESSIONAL SUMMARY", { bold: true, size: 26 })] }));
children.push(new Paragraph({ children: [run(C.summary, { italics: true })] }));

const heading = (text) => new Paragraph({
  spacing: { before: 200, after: 90 }, keepNext: true,
  border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: INK, space: 1 } },
  children: [run(text.toUpperCase(), { bold: true, size: 24, color: GREEN, characterSpacing: 6 })],
});

for (const s of C.sections) {
  children.push(heading(s.title));
  if (s.text) { children.push(new Paragraph({ children: [run(s.text)] })); continue; }
  if (s.skills) {
    s.skills.forEach(([name, desc], k) => children.push(new Paragraph({ spacing: { after: k < s.skills.length - 1 ? 70 : 0 },
      children: [run(name, { bold: true }), run(" – " + desc)] })));
    continue;
  }
  s.entries.forEach((e, k) => {
    const r = e.date ? [run("\t" + e.date, { bold: true })]
      : e.link ? [run("\t"), link(e.link.text + " ↗", e.link.url, { color: GREEN, size: 17 })] : [];
    children.push(new Paragraph({ tabStops: right, keepNext: true, spacing: { before: k ? 120 : 0 }, children: [run(e.title, { bold: true }), ...r] }));
    children.push(new Paragraph({ keepNext: !!(e.note || e.bullets), children: [run(e.org, { italics: true, color: GREEN })] }));
    if (e.note) children.push(new Paragraph({ children: [run(e.note)] }));
    for (const b of e.bullets || []) children.push(new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [run(b)] }));
  });
}

const doc = new Document({
  creator: C.name,
  title: C.name + " – CV",
  fonts: [
    { name: SANS, data: font("OpenSans-Regular.ttf"), bold: font("OpenSans-Bold.ttf"), italic: font("OpenSans-Italic.ttf"),
      boldItalic: font("OpenSans-BoldItalic.ttf"), characterSet: CharacterSet.ANSI },
    { name: SERIF, data: font("EBGaramond-Regular.ttf"), characterSet: CharacterSet.ANSI },
  ],
  styles: { default: { document: { run: { font: SANS, size: SZ, color: INK }, paragraph: { spacing: { line: 230 } } } } },
  numbering: { config: [{ reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "●", alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 380, hanging: 230 } }, run: { size: 12 } } }] }] },
  sections: [{ properties: { page: { size: { width: PAGE_W, height: 16838 }, margin: { top: TOPBOT, bottom: TOPBOT, left: SIDE, right: SIDE } } }, children }],
});
Packer.toBuffer(doc).then((buf) => { fs.writeFileSync(process.argv[2], buf); console.log("written", buf.length); });
