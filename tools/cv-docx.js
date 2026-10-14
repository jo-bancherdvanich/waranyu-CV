// Builds Waranyu-Bancherdvanich-CV.docx from the same content as tools/cv-source.html.
const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType,
  BorderStyle, LevelFormat, ExternalHyperlink, TabStopType, HeadingLevel, ShadingType,
} = require("docx");

const INK = "1C1B18", MUTED = "5D5A52", ACCENT = "0F6B45", LINE = "D8D2C4";
const SERIF = "Georgia", SANS = "Calibri", MONO = "Consolas";
const PAGE_W = 11906, MARGIN = 850, CONTENT = PAGE_W - 2 * MARGIN;   // A4, 15 mm margins

const run = (text, o = {}) => new TextRun({ text, font: SANS, size: 19, color: INK, ...o });
const link = (text, url, o = {}) => new ExternalHyperlink({ link: url, children: [run(text, { color: ACCENT, underline: {}, ...o })] });
const noBorder = { top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } };
const cell = (children, width, o = {}) => new TableCell({ children, width: { size: width, type: WidthType.DXA }, borders: noBorder, margins: { top: 0, bottom: 0, left: 0, right: 0 }, ...o });

function h2(text) {
  return new Paragraph({
    spacing: { before: 260, after: 90 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: LINE, space: 2 } },
    children: [run(text.toUpperCase(), { font: MONO, size: 15, color: ACCENT, characterSpacing: 40 })],
  });
}
function role(text) { return new Paragraph({ spacing: { after: 0 }, children: [run(text, { font: SERIF, size: 21, bold: true })] }); }
function org(text) { return new Paragraph({ spacing: { after: 40 }, children: [run(text, { color: MUTED })] }); }
function stack(text) { return new Paragraph({ spacing: { after: 40 }, children: [run(text, { font: MONO, size: 15, color: MUTED })] }); }
function bullet(text) { return new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 30 }, children: [run(text)] }); }
function body(text) { return new Paragraph({ spacing: { after: 60 }, children: [run(text)] }); }

/* an entry: left column of content, right column with the date or link */
function item(left, right, rightWidth = 2400) {
  return new Table({
    width: { size: CONTENT, type: WidthType.DXA }, columnWidths: [CONTENT - rightWidth, rightWidth],
    rows: [new TableRow({ children: [
      cell(left, CONTENT - rightWidth),
      cell([new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 30 }, children: right })], rightWidth),
    ] })],
  });
}
const gap = (n = 110) => new Paragraph({ spacing: { after: 0, before: 0, line: n, lineRule: "exact" }, children: [] });

const header = new Table({
  width: { size: CONTENT, type: WidthType.DXA }, columnWidths: [5600, CONTENT - 5600],
  rows: [new TableRow({ children: [
    cell([
      new Paragraph({ spacing: { after: 40 }, children: [run("Waranyu Bancherdvanich", { font: SERIF, size: 46 }), run(".", { font: SERIF, size: 46, color: ACCENT })] }),
      new Paragraph({ children: [run("Data analyst · Curtin master’s student · ", { size: 21, color: MUTED }), run("Perth", { size: 21, color: ACCENT, italics: true, font: SERIF })] }),
    ], 5600),
    cell([
      new Paragraph({ alignment: AlignmentType.RIGHT, children: [link("jojowaranyu.career@gmail.com", "mailto:jojowaranyu.career@gmail.com", { size: 17 })] }),
      new Paragraph({ alignment: AlignmentType.RIGHT, children: [link("waranyu-cv.vercel.app", "https://waranyu-cv.vercel.app", { size: 17 }), run(" · ", { size: 17, color: MUTED }), link("linkedin.com/in/waranyu-ban", "https://www.linkedin.com/in/waranyu-ban/", { size: 17 })] }),
      new Paragraph({ alignment: AlignmentType.RIGHT, children: [link("github.com/jo-bancherdvanich", "https://github.com/jo-bancherdvanich", { size: 17 }), run(" · Perth, Western Australia", { size: 17, color: MUTED })] }),
    ], CONTENT - 5600, { verticalAlign: "bottom" }),
  ] })],
});

