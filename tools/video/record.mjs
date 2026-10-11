// Frame-by-frame recording: renders frame(i / FPS) for every frame and saves
// it, so the result is exact regardless of how fast the machine is.
// usage: node record.mjs [fps] [dpr] [first frame, to resume]
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
const FPS = Number(process.argv[2] || 30), DPR = Number(process.argv[3] || 1.25);
mkdirSync("frames", { recursive: true });
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: DPR });
p.on("pageerror", (e) => console.log("pageerror", e.message));
await p.goto(`http://localhost:8010/index.html?dpr=${DPR}`);
await p.waitForFunction(() => window.ready === true, null, { timeout: 300000 });
const total = Math.round((await p.evaluate(() => window.DURATION)) * FPS);
const t0 = Date.now();
const START = Number(process.argv[4] || 0);   // resume after an interrupted run
for (let i = START; i < total; i++) {
  await p.evaluate((t) => window.frame(t), i / FPS);
  writeFileSync(`frames/f${String(i).padStart(4, "0")}.jpg`, await p.screenshot({ type: "jpeg", quality: 94 }));
  if (i % 60 === 0) console.log(`frame ${i}/${total}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
console.log("done", total, "frames in", ((Date.now() - t0) / 1000).toFixed(0) + "s");
await b.close();
