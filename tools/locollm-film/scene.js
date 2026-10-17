/* LocoLLM capstone film: a three.js desk diorama posed entirely from time t.
 *
 * window.frame(t) poses everything for time t (seconds) and renders once,
 * so every render of a given t is identical. Every number on screen comes
 * from the team's client presentation (MGMT6052, October 2026): the
 * 15-topic base-model test, the sealed 170-question benchmark, the 615
 * training examples and the one-principle accuracy of each run.
 * The laptop, adapters, vault and cards are illustrations.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const params = new URLSearchParams(location.search);
const DPR = parseFloat(params.get("dpr") || "1");
const W = 1280, H = 720;
export const DURATION = 54;
window.DURATION = DURATION;

/* ---- the facts ----------------------------------------------------------- */
const DOMAINS = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 4, 3, 0, 0];   // base model, out of 5; the last is privacy law
const RUNS = [["Base", 2], ["Run 1", 32], ["Run 2", 32], ["Run 4", 38], ["Run 5", 81]];
const QUESTION = "A gym stores fingerprint scans on an unencrypted laptop. The laptop is lost. Which principle applies?";
const ANSWER1 = "APP 11: Security of personal information";
const ANSWER2 = "The data was not kept secure.";

/* ---- beats (seconds), matched to the narration ----------------------- */
const B = { title: [0, 7.4], adapt: [7.4, 15.1], domains: [15.1, 24.8], seal: [24.8, 35.0], runs: [35.0, 45.0], end: [45.0, 54] };

/* ---- palette (the site's) ------------------------------------------------ */
const PAPER = "#f7f4ee", INK = "#1c1b18", MUTED = "#5d5a52", ACCENT = "#0f6b45", MINT = "#b3cfc3", SAND = "#d4cab6", AMBER = "#8c5200";

/* ---- helpers ------------------------------------------------------------ */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(61852026);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
const ease = (x) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const easeOutBack = (x) => { x = clamp(x); const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const win = (t, a, b, d = 0.5) => smooth((t - a) / d) * (1 - smooth((t - (b - d)) / d));

function canvasTex(w, h, draw) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 8;
  return tx;
}
function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function wrap(ctx, text, maxW) {
  const words = text.split(" "), lines = []; let line = "";
  for (const w of words) { const s = line ? line + " " + w : w; if (ctx.measureText(s).width > maxW && line) { lines.push(line); line = w; } else line = s; }
  if (line) lines.push(line); return lines;
}

await document.fonts.load('700 40px "SG"'); await document.fonts.load('500 40px "SG"');
await document.fonts.load('400 40px "SG"'); await document.fonts.load('400 20px "DM"'); await document.fonts.load('500 20px "DM"');

/* ---- renderer, scene, lights --------------------------------------------- */
const canvas = document.getElementById("gl");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(DPR); renderer.setSize(W, H, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color("#ece5d8");
scene.fog = new THREE.Fog("#ece5d8", 26, 60);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.45;

scene.add(new THREE.HemisphereLight("#fff6e6", "#b89a78", 0.9));
const key = new THREE.DirectionalLight("#fff1dc", 2.4);
key.position.set(9, 16, 11); key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -26, right: 26, top: 18, bottom: -18, near: 1, far: 60 });
key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; key.shadow.radius = 4;
scene.add(key);
const fill = new THREE.DirectionalLight("#dfe9ff", 0.5); fill.position.set(-12, 8, 6); scene.add(fill);

const camera = new THREE.PerspectiveCamera(36, W / H, 0.1, 200);

/* ---- desk ----------------------------------------------------------------- */
const woodTex = canvasTex(2048, 1024, (ctx, w, h) => {
  ctx.fillStyle = "#cfae86"; ctx.fillRect(0, 0, w, h);
  const r = mulberry32(7);
  for (let i = 0; i < 520; i++) {
    const y0 = r() * h, amp = 4 + r() * 14, f = 0.002 + r() * 0.004, ph = r() * 6.28;
    ctx.strokeStyle = r() < 0.5 ? `rgba(120,80,45,${0.05 + r() * 0.12})` : `rgba(255,240,215,${0.05 + r() * 0.1})`;
    ctx.lineWidth = 0.6 + r() * 2.4; ctx.beginPath();
    for (let x = 0; x <= w; x += 16) { const y = y0 + Math.sin(x * f + ph) * amp; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
  }
  for (let p = 1; p < 6; p++) { ctx.fillStyle = "rgba(90,60,35,.18)"; ctx.fillRect(0, (p * h) / 6 - 1, w, 2); }   // plank seams
});
woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping; woodTex.repeat.set(3, 2.4);
const desk = new THREE.Mesh(new THREE.PlaneGeometry(90, 60), new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.62, metalness: 0 }));
desk.rotation.x = -Math.PI / 2; desk.receiveShadow = true; scene.add(desk);

