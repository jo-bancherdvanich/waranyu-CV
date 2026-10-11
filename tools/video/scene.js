/* Renewable transition video: a three.js scene posed entirely from time t.
 *
 * window.frame(t) poses everything for time t (seconds) and renders once.
 * There is no real-time clock and no Math.random() at pose time: random
 * layout comes from a seeded generator while the scene is built, so every
 * render of a given t is identical. All numbers drawn on screen come from
 * data.json (extracted from renewable-rows.js, the site's own data) or are
 * computed here from it with the same regression the case study uses.
 */
import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { Pass } from "three/addons/postprocessing/Pass.js";
import { buildDiorama, RENEW_COLOR, FOSSIL_COLOR } from "./diorama.js";
import { buildLineup, SOURCES as LSOURCES } from "./models/lineup.js";
import { buildGlobe, lonLat, R as GR } from "./models/globe.js";
import { makeMinis } from "./models/minis.js";
import { buildForecast } from "./models/forecast3d.js";
import { makeGumTrees, plantGumTrees } from "./models/tree.js";

const params = new URLSearchParams(location.search);
const DPR = parseFloat(params.get("dpr") || "1");
const USE_AO = params.get("ao") === "1";
const W = 1280, H = 720;
export const DURATION = 69;   // 5 s globe + the 64 s that follow (steps 1 to 5, closing card)
const GLOBE = 5.0, SKIP = 2.0;   // the globe opens the film; the landscape then joins 2 s into its drift   // steps 1 to 3 for now (title, studio, sources); the forecast beats follow at CUT3

/* ---- data and forecast ------------------------------------------------ */
const D = await (await fetch("data.json")).json();
const YEARS = D.years;

function fit(ys) {
  const n = ys.length, xs = YEARS.map((y) => y - 2005);
  const mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (ys[i] - my); syy += (ys[i] - my) ** 2;
  }
  const slope = sxy / sxx, icpt = my - slope * mx, s2 = (syy - slope * sxy) / (n - 2);
  const T = 2.100922; // t(0.975, df = 18), as in the case study
  return {
    slope, icpt,
    r2: (sxy * sxy) / (sxx * syy),
    at: (y) => icpt + slope * (y - 2005),
    pi: (y) => T * Math.sqrt(s2 * (1 + 1 / n + ((y - 2005 - mx) ** 2) / sxx)),
  };
}
const FIT_TWH = fit(D.total);
const FIT_SHARE = fit(D.share);
export const FACTS = {
  twh2035: FIT_TWH.at(2035),
  r2: FIT_TWH.r2,
  share2035: FIT_SHARE.at(2035),
  share2005: D.share[0], share2024: D.share[19],
  solar2005: D.solar[0], solar2024: D.solar[19],
  wind2005: D.wind[0], wind2024: D.wind[19],
};
window.FACTS = FACTS;

/* ---- helpers ------------------------------------------------------------ */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20240607);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
const easeCam = (x) => { x = clamp(x); return 0.5 - 0.5 * Math.cos(Math.PI * x); };
const ease = (x) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
/* 0 -> 1 -> 0 over [a, b], with soft edges of length d */
const window01 = (t, a, b, d = 0.6) => smooth((t - a) / d) * (1 - smooth((t - (b - d)) / d));

/* value noise and fractal noise for the terrain */
const HASH = new Uint32Array(1024);
for (let i = 0; i < 1024; i++) HASH[i] = Math.floor(rand() * 4294967295);
function h2(ix, iz) { return HASH[(ix * 73856093 ^ iz * 19349663) & 1023] / 4294967295; }
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = h2(ix, iz), b = h2(ix + 1, iz), c = h2(ix, iz + 1), d = h2(ix + 1, iz + 1);
  return lerp(lerp(a, b, sx), lerp(c, d, sx), sz);
}
function fbm(x, z, o = 4) {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < o; i++) { s += amp * vnoise(x * f, z * f); f *= 2.03; amp *= 0.5; }
  return s;
}

/* areas, in metres. North is +z, so north-facing panels face the camera. */
const SOLAR = { x0: 150, x1: 1060, z0: 40, z1: 400 };
/* the step-2 diorama stands in a paddock below the solar farm, at this
   scale, so the camera can fly down to it without a cut */
const DIO = { x: 380, z: 830, s: 0.6, y: 4 };
const WIND = { x0: -2500, x1: -500, z0: -1700, z1: 250 };
/* ridges as line segments with a height and a half-width (metres) */
const RIDGES = [
  { ax: -2300, az: 300, bx: -250, bz: -250, h: 110, w: 360 },
  { ax: -2600, az: -900, bx: 150, bz: -1500, h: 150, w: 460 },
  { ax: 300, az: -2500, bx: 2900, bz: -2900, h: 110, w: 520 },
];
function segDist(x, z, R) {
  const dx = R.bx - R.ax, dz = R.bz - R.az, k = Math.max(0, Math.min(1, ((x - R.ax) * dx + (z - R.az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - (R.ax + dx * k), z - (R.az + dz * k));
}
function inDio(x, z) { return Math.abs(x - DIO.x) < 300 && z > DIO.z - 110 && z < DIO.z + 420; }   // the site and the view of it
function inSolar(x, z, pad = 0) { return x > SOLAR.x0 - pad && x < SOLAR.x1 + pad && z > SOLAR.z0 - pad && z < SOLAR.z1 + pad; }
function heightAt(x, z) {
  let h = (fbm(x / 1100, z / 1100) - 0.45) * 140 + (fbm(x / 260, z / 260) - 0.5) * 14;
  // long ridges for the wind farm: turbines line their crests, as at Waterloo or Waubra
  for (const R of RIDGES) h += R.h * Math.exp(-((segDist(x, z, R) / R.w) ** 2));
  // the solar site is graded flat
  const dx = Math.max(SOLAR.x0 - 80 - x, 0, x - SOLAR.x1 - 80);
  const dz = Math.max(SOLAR.z0 - 80 - z, 0, z - SOLAR.z1 - 80);
  const k = smooth(Math.hypot(dx, dz) / 260);
  // and so is the diorama's paddock
  const ex = Math.max(Math.abs(x - DIO.x) - 260, 0), ez = Math.max(Math.abs(z - DIO.z) - 90, 0);
  return lerp(4, h, Math.min(k, smooth(Math.hypot(ex, ez) / 220)));
}

/* canvas textures with grain, so no surface is a flat colour */
function canvasTex(w, h, draw, repeat = 1) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  return t;
}
function grain(ctx, w, h, base, amt, r) {
  ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amt;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

/* ---- renderer, sky, light ------------------------------------------------ */
const canvas = document.getElementById("gl");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(DPR);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.62;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, W / H, 2, 60000);

const SUN_DIR = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 22), THREE.MathUtils.degToRad(-55));
function makeSky() {
  const s = new Sky();
  s.scale.setScalar(50000);
  const u = s.material.uniforms;
  u.turbidity.value = 5; u.rayleigh.value = 1.4;
  u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.82;
  u.sunPosition.value.copy(SUN_DIR);
  return s;
}
scene.add(makeSky());
const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene(); envScene.add(makeSky());
scene.environment = pmrem.fromScene(envScene).texture;
scene.environmentIntensity = 0.28; // the physical sky is very bright; let the sun lead
scene.fog = new THREE.Fog(0xb9cbdc, 4500, 26000);

const sun = new THREE.DirectionalLight(0xffe2bc, 4.6);
sun.position.copy(SUN_DIR).multiplyScalar(4000);
sun.target.position.set(-500, 0, -300);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -2600, right: 2600, top: 2600, bottom: -2600, near: 100, far: 9000 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.8; sun.shadow.radius = 3;
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(0xbcd3ec, 0x6b5a3c, 0.35));

/* ---- terrain: rolling ground with a paddock map painted over it ---------- */
/* The farmland is a rotated grid of paddocks with jittered sizes. Each has
   its own shade (stubble, straw, pasture, ploughed), crop rows, and fence
   lines; some fence lines carry belts of gum trees (planted below). Roads
   follow a few grid lines. The map covers the whole 16 km ground plane. */
