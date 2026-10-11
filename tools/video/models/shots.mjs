// Photographs one model from several angles and joins them into a sheet.
// usage (from tools/video): node models/shots.mjs coal-plant out.png [views...]
import { chromium } from "playwright-core";
const [name, out, ...vs] = process.argv.slice(2);
const views = vs.length ? vs : ["front", "left", "back", "high", "close", "detail"];
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 960, height: 600 } });
p.on("pageerror", (e) => console.log("pageerror", e.message));
p.on("console", (m) => { if (m.type() === "error") console.log("console", m.text()); });
await p.goto(`http://localhost:8010/models/test.html?model=${name}`);
await p.waitForFunction(() => window.ready === true, null, { timeout: 180000 });
const shots = [];
for (const v of views) {
  await p.evaluate((v) => window.shot(v), v);
  shots.push((await p.screenshot({ type: "jpeg", quality: 88 })).toString("base64"));
}
const cols = 2, w = 960, h = 600;
await p.setViewportSize({ width: cols * w, height: Math.ceil(shots.length / cols) * (h + 26) });
await p.setContent(`<body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(${cols},${w}px);font:15px monospace;color:#ccc">` +
  shots.map((s, i) => `<div><img src="data:image/jpeg;base64,${s}" width="${w}" height="${h}" style="display:block"><div style="height:26px;padding:3px 8px">${views[i]}</div></div>`).join("") + "</body>");
await p.screenshot({ path: out, type: "jpeg", quality: 80 });
await b.close();