/* ---- materials ------------------------------------------------------------ */
const M = {
  alu: new THREE.MeshStandardMaterial({ color: "#9aa0a7", roughness: 0.32, metalness: 0.75 }),
  aluDark: new THREE.MeshStandardMaterial({ color: "#5b6068", roughness: 0.4, metalness: 0.6 }),
  ink: new THREE.MeshStandardMaterial({ color: INK, roughness: 0.6 }),
  accent: new THREE.MeshStandardMaterial({ color: ACCENT, roughness: 0.45, metalness: 0.05, emissive: ACCENT, emissiveIntensity: 0 }),
  mint: new THREE.MeshStandardMaterial({ color: MINT, roughness: 0.55 }),
  sand: new THREE.MeshStandardMaterial({ color: SAND, roughness: 0.6 }),
  paper: new THREE.MeshStandardMaterial({ color: "#fbf9f4", roughness: 0.85 }),
  gold: new THREE.MeshStandardMaterial({ color: "#c79a3a", roughness: 0.3, metalness: 0.85 }),
  pcb: new THREE.MeshStandardMaterial({ color: "#1d3b2c", roughness: 0.55 }),
  chip: new THREE.MeshStandardMaterial({ color: "#26272a", roughness: 0.35, metalness: 0.3 }),
};
function mesh(geo, mat, cast = true) { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; return m; }

/* ---- station A: the laptop ------------------------------------------------ */
const laptop = new THREE.Group(); scene.add(laptop);
const base = mesh(new RoundedBoxGeometry(3.4, 0.14, 2.3, 4, 0.06), M.alu); base.position.y = 0.07; laptop.add(base);
const keysTex = canvasTex(1024, 380, (ctx, w, h) => {
  ctx.fillStyle = "#7d838b"; ctx.fillRect(0, 0, w, h);
  const cols = 14, rows = 5, gx = 8, kw = (w - gx * (cols + 1)) / cols, kh = (h - gx * (rows + 1)) / rows;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (r === 4 && c > 3 && c < 10) continue;
    ctx.fillStyle = "#2b2e33"; rrect(ctx, gx + c * (kw + gx), gx + r * (kh + gx), kw, kh, 8); ctx.fill();
  }
  ctx.fillStyle = "#2b2e33"; rrect(ctx, gx + 4 * (kw + gx), gx + 4 * (kh + gx), 6 * kw + 5 * gx, kh, 8); ctx.fill();
});
const keyboard = mesh(new THREE.PlaneGeometry(3.0, 1.12), new THREE.MeshStandardMaterial({ map: keysTex, roughness: 0.5 }), false);
keyboard.rotation.x = -Math.PI / 2; keyboard.position.set(0, 0.142, -0.32); laptop.add(keyboard);
const pad = mesh(new THREE.PlaneGeometry(1.15, 0.62), new THREE.MeshStandardMaterial({ color: "#8a9098", roughness: 0.25, metalness: 0.6 }), false);
pad.rotation.x = -Math.PI / 2; pad.position.set(0, 0.142, 0.72); laptop.add(pad);
const port = mesh(new THREE.BoxGeometry(0.02, 0.05, 0.32), M.ink, false); port.position.set(1.701, 0.07, 0.3); laptop.add(port);

const hinge = new THREE.Group(); hinge.position.set(0, 0.14, -1.13); laptop.add(hinge);
const lid = mesh(new RoundedBoxGeometry(3.4, 2.2, 0.08, 4, 0.04), M.alu); lid.position.set(0, 1.1, 0); hinge.add(lid);
const bezel = mesh(new THREE.PlaneGeometry(3.3, 2.1), M.ink, false); bezel.position.set(0, 1.1, 0.0405); hinge.add(bezel);