const PAD = (() => {
  const r = mulberry32(61), A = 0.2, ca = Math.cos(A), sa = Math.sin(A);
  const cuts = (lo, hi) => { const v = [lo]; while (v.at(-1) < hi) v.push(v.at(-1) + 320 + r() * 380); return v; };
  const us = cuts(-8200, 8200), vs = cuts(-8200, 8200);
  const toW = (u, v) => [u * ca - v * sa, u * sa + v * ca];       // grid -> world (x, z)
  const toG = (x, z) => [x * ca + z * sa, -x * sa + z * ca];      // world -> grid
  const shades = ["#c9ad6c", "#d8bf82", "#b99a58", "#a8955c", "#8f8f52", "#7e8a4a", "#b0784a", "#cdb27a"];
  const cells = [];
  for (let i = 0; i < us.length - 1; i++) for (let j = 0; j < vs.length - 1; j++)
    cells.push({ i, j, shade: shades[Math.floor(r() * shades.length)], rows: r() < 0.45, rowDir: r() < 0.5 });
  const belts = [];       // fence segments that carry a tree belt
  for (let i = 1; i < us.length - 1; i++) for (let j = 0; j < vs.length - 1; j++) if (r() < 0.3) belts.push([toW(us[i], vs[j]), toW(us[i], vs[j + 1])]);
  for (let j = 1; j < vs.length - 1; j++) for (let i = 0; i < us.length - 1; i++) if (r() < 0.3) belts.push([toW(us[i], vs[j]), toW(us[i + 1], vs[j])]);
  const roadsU = [us[Math.floor(us.length / 2) + 2]], roadsV = [vs[Math.floor(vs.length / 2) + 1], vs[Math.floor(vs.length / 2) - 4]];
  return { us, vs, toW, toG, cells, belts, roadsU, roadsV };
})();
function onRoad(x, z, pad = 0) {
  const [u, v] = PAD.toG(x, z);
  return PAD.roadsU.some((ru) => Math.abs(u - ru) < 8 + pad) || PAD.roadsV.some((rv) => Math.abs(v - rv) < 8 + pad);
}
{
  const g = new THREE.PlaneGeometry(16000, 16000, 260, 260);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, heightAt(x, z));
    // gentle large-scale variation multiplied over the painted map
    const k = 0.9 + 0.16 * fbm(x / 1400 + 9, z / 1400 - 3);
    c.setRGB(k, k * 0.99, k * 0.96);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();

  const S = 4096, M = 16000;
  const P = (x, z) => [((x + M / 2) / M) * S, ((z + M / 2) / M) * S];
  const map = canvasTex(S, S, (ctx) => {
    const r = mulberry32(62);
    ctx.fillStyle = "#c2a868"; ctx.fillRect(0, 0, S, S);
    // paddocks
    for (const cl of PAD.cells) {
      const u0 = PAD.us[cl.i], u1 = PAD.us[cl.i + 1], v0 = PAD.vs[cl.j], v1 = PAD.vs[cl.j + 1];
      const pts = [PAD.toW(u0, v0), PAD.toW(u1, v0), PAD.toW(u1, v1), PAD.toW(u0, v1)].map(([x, z]) => P(x, z));
      ctx.beginPath(); pts.forEach(([px, py], n) => (n ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.closePath();
      ctx.fillStyle = cl.shade; ctx.fill();
      if (cl.rows) {                                  // crop or harrow rows
        ctx.save(); ctx.clip(); ctx.strokeStyle = "rgba(60,45,20,.12)"; ctx.lineWidth = 0.8;
        const n = 60;
        for (let k = 0; k <= n; k++) {
          const a = cl.rowDir ? [PAD.toW(u0 + ((u1 - u0) * k) / n, v0), PAD.toW(u0 + ((u1 - u0) * k) / n, v1)] : [PAD.toW(u0, v0 + ((v1 - v0) * k) / n), PAD.toW(u1, v0 + ((v1 - v0) * k) / n)];
          ctx.beginPath(); ctx.moveTo(...P(...a[0])); ctx.lineTo(...P(...a[1])); ctx.stroke();
        }
        ctx.restore();
      }
    }
    // soft blotches: damp hollows and bare patches
    for (let k = 0; k < 900; k++) {
      const x = r() * S, y = r() * S, rad = 6 + r() * 40, gd = ctx.createRadialGradient(x, y, 0, x, y, rad);
      const col2 = r() < 0.5 ? "rgba(90,98,50," : "rgba(225,205,160,";
      gd.addColorStop(0, col2 + "0.22)"); gd.addColorStop(1, col2 + "0)");
      ctx.fillStyle = gd; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    // fence lines
    ctx.strokeStyle = "rgba(70,58,38,.45)"; ctx.lineWidth = 0.9;
    for (const u of PAD.us) { ctx.beginPath(); ctx.moveTo(...P(...PAD.toW(u, -8200))); ctx.lineTo(...P(...PAD.toW(u, 8200))); ctx.stroke(); }
    for (const v of PAD.vs) { ctx.beginPath(); ctx.moveTo(...P(...PAD.toW(-8200, v))); ctx.lineTo(...P(...PAD.toW(8200, v))); ctx.stroke(); }
    // roads: one sealed, the rest gravel
    const road = (a, b, w, colr) => { ctx.strokeStyle = colr; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(...P(...a)); ctx.lineTo(...P(...b)); ctx.stroke(); };
    for (const u of PAD.roadsU) road(PAD.toW(u, -8200), PAD.toW(u, 8200), 4.2, "#5b5752");
    for (const v of PAD.roadsV) road(PAD.toW(-8200, v), PAD.toW(8200, v), 3.4, "#d9cdb2");
    // the solar site: gravel pads with a perimeter track
    const [sx0, sz0] = P(SOLAR.x0 - 40, SOLAR.z0 - 40), [sx1, sz1] = P(SOLAR.x1 + 40, SOLAR.z1 + 40);
    ctx.fillStyle = "#cbbf9f"; ctx.fillRect(sx0, sz0, sx1 - sx0, sz1 - sz0);
    ctx.strokeStyle = "#e3d9c0"; ctx.lineWidth = 3; ctx.strokeRect(sx0 + 2, sz0 + 2, sx1 - sx0 - 4, sz1 - sz0 - 4);
    // grain over everything
    const img = ctx.getImageData(0, 0, S, S), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * 22; d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.8; }
    ctx.putImageData(img, 0, 0);
  }, 1);
  const ground = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, map, roughness: 0.97, metalness: 0 }));
  ground.receiveShadow = true;
  scene.add(ground);
}

/* ---- wind turbines ------------------------------------------------------ */
const HUB = 105, BLADE = 58;
const turbineMat = new THREE.MeshStandardMaterial({
  color: 0xeef1f3, roughness: 0.42, metalness: 0.1,
  map: canvasTex(128, 128, (ctx, w, h) => grain(ctx, w, h, "#f2f2f0", 18, mulberry32(3)), 1),
});
function bladeGeometry() {
  const g = new THREE.BoxGeometry(1, BLADE, 0.6, 1, 12, 1);
  g.translate(0, BLADE / 2 + 1.5, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = (p.getY(i) - 1.5) / BLADE;
    const chord = lerp(3.8, 0.7, Math.pow(k, 0.7));
    p.setX(i, p.getX(i) * chord + 0.6 * (1 - k));
    p.setZ(i, p.getZ(i) * lerp(1.6, 0.4, k) + p.getX(i) * 0.25);
  }
  g.computeVertexNormals();
  return g;
}
const towerGeo = mergeGeometries([
  new THREE.CylinderGeometry(1.5, 2.4, HUB, 24).translate(0, HUB / 2, 0),
  new THREE.BoxGeometry(4.2, 4.2, 13).translate(0, HUB + 1.5, -2.5),
]);
const hubGeo = new THREE.ConeGeometry(2.1, 5, 20).rotateX(Math.PI / 2).translate(0, 0, 1.5);
const rotorGeo = mergeGeometries([hubGeo, ...[0, 1, 2].map((k) => bladeGeometry().rotateZ((k * 2 * Math.PI) / 3))]);

const turbines = [];
{
  const r = mulberry32(11);
  for (const R of RIDGES) {
    const L = Math.hypot(R.bx - R.ax, R.bz - R.az), n = Math.floor(L / 230);
    for (let k = 0; k <= n; k++) {
      const f = (k + 0.5 * (r() - 0.5)) / n, x = R.ax + (R.bx - R.ax) * f + (r() - 0.5) * 40, z = R.az + (R.bz - R.az) * f + (r() - 0.5) * 40;
      turbines.push({ x, z, y: heightAt(x, z) - 1, yaw: 0.35 + (r() - 0.5) * 0.12, phase: r() * 6.28, speed: 0.9 + r() * 0.25 });
    }
  }
  // build order: the nearest corner of the farm first, like a real build-out
  turbines.sort((a, b) => (a.x - a.z * 0.6) - (b.x - b.z * 0.6)).reverse();
}
const towerMesh = new THREE.InstancedMesh(towerGeo, turbineMat, turbines.length);
const rotorMesh = new THREE.InstancedMesh(rotorGeo, turbineMat, turbines.length);
for (const m of [towerMesh, rotorMesh]) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; scene.add(m); }

/* ---- solar tables --------------------------------------------------------- */
const panelTex = canvasTex(512, 176, (ctx, w, h) => {
  const r = mulberry32(5);
  ctx.fillStyle = "#c9ced4"; ctx.fillRect(0, 0, w, h);          // aluminium frame
  const pw = w / 6, ph = h / 2;
  for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) {
    const x0 = i * pw + 3, y0 = j * ph + 3;
    ctx.fillStyle = "#16233d"; ctx.fillRect(x0, y0, pw - 6, ph - 6);
    for (let a = 0; a < 6; a++) for (let b = 0; b < 10; b++) {  // cells
      const s = 18 + r() * 10;
      ctx.fillStyle = `rgb(${s},${s + 14},${s + 42})`;
      ctx.fillRect(x0 + 2 + a * ((pw - 8) / 6), y0 + 2 + b * ((ph - 8) / 10), (pw - 8) / 6 - 1.5, (ph - 8) / 10 - 1.5);
    }
  }
}, 1);
const panelMat = new THREE.MeshStandardMaterial({ map: panelTex, metalness: 0.55, roughness: 0.2, envMapIntensity: 1.3 });
const postMat = new THREE.MeshStandardMaterial({ color: 0x9aa2aa, metalness: 0.8, roughness: 0.35 });
const TILT = THREE.MathUtils.degToRad(28);
const panelGeo = new THREE.BoxGeometry(12, 0.12, 4.2);
panelGeo.rotateX(TILT).translate(0, 2.0, 0);
const postGeo = mergeGeometries([-4.5, 4.5].map((x) => new THREE.BoxGeometry(0.16, 2.0, 0.16).translate(x, 1.0, 0)));

const tables = [];
for (let z = SOLAR.z1; z >= SOLAR.z0; z -= 10) {
  if (Math.abs(z - (SOLAR.z0 + SOLAR.z1) / 2) < 22) continue;          // an access track across the site
  for (let x = SOLAR.x0, n = 0; x <= SOLAR.x1; x += 12.6, n++) {
    if (Math.abs(x - (SOLAR.x0 + SOLAR.x1) / 2) < 26) continue;          // and one down the middle: four blocks
    if (n % 18 === 17) continue; // maintenance gaps
    tables.push({ x, z });
  }
}
const panelMesh = new THREE.InstancedMesh(panelGeo, panelMat, tables.length);
const postMesh = new THREE.InstancedMesh(postGeo, postMat, tables.length);
for (const m of [panelMesh, postMesh]) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; scene.add(m); }

