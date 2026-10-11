// Renders chosen moments and joins them into one contact sheet.
// usage: node stills.mjs out.png 1 3 6 10 ...
import { chromium } from "playwright-core";
const [out, ...ts] = process.argv.slice(2);
const times = ts.map(Number);
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on("pageerror", (e) => console.log("pageerror", e.message));
p.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log(m.type(), m.text()); });
await p.goto("http://localhost:8010/index.html" + (process.env.Q || ""));
await p.waitForFunction(() => window.ready === true, null, { timeout: 180000 });
console.log("facts", JSON.stringify(await p.evaluate(() => window.FACTS)));
const shots = [];
for (const t of times) {
  const t0 = Date.now();
  await p.evaluate((t) => window.frame(t), t);
  shots.push((await p.screenshot({ type: "jpeg", quality: 85 })).toString("base64"));
  console.log("t=" + t, (Date.now() - t0) + "ms", JSON.stringify(await p.evaluate((t) => window.cameraAt(t), t)));
}
const cols = 3, w = 640, h = 360;
await p.setViewportSize({ width: cols * w, height: Math.ceil(shots.length / cols) * (h + 28) });
await p.setContent(`<body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(${cols},${w}px);font:14px monospace;color:#ccc">` +
  shots.map((s, i) => `<div><img src="data:image/jpeg;base64,${s}" width="${w}" height="${h}" style="display:block"><div style="height:28px;padding:4px 8px">t = ${times[i]} s</div></div>`).join("") + "</body>");
await p.screenshot({ path: out });
await b.close();