const SCR_W = 1200, SCR_H = 760;
const scrCanvas = document.createElement("canvas"); scrCanvas.width = SCR_W; scrCanvas.height = SCR_H;
const scrTex = new THREE.CanvasTexture(scrCanvas); scrTex.colorSpace = THREE.SRGBColorSpace; scrTex.anisotropy = 8;
const screen = new THREE.Mesh(new THREE.PlaneGeometry(3.12, 1.976), new THREE.MeshBasicMaterial({ map: scrTex, toneMapped: false }));
screen.position.set(0, 1.12, 0.042); hinge.add(screen);
let scrKey = "";
function drawScreen(typed, phase, adapterOn) {
  const k = typed + "|" + phase + "|" + adapterOn;
  if (k === scrKey) return; scrKey = k;
  const ctx = scrCanvas.getContext("2d"), w = SCR_W, h = SCR_H;
  ctx.fillStyle = "#fbfaf6"; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#efeae0"; ctx.fillRect(0, 0, w, 74);
  ctx.fillStyle = INK; ctx.font = '700 30px "SG"'; ctx.textBaseline = "middle"; ctx.fillText("LocoLLM", 36, 38);
  ctx.font = '400 22px "DM"'; ctx.fillStyle = MUTED;
  ctx.fillText(adapterOn ? "Qwen3-4B  +  privacy-law adapter" : "Qwen3-4B  ·  runs on this laptop", 200, 39);
  ctx.fillStyle = adapterOn ? ACCENT : "#b9b2a3"; ctx.beginPath(); ctx.arc(w - 46, 38, 10, 0, 6.29); ctx.fill();
  // the question bubble, typed
  const q = QUESTION.slice(0, typed);
  ctx.font = '400 31px "SG"'; const lines = wrap(ctx, QUESTION, 640);
  const bh = 34 + lines.length * 42, bx = w - 36 - 700, by = 112;
  ctx.fillStyle = "#e6efe9"; rrect(ctx, bx, by, 700, bh, 22); ctx.fill();
  ctx.fillStyle = INK; ctx.textBaseline = "top"; let left = q;
  lines.forEach((ln, i) => { const part = left.slice(0, ln.length); left = left.slice(ln.length + 1); ctx.fillText(part, bx + 30, by + 22 + i * 42); });
  // the reply
  const ry = by + bh + 34;
  if (phase === 1) {           // thinking
    ctx.fillStyle = "#f1ede4"; rrect(ctx, 36, ry, 170, 70, 22); ctx.fill();
    ctx.fillStyle = MUTED; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(84 + i * 38, ry + 35, 8, 0, 6.29); ctx.fill(); }
  } else if (phase === 2) {    // the answer
    ctx.fillStyle = "#f1ede4"; rrect(ctx, 36, ry, 760, 150, 22); ctx.fill();
    ctx.fillStyle = ACCENT; ctx.font = '700 34px "SG"'; ctx.fillText(ANSWER1, 70, ry + 30);
    ctx.fillStyle = INK; ctx.font = '400 30px "SG"'; ctx.fillText(ANSWER2, 70, ry + 86);
    ctx.fillStyle = ACCENT; ctx.beginPath(); ctx.arc(w - 120, ry + 75, 44, 0, 6.29); ctx.fill();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 10; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(w - 142, ry + 76); ctx.lineTo(w - 126, ry + 92); ctx.lineTo(w - 96, ry + 58); ctx.stroke();
  }
  ctx.fillStyle = "#efeae0"; rrect(ctx, 36, h - 92, w - 72, 60, 30); ctx.fill();
  ctx.fillStyle = "#9a9384"; ctx.font = '400 24px "SG"'; ctx.textBaseline = "middle"; ctx.fillText("Ask about Australian privacy law…", 70, h - 62);
  scrTex.needsUpdate = true;
}
const screenGlow = new THREE.PointLight("#eaf6ef", 0.0, 6, 2); screenGlow.position.set(0, 1.3, -0.4); laptop.add(screenGlow);

/* ---- adapters ---------------------------------------------------------------- */
function labelTex(text, sub, bg, fg) {
  return canvasTex(512, 360, (ctx, w, h) => {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = fg; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = '700 70px "SG"'; ctx.fillText(text, w / 2, h / 2 - (sub ? 26 : 0));
    if (sub) { ctx.font = '400 38px "DM"'; ctx.globalAlpha = 0.8; ctx.fillText(sub, w / 2, h / 2 + 52); }
  });
}
function makeAdapter(text, sub, body, labelBg, labelFg) {
  const g = new THREE.Group();
  const b = mesh(new RoundedBoxGeometry(1.1, 0.42, 0.78, 4, 0.08), body); g.add(b);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 0.69), new THREE.MeshStandardMaterial({ map: labelTex(text, sub, labelBg, labelFg), roughness: 0.6 }));
  top.rotation.x = -Math.PI / 2; top.position.y = 0.212; g.add(top);
  const plug = mesh(new THREE.BoxGeometry(0.16, 0.06, 0.28), M.aluDark, false); plug.position.set(-0.6, -0.05, 0); g.add(plug);
  scene.add(g); return g;
}
const adPriv = makeAdapter("Privacy law", "our adapter", M.accent, ACCENT, "#ffffff");
const adHR = makeAdapter("HR", "next team", M.sand, "#e7e0d1", INK);
const adAny = makeAdapter("Any subject", "", M.sand, "#efe9dd", INK);
const AD_HOME = [new THREE.Vector3(3.6, 1.15, -0.2), new THREE.Vector3(4.95, 1.45, -0.9), new THREE.Vector3(6.3, 1.2, -0.3)];
const AD_DOCK = new THREE.Vector3(2.28, 0.21, 0.3);
const seam = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.3, 0.6), new THREE.MeshBasicMaterial({ color: "#7fe0b3", transparent: true, opacity: 0, toneMapped: false }));
seam.position.set(1.72, 0.2, 0.3); scene.add(seam);