/* ---- substation, pylons and lines ---------------------------------------- */
const metal = new THREE.MeshStandardMaterial({ color: 0x5d646b, metalness: 0.75, roughness: 0.38 });
{
  const r = mulberry32(17);
  const shed = new THREE.Mesh(new THREE.BoxGeometry(34, 9, 18),
    new THREE.MeshStandardMaterial({ color: 0xe4e2dc, roughness: 0.8, map: canvasTex(128, 128, (ctx, w, h) => grain(ctx, w, h, "#ecebe6", 22, r), 1) }));
  shed.position.set(1180, 8.5, 470); shed.castShadow = shed.receiveShadow = true; scene.add(shed);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(36, 0.8, 20), metal); roof.position.set(1180, 13.4, 470); roof.castShadow = true; scene.add(roof);
  for (let i = 0; i < 4; i++) {
    const tr = new THREE.Mesh(new THREE.BoxGeometry(6, 6, 6), metal);
    tr.position.set(1150 + i * 14, 7, 420); tr.castShadow = true; scene.add(tr);
  }
}
function pylonGeometry() {
  const parts = [];
  const legs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [sx, sz] of legs) {
    const g = new THREE.CylinderGeometry(0.35, 0.5, 52, 6);
    g.translate(0, 26, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const k = p.getY(i) / 52, spread = lerp(5, 1.2, k);
      p.setX(i, p.getX(i) + sx * spread); p.setZ(i, p.getZ(i) + sz * spread);
    }
    parts.push(g);
  }
  for (let y = 6; y < 46; y += 8) parts.push(new THREE.BoxGeometry(lerp(10, 3, y / 52), 0.35, 0.35).translate(0, y, 0));
  parts.push(new THREE.BoxGeometry(26, 0.9, 1).translate(0, 42, 0));
  parts.push(new THREE.BoxGeometry(18, 0.9, 1).translate(0, 49, 0));
  for (const g of parts) if (g.index === null) g.setIndex([...Array(g.attributes.position.count).keys()]);
  return mergeGeometries(parts.map((g) => g.toNonIndexed()));
}
const pylonPts = [];
for (let i = 0; i < 11; i++) {
  const x = 1230 + i * 70, z = 430 - i * 420;
  pylonPts.push(new THREE.Vector3(x, heightAt(x, z), z));
}
const pylonMesh = new THREE.InstancedMesh(pylonGeometry(), metal, pylonPts.length);
{
  const m = new THREE.Matrix4(), q = new THREE.Quaternion();
  const yaw = Math.atan2(70, -420);
  pylonPts.forEach((p, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw + Math.PI / 2);
    m.compose(p, q, new THREE.Vector3(1, 1, 1)); pylonMesh.setMatrixAt(i, m);
  });
  pylonMesh.castShadow = true; scene.add(pylonMesh);
}
/* three conductors per span, each a sagging curve; pulses run along them */
const wireCurves = [];
{
  const offs = [[-12, 42], [12, 42], [0, 49]];
  const dir = new THREE.Vector3(70, 0, -420).normalize(), side = new THREE.Vector3(-dir.z, 0, dir.x);
  const wireMat = new THREE.LineBasicMaterial({ color: 0x2b2f33, transparent: true, opacity: 0.85 });
  for (const [o, hgt] of offs) {
    const pts = [];
    for (let i = 0; i < pylonPts.length - 1; i++) {
      const a = pylonPts[i].clone().addScaledVector(side, o).setY(pylonPts[i].y + hgt);
      const b = pylonPts[i + 1].clone().addScaledVector(side, o).setY(pylonPts[i + 1].y + hgt);
      for (let s = 0; s < 16; s++) {
        const k = s / 16, p = a.clone().lerp(b, k);
        p.y -= 9 * 4 * k * (1 - k); // sag
        pts.push(p);
      }
    }
    pts.push(pylonPts.at(-1).clone().addScaledVector(side, o).setY(pylonPts.at(-1).y + hgt));
    const curve = new THREE.CatmullRomCurve3(pts);
    wireCurves.push(curve);
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(600)), wireMat));
  }
}
const PULSES = 8;
const pulseMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(2.6, 12, 8),
  new THREE.MeshBasicMaterial({ color: 0x9fe6ff, transparent: true, opacity: 0.95 }), wireCurves.length * PULSES);
pulseMesh.frustumCulled = false; scene.add(pulseMesh);

/* ---- trees ------------------------------------------------------------------- */
{
  const r = mulberry32(23);
  const pts = [];
  const ok = (x, z) => Math.abs(x) < 6500 && Math.abs(z + 1000) < 6500 && !inSolar(x, z, 90) && !onRoad(x, z, 6)
    && !(x > 1100 && x < 1300 && z > 380 && z < 520) && !inDio(x, z) && !turbines.some((t) => Math.hypot(t.x - x, t.z - z) < 30);
  // belts along fence lines
  for (const [[ax, az], [bx, bz]] of PAD.belts) {
    const L = Math.hypot(bx - ax, bz - az);
    for (let d0 = r() * 10; d0 < L; d0 += 11 + r() * 14) {
      const k = d0 / L, x = ax + (bx - ax) * k + (r() - 0.5) * 8, z = az + (bz - az) * k + (r() - 0.5) * 8;
      if (ok(x, z)) pts.push({ x, z, s: 1.1 + r() * 0.9, rot: r() * 6.28 });
    }
  }
  // clumps in hollows and lone paddock trees
  for (let k = 0; k < 2400; k++) {
    const x = (r() - 0.5) * 12000, z = (r() - 0.5) * 12000 - 1000;
    if (!ok(x, z)) continue;
    if (fbm(x / 400, z / 400) < 0.56 && r() < 0.96) continue;
    pts.push({ x, z, s: 1.2 + r() * 1.0, rot: r() * 6.28 });
  }
  // gum trees after paddock eucalypts (models/tree.js): forked pale trunks, foliage in open clumps
  const trees = makeGumTrees(55, 4);
  pts.forEach((p) => { p.y = heightAt(p.x, p.z) - 0.3; p.sy = 0.9 + r() * 0.3; });
  plantGumTrees(scene, pts, trees, { tint: (c) => c.setHSL(0.17 + r() * 0.07, 0.22 + r() * 0.2, 0.52 + r() * 0.28) });
}

/* ---- farm details for scale: a homestead, sheds, hay bales, a truck ------- */
{
  const r = mulberry32(71);
  const put = (mesh, x, z, dy = 0, rot = 0) => { mesh.position.set(x, heightAt(x, z) + dy, z); mesh.rotation.y = rot; mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh); return mesh; };
  const iron = new THREE.MeshStandardMaterial({ color: 0xb9bcbf, metalness: 0.6, roughness: 0.45 });
  const rust = new THREE.MeshStandardMaterial({ color: 0x9a5a3a, metalness: 0.3, roughness: 0.7 });
  const weather = new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.85, map: canvasTex(128, 128, (c, w, h) => grain(c, w, h, "#e0dacc", 26, r), 1) });
  // homestead: house with a hipped iron roof and a verandah, two sheds, a water tank
  const HX = -260, HZ = 520, rot = 0.2;
  put(new THREE.Mesh(new THREE.BoxGeometry(18, 4, 12).translate(0, 2, 0), weather), HX, HZ, 0, rot);
  put(new THREE.Mesh(new THREE.ConeGeometry(13, 4, 4).rotateY(Math.PI / 4).scale(1.05, 1, 0.72).translate(0, 6, 0), rust), HX, HZ, 0, rot);
  put(new THREE.Mesh(new THREE.BoxGeometry(24, 7, 14).translate(0, 3.5, 0), iron), HX + 40, HZ - 18, 0, rot);
  put(new THREE.Mesh(new THREE.BoxGeometry(16, 5, 10).translate(0, 2.5, 0), iron), HX + 38, HZ + 14, 0, rot);
  put(new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 4, 20).translate(0, 2, 0), iron), HX - 16, HZ + 8);
  // round hay bales in a paddock beside the solar farm
  const bale = new THREE.CylinderGeometry(0.9, 0.9, 1.2, 14).rotateZ(Math.PI / 2).translate(0, 0.9, 0);
  const baleMat = new THREE.MeshStandardMaterial({ color: 0xd2b46a, roughness: 1, map: canvasTex(64, 64, (c, w, h) => grain(c, w, h, "#d8bb72", 60, r), 2) });
  const bales = new THREE.InstancedMesh(bale, baleMat, 60), m = new THREE.Matrix4(), q = new THREE.Quaternion();
  for (let i = 0; i < 60; i++) {
    const x = 120 + (i % 10) * 26 + (r() - 0.5) * 8, z = 540 + Math.floor(i / 10) * 30 + (r() - 0.5) * 8;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6.28);
    m.compose(new THREE.Vector3(x, heightAt(x, z), z), q, new THREE.Vector3(1, 1, 1)); bales.setMatrixAt(i, m);
  }
  bales.castShadow = bales.receiveShadow = true; scene.add(bales);
  // a truck on the nearest gravel road, pointing along it
  const [tu] = PAD.toG(500, 700), [tx, tz] = PAD.toW(tu, PAD.roadsV[0]), [nx, nz] = PAD.toW(tu + 1, PAD.roadsV[0]);
  const truck = new THREE.Group();
  const add = (geo, mat, x, y, z) => { const mm = new THREE.Mesh(geo, mat); mm.position.set(x, y, z); mm.castShadow = true; truck.add(mm); };
  add(new THREE.BoxGeometry(2.6, 2.8, 2.5), new THREE.MeshStandardMaterial({ color: 0xe9e7e2, roughness: 0.5 }), -5.5, 1.9, 0);
  add(new THREE.BoxGeometry(10, 2.8, 2.5), new THREE.MeshStandardMaterial({ color: 0x2f6aa3, roughness: 0.5 }), 1.3, 2.1, 0);
  add(new THREE.BoxGeometry(13, 0.6, 2.2), new THREE.MeshStandardMaterial({ color: 0x2a2c2e }), -1, 0.6, 0);
  truck.position.set(tx, heightAt(tx, tz) + 0.2, tz);
  truck.rotation.y = -Math.atan2(nz - tz, nx - tx);
  scene.add(truck);
}

