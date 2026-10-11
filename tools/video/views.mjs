// usage: node views.mjs out.png '[[t,[px,py,pz],[lx,ly,lz],fov], ...]'
import { chromium } from "playwright-core";
const out = process.argv[2], list = JSON.parse(process.argv[3]);
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on("pageerror", (e) => console.log("pageerror", e.message));
await p.goto("http://localhost:8010/index.html");
await p.waitForFunction(() => window.ready === true, null, { timeout: 180000 });
const shots = [];
for (const [t, pos, look, fov] of list) {
  await p.evaluate(([t, pos, look, fov]) => window.view(t, pos, look, fov || 38), [t, pos, look, fov]);
  shots.push((await p.screenshot({ type: "jpeg", quality: 85 })).toString("base64"));
}
const cols = 2, w = 640, h = 360;
await p.setViewportSize({ width: cols * w, height: Math.ceil(shots.length / cols) * h });
await p.setContent(`<body style="margin:0;display:grid;grid-template-columns:repeat(${cols},${w}px)">` + shots.map((s) => `<img src="data:image/jpeg;base64,${s}" width="${w}" height="${h}">`).join("") + "</body>");
await p.screenshot({ path: out });
await b.close();