/* ---- station B: the 15-topic test ---------------------------------------- */
const SB = new THREE.Vector3(-12, 0, -1.5);
const bars = DOMAINS.map((v, i) => {
  const isPriv = i === DOMAINS.length - 1;
  const m = mesh(new RoundedBoxGeometry(0.44, 1, 0.44, 3, 0.05), v === 5 ? M.sand : M.mint);
  m.position.set(SB.x + (i - 7) * 0.62, 0, SB.z); m.scale.y = 0.001; scene.add(m);
  return { m, v, isPriv };
});
const privTile = mesh(new THREE.BoxGeometry(0.62, 0.03, 0.62), M.accent, false);
privTile.position.set(SB.x + 7 * 0.62, 0.015, SB.z); privTile.scale.set(0.001, 1, 0.001); scene.add(privTile);
const hrTile = mesh(new THREE.BoxGeometry(0.44, 0.02, 0.44), M.mint, false);
hrTile.position.set(SB.x + 6 * 0.62, 0.01, SB.z); hrTile.scale.set(0.001, 1, 0.001); scene.add(hrTile);
const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 48), new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0, side: THREE.DoubleSide }));
ring.rotation.x = -Math.PI / 2; ring.position.set(SB.x + 7 * 0.62, 0.035, SB.z); scene.add(ring);
const BAR_H = 0.38;   // world units per point out of 5

/* ---- station C: seal the test, then train ---------------------------------- */
const SC = new THREE.Vector3(11, 0, -1.5);
const vault = new THREE.Group(); vault.position.copy(SC); scene.add(vault);
const VW = 2.4, VH = 1.7, VD = 1.6;
const glass = new THREE.Mesh(new THREE.BoxGeometry(VW, VH, VD), new THREE.MeshStandardMaterial({ color: "#eef6f2", transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0, depthWrite: false }));
glass.position.y = VH / 2; vault.add(glass);
const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(VW, VH, VD)), new THREE.LineBasicMaterial({ color: "#3d4a43" }));
edges.position.y = VH / 2; vault.add(edges);
const vaultBase = mesh(new THREE.BoxGeometry(VW + 0.2, 0.08, VD + 0.2), M.aluDark); vaultBase.position.y = 0.04; vault.add(vaultBase);
const lidG = new THREE.Group(); lidG.position.set(0, VH, -VD / 2); vault.add(lidG);
const vlid = mesh(new THREE.BoxGeometry(VW + 0.14, 0.09, VD + 0.14), M.aluDark); vlid.position.set(0, 0.045, VD / 2); lidG.add(vlid);
const lock = new THREE.Group(); vault.add(lock); lock.position.set(0, VH * 0.55, VD / 2 + 0.06);
const lockBody = mesh(new RoundedBoxGeometry(0.5, 0.42, 0.14, 3, 0.05), M.gold); lock.add(lockBody);
const shackle = mesh(new THREE.TorusGeometry(0.15, 0.04, 12, 24, Math.PI), M.gold); shackle.position.y = 0.2; lock.add(shackle);
const keyhole = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.02, 16), M.ink, false); keyhole.rotation.x = Math.PI / 2; keyhole.position.z = 0.075; lock.add(keyhole);

const cardTex = canvasTex(256, 170, (ctx, w, h) => {
  ctx.fillStyle = "#fbf9f4"; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = ACCENT; ctx.fillRect(18, 18, 60, 14);
  ctx.fillStyle = "#c9c2b3"; for (let i = 0; i < 5; i++) ctx.fillRect(18, 50 + i * 22, w - 36 - (i % 2) * 50, 9);
});
const cardMat = new THREE.MeshStandardMaterial({ map: cardTex, roughness: 0.8 });
const NCARD = 34;
const cards = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.022, 0.62), cardMat, NCARD);
cards.castShadow = true; cards.receiveShadow = true; scene.add(cards);
const cardRest = [];
for (let i = 0; i < NCARD; i++) {
  const pile = i % 2, lvl = Math.floor(i / 2);
  cardRest.push({ x: SC.x + (pile ? 0.5 : -0.5) + (rand() - 0.5) * 0.08, y: 0.1 + lvl * 0.026, z: SC.z + (rand() - 0.5) * 0.1, ry: (rand() - 0.5) * 0.25 });
}
// training: a stack of examples streams into the adapter on a GPU board
const ST = new THREE.Vector3(14.6, 0, -1.4), GPU = new THREE.Vector3(17.6, 0, -1.4);
const stack = mesh(new THREE.BoxGeometry(0.9, 1, 0.62), new THREE.MeshStandardMaterial({ color: "#f3efe6", roughness: 0.9 }));
stack.position.set(ST.x, 0, ST.z); stack.scale.y = 0.001; scene.add(stack);
const stackTop = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.62), cardMat); stackTop.rotation.x = -Math.PI / 2; scene.add(stackTop);
const board = new THREE.Group(); board.position.copy(GPU); scene.add(board);
const pcbM = mesh(new THREE.BoxGeometry(2.2, 0.08, 1.5), M.pcb); pcbM.position.y = 0.04; board.add(pcbM);
const chipM = mesh(new THREE.BoxGeometry(0.7, 0.07, 0.7), M.chip); chipM.position.set(-0.45, 0.115, 0); board.add(chipM);
for (let i = 0; i < 9; i++) { const pin = mesh(new THREE.BoxGeometry(0.06, 0.012, 0.22), M.gold, false); pin.position.set(-1.0 + i * 0.25, 0.086, 0.62); board.add(pin); }
const fanM = mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.05, 32), M.aluDark); fanM.position.set(0.55, 0.11, 0); board.add(fanM);
const adTrain = makeAdapter("Privacy law", "training…", M.accent, ACCENT, "#ffffff");
const NFLY = 40;
const fly = new THREE.InstancedMesh(new THREE.BoxGeometry(0.36, 0.012, 0.25), cardMat, NFLY); fly.castShadow = true; scene.add(fly);