/* ---- clouds --------------------------------------------------------------- */
const cloudTex = (() => {
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const ctx = c.getContext("2d"), r = mulberry32(31);
  for (let i = 0; i < 26; i++) {
    const x = 128 + (r() - 0.5) * 120, y = 140 + (r() - 0.5) * 50, rad = 30 + r() * 50;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    // lit tops, faintly shaded bases
    const tone = y < 140 ? "255,255,255" : "236,238,242";
    g.addColorStop(0, `rgba(${tone},.75)`); g.addColorStop(1, `rgba(${tone},0)`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const clouds = [];
{
  const r = mulberry32(37);
  for (let i = 0; i < 14; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, opacity: 0.95, fog: false, color: 0xffffff, toneMapped: false }));
    const base = new THREE.Vector3((r() - 0.5) * 16000, 900 + r() * 700, -4000 - r() * 9000);
    s.scale.set(1800 + r() * 2000, 700 + r() * 500, 1);
    clouds.push({ s, base }); scene.add(s);
  }
}

/* ---- step 5: the forecast chart, standing in the paddocks east of the farm ---- */
const FC = buildForecast({ years: YEARS, values: D.total, fit: FIT_TWH, x0: -1250, x1: 650, z: 1100, yScale: 2.4, floorAt: heightAt,
  share: { value: FACTS.share2035, target: 82 } });
FC.group.visible = false; scene.add(FC.group);
/* how far the chart has drawn at time t, as a year */
function forecastYear(t) {
  const hk = ease((t - F0 - 1.0) / 4.6), fk = ease((t - F0 - 6.2) / 3.0);
  return hk < 1 ? 2005 + hk * 19 : 2024 + fk * 11;
}

/* ---- post-processing ---------------------------------------------------------- */
let composer = null;
if (USE_AO) {
  composer = new EffectComposer(renderer);
  composer.setPixelRatio(DPR); composer.setSize(W, H);
  composer.addPass(new RenderPass(scene, camera));
  const ao = new GTAOPass(scene, camera, W, H);
  ao.updateGtaoMaterial({ radius: 6, distanceExponent: 1.5, thickness: 2, scale: 1 });
  ao.blendIntensity = 0.8;
  composer.addPass(ao);
  composer.addPass(new OutputPass());
}

/* ---- the timeline ---------------------------------------------------------- */
/* Beats (seconds):
 *  0   – 5     project name and data sources, over the landscape
 *  5.3 – 21    studio scene: renewable on the left, non-renewable on the
 *              right; the year runs 2005 -> 2024 and the bars rise and fall
 * 15   – 23    the forecast to 2035 draws itself
 * 23   – 28    forecast share against the target; closing line
 * Cuts at 5.3 and 21 go through a short fade to dark.                      */
const CUT1 = 5.3, CUT2 = 17;      // the studio holds on 2024 for a summary before the cut
const CUT3 = 33;                   // end of step 3 (the five sources)
const I0 = CUT3, I1 = I0 + 13;     // step 4: the four countries on the globe
const F0 = I1, F1 = F0 + 13;       // step 5: the forecast over the farmland
const END = F1 + 7;                // closing card holds long enough to read
const SHARE_AT = F0 + 9.8;         // the share gauge beside 2035 fills from here
const LG0 = CUT2 + 2.2, LG1 = LG0 + 8;   // step 3: the years run between these
const T_GROW0 = 7.2, T_GROW1 = 13.2;        // years advance between these (about 0.3 s a year)
function yearIndexAt(t) { return clamp((t - T_GROW0) / (T_GROW1 - T_GROW0)) * 19; }
function seriesAt(arr, fi) { const i = Math.floor(fi), k = fi - i; return i >= 19 ? arr[19] : lerp(arr[i], arr[i + 1], k); }
const inStudio = (t) => t >= CUT1 && t < CUT2;
const inInter = (t) => t >= I0 && t < I1;

function path(keys) {
  const pc = new THREE.CatmullRomCurve3(keys.map((k) => new THREE.Vector3(...k.p)), false, "centripetal");
  const lc = new THREE.CatmullRomCurve3(keys.map((k) => new THREE.Vector3(...k.l)), false, "centripetal");
  return (t, cam) => {
    let u = 1;
    for (let i = 0; i < keys.length - 1; i++) {
      if (t <= keys[i + 1].t) {
        const k = clamp((t - keys[i].t) / (keys[i + 1].t - keys[i].t));
        u = (i + (keys[i + 1].ease === "in" ? k * k * k : easeCam(k))) / (keys.length - 1); break;
      }
    }
    if (t < keys[0].t) u = 0;
    cam.position.copy(pc.getPoint(u)); cam.lookAt(lc.getPoint(u)); cam.updateMatrixWorld();
    return u;
  };
}
/* diorama-local point -> world, for the camera keys */
const dio = (x, y, z) => [DIO.x + x * DIO.s, DIO.y + y * DIO.s, DIO.z + z * DIO.s];
const introPath = path([
  { t: 0, p: [2300, 950, 2700], l: [200, 0, -300] },
  { t: 2.0, p: [1900, 1350, 2300], l: [100, 0, 100] },            // high, looking down, as if still falling from space
  { t: 3.9, p: [1250, 620, 2150], l: [-300, 60, -200] },          // levelling out over the farms, wind ridges ahead
  { t: CUT1, p: dio(60, 900, 1500), l: dio(0, -40, 0) },          // turning down to the paddock as the models rise
  { t: CUT1 + 1.8, p: dio(-10, 150, 600), l: dio(0, 44, 0) },     // settling in front of the two platforms
  { t: CUT2, p: dio(10, 130, 545), l: dio(0, 46, 0) },
]);
/* step 5: arriving from space over the paddocks east of the farm, where the
   forecast chart stands, then drifting slowly past it */
const forecastPath = path([
  { t: F0, p: [1600, 1500, 3400], l: [-200, 150, 1100] },
  { t: F0 + 2.0, p: [-900, 420, 2500], l: [-700, 170, 1100] },     // the 2005 end: bare paddocks, two turbines
  { t: F0 + 6.4, p: [-100, 480, 2600], l: [-250, 200, 1100] },     // tracking along as the farm builds
  { t: F0 + 10.5, p: [760, 720, 2400], l: [380, 120, 1100] },      // the bundle of futures and the share gauge
  { t: END, p: [860, 760, 2450], l: [340, 130, 1100] },
]);
/* ---- the studio scene -------------------------------------------------------- */
const studio = buildDiorama(renderer, scene.environment,
  { canvasTex, grain, mulberry32, turbineMat, towerGeo, rotorGeo, panelGeo, postGeo, panelMat, postMat }, { inline: true, camera });
studio.scene.position.set(DIO.x, DIO.y, DIO.z);
scene.add(studio.scene);
/* the models rise out of the paddock as the camera comes down */
const DIO_RISE0 = 3.4, DIO_RISE1 = CUT1 + 0.6;
function poseDiorama(t) {
  const k = ease((t - DIO_RISE0) / (DIO_RISE1 - DIO_RISE0));
  studio.scene.visible = k > 0 && t < F0;   // the paddock is clear again for the forecast
  studio.scene.scale.set(DIO.s, DIO.s * Math.max(k, 1e-3), DIO.s);
  studio.pose(t, studioState(t));
}
const MAX_FOSSIL = Math.max(...D.generation.map((g, i) => g - D.total[i]));

/* The year steps once per slot: the bars move in the first part of each
 * slot and then hold, so the label and the bar always agree while held. */
/* A smooth curve through each year's value (monotone cubic, so it never
   overshoots between two years): p runs 0..19 continuously, and at each
   whole p the value is exactly that year's figure. */
const _slopes = new Map();
function curve(arr, p) {
  let m = _slopes.get(arr);
  if (!m) {
    const n = arr.length, d = [], mm = new Array(n);
    for (let i = 0; i < n - 1; i++) d.push(arr[i + 1] - arr[i]);
    mm[0] = d[0]; mm[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) mm[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) { mm[i] = mm[i + 1] = 0; continue; }
      const a = mm[i] / d[i], b = mm[i + 1] / d[i], h = a * a + b * b;
      if (h > 9) { const tt = 3 / Math.sqrt(h); mm[i] = tt * a * d[i]; mm[i + 1] = tt * b * d[i]; }
    }
    m = mm; _slopes.set(arr, m);
  }
  p = clamp(p, 0, arr.length - 1);
  const i = Math.min(arr.length - 2, Math.floor(p)), x = p - i, x2 = x * x, x3 = x2 * x;
  return (2 * x3 - 3 * x2 + 1) * arr[i] + (x3 - 2 * x2 + x) * m[i] + (-2 * x3 + 3 * x2) * arr[i + 1] + (x3 - x2) * m[i + 1];
}
const FOSSIL_TWH = D.generation.map((g, i) => g - D.total[i]);

function studioState(t) {
  const p = clamp((t - T_GROW0) / (T_GROW1 - T_GROW0)) * 19;
  const share = curve(D.share, p), fossilTwh = curve(FOSSIL_TWH, p);
  const wind = curve(D.wind, p), solar = curve(D.solar, p);
  return { year: YEARS[Math.round(p)], shown: share, renewable: share, fossil: 100 - share, fossilLevel: fossilTwh / MAX_FOSSIL,
    windFrac: (wind - D.wind[0]) / (MAX_WIND - D.wind[0]), solarFrac: (solar - D.solar[0]) / (MAX_SOLAR - D.solar[0]) };
}
/* contact shadows for the studio: a pass hides sprites and leaf cards while
   the occlusion is measured (it ignores cut-outs), then shows them again */
class Toggle extends Pass { constructor(fn) { super(); this.needsSwap = false; this.fn = fn; } render() { this.fn(); } }
const sceneNoAO = [];
scene.traverse((o) => { if (o.isSprite || o.isLine || o.isPoints || (o.material && !Array.isArray(o.material) && (o.material.alphaTest > 0 || o.material.transparent))) sceneNoAO.push(o); });
let studioComposer = null;   // built after aoComposer below

/* ---- step 3: the five sources ------------------------------------------------- */
function aoComposer(sc, cam, list) {
  const c = new EffectComposer(renderer);
  c.setPixelRatio(DPR); c.setSize(W, H);
  c.addPass(new RenderPass(sc, cam));
  c.addPass(new Toggle(() => list.forEach((o) => { o.userData.wasVisible = o.visible; o.visible = false; })));
  const ao = new GTAOPass(sc, cam, W, H);
  ao.updateGtaoMaterial({ radius: 5, distanceExponent: 1.4, thickness: 3, scale: 1 }); ao.blendIntensity = 0.85;
  c.addPass(ao);
  c.addPass(new Toggle(() => list.forEach((o) => { o.visible = o.userData.wasVisible; })));
  c.addPass(new OutputPass());
  return c;
}
studioComposer = aoComposer(scene, camera, sceneNoAO);
const lineup = buildLineup(renderer, scene.environment);
const ICONS = lineup.makeIcons(DPR);
const LKEYS = LSOURCES.map((s) => s.key);
const LLABEL = Object.fromEntries(LSOURCES.map((s) => [s.key, s.label]));
const inLineup = (t) => t >= CUT2 && t < CUT3;
/* the year steps once per slot, as in step 2: values move, then hold */
function lineupYear(t) {
  const p = clamp((t - LG0) / (LG1 - LG0)) * 19;
  return { p, j: Math.round(p) };
}
function twhAt(t) { const { p } = lineupYear(t); const o = {}; for (const k of LKEYS) o[k] = Math.max(0, curve(D[k], p)); return o; }
function rankOf(t) { const v = twhAt(t); const o = {}; [...LKEYS].sort((a, b) => v[b] - v[a]).forEach((k, n) => { o[k] = n; }); return o; }
/* row positions: the rank order, smoothed over the last 0.6 s so a swap is a
   glide rather than a jump (still a pure function of t) */
