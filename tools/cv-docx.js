// Builds the Word CV from tools/cv-content.json, in a plain single-column
// template: bold name, one contact line, uppercase section headings between
// rules, bold entry titles with the date on the right.
// usage: npm install docx && node tools/cv-docx.js Waranyu-Bancherdvanich-CV.docx
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, ExternalHyperlink, AlignmentType,
  BorderStyle, LevelFormat, TabStopType,
} = require("docx");

const C = JSON.parse(fs.readFileSync(path.join(__dirname, "cv-content.json"), "utf8"));
const FONT = "Calibri", INK = "000000", GREY = "404040", LINK = "1F4E79";
const PAGE_W = 11906, MARGIN = 900, CONTENT = PAGE_W - 2 * MARGIN;   // A4, about 16 mm margins
const SZ = 21;                                                        // 10.5 pt

const run = (text, o = {}) => new TextRun({ text, font: FONT, size: SZ, color: INK, ...o });
const link = (text, url, o = {}) => new ExternalHyperlink({ link: url, children: [run(text, { color: LINK, ...o })] });
const right = [{ type: TabStopType.RIGHT, position: CONTENT }];

const children = [];
// name and contact line
children.push(new Paragraph({ spacing: { after: 40 }, children: [run(C.name, { size: 36, bold: true })] }));
const contact = [];
C.contact.forEach((c, i) => {
  if (i) contact.push(run("  |  ", { color: GREY, size: 18 }));
  contact.push(c.url ? link(c.text, c.url, { size: 18 }) : run(c.text, { size: 18, color: GREY }));
});
children.push(new Paragraph({ spacing: { after: 60 }, children: contact }));

const heading = (text) => new Paragraph({
  spacing: { before: 200, after: 80 },
  border: { top: { style: BorderStyle.DOUBLE, size: 4, color: "808080", space: 4 }, bottom: { style: BorderStyle.SINGLE, size: 4, color: "808080", space: 2 } },
  children: [run(text.toUpperCase(), { bold: true, size: SZ })],
});

// professional summary
children.push(heading("Professional Summary"));
children.push(new Paragraph({ spacing: { after: 40 }, children: [run(C.summary)] }));

for (const s of C.sections) {
  children.push(heading(s.title));
  if (s.text) { children.push(new Paragraph({ children: [run(s.text)] })); continue; }
  if (s.skills) {
    for (const [name, desc] of s.skills) {
      children.push(new Paragraph({ spacing: { after: 50 }, children: [run(name + " - ", { bold: true }), run(desc)] }));
    }
    continue;
  }
  s.entries.forEach((e, k) => {
    children.push(new Paragraph({ spacing: { before: k ? 140 : 40, after: 0 }, keepNext: true, children: [run(e.title, { bold: true })] }));
    const rightPart = e.date ? [run("\t" + e.date)] : e.link ? [run("\t"), link(e.link.text + " ↗", e.link.url)] : [];
    children.push(new Paragraph({ tabStops: right, spacing: { after: 20 }, keepNext: true, children: [run(e.org, { color: GREY }), ...rightPart] }));
    if (e.note) children.push(new Paragraph({ spacing: { after: 0 }, children: [run(e.note, { color: GREY })] }));
    for (const b of e.bullets || []) {
      children.push(new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 20 }, children: [run(b)] }));
    }
  });
}

const doc = new Document({
  creator: C.name,
  title: C.name + " – CV",
  styles: { default: { document: { run: { font: FONT, size: SZ, color: INK }, paragraph: { spacing: { line: 264 } } } } },
  numbering: { config: [{ reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] }] },
  sections: [{ properties: { page: { size: { width: PAGE_W, height: 16838 }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } }, children }],
});
Packer.toBuffer(doc).then((buf) => { fs.writeFileSync(process.argv[2], buf); console.log("written", buf.length); });