/* ---- station D: one change per run ------------------------------------------ */
const SD = new THREE.Vector3(-24, 0, -13);
const COL_H = 0.056;   // world units per percentage point
const cols = RUNS.map((r, i) => {
  const m = mesh(new RoundedBoxGeometry(0.95, 1, 0.95, 4, 0.08), i === 4 ? M.accent.clone() : M.mint);
  m.position.set(SD.x + (i - 2) * 1.55, 0, SD.z); m.scale.y = 0.001; scene.add(m);
  return m;
});
const RUN_T = [36.0, 37.2, 38.2, 39.6, 41.8];   // when each column starts to grow

/* ---- camera path ------------------------------------------------------------ */
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const CAM = [   // [time, position, target]
  [0.0, V(0.2, 3.1, 9.6), V(0, 1.05, 0)],
  [6.6, V(0.3, 2.35, 5.9), V(0, 1.1, -0.2)],
  [8.6, V(2.9, 3.0, 8.4), V(2.4, 0.95, -0.2)],
  [14.4, V(2.6, 2.6, 7.6), V(2.1, 0.8, 0)],
  [16.9, V(SB.x, 3.6, SB.z + 10.2), V(SB.x, 1.45, SB.z)],
  [24.0, V(SB.x - 1.0, 3.3, SB.z + 9.4), V(SB.x + 0.5, 1.35, SB.z)],
  [26.8, V(SC.x + 0.4, 3.6, SC.z + 7.0), V(SC.x + 0.4, 1.0, SC.z)],
  [30.4, V(SC.x + 1.4, 3.8, SC.z + 8.4), V(SC.x + 2.6, 0.9, SC.z)],
  [34.4, V(SC.x + 4.0, 3.9, SC.z + 8.6), V(SC.x + 4.0, 0.8, SC.z)],
  [36.8, V(SD.x, 4.6, SD.z + 12.6), V(SD.x, 2.0, SD.z)],
  [44.2, V(SD.x + 0.8, 4.8, SD.z + 11.8), V(SD.x + 0.4, 2.2, SD.z)],
  [46.8, V(-0.9, 2.3, 5.6), V(-1.25, 1.12, -0.25)],
  [54.0, V(-0.85, 2.15, 4.9), V(-1.15, 1.15, -0.3)],
];
function poseCamera(t) {
  let i = 0; while (i < CAM.length - 2 && t > CAM[i + 1][0]) i++;
  const [t0, p0, q0] = CAM[i], [t1, p1, q1] = CAM[i + 1];
  const k = ease((t - t0) / (t1 - t0));
  camera.position.lerpVectors(p0, p1, k);
  const tgt = new THREE.Vector3().lerpVectors(q0, q1, k);
  camera.lookAt(tgt);
}

