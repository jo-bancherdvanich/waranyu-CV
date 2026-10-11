/* Shared backdrop for the studio scenes (steps 2 and 3): a physical sky,
 * golden grassland that fades into haze, rolling hills on the horizon with
 * scattered gum trees, and a few clouds. Everything is built from code and a
 * seeded random generator, so it is identical on every render.
 *
 * addBackdrop(scene, { floorY }) — floorY is the height of the ground.
 * Returns the fog colour so the caller can match anything else to it.
 */
import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
import { mulberry32, makeNoise, canvasTex, grain } from "./kit.js";
import { makeGumTrees, plantGumTrees } from "./tree.js";

const smooth = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };

export function addBackdrop(scene, { floorY = -10, seed = 404 } = {}) {
  const r = mulberry32(seed), noise = makeNoise(seed);

  /* sky: same model as the landscape in step 1, sun high on the left */
  const sky = new Sky();
  sky.scale.setScalar(9000);
  const u = sky.material.uniforms;
  u.turbidity.value = 4.2; u.rayleigh.value = 1.25; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.82;
  u.sunPosition.value.copy(new THREE.Vector3(-260, 300, 320).normalize());
  scene.add(sky);
  scene.background = null;
  const FOG = 0xcfd9e0;
  scene.fog = new THREE.Fog(FOG, 1700, 6000);

  /* ground: golden grass with olive patches, red earth showing through */
  {
    const g = new THREE.PlaneGeometry(7000, 7000, 160, 160).rotateX(-Math.PI / 2);
    const p = g.attributes.position, col = new Float32Array(p.count * 3);
    const gold = new THREE.Color(0xc2a564), olive = new THREE.Color(0x8b9356), earth = new THREE.Color(0xa86a42), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const a = noise(x / 520 + 3, z / 520 - 1), b = noise(x / 160 - 7, z / 160 + 4);
      c.copy(gold).lerp(olive, smooth((a - 0.42) * 3.2)).lerp(earth, smooth((b - 0.66) * 6) * 0.45);
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const map = canvasTex(256, 256, (ctx, w, h) => {
      grain(ctx, w, h, "#d6cfbf", 70, r);
      for (let i = 0; i < 1600; i++) { ctx.fillStyle = r() < 0.65 ? "rgba(110,95,55,.35)" : "rgba(245,235,205,.35)"; ctx.fillRect(r() * w, r() * h, 1 + r() * 2, 2 + r() * 4); }
    }, 90);
    const ground = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, map, roughness: 1 }));
    ground.position.y = floorY; ground.receiveShadow = true; scene.add(ground);
  }

  /* rolling hills on the horizon: a ring of terrain whose height comes from
     noise, coloured from olive near the top to golden at the foot */
  const hillH = (x, z) => {
    const d = Math.hypot(x, z);
    const ring = smooth((d - 900) / 500) * (1 - smooth((d - 2900) / 500));
    return floorY + ring * (70 + 260 * noise(x / 700, z / 700) ** 1.5 + 30 * noise(x / 200, z / 200));
  };
  {
    const N = 220, R0 = 750, R1 = 3300, rings = 40, pos = [], col = [], idx = [];
    const top = new THREE.Color(0x5f6e40), foot = new THREE.Color(0xb39a5e), c = new THREE.Color();
    for (let j = 0; j <= rings; j++) for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2, rr = R0 + (R1 - R0) * (j / rings) ** 1.2;
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr, y = hillH(x, z);
      pos.push(x, y, z);
      c.copy(foot).lerp(top, smooth((y - floorY - 30) / 120)); col.push(c.r, c.g, c.b);
      if (i && j) { const k = j * (N + 1) + i; idx.push(k - N - 2, k - 1, k - N - 1, k - N - 1, k - 1, k); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    scene.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: false })));
  }

  /* scattered gum trees between the stage and the hills (models/tree.js) */
  {
    const trees = makeGumTrees(seed + 3, 3), pts = [];
    let guard = 0;
    while (pts.length < 260 && guard++ < 20000) {
      const a = r() * Math.PI * 2, d = 1000 + r() * 1700;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (z > 300 && Math.abs(x) < 900) continue;                    // keep the space in front of the camera clear
      if (noise(x / 300, z / 300) < 0.42 && r() < 0.85) continue;   // trees grow in clumps
      pts.push({ x, y: hillH(x, z) - 1, z, s: 1.6 + r() * 1.4, sy: 0.85 + r() * 0.35, rot: r() * 6.28 });
    }
    plantGumTrees(scene, pts, trees, { tint: (c) => c.setHSL(0.2 + r() * 0.05, 0.3 + r() * 0.12, 0.42 + r() * 0.16) });
  }

  /* clouds: soft sprites high over the hills */
  {
    const tex = (() => {
      const c = document.createElement("canvas"); c.width = c.height = 256;
      const ctx = c.getContext("2d"), rr = mulberry32(seed + 1);
      for (let i = 0; i < 28; i++) {
        const x = 128 + (rr() - 0.5) * 130, y = 140 + (rr() - 0.5) * 46, rad = 26 + rr() * 52;
        const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, "rgba(255,255,255,.6)"); g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
      }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    for (let i = 0; i < 10; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, opacity: 0.75 + r() * 0.2 }));
      s.position.set((r() - 0.5) * 5000, 650 + r() * 500, -1800 - r() * 2600);
      s.scale.set(900 + r() * 1100, 320 + r() * 220, 1);
      scene.add(s);
    }
  }
  return FOG;
}