function lineupState(t) {
  const row = {}; for (const k of LKEYS) row[k] = 0;
  const N = 12;
  for (let n = 0; n < N; n++) { const rk = rankOf(t - n * 0.05); for (const k of LKEYS) row[k] += rk[k] / N; }
  return { year: YEARS[lineupYear(t).j], twh: twhAt(t), row };
}
/* overtakes found in the data: a passes b in year y and stays ahead after */
function crossAt(a, bs, y) {
  // the first p in (y - 1, y] where a is ahead of every b it passes that year
  for (let p = y - 1; p <= y; p += 0.01) if (bs.every((b) => curve(D[a], p) > curve(D[b], p))) return p;
  return y;
}
const EVENTS = (() => {
  const ev = [];
  for (let y = 1; y < 20; y++) {
    const passes = {};
    for (const a of LKEYS) for (const b of LKEYS) {
      if (a === b) continue;
      if (D[a][y - 1] < D[b][y - 1] && D[a][y] > D[b][y] && D[a].slice(y).every((v, n) => v > D[b][y + n])) (passes[a] = passes[a] || []).push(b);
    }
    for (const a in passes) ev.push({ y, t: LG0 + (crossAt(a, passes[a], y) / 19) * (LG1 - LG0), text: `${YEARS[y]} \u00b7 ${LLABEL[a]} passes ${passes[a].map((b) => LLABEL[b].toLowerCase()).join(" and ")}`, color: LSOURCES.find((s) => s.key === a).color });
  }
  return ev;
})();
window.EVENTS = EVENTS;
const lineupPath = path([
  { t: CUT2, p: [0, 520, 980], l: [0, 20, 0] },
  { t: CUT2 + 2, p: [-40, 40, 560], l: [0, 196, 0] },
  { t: CUT3, p: [40, 36, 520], l: [0, 202, 0] },
]);


function camU(t) {
  // widen a little on the way down, to the studio framing (45 degrees)
  const fov = t < CUT3 ? lerp(38, 45, smooth((t - 3.9) / (CUT1 + 1.8 - 3.9))) : 38;
  if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
  return t < CUT3 ? introPath(t, camera) : forecastPath(t, camera);
}
const _pv = new THREE.Vector3();
function proj(v) { _pv.copy(v).project(camera); return [(_pv.x * 0.5 + 0.5) * W, (-_pv.y * 0.5 + 0.5) * H]; }

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
const Y_AXIS = new THREE.Vector3(0, 1, 0), Z_AXIS = new THREE.Vector3(0, 0, 1);
const MAX_WIND = Math.max(...D.wind), MAX_SOLAR = Math.max(...D.solar);

export function poseAll(t) {
  // the landscape shows today's build, except in the forecast scene, where
  // the farm builds year by year in step with the line being drawn
  const yp = t >= F0 ? clamp(forecastYear(t) - 2005, 0, 19) : 19;
  const wind = curve(D.wind, yp), solar = curve(D.solar, yp);

  // turbines: count follows wind generation; each one rises over ~0.6 of a slot
  const nT = (turbines.length * wind) / MAX_WIND;
  turbines.forEach((tb, i) => {
    const g = ease(clamp((nT - i) * 1.4));
    const sc = Math.max(g, 1e-4);
    _q.setFromAxisAngle(Y_AXIS, tb.yaw);
    _m.compose(_v.set(tb.x, tb.y, tb.z), _q, _s.set(sc, sc, sc));
    towerMesh.setMatrixAt(i, _m);
    const ang = tb.phase + t * 1.55 * tb.speed * g;
    _q2.setFromAxisAngle(Z_AXIS, ang);
    const hubPos = new THREE.Vector3(0, HUB + 1.5, 4.6).multiplyScalar(sc).applyQuaternion(_q).add(_v.set(tb.x, tb.y, tb.z));
    _m.compose(hubPos, _q.clone().multiply(_q2), _s.set(sc, sc, sc));
    rotorMesh.setMatrixAt(i, _m);
  });
  towerMesh.instanceMatrix.needsUpdate = rotorMesh.instanceMatrix.needsUpdate = true;

  // solar tables: count follows solar generation
  const nP = (tables.length * solar) / MAX_SOLAR;
  tables.forEach((tb, i) => {
    const g = ease(clamp((nP - i) / 30));
    const sc = Math.max(g, 1e-4);
    _m.compose(_v.set(tb.x, 4 - (1 - g) * 2, tb.z), _q.identity(), _s.set(1, sc, 1));
    panelMesh.setMatrixAt(i, _m); postMesh.setMatrixAt(i, _m);
  });
  panelMesh.instanceMatrix.needsUpdate = postMesh.instanceMatrix.needsUpdate = true;

  // power pulses travel away from the substation once there is generation
  const on = smooth((t - 5) / 2);
  wireCurves.forEach((c, w) => {
    for (let k = 0; k < PULSES; k++) {
      const u = (t * 0.045 + k / PULSES + w * 0.11) % 1;
      c.getPointAt(u, _v);
      const sc = on * (0.6 + 0.4 * Math.sin(t * 6 + k));
      _m.compose(_v, _q.identity(), _s.set(sc, sc, sc));
      pulseMesh.setMatrixAt(w * PULSES + k, _m);
    }
  });
  pulseMesh.instanceMatrix.needsUpdate = true;

  clouds.forEach((c) => c.s.position.copy(c.base).add(_v.set(t * 9, 0, 0)));
  poseDiorama(t);

  camU(t);
}

/* ---- the overlay: captions, counters, charts ----------------------------------- */
const hud = document.getElementById("hud");
hud.width = W * DPR; hud.height = H * DPR;
const ctx = hud.getContext("2d");
const ACC = "#7ad7ff", AMB = "#ffcf8f", INK = "#f4f7fb", MUTED = "rgba(232,240,248,.72)";
const fmt1 = (v) => v.toLocaleString("en-AU", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function card(x, y, w, h, a) {
  ctx.save(); ctx.globalAlpha = a;
  rr(x, y, w, h, 18); ctx.fillStyle = "rgba(9,14,22,.88)"; ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.12)"; ctx.lineWidth = 1; ctx.stroke();
  ctx.restore();
}
function text(s, x, y, size, color, a = 1, weight = 500, family = "SG", align = "left") {
  ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = color; ctx.textAlign = align;
  ctx.font = `${weight} ${size}px ${family}`; ctx.fillText(s, x, y); ctx.restore();
}
function mono(s, x, y, size, color, a = 1, align = "left") {
  ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = color; ctx.textAlign = align;
  ctx.font = `400 ${size}px DM`; ctx.letterSpacing = "1px"; ctx.fillText(s.toUpperCase(), x, y); ctx.restore();
}

const CAPTIONS = [
  { a: 5.8, b: 13.6, s: "Renewable share of electricity generated in Australia" },
  { a: CUT2 + 1.4, b: LG1 + 0.6, s: "Each bar is one source\u2019s generation that year" },
  { a: I0 + 0.6, b: I0 + 6.2, s: "Renewable electricity generated in 2024, by country" },
  { a: I0 + 7.6, b: I1 - 0.4, s: "Share shows which countries actually rely on renewable energy" },
  { a: F0 + 0.8, b: F0 + 5.6, s: "A linear regression in R projects the trend to 2035" },
  { a: F0 + 5.6, b: F1 + 0.4, s: "On this trend, Australia falls well short of the 82% target" },
];
const SOURCE_LINE = "DCCEEW (Australia) \u00b7 MBIE (New Zealand) \u00b7 AGEE-Stat (Germany) \u00b7 OWID / IEA (China)";