/* ---- HUD -------------------------------------------------------------------- */
const hud = document.getElementById("hud");
hud.width = W * DPR; hud.height = H * DPR;
const hx = hud.getContext("2d"); hx.scale(DPR, DPR);
function toScreen(v) { const p = v.clone().project(camera); return { x: (p.x * 0.5 + 0.5) * W, y: (-p.y * 0.5 + 0.5) * H, z: p.z }; }
function heading(a, eyebrow, title, sub) {
  if (a <= 0.001) return;
  hx.save(); hx.globalAlpha = a;
  hx.font = '700 40px "SG"'; const tw = hx.measureText(title).width;
  hx.font = '400 19px "SG"'; const sw = sub ? hx.measureText(sub).width : 0;
  const pw = Math.max(tw, sw, 200) + 56, ph = sub ? 132 : 104;
  hx.fillStyle = "rgba(247,244,238,0.9)"; rrect(hx, 40, 38, pw, ph, 14); hx.fill();
  hx.fillStyle = ACCENT; hx.font = '500 13px "DM"'; hx.letterSpacing = "1.5px"; hx.textBaseline = "top"; hx.fillText(eyebrow, 68, 60); hx.letterSpacing = "0px";
  hx.fillStyle = INK; hx.font = '700 40px "SG"'; hx.fillText(title, 66, 82);
  if (sub) { hx.fillStyle = MUTED; hx.font = '400 19px "SG"'; hx.fillText(sub, 68, 132); }
  hx.restore();
}
function tag(a, at, text, sub, opts = {}) {
  if (a <= 0.001) return;
  const p = toScreen(at); if (p.z > 1) return;
  const dx = opts.dx || 0, dy = opts.dy == null ? -70 : opts.dy, strong = !!opts.strong;
  hx.save(); hx.globalAlpha = a;
  hx.font = (strong ? '700 22px "SG"' : '500 19px "SG"'); const tw = hx.measureText(text).width;
  hx.font = '400 13px "DM"'; const sw = sub ? hx.measureText(sub).width : 0;
  const w = Math.max(tw, sw) + 30, h = sub ? 58 : 38;
  const bx = p.x + dx - w / 2, by = p.y + dy - h;
  hx.strokeStyle = strong ? ACCENT : "rgba(28,27,24,.55)"; hx.lineWidth = 1.5;
  hx.beginPath(); hx.moveTo(p.x, p.y); hx.lineTo(p.x + dx, by + h); hx.stroke();
  hx.fillStyle = strong ? ACCENT : INK; hx.beginPath(); hx.arc(p.x, p.y, 4, 0, 6.29); hx.fill();
  hx.fillStyle = strong ? ACCENT : "rgba(251,250,246,.95)"; rrect(hx, bx, by, w, h, 10); hx.fill();
  hx.fillStyle = strong ? "#ffffff" : INK; hx.textBaseline = "top";
  hx.font = (strong ? '700 22px "SG"' : '500 19px "SG"'); hx.fillText(text, bx + 15, by + 8);
  if (sub) { hx.fillStyle = strong ? "rgba(255,255,255,.85)" : MUTED; hx.font = '400 13px "DM"'; hx.fillText(sub, bx + 15, by + 36); }
  hx.restore();
}
function counter(a, x, y, value, label) {
  if (a <= 0.001) return;
  hx.save(); hx.globalAlpha = a;
  hx.fillStyle = "rgba(247,244,238,0.9)"; rrect(hx, x, y, 250, 92, 12); hx.fill();
  hx.fillStyle = AMBER; hx.font = '700 44px "SG"'; hx.textBaseline = "top"; hx.fillText(value, x + 22, y + 12);
  hx.fillStyle = MUTED; hx.font = '400 13px "DM"'; hx.letterSpacing = "1px"; hx.fillText(label.toUpperCase(), x + 24, y + 64); hx.letterSpacing = "0px";
  hx.restore();
}
function drawHUD(t) {
  hx.clearRect(0, 0, W, H);
  // opening title
  const aT = win(t, 0.3, 6.9, 0.7);
  if (aT > 0) {
    hx.save(); hx.globalAlpha = aT;
    hx.fillStyle = "rgba(247,244,238,0.9)"; rrect(hx, 40, 38, 520, 168, 16); hx.fill();
    hx.fillStyle = ACCENT; hx.font = '500 13px "DM"'; hx.letterSpacing = "1.5px"; hx.textBaseline = "top";
    hx.fillText("MGMT6052 CONSULTANCY · CLIENT: LOCOLABO", 68, 62); hx.letterSpacing = "0px";
    hx.fillStyle = INK; hx.font = '700 64px "SG"'; hx.fillText("LocoLLM", 64, 84);
    hx.fillStyle = MUTED; hx.font = '400 21px "SG"'; hx.fillText("A small AI model that runs on your own laptop", 68, 158);
    hx.restore();
  }
  // adapters
  heading(win(t, 7.7, 14.9), "01 · THE IDEA", "One small model, plug-in experts", "Each adapter makes it an expert in one subject");
  const aA = win(t, 8.6, 11.6);
  tag(aA, adPriv.position.clone().add(V(0, 0.25, 0)), "Privacy law", "our adapter", { dy: -64, strong: true });
  tag(aA, adHR.position.clone().add(V(0, 0.25, 0)), "HR", "the next team", { dy: -64 });
  tag(aA, adAny.position.clone().add(V(0, 0.25, 0)), "Any subject", "", { dy: -64 });
  tag(win(t, 12.4, 14.9), V(1.95, 0.42, 0.3), "Plugged in", "Qwen3-4B + privacy-law adapter", { dy: -86, dx: 60, strong: true });
  // domains
  heading(win(t, 16.6, 24.6), "02 · CHOOSING THE DOMAIN", "15 topics, tested before training", "Base model · 5 questions per topic");
  tag(win(t, 19.4, 24.6), V(SB.x - 1 * 0.62, 5 * BAR_H + 0.05, SB.z), "11 topics: 5 out of 5", "nothing left to prove", { dy: -56, dx: 70 });
  tag(win(t, 20.6, 24.6), V(SB.x + 7 * 0.62, 0.06, SB.z), "Privacy law: 0 out of 5", "our choice", { dy: -120, dx: 30, strong: true });
  // seal and train
  heading(win(t, 25.4, 34.8), "03 · A FAIR TEST", "Seal the test, then train", "Questions from the OAIC guidelines and the Privacy Act 1988");
  const nSealed = Math.round(170 * smooth((t - 25.6) / 3.6));
  counter(win(t, 25.8, 30.6), 40, H - 150, String(nSealed), "test questions, sealed");
  tag(win(t, 29.0, 31.6), V(SC.x, VH + 0.1, SC.z), "Never used for training", "", { dy: -54 });
  const nTrain = Math.round(615 * smooth((t - 31.4) / 3.0));
  counter(win(t, 31.4, 34.8), 40, H - 150, String(nTrain), "training examples");
  tag(win(t, 31.4, 34.8), GPU.clone().add(V(0.2, 0.75, 0)), "Free Colab GPU", "about 15 minutes a run", { dy: -74, dx: 30 });
  // runs
  heading(win(t, 36.2, 44.8), "04 · ONE CHANGE PER RUN", "One-principle accuracy", "Sealed benchmark · 130 single-answer questions");
  RUNS.forEach((r, i) => {
    const g = growK(t, i);
    if (g <= 0.02) return;
    const top = V(cols[i].position.x, r[1] * COL_H * easeOutBack(g) + 0.12, SD.z);
    const p = toScreen(top);
    hx.save(); hx.globalAlpha = clamp(g * 3) * win(t, 35.4, 45.0);
    hx.fillStyle = i === 4 ? ACCENT : INK; hx.font = (i === 4 ? '700 30px "SG"' : '700 22px "SG"');
    hx.textAlign = "center"; hx.textBaseline = "bottom"; hx.fillText(Math.round(r[1] * clamp(g * 1.15)) + "%", p.x, p.y - 6);
    const q = toScreen(V(cols[i].position.x, 0, SD.z + 0.62));
    hx.fillStyle = i === 4 ? ACCENT : MUTED; hx.font = '500 15px "DM"'; hx.textBaseline = "top"; hx.fillText(r[0], q.x, q.y + 8);
    hx.restore();
  });
  tag(win(t, 40.0, 44.8), V(cols[3].position.x - 0.3, 38 * COL_H, SD.z), "Reasoning first", "", { dy: -40, dx: -130 });
  tag(win(t, 42.6, 44.8), V(cols[4].position.x + 0.45, 60 * COL_H, SD.z), "+ MLP layers", "38% → 81%", { dy: -20, dx: 150, strong: true });
  // end card
  const aE = win(t, 48.2, 54.6, 0.8);
  if (aE > 0) {
    hx.save(); hx.globalAlpha = aE;
    hx.fillStyle = "rgba(247,244,238,0.93)"; rrect(hx, 40, 38, 470, 214, 16); hx.fill();
    hx.fillStyle = ACCENT; hx.font = '500 13px "DM"'; hx.letterSpacing = "1.5px"; hx.textBaseline = "top";
    hx.fillText("SEALED BENCHMARK · RUN 5", 68, 62); hx.letterSpacing = "0px";
    hx.fillStyle = AMBER; hx.font = '700 84px "SG"'; hx.fillText("81%", 64, 82);
    hx.fillStyle = INK; hx.font = '500 21px "SG"'; hx.fillText("correct on one-principle questions", 68, 178);
    hx.fillStyle = MUTED; hx.font = '400 17px "SG"'; hx.fillText("Explore the results below", 68, 212);
    hx.restore();
  }
  // corner note
  hx.save(); hx.globalAlpha = 0.85; hx.fillStyle = MUTED; hx.font = '400 12px "DM"'; hx.textAlign = "right"; hx.textBaseline = "bottom";
  hx.fillText("Illustration · every figure is from the team's benchmark results", W - 26, H - 18); hx.restore();
}
function growK(t, i) { return clamp((t - RUN_T[i]) / (i === 4 ? 1.8 : 1.0)); }

