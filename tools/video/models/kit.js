/* Shared helpers for the models: a seeded random generator, value noise,
 * and painted textures so no surface is a flat colour. Every texture is
 * drawn on a canvas in code, so nothing is downloaded.
 */
import * as THREE from "three";

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, k) => a + (b - a) * k;

/* 2D value noise on a small lattice, seeded */
export function makeNoise(seed) {
  const r = mulberry32(seed), N = 256, v = new Float32Array(N * N);
  for (let i = 0; i < v.length; i++) v[i] = r();
  const at = (x, y) => v[((y & (N - 1)) * N) + (x & (N - 1))];
  const n = (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    return lerp(lerp(at(ix, iy), at(ix + 1, iy), sx), lerp(at(ix, iy + 1), at(ix + 1, iy + 1), sx), sy);
  };
  return (x, y, oct = 4) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { s += a * n(x * f, y * f); f *= 2; a *= 0.5; } return s; };
}

export function canvasTex(w, h, draw, rx = 1, ry = rx) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 8;
  return t;
}

/* fine per-pixel grain over a base colour */
export function grain(ctx, w, h, base, amt, r) {
  ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amt;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

/* large soft blotches: weathering, damp patches, dust */
export function blotches(ctx, w, h, noise, color, strength, scale = 6) {
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  const c = new THREE.Color(color); const cr = c.r * 255, cg = c.g * 255, cb = c.b * 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = Math.max(0, noise((x / w) * scale, (y / h) * scale) - 0.45) * strength;
    const i = (y * w + x) * 4;
    d[i] = lerp(d[i], cr, k); d[i + 1] = lerp(d[i + 1], cg, k); d[i + 2] = lerp(d[i + 2], cb, k);
  }
  ctx.putImageData(img, 0, 0);
}

/* vertical rain streaks running down from the top or from ledges */
export function streaks(ctx, w, h, r, color, count, maxAlpha, fromTop = true) {
  for (let i = 0; i < count; i++) {
    const x = r() * w, len = h * (0.15 + r() * 0.7), wd = 1 + r() * 4;
    const y0 = fromTop ? 0 : r() * h * 0.6;
    const g = ctx.createLinearGradient(0, y0, 0, y0 + len);
    g.addColorStop(0, color.replace("A", (maxAlpha * (0.4 + r() * 0.6)).toFixed(3)));
    g.addColorStop(1, color.replace("A", "0"));
    ctx.fillStyle = g; ctx.fillRect(x, y0, wd, len);
  }
}

export const std = (color, rough = 0.7, metal = 0, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });

/* ---- ready-made surfaces -------------------------------------------------- */

/* weathered concrete: grain, blotches, horizontal pour lines, rain streaks */
export function concreteTex(seed, { base = "#cfcac1", lifts = 0, streak = 60, rx = 1, ry = 1, w = 512, h = 512 } = {}) {
  const r = mulberry32(seed), noise = makeNoise(seed);
  return canvasTex(w, h, (ctx) => {
    grain(ctx, w, h, base, 22, r);
    blotches(ctx, w, h, noise, "#8f887c", 0.55, 5);
    blotches(ctx, w, h, makeNoise(seed + 7), "#e8e4dc", 0.35, 11);
    ctx.fillStyle = "rgba(70,62,52,.10)";
    for (let i = 1; i < lifts; i++) ctx.fillRect(0, (i / lifts) * h, w, 1.5);
    streaks(ctx, w, h, r, "rgba(58,52,44,A)", streak, 0.22, true);
  }, rx, ry);
}

/* profiled metal cladding: vertical ribs with light and dark edges */
export function claddingTex(seed, { base = "#a9b2ba", rib = 8, rx = 1, ry = 1, dirt = 0.25, w = 256, h = 256 } = {}) {
  const r = mulberry32(seed), noise = makeNoise(seed);
  return canvasTex(w, h, (ctx) => {
    grain(ctx, w, h, base, 10, r);
    for (let x = 0; x < w; x += rib) {
      ctx.fillStyle = "rgba(255,255,255,.22)"; ctx.fillRect(x, 0, 1.5, h);
      ctx.fillStyle = "rgba(0,0,0,.16)"; ctx.fillRect(x + rib * 0.55, 0, 1.5, h);
    }
    blotches(ctx, w, h, noise, "#6f6a62", dirt, 4);
    streaks(ctx, w, h, r, "rgba(60,56,50,A)", 26, 0.18, true);
  }, rx, ry);
}

/* rows of windows on a wall */
export function windowsTex(seed, { base = "#b7c0c7", rows = 3, cols = 12, glass = "#3c4a57", rx = 1, ry = 1, w = 512, h = 256 } = {}) {
  const r = mulberry32(seed);
  return canvasTex(w, h, (ctx) => {
    grain(ctx, w, h, base, 10, r);
    for (let x = 0; x < w; x += 8) { ctx.fillStyle = "rgba(0,0,0,.08)"; ctx.fillRect(x, 0, 1, h); }
    const cw = w / cols, rh = h / (rows + 1);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const x = i * cw + cw * 0.15, y = (j + 0.6) * rh;
      const lit = r();
      ctx.fillStyle = glass; ctx.fillRect(x, y, cw * 0.7, rh * 0.35);
      ctx.fillStyle = `rgba(200,220,235,${0.08 + lit * 0.2})`; ctx.fillRect(x, y, cw * 0.7, rh * 0.12);
    }
  }, rx, ry);
}

/* lumpy black coal */
export function coalTex(seed, rx = 4, ry = rx) {
  const r = mulberry32(seed);
  return canvasTex(256, 256, (ctx, w, h) => {
    grain(ctx, w, h, "#2c2d2f", 34, r);
    for (let i = 0; i < 900; i++) {
      const x = r() * w, y = r() * h, s = 1 + r() * 4, v = 20 + r() * 50;
      ctx.fillStyle = `rgb(${v},${v},${v + 3})`; ctx.fillRect(x, y, s, s * (0.6 + r()));
      if (r() < 0.25) { ctx.fillStyle = "rgba(170,180,190,.35)"; ctx.fillRect(x, y, 1, 1); }
    }
  }, rx, ry);
}

/* steel truss face for conveyor galleries and gantries */
export function trussTex(seed, { base = "#8d949b", panels = 8, rx = 1, ry = 1 } = {}) {
  const r = mulberry32(seed);
  return canvasTex(512, 64, (ctx, w, h) => {
    grain(ctx, w, h, base, 14, r);
    ctx.strokeStyle = "rgba(40,44,48,.75)"; ctx.lineWidth = 3;
    const pw = w / panels;
    ctx.strokeRect(1, 2, w - 2, h - 4);
    for (let i = 0; i < panels; i++) {
      ctx.beginPath(); ctx.moveTo(i * pw, 2); ctx.lineTo(i * pw, h - 2);
      ctx.moveTo(i * pw, i % 2 ? 2 : h - 2); ctx.lineTo((i + 1) * pw, i % 2 ? h - 2 : 2); ctx.stroke();
    }
  }, rx, ry);
}