function drawHUD(t) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);

  // soft shading behind the captions
  const g = ctx.createLinearGradient(0, H - 200, 0, H);
  g.addColorStop(0, "rgba(5,8,12,0)"); g.addColorStop(1, "rgba(5,8,12,.55)");
  ctx.fillStyle = g; ctx.fillRect(0, H - 200, W, 200);

  // 1. project name and where the data comes from
  const ta = 0;   // the title now sits on the globe (drawGlobeHUD)
  if (ta > 0) {
    ctx.fillStyle = `rgba(5,8,12,${0.3 * ta})`; ctx.fillRect(0, 0, W, H);
    mono("Data analytics portfolio \u00b7 Waranyu Bancherdvanich", W / 2, 236, 14, ACC, ta, "center");
    text("Australia\u2019s Renewable", W / 2, 306, 58, INK, ta, 700, "SG", "center");
    text("Electricity Transition", W / 2, 370, 58, INK, ta, 700, "SG", "center");
    text("2005 to 2035", W / 2, 420, 28, MUTED, ta, 400, "SG", "center");
    const sa = ta * smooth((t - 1.2) / 0.6);
    card(W / 2 - 430, 468, 860, 90, sa);
    mono("Data sources", W / 2, 500, 14, MUTED, sa, "center");
    text(SOURCE_LINE, W / 2, 534, 21, INK, sa, 500, "SG", "center");
  }

  // 2. the studio: share on each side, year in the middle
  if (inStudio(t)) {
    const st = studioState(t), tp = studio.tops(st);
    const a = smooth((t - CUT1 - 1.1) / 0.6) * (1 - smooth((t - CUT2 + 0.6) / 0.5));
    mono("Year", W / 2, 54, 15, "rgba(20,28,38,.8)", a, "center");
    text(String(st.year), W / 2, 122, 74, "#101722", a, 700, "SG", "center");
    // side titles
    text("Renewable", 64, 78, 38, "#13532f", a, 700);
    mono("Solar \u00b7 wind \u00b7 hydro \u00b7 biomass \u00b7 geothermal", 66, 108, 15, "rgba(20,28,38,.85)", a);
    text("Non-renewable", W - 64, 78, 38, "#3a3e45", a, 700, "SG", "right");
    mono("Coal \u00b7 gas \u00b7 oil", W - 66, 108, 15, "rgba(20,28,38,.85)", a, "right");
    // scale marks between the bars, and the 2030 target on the renewable bar
    for (const [l, [mx, my]] of tp.marks) mono(l + "%", mx, my + 5, 14, "rgba(20,28,38,.75)", a, "center");
    {
      const [tx, ty] = tp.target;
      ctx.save(); ctx.globalAlpha = a; ctx.font = "700 17px SG";
      const label = "2030 target 82%", w = ctx.measureText(label).width + 22;
      rr(tx - 8 - w, ty - 15, w, 30, 15); ctx.fillStyle = "rgba(255,255,255,.92)"; ctx.fill();
      ctx.strokeStyle = "#0f6b45"; ctx.lineWidth = 1.5; ctx.setLineDash([5, 3]); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = "#0f6b45"; ctx.textAlign = "left"; ctx.fillText(label, tx - w + 3, ty + 6); ctx.restore();
    }
    // percentages on top of both bars
    const pill = (x, y, label, col) => {
      ctx.save(); ctx.globalAlpha = a; ctx.font = "700 32px SG";
      const w = ctx.measureText(label).width + 30;
      rr(x - w / 2, y - 56, w, 44, 22); ctx.fillStyle = col; ctx.fill();
      ctx.fillStyle = "#ffffff"; ctx.textAlign = "center"; ctx.fillText(label, x, y - 23); ctx.restore();
    };
    pill(tp.left[0], tp.left[1], fmt1(st.shown) + "%", "#1f8a5c");
    // 2015: the year the Large-scale RET was revised (as flagged in the project's dashboard)
    {
      const t15 = T_GROW0 + (10 / 19) * (T_GROW1 - T_GROW0);
      const ea = a * window01(t, t15 - 0.15, t15 + 1.9, 0.3);
      if (ea > 0) {
        ctx.save(); ctx.globalAlpha = ea; ctx.font = "600 19px SG";
        const label = "2015 \u00b7 LRET target revised", w = ctx.measureText(label).width + 30;
        rr(W / 2 - w / 2, 142, w, 34, 17); ctx.fillStyle = "#c2410c"; ctx.fill();
        ctx.fillStyle = "#ffffff"; ctx.textAlign = "center"; ctx.fillText(label, W / 2, 166); ctx.restore();
      }
    }
    // the result, once the years reach 2024
    {
      const sa = a * smooth((t - 13.7) / 0.5);
      if (sa > 0) {
        const y0 = H - 116 + (1 - sa) * 12;
        card(W / 2 - 360, y0, 720, 88, sa);
        mono("Renewable share of electricity, Australia", W / 2, y0 + 30, 14, MUTED, sa, "center");
        ctx.save(); ctx.globalAlpha = sa; ctx.textAlign = "center"; ctx.font = "700 34px SG";
        const l1 = `${fmt1(D.share[0])}% in 2005`, mid = "  \u2192  ", l2 = `${fmt1(D.share[19])}% in 2024`;
        const w1 = ctx.measureText(l1).width, wm = ctx.measureText(mid).width, w2 = ctx.measureText(l2).width;
        let x = W / 2 - (w1 + wm + w2) / 2;
        ctx.textAlign = "left";
        ctx.fillStyle = "rgba(232,240,248,.85)"; ctx.fillText(l1, x, y0 + 72); x += w1;
        ctx.fillStyle = MUTED; ctx.fillText(mid, x, y0 + 72); x += wm;
        ctx.fillStyle = "#5fe0a4"; ctx.fillText(l2, x, y0 + 72);
        ctx.restore();
      }
    }
    pill(tp.right[0], tp.right[1], fmt1(100 - st.shown) + "%", "#5b6068");
  }

  // 3. the five sources: a ranked bar chart race, biggest at the top
  if (inLineup(t)) {
    const st = lineupState(t);
    const a = smooth((t - CUT2 - 1.0) / 0.6) * (1 - smooth((t - CUT3 + 0.6) / 0.5));
    const X0 = 196, XMAX = 1060, VMAX = 50, TOP = 168, ROW = 86, BAR = 54, ICON = 104;
    const X = (v) => X0 + (v / VMAX) * (XMAX - X0);
    text("Renewable generation by source", 64, 72, 30, "#101722", a, 700);
    mono("Australia \u00b7 TWh per year \u00b7 biggest at the top", 66, 100, 14, "rgba(20,28,38,.85)", a);
    // axis: faint lines every 10 TWh
    for (let v = 0; v <= VMAX; v += 10) {
      ctx.save(); ctx.globalAlpha = a * 0.55; ctx.strokeStyle = "rgba(20,28,38,.25)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(X(v), TOP - 14); ctx.lineTo(X(v), TOP + 5 * ROW - 26); ctx.stroke(); ctx.restore();
      mono(`${v}`, X(v), TOP - 20, 12, "rgba(20,28,38,.7)", a, "center");
    }
    mono("TWh", XMAX + 8, TOP - 20, 12, "rgba(20,28,38,.7)", a, "left");
    // rows, drawn bottom rank first so a rising bar passes over the others
    const order = [...LSOURCES].sort((p, q) => st.row[q.key] - st.row[p.key]);
    for (const s2 of order) {
      const y = TOP + st.row[s2.key] * ROW, v = st.twh[s2.key], x1 = Math.max(X(v), X0 + 4);
      // icon tile
      ctx.save(); ctx.globalAlpha = a; ctx.shadowColor = "rgba(16,23,34,.55)"; ctx.shadowBlur = 5; ctx.shadowOffsetY = 1;
      ctx.drawImage(ICONS[s2.key], 132 - ICON / 2, y + 31 - ICON / 2 - 6, ICON, ICON); ctx.restore();
      // a faint track behind each bar, so the scale reads without a panel
      ctx.save(); ctx.globalAlpha = a; rr(X0, y + 4, XMAX - X0, BAR, 10); ctx.fillStyle = "rgba(16,23,34,.07)"; ctx.fill(); ctx.restore();
      // bar with a lighter top edge
      ctx.save(); ctx.globalAlpha = a; rr(X0, y + 4, x1 - X0, BAR, 10); ctx.fillStyle = s2.color; ctx.fill();
      rr(X0, y + 4, x1 - X0, BAR * 0.32, 10); ctx.fillStyle = "rgba(255,255,255,.22)"; ctx.fill(); ctx.restore();
      // name inside the bar when it fits, value after the bar
      ctx.save(); ctx.globalAlpha = a; ctx.font = "700 22px SG";
      const nameW = ctx.measureText(s2.label).width;
      const inside = x1 - X0 > nameW + 30;
      ctx.fillStyle = "#101722"; ctx.textAlign = "left";
      if (inside) ctx.fillText(s2.label, X0 + 14, y + 39);
      ctx.font = "700 22px SG";
      const after = (inside ? "" : s2.label + "  ") + `${fmt1(v)} TWh`;
      ctx.fillText(after, x1 + 12, y + 39);
      ctx.restore();
    }
    // the year, large in the lower right of the chart
    text(String(st.year), W - 56, TOP + 2 * ROW + 6, 84, "rgba(16,23,34,.3)", a, 700, "SG", "right");
    // overtakes, one at a time beside the year as they happen, then kept as a list
    EVENTS.forEach((e, n) => {
      const ea = a * smooth((t - e.t) / 0.3) * (1 - 0.35 * smooth((t - e.t - 1.6) / 0.5));
      if (ea <= 0) return;
      ctx.save(); ctx.globalAlpha = ea; ctx.font = "600 17px SG";
      const w = ctx.measureText(e.text).width + 40, y = TOP + 2 * ROW + 26 + n * 34, x0 = W - 56 - w;
      rr(x0, y, w, 30, 15); ctx.fillStyle = "rgba(255,255,255,.95)"; ctx.fill();
      ctx.strokeStyle = e.color; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = e.color; ctx.beginPath(); ctx.arc(x0 + 16, y + 15, 6, 0, 7); ctx.fill();
      ctx.fillStyle = "#101722"; ctx.textAlign = "left"; ctx.fillText(e.text, x0 + 29, y + 21); ctx.restore();
    });
    // the result, once the years reach 2024
    const sa = a * smooth((t - LG1 - 0.8) / 0.5);
    if (sa > 0) {
      const y0 = H - 104 + (1 - sa) * 12, rows = ["solar", "wind", "hydro"];
      card(W / 2 - 440, y0, 880, 84, sa);
      mono("Generation, 2005 \u2192 2024", W / 2, y0 + 28, 14, MUTED, sa, "center");
      ctx.save(); ctx.globalAlpha = sa; ctx.font = "700 25px SG"; ctx.textAlign = "left";
      const parts = rows.map((k) => [`${LLABEL[k]} `, `${fmt1(D[k][0])} \u2192 ${fmt1(D[k][19])} TWh`, LSOURCES.find((q) => q.key === k).color]);
      const gap = 34, widths = parts.map(([nm, v]) => ctx.measureText(nm + v).width);
      let x = W / 2 - (widths.reduce((p, q) => p + q, 0) + gap * (parts.length - 1)) / 2;
      parts.forEach(([nm, v, col], i) => {
        ctx.fillStyle = col; ctx.fillText(nm, x, y0 + 66); const wn = ctx.measureText(nm).width;
        ctx.fillStyle = "rgba(240,244,248,.95)"; ctx.fillText(v, x + wn, y0 + 66); x += widths[i] + gap;
      });
      ctx.restore();
    }
  }

  // captions
  for (const c of CAPTIONS) {
    const ca = window01(t, c.a, c.b, 0.5);
    if (ca > 0) text(c.s, 56, H - 52 + (1 - ca) * 10, 34, INK, ca, 600);
  }

  // 4. the four countries on the globe, 5. the forecast, then the closing card
  if (inInter(t)) drawInterHUD(t);
  if (t >= F0) drawForecastHUD(t);
  if (t >= F1 - 0.2) drawEndCard(t);

  // fades at each cut: haze into the bar race, up through the sky to space,
  // back down through the atmosphere to the paddocks
  {
    const f2 = 1 - smooth(Math.abs(t - CUT2) / 0.45);
    if (f2 > 0) { ctx.fillStyle = `rgba(226,222,213,${f2})`; ctx.fillRect(0, 0, W, H); }
    const g = 1 - smooth(Math.abs(t - CUT3) / 0.5);
    if (g > 0) { ctx.fillStyle = `rgba(214,228,240,${g})`; ctx.fillRect(0, 0, W, H); }
    const g2 = 1 - smooth(Math.abs(t - I1) / 0.5);
    if (g2 > 0) { ctx.fillStyle = `rgba(214,228,240,${g2})`; ctx.fillRect(0, 0, W, H); }
    const e = smooth((t - END + 1.2) / 1.2);
    if (e > 0) { ctx.fillStyle = `rgba(5,8,12,${e})`; ctx.fillRect(0, 0, W, H); }
  }

  // honesty note
  ctx.save(); rr(W - 500, 12, 476, 30, 15); ctx.fillStyle = "rgba(8,12,18,.6)"; ctx.fill(); ctx.restore();
  mono("Illustration \u00b7 figures from project data (DCCEEW)", W - 38, 32, 13, "rgba(244,247,250,.95)", 1, "right");
}