const skills = new Table({
  width: { size: CONTENT, type: WidthType.DXA }, columnWidths: [CONTENT / 2, CONTENT / 2],
  rows: [
    [["Data Analysis and Visualisation", "Skilled in using Power BI, Tableau, Excel, Python, and R to clean, analyse, and present data insights through dashboards and reports."],
     ["Data Modelling and Database Design", "Knowledge of SQL, ERD design, dimensional modelling, star schema design, and database structure."]],
    [["Forecasting and Financial Modelling", "Experienced in linear regression, time-series analysis, forecasting and prediction intervals in R, and in break-even, scenario and sensitivity modelling in Excel."],
     ["Communication and Data Storytelling", "Able to explain data findings clearly through dashboards, reports, and presentations."]],
  ].map((pair) => new TableRow({ children: pair.map(([t, d]) => cell([
    new Paragraph({ spacing: { after: 0 }, children: [run(t, { bold: true })] }),
    new Paragraph({ spacing: { after: 100 }, children: [run(d)] }),
  ], CONTENT / 2, { margins: { top: 0, bottom: 0, left: 0, right: 220 } })) })),
});

const children = [
  header,
  new Paragraph({ spacing: { before: 80, after: 0 }, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: INK, space: 1 } }, children: [] }),

  h2("Professional summary"),
  body("Master of Information Systems and Technology student at Curtin University (CWA 83.57), specialising in data analytics and visualisation, with a bachelor’s degree in statistics and finance. I build Power BI dashboards on data I have audited and modelled myself, and I forecast in R so the method can be checked. Most recently I led the financial analysis for a Curtin Consulting Group engagement with Hockey WA. Four portfolio projects run on their real data at waranyu-cv.vercel.app. Seeking a data analyst internship in Perth, and graduate roles from July 2027."),

  h2("Education and training"),
  item([role("Master of Information Systems and Technology"), org("Curtin University, Western Australia · Specialisation: Data Analytics and Visualisation · CWA: 83.57")], [run("2025 – Present", { font: MONO, size: 15, color: MUTED })]),
  gap(),
  item([role("Bachelor of Science and Technology"), org("Thammasat University, Thailand · Major: Statistics · Minor: Finance")], [run("2019 – 2023", { font: MONO, size: 15, color: MUTED })]),

  h2("Key skills"),
  skills,

  h2("Academic projects"),
  item([role("FreshMart Sales Performance Dashboard"), stack("Power BI · Power Query · DAX · Data Modelling"),
    bullet("Built a Power BI retail sales dashboard using Power Query, DAX, and star schema modelling to analyse revenue, margin, product performance, and store performance."),
    bullet("Cleaned and standardised source data, including duplicate removal, category correction, and data type validation."),
    bullet("Created KPI measures and visual insights to identify sales trends, product/category performance, and district-level performance gaps.")],
    [link("Case study ↗", "https://waranyu-cv.vercel.app/freshmart.html", { font: MONO, size: 15 })], 2000),
  gap(),
  item([role("Renewable Electricity Transition Dashboard"), stack("Power BI · DAX · R · Forecasting"),
    bullet("Developed a Power BI dashboard to analyse Australia’s renewable electricity transition from 2005–2024 and forecast progress to 2035."),
    bullet("Cleaned and standardised multi-country electricity data, including energy source mapping and GWh-to-TWh conversion."),
    bullet("Created DAX measures for renewable share, renewable generation, non-renewable generation, and renewable source mix."),
    bullet("Used R-based linear regression to forecast renewable generation and renewable share with prediction intervals and model statistics.")],
    [link("Case study ↗", "https://waranyu-cv.vercel.app/renewable.html", { font: MONO, size: 15 })], 2000),
  gap(),
  item([role("Football Club Database Design and SQL Implementation"), stack("SQL · Oracle · ERD · Database Design"),
    bullet("Designed a relational database model for a football club management system."),
    bullet("Developed an ERD and business rules to define relationships between key entities."),
    bullet("Created a logical database schema with clear table structures, relationships, and constraints."),
    bullet("Built and tested Oracle SQL tables to support accurate data storage and relational integrity.")],
    [link("Case study ↗", "https://waranyu-cv.vercel.app/football-database.html", { font: MONO, size: 15 })], 2000),

  h2("Relevant experience"),
  item([role("Student Consultant (Finance Lead)"), org("Curtin Consulting Group, Curtin University · Client: Hockey WA"),
    bullet("Led the financial analysis in a nine-person student consulting team advising Hockey WA, the state’s not-for-profit hockey body, on how to stream and own the broadcast of games at its new six-surface hockey centre in Perth without building its own platform."),
    bullet("Built a 20-year break-even model in Excel with best, base and worst-case scenarios, one-off and running cost tables, revenue estimates, and an appendix tracing every figure to its source."),
    bullet("Ran a sensitivity analysis (each driver ±20%) showing that audience growth outweighs upfront build cost in determining payback, and used it to recommend investing in marketing rather than seeking funding for the build."),
    bullet("Benchmarked growth and audience-retention assumptions against 15+ public case studies, including Finnish floorball streaming, GAAGO, Solidsport and the NFL’s move to Prime Video, alongside the team’s evaluation of three ownership options and four camera and analysis providers against weighted criteria."),
    bullet("Turned the analysis into board-ready slides and charts, revised after project director feedback, and presented the financial section at the final pitch to the client and an industry panel."),
    bullet("Built an interactive React prototype of the recommended streaming platform (family, coach and admin views) and a 3D render of the venue’s camera layout.")],
    [run("Jul 2026 – Nov 2026", { font: MONO, size: 15, color: MUTED })], 2700),
  gap(),
  item([role("Digital Marketing & Data Analytics Intern"), org("Like Me Co., Ltd. – Bangkok, Thailand"),
    bullet("Supported digital marketing campaigns through social media content, product research, and competitor analysis."),
    bullet("Conducted basic data tracking and market research to support campaign planning and business decisions."),
    bullet("Assisted with content writing and customer trend analysis to improve marketing communication.")],
    [run("Nov 2022 – Jan 2023", { font: MONO, size: 15, color: MUTED })], 2700),

  h2("Additional experience"),
  item([role("Bartender / Wait Staff"), org("Six Senses Gourmet, Leederville, Western Australia"),
    bullet("Delivered customer service in a fast-paced restaurant environment, including taking orders, serving food and drinks, bartending, and processing bills."),
    bullet("Managed multiple tasks under pressure while maintaining accuracy with orders, payments, and customer requests.")],
    [run("Nov 2023 – Present", { font: MONO, size: 15, color: MUTED })], 2700),

  h2("Achievements"),
  item([role("Best Business Case Pitch — “Branding is All About Counting”"), org("NSO Data Camp, Thailand"),
    body("Selected for Best Business Case Pitch after presenting a data-driven business model using tourism statistics, customer segmentation, and branding strategy.")],
    [run("2023", { font: MONO, size: 15, color: MUTED })], 1200),

  h2("Professional development"),
  item([role("Google Data Analytics Certificate Courses"), org("Coursera / Google"),
    bullet("Foundations: Data, Data, Everywhere"), bullet("Ask Questions to Make Data-Driven Decisions"), bullet("Prepare Data for Exploration")],
    [run("Completed May 2026", { font: MONO, size: 15, color: MUTED })], 2900),


  new Paragraph({ spacing: { before: 300, after: 0 }, border: { top: { style: BorderStyle.SINGLE, size: 4, color: LINE, space: 4 } },
    tabStops: [{ type: TabStopType.RIGHT, position: CONTENT }],
    children: [run("References available on request", { font: MONO, size: 14, color: MUTED }), run("\tPortfolio and live dashboards: waranyu-cv.vercel.app", { font: MONO, size: 14, color: MUTED })] }),
];

const doc = new Document({
  creator: "Waranyu Bancherdvanich",
  title: "Waranyu Bancherdvanich – CV",
  styles: { default: { document: { run: { font: SANS, size: 19, color: INK } } } },
  numbering: { config: [{ reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 360, hanging: 220 } }, run: { color: ACCENT } } }] }] },
  sections: [{ properties: { page: { size: { width: PAGE_W, height: 16838 }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } }, children }],
});
Packer.toBuffer(doc).then((buf) => { fs.writeFileSync(process.argv[2], buf); console.log("written", buf.length); });