/* ---- pose everything for time t -------------------------------------------- */
const dummy = new THREE.Object3D();
function frame(t) {
  poseCamera(t);

  // laptop screen: the question types, then (at the end) the answer
  const typed = Math.round(QUESTION.length * clamp((t - 1.2) / 4.2));
  const adapterOn = t > 13.4;
  const phase = t > 47.6 ? 2 : t > 45.6 ? 1 : 0;
  drawScreen(typed, phase, adapterOn);
  hinge.rotation.x = -0.3;
  screenGlow.intensity = 0.6;

  // adapters float, then the privacy one docks
  const bob = (i) => Math.sin(t * 1.6 + i * 1.7) * 0.06;
  const ads = [adPriv, adHR, adAny];
  const appear = (i) => easeOutBack((t - 8.0 - i * 0.25) / 0.9);
  ads.forEach((a, i) => {
    const k = clamp(appear(i), 0, 1.2);
    a.visible = t > 7.9;
    a.position.copy(AD_HOME[i]).add(V(0, bob(i) - (1 - clamp(k)) * 0.8, 0));
    a.scale.setScalar(Math.max(0.001, k));
    a.rotation.set(0, -0.25 + Math.sin(t * 0.9 + i) * 0.05, 0);
  });
  const dk = ease((t - 11.4) / 1.6);
  if (t > 11.4) {
    adPriv.position.lerpVectors(AD_HOME[0].clone().add(V(0, bob(0), 0)), AD_DOCK, dk);
    adPriv.rotation.set(0, lerp(-0.25, 0, dk), 0);
  }
  const glowK = t > 13.0 ? 0.6 + 0.4 * Math.sin(t * 4) : 0;
  seam.material.opacity = clamp((t - 13.0) / 0.4) * glowK;
  adPriv.children[0].material.emissiveIntensity = t > 13.0 ? 0.12 + 0.08 * Math.sin(t * 4) : 0;

  // the 15-topic test
  bars.forEach((b, i) => {
    const g = easeOutBack((t - 17.4 - i * 0.12) / 0.8);
    const hgt = b.v * BAR_H;
    b.m.visible = b.v > 0 && t > 17.3;
    b.m.scale.y = Math.max(0.001, hgt * clamp(g, 0, 1.15));
    b.m.position.y = b.m.scale.y / 2;
  });
  const tileK = easeOutBack((t - 19.2) / 0.6);
  privTile.scale.set(Math.max(0.001, tileK), 1, Math.max(0.001, tileK)); privTile.visible = t > 19.1;
  hrTile.scale.set(Math.max(0.001, tileK), 1, Math.max(0.001, tileK)); hrTile.visible = t > 19.1;
  const rk = clamp((t - 20.6) / 2.0);
  ring.material.opacity = t > 20.6 ? (1 - ((t - 20.6) % 1.2) / 1.2) * 0.9 : 0;
  ring.scale.setScalar(1 + ((t - 20.6) % 1.2) * 0.9 * (rk > 0 ? 1 : 0));

  // seal: cards drop into the vault, the lid closes, the lock appears
  for (let i = 0; i < NCARD; i++) {
    const r = cardRest[i], t0 = 25.6 + i * 0.1, k = clamp((t - t0) / 0.55);
    const y = lerp(r.y + 3.2, r.y, k * k);
    dummy.position.set(r.x, y, r.z); dummy.rotation.set(0, r.ry + (1 - k) * 0.6, 0);
    dummy.scale.setScalar(t > t0 ? 1 : 0.0001); dummy.updateMatrix(); cards.setMatrixAt(i, dummy.matrix);
  }
  cards.instanceMatrix.needsUpdate = true;
  lidG.rotation.x = lerp(-1.9, 0, ease((t - 29.4) / 0.9));
  const lk = easeOutBack((t - 30.2) / 0.6); lock.scale.setScalar(Math.max(0.001, lk)); lock.visible = t > 30.1;

  // train: the stack grows, cards stream into the adapter on the GPU board
  const sk = clamp((t - 30.6) / 0.8); stack.scale.y = Math.max(0.001, 0.9 * ease(sk)); stack.position.y = stack.scale.y / 2;
  stackTop.position.set(ST.x, stack.scale.y + 0.002, ST.z); stackTop.visible = sk > 0;
  adTrain.position.set(GPU.x + 0.45, 0.42 + Math.sin(t * 2) * 0.02, GPU.z); adTrain.rotation.set(0, 0, 0);
  adTrain.scale.setScalar(Math.max(0.001, easeOutBack((t - 30.4) / 0.7)));
  adTrain.children[0].material = M.accent;
  const from = V(ST.x, 1.0, ST.z), to = V(GPU.x + 0.45, 0.7, GPU.z), mid = V((ST.x + GPU.x) / 2 + 0.2, 2.2, ST.z);
  for (let i = 0; i < NFLY; i++) {
    const ph = ((t - 31.2) * 0.55 + i / NFLY) % 1, on = t > 31.2 + (i / NFLY) * 1.8 && t < 35.0;
    const a = 1 - ph;
    const p = from.clone().multiplyScalar(a * a).add(mid.clone().multiplyScalar(2 * a * ph)).add(to.clone().multiplyScalar(ph * ph));
    dummy.position.copy(p); dummy.rotation.set(0.3 * Math.sin(i), ph * 3 + i, 0.2 * Math.cos(i));
    dummy.scale.setScalar(on ? Math.sin(Math.PI * ph) * 1.0 + 0.001 : 0.0001); dummy.updateMatrix(); fly.setMatrixAt(i, dummy.matrix);
  }
  fly.instanceMatrix.needsUpdate = true;
  fanM.rotation.y = t * 9;

  // one change per run: the columns grow in turn
  cols.forEach((m, i) => {
    const g = growK(t, i);
    m.visible = t > RUN_T[i] - 0.05;
    m.scale.y = Math.max(0.001, RUNS[i][1] * COL_H * easeOutBack(g) + 0.04);
    m.position.y = m.scale.y / 2;
  });
  cols[4].material.emissiveIntensity = t > 43.4 ? 0.1 + 0.08 * Math.sin(t * 4) : 0;

  renderer.render(scene, camera);
  drawHUD(t);
}
window.frame = frame;

// warm up so the first recorded frame is complete
frame(0); frame(0);
window.ready = true;