/* ---- the opening globe ---------------------------------------------------- */
const globe = await buildGlobe(renderer);

/* ---- step 4: the four countries, on the globe ------------------------------- */
/* Each country is a plate of its own shape. First it rises to its 2024
   renewable generation (TWh, from the project workbook), with miniatures of
   the sources that actually make it on top. Then the four lift off the
   planet into a row in front of the camera and fill to their renewable
   share. All four figures come from data.json (countries). */
const CTRY = [
  { n: "Australia", lon: 134, lat: -25, color: 0x2ec27e, minis: ["solar", "wind"], s: 0.3, ls: 0.72, row: 2 },
  { n: "New Zealand", lon: 170.5, lat: -43.6, color: 0x5fb8f0, minis: ["hydro", "geoField"], s: 0.16, ls: 1.7, row: 0 },
  { n: "Germany", lon: 10.3, lat: 51.0, color: 0xf2b13a, minis: ["offshoreWind", "solar"], s: 0.16, ls: 2.2, row: 1 },
  { n: "China", lon: 104, lat: 35, color: 0xef6a5a, minis: ["gravityDam", "wind"], s: 0.42, ls: 0.46, row: 3 },
];
const TWH_K = 0.019;                // globe units per TWh for the towers
const ROW_H = 9;                    // plate thickness (world units) in the share row
const GM = makeMinis(779);
for (const c of CTRY) {
  const d = D.countries[c.n];
  c.twh = d.renewable[19]; c.share = d.share[19];
  c.plate = globe.plate(c.n, c.color);
  c.up = lonLat(c.lon, c.lat, 1);
  c.anchor = globe.anchor(c.lon, c.lat, 0);
  globe.scene.remove(c.anchor); c.plate.mesh.add(c.anchor);       // ride on the plate
  c.anchor.scale.setScalar(c.s);
  c.minis.forEach((k, i) => { const g = new THREE.Group(); g.position.set(i ? 34 : -34, 0, 0); c.anchor.add(g); GM.minis[k](g); });
}
// steam on the geothermal field and biomass miniatures
const gPuff = (() => {
  const cv = document.createElement("canvas"); cv.width = cv.height = 64;
  const g = cv.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 31);
  gr.addColorStop(0, "rgba(255,255,255,.9)"); gr.addColorStop(0.5, "rgba(255,255,255,.35)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const gSteam = GM.steams.map((e) => {
  const sp = [];
  for (let i = 0; i < 6; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: gPuff, transparent: true, depthWrite: false })); e.g.add(s); sp.push(s); }
  return { ...e, sp };
});
const interLight = new THREE.DirectionalLight(0xffffff, 1.6);   // a fill from the camera, so the far side is not black
interLight.visible = false; globe.scene.add(interLight);
const interCam = (() => {
  const keys = [
    { t: I0, p: { lon: 134, lat: -26, r: 175 } },
    { t: I0 + 2.3, p: { lon: 152, lat: -33, r: 310 } },
    { t: I0 + 5.6, p: { lon: 112, lat: -6, r: 640, ly: 75 } },     // China's tower in profile, upper left; the globe sits low for headroom
    { t: I0 + 7.6, p: { lon: 100, lat: 10, r: 470, ly: 105 } },   // the globe drops low; the row fills the frame
    { t: I1, p: { lon: 103, lat: 8, r: 455, ly: 105 } },
  ];
  return (t) => {
    let a = keys[0].p, b = keys[0].p, k = 0;
    for (let i = 0; i < keys.length - 1; i++) if (t <= keys[i + 1].t) { a = keys[i].p; b = keys[i + 1].p; k = easeCam((t - keys[i].t) / (keys[i + 1].t - keys[i].t)); break; }
    if (t > keys.at(-1).t) { a = b = keys.at(-1).p; k = 1; }
    return { lon: lerp(a.lon, b.lon, k), lat: lerp(a.lat, b.lat, k), r: lerp(a.r, b.r, k), ly: lerp(a.ly || 0, b.ly || 0, k) };
  };
})();
const RISE_AT = { Australia: I0 + 0.5, "New Zealand": I0 + 2.0, China: I0 + 3.2, Germany: I0 + 3.9 };
const LIFT0 = I0 + 6.2, LIFT1 = I0 + 7.6;      // towers settle to plates and lift off into the row
const FILL_AT = { "New Zealand": I0 + 7.9, Germany: I0 + 8.3, Australia: I0 + 8.7, China: I0 + 9.1 };
const _c = new THREE.Vector3(), _d = new THREE.Vector3(), _rt = new THREE.Vector3(), _upv = new THREE.Vector3();
function interState(t) {
  const lift = ease((t - LIFT0) / (LIFT1 - LIFT0));
  const out = {};
  for (const c of CTRY) {
    const tower = c.twh * TWH_K * ease((t - RISE_AT[c.n]) / (c.n === "China" ? 2.0 : 1.2));
    const h = lerp(tower, ROW_H / (c.ls * 1.35), lift);                      // world height stays ROW_H once scaled
    const fillK = ease((t - FILL_AT[c.n]) / 1.5);
    const fill = lift < 1 ? lerp(1, 0.02, smooth((lift - 0.6) / 0.4)) : lerp(0.02, c.share / 100, fillK);
    out[c.n] = { h, fill, lift, fillK, shown: c.share * fillK };
  }
  return out;
}
function poseInter(t) {
  const cam = interCam(t);
  globe.camAt(cam, new THREE.Vector3(0, cam.ly, 0));
  globe.setOutline(0); globe.setClouds(1);
  globe.clouds.rotation.y = t * 0.012;
  interLight.visible = true; interLight.position.copy(globe.camera.position);
  const st = interState(t);
  // the row: plates lifted in front of the camera, spread left to right
  globe.camera.getWorldDirection(_d); _rt.crossVectors(_d, new THREE.Vector3(0, 1, 0)).normalize(); _upv.crossVectors(_rt, _d).normalize();
  const camDist = globe.camera.position.length();
  for (const c of CTRY) {
    const s = st[c.n], m = c.plate.mesh;
    c.plate.set(s.h, s.fill);
    if (s.lift <= 0) { m.position.set(0, 0, 0); m.quaternion.identity(); m.scale.setScalar(1); }
    else {
      // the row sits across the view direction, a fixed distance in front of the camera
      const P = globe.camera.position.clone().addScaledVector(_d, 250).addScaledVector(_rt, (c.row - 1.5) * 66).addScaledVector(_upv, 8);
      const dir = P.clone().normalize(), sc = lerp(1, c.ls * 1.35, s.lift);
      const q = new THREE.Quaternion().setFromUnitVectors(c.up, dir);
      m.quaternion.slerpQuaternions(new THREE.Quaternion(), q, s.lift);
      m.scale.setScalar(sc);
      // the plate's centre sits at up*R in object space; put it on the line from the surface to P
      _c.copy(c.up).multiplyScalar(GR).applyQuaternion(m.quaternion).multiplyScalar(sc);
      m.position.copy(c.up).multiplyScalar(GR).lerp(P, s.lift).sub(_c);
    }
    c.anchor.position.copy(c.up).multiplyScalar(GR + s.h);
    c.anchor.visible = s.h > 0.05;
  }
  GM.spinners.forEach((ro) => { ro.rotation.z = ro.userData.phase + t * 1.6; });
  for (const e of gSteam) e.sp.forEach((sp, i) => {
    const k = (t * 0.3 + i / 6) % 1;
    sp.position.set(e.x + k * 3, e.y + k * e.size * 3.2, e.z); sp.scale.setScalar(e.size * (0.7 + k * 1.8));
    sp.material.opacity = Math.sin(Math.PI * k) * 0.7;
  });
}
/* screen position of a point `h` above a country's surface point, through the plate's transform */
function interTop(c, h) {
  const v = c.up.clone().multiplyScalar(GR + h); c.plate.mesh.localToWorld(v);
  const p = v.project(globe.camera);
  return [(p.x * 0.5 + 0.5) * W, (-p.y * 0.5 + 0.5) * H, v];
}
const fmtTwh = (v) => v.toLocaleString("en-AU", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
function drawInterHUD(t) {
  const st = interState(t);
  // titles: volume first, then share
  const va = window01(t, I0 + 3.6, LIFT0 + 0.3, 0.5);
  if (va > 0) {
    text("China leads renewable generation by volume", W - 56, 92, 36, INK, va, 700, "SG", "right");
    mono("Volume reflects the size of a country\u2019s grid, not how clean it is", W - 58, 122, 14, MUTED, va, "right");
  }
  const sa = smooth((t - I0 - 8.0) / 0.6);
  if (sa > 0) {
    text("Australia edges China on renewable share", 56, 78, 36, INK, sa, 700);
    mono("Renewable share of electricity generated, 2024", 58, 108, 14, MUTED, sa);
  }
  globe.camera.getWorldDirection(_d);
  for (const c of CTRY) {
    const s = st[c.n];
    if (s.h <= 0.05) continue;
    const [x, y, v] = interTop(c, s.h);
    // only label a country that faces the camera (not round the limb)
    const facing = c.plate.mesh.localToWorld(c.up.clone().multiplyScalar(GR)).normalize().dot(_d.clone().negate());
    const a = smooth((facing - 0.1) / 0.2) * smooth((t - RISE_AT[c.n]) / 0.5);
    if (a <= 0) continue;
    const col = "#" + c.color.toString(16).padStart(6, "0");
    if (s.lift < 1) {
      // volume: name and TWh beside the tower top
      const va2 = a * (1 - smooth((s.lift - 0.2) / 0.5));
      const label = fmtTwh(c.twh * ease((t - RISE_AT[c.n]) / (c.n === "China" ? 2.0 : 1.2))) + " TWh";
      ctx.save(); ctx.globalAlpha = va2; ctx.font = "700 20px SG";
      const w = ctx.measureText(label).width + 26;
      rr(x + 14, y - 40, w, 32, 16); ctx.fillStyle = "rgba(8,12,18,.78)"; ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = INK; ctx.textAlign = "left"; ctx.fillText(label, x + 27, y - 17); ctx.restore();
      mono(c.n, x + 16, y + 2, 13, "rgba(244,247,250,.9)", va2);
    } else {
      // share: name under the plate, the percentage rising with the fill
      const [bx, by] = interTop(c, -6);
      ctx.save(); ctx.globalAlpha = a; ctx.font = "700 22px SG";
      const nw = ctx.measureText(c.n).width + 26;
      rr(bx - nw / 2, by + 30, nw, 34, 17); ctx.fillStyle = "rgba(8,12,18,.8)"; ctx.fill(); ctx.restore();
      text(c.n, bx, by + 54, 22, INK, a, 700, "SG", "center");
      const pa = a * smooth((t - FILL_AT[c.n]) / 0.3);
      if (pa > 0) {
        const [tx, ty] = interTop(c, ROW_H / (c.ls * 1.35));
        const label = s.shown.toFixed(1) + "%";
        ctx.save(); ctx.globalAlpha = pa; ctx.font = "700 24px SG";
        const w = ctx.measureText(label).width + 28;
        rr(tx - w / 2, ty - 58, w, 38, 19); ctx.fillStyle = col; ctx.fill();
        ctx.fillStyle = "#0b1118"; ctx.textAlign = "center"; ctx.fillText(label, tx, ty - 31); ctx.restore();
      }
    }
  }
}

/* ---- step 5: the forecast, over the farmland ---------------------------------- */
function drawForecastHUD(t) {
  const a = window01(t, F0 + 0.5, F1 + 0.6, 0.5);
  if (a <= 0) return;
  const DK = "#101722", DM = "rgba(20,28,38,.8)";
  text("Renewable generation is forecast to keep rising to 2035", 56, 78, 34, DK, a, 700);
  mono("Linear trend on 2005\u20132024, Australia \u00b7 TWh \u00b7 95% prediction interval", 58, 108, 14, DM, a);
  const yr = forecastYear(t);
  // year ticks under the baseline
  for (let y = 2005; y <= 2035; y += 5) {
    const ya = a * smooth((yr - y + 0.4) / 0.6);
    if (ya <= 0) continue;
    const [x, yy] = proj(FC.point(y, 0).setY(FC.base - 14));
    mono(String(y), x, yy + 16, 13, "rgba(244,247,250,.92)", ya, "center");
  }
  // the running value at the drawing tip
  if (yr < 2024) {
    const i = Math.floor(yr - 2005), k = yr - 2005 - i, v = lerp(D.total[i], D.total[Math.min(19, i + 1)], k);
    const [x, y] = proj(FC.point(yr, v));
    text(fmtTwh(v) + " TWh", x + 12, y - 14, 18, INK, a, 700);
  }
  // 2024 actual, pinned once the history is drawn
  const ha = a * smooth((yr - 2023.6) / 0.4);
  if (ha > 0) {
    const [x, y] = proj(FC.point(2024, D.total[19]));
    pill(fmtTwh(D.total[19]) + " TWh in 2024", x, y - 44, ACC, ha);
  }
  // the forecast end point
  const fa = a * smooth((yr - 2034.6) / 0.4);
  if (fa > 0) {
    const [x, y] = proj(FC.point(2035, FACTS.twh2035));
    pill(fmtTwh(FACTS.twh2035) + " TWh by 2035", x, y - 30, AMB, fa);
    const eq = `y = ${FIT_TWH.slope.toFixed(2)}x + ${FIT_TWH.icpt.toFixed(1)} \u00b7 R\u00b2 = ${FACTS.r2.toFixed(3)} \u00b7 p < 0.001`;
    card(W - 470, 140, 414, 54, fa);
    mono(eq, W - 263, 173, 14, INK, fa, "center");
  }
  // the share gauge beside 2035: the target mark, then the fill rising to the forecast share
  const ga = a * smooth((t - SHARE_AT + 0.4) / 0.5);
  if (ga > 0) {
    const [tx, ty] = proj(FC.gauge.at(FC.gauge.target));
    pill(`2030 target ${FC.gauge.target}%`, tx, ty - 22, INK, ga);
    const k = ease((t - SHARE_AT) / 1.4);
    if (k > 0) {
      const v = FACTS.share2035 * k, [fx, fy] = proj(FC.gauge.at(v));
      pill(`${fmt1(v)}% renewable by 2035 on this trend`, fx, fy + 26, AMB, ga);
    }
  }
  // the farm on screen is the real build each year: turbines and tables follow the data
  const ba = a * window01(t, F0 + 1.2, F0 + 5.8, 0.5);
  if (ba > 0) mono("The farm builds in step with the data: turbines follow wind TWh, tables follow solar TWh", 58, H - 92, 12, "rgba(244,247,250,.8)", ba);
}
function pill(label, x, y, col, a) {
  ctx.save(); ctx.globalAlpha = a; ctx.font = "700 19px SG";
  const w = ctx.measureText(label).width + 28;
  rr(x - w / 2, y - 18, w, 36, 18); ctx.fillStyle = "rgba(8,12,18,.82)"; ctx.fill();
  ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = col; ctx.textAlign = "center"; ctx.fillText(label, x, y + 7); ctx.restore();
}
function drawEndCard(t) {
  const a = smooth((t - F1 + 0.2) / 0.8);
  if (a <= 0) return;
  ctx.fillStyle = `rgba(5,8,12,${0.55 * a})`; ctx.fillRect(0, 0, W, H);
  mono("Data analytics portfolio \u00b7 Waranyu Bancherdvanich", W / 2, 286, 14, ACC, a, "center");
  text("Australia\u2019s Renewable", W / 2, 352, 54, INK, a, 700, "SG", "center");
  text("Electricity Transition", W / 2, 412, 54, INK, a, 700, "SG", "center");
  text(`${fmt1(FACTS.share2005)}% renewable in 2005 \u00b7 ${fmt1(FACTS.share2024)}% in 2024 \u00b7 ${fmt1(FACTS.share2035)}% by 2035 on trend`, W / 2, 462, 22, MUTED, a, 500, "SG", "center");
  mono(SOURCE_LINE, W / 2, 520, 13, MUTED, a, "center");
}

function drawGlobeHUD(t) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const ta = window01(t, 0.2, 3.9, 0.6);
  if (ta > 0) {
    const g = ctx.createRadialGradient(W / 2, 380, 60, W / 2, 380, 620);
    g.addColorStop(0, `rgba(2,4,10,${0.55 * ta})`); g.addColorStop(1, "rgba(2,4,10,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    mono("Data analytics portfolio \u00b7 Waranyu Bancherdvanich", W / 2, 236, 14, ACC, ta, "center");
    text("Australia\u2019s Renewable", W / 2, 306, 58, INK, ta, 700, "SG", "center");
    text("Electricity Transition", W / 2, 370, 58, INK, ta, 700, "SG", "center");
    text("2005 to 2035", W / 2, 420, 28, MUTED, ta, 400, "SG", "center");
    const sa = ta * smooth((t - 1.0) / 0.6);
    card(W / 2 - 430, 468, 860, 90, sa);
    mono("Data sources", W / 2, 500, 14, MUTED, sa, "center");
    text(SOURCE_LINE, W / 2, 534, 21, INK, sa, 500, "SG", "center");
  }
  // Australia, labelled as the camera arrives
  const la = smooth((t - 3.6) / 0.5);
  if (la > 0) {
    const [x, y] = globe.project(134, -25);
    mono("Australia", x, y + 6, 18, "rgba(235,248,255,.95)", la, "center");
  }
  ctx.save(); rr(W - 500, 12, 476, 30, 15); ctx.fillStyle = "rgba(8,12,18,.6)"; ctx.fill(); ctx.restore();
  mono("Illustration \u00b7 figures from project data (DCCEEW)", W - 38, 32, 13, "rgba(244,247,250,.95)", 1, "right");
}

/* ---- entry points ------------------------------------------------------- */
export function frame(T) {
  if (T < GLOBE) {
    globe.setOutline(1); globe.setClouds(1); interLight.visible = false;
    for (const c of CTRY) { c.plate.set(0, 1); c.anchor.visible = false; }
    globe.pose(T, T / GLOBE);
    renderer.render(globe.scene, globe.camera);
    drawGlobeHUD(T);
  } else {
    frameInner(T - GLOBE + SKIP);
  }
  // through the atmosphere: a bright haze across the cut from space to the land
  const f = 1 - smooth(Math.abs(T - GLOBE) / 0.5);
  if (f > 0) { ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.fillStyle = `rgba(214,228,240,${f})`; ctx.fillRect(0, 0, W, H); }
}
function frameInner(t) {
  if (inStudio(t)) {
    poseAll(t);
    studioComposer.render();
  } else if (inLineup(t)) {
    lineupPath(t, lineup.camera);
    renderer.render(lineup.scene, lineup.camera);
  } else if (inInter(t)) {
    poseInter(t);
    renderer.render(globe.scene, globe.camera);
  } else {
    FC.group.visible = t >= F0;
    if (t >= F0) { FC.set(forecastYear(t)); FC.gauge.set(smooth((t - SHARE_AT + 0.4) / 0.4) * ease((t - SHARE_AT) / 1.4)); }
    poseAll(t);
    if (composer) composer.render(); else renderer.render(scene, camera);
  }
  drawHUD(t);
}
window.frame = frame;
/* debug: render time t from any camera position, without the overlay */
window.view = (t, p, l, fov = 38) => {
  poseAll(t); camera.fov = fov; camera.updateProjectionMatrix();
  camera.position.set(...p); camera.lookAt(...l); camera.updateMatrixWorld();
  if (composer) composer.render(); else renderer.render(scene, camera);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, hud.width, hud.height);
  camera.fov = 38; camera.updateProjectionMatrix();
};
window.treeNear = (x, z) => [x, heightAt(x, z), z];
window.DURATION = DURATION;
window.cameraAt = (t) => { poseAll(t); return { p: camera.position.toArray().map(Math.round), u: camU(t) }; };

await document.fonts.load("700 20px SG"); await document.fonts.load("500 20px SG");
await document.fonts.load("400 20px SG"); await document.fonts.load("400 12px DM");
frame(0);
window.ready = true;
