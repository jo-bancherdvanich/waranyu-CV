/* Gas and oil, after WA sites such as the Pinjar and Kwinana gas turbine
 * stations and a fuel terminal:
 *  - two open-cycle gas turbine units: a long clad turbine enclosure, a
 *    raised air-intake filter house with louvres, a tall exhaust stack with
 *    stiffening rings, and a generator transformer
 *  - a gas receiving station: pipes, valves and a metering skid
 *  - a fuel oil tank farm: welded steel tanks with plate seams, rust
 *    streaks, cone or floating roofs and spiral stairs, inside a concrete
 *    bund wall, with a pipe manifold and a tanker truck
 *  - a small refinery unit: two distillation columns with platforms and
 *    ladders, a pipe rack, and a flare stack with a flickering flame
 *
 * Local units are the studio's diorama units; the origin is the centre of
 * the grey platform, y = 0 its top. This model sits in the platform's left
 * half (x from about -118 to -30). pose(t) flickers the flare.
 */
import * as THREE from "three";
import { mulberry32, makeNoise, std, lerp, canvasTex, grain, streaks, concreteTex, claddingTex, trussTex } from "./kit.js";

export function build() {
  const group = new THREE.Group();
  const r = mulberry32(5150);
  const add = (geo, mat, x = 0, y = 0, z = 0, parent = group) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true; parent.add(m); return m;
  };
  const steel = std(0x8b9298, 0.42, 0.75);
  const darkSteel = std(0x4f555b, 0.5, 0.6);
  const yellow = std(0xd9b43a, 0.55, 0.3);
  const emitters = [];

  /* ---- gas turbine units ------------------------------------------------- */
  const encl = std(0xffffff, 0.6, 0.25, { map: claddingTex(201, { base: "#cfd2d0", rib: 7, rx: 3, ry: 1, dirt: 0.3 }) });
  const louvre = std(0xffffff, 0.6, 0.3, { map: canvasTex(128, 128, (ctx, w, h) => {
    const rr = mulberry32(202); grain(ctx, w, h, "#b9bec2", 10, rr);
    for (let y = 4; y < h; y += 7) { ctx.fillStyle = "rgba(30,34,38,.55)"; ctx.fillRect(4, y, w - 8, 3); ctx.fillStyle = "rgba(255,255,255,.25)"; ctx.fillRect(4, y + 3, w - 8, 1); }
    ctx.strokeStyle = "rgba(60,64,68,.6)"; ctx.lineWidth = 3; ctx.strokeRect(1, 1, w - 2, h - 2);
  }, 2, 1) });
  const stackMat = std(0xffffff, 0.55, 0.5, { map: canvasTex(64, 256, (ctx, w, h) => {
    const rr = mulberry32(203); grain(ctx, w, h, "#9ea3a6", 12, rr);
    const g = ctx.createLinearGradient(0, 0, 0, h * 0.25); g.addColorStop(0, "rgba(40,36,32,.6)"); g.addColorStop(1, "rgba(40,36,32,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h * 0.25);
    streaks(ctx, w, h, rr, "rgba(120,70,40,A)", 14, 0.25, true);
  }) });
  function gtUnit(x, z) {
    add(new THREE.BoxGeometry(22, 7, 7).translate(0, 3.5, 0), encl, x, 0, z);
    add(new THREE.BoxGeometry(22.4, 0.5, 7.4), darkSteel, x, 7.2, z);
    // intake filter house on a frame at the cold end
    add(new THREE.BoxGeometry(8, 8, 9).translate(0, 4, 0), louvre, x - 8, 8, z);
    for (const dx of [-3.6, 3.6]) for (const dz of [-4, 4]) add(new THREE.BoxGeometry(0.5, 8, 0.5).translate(0, 4, 0), darkSteel, x - 8 + dx, 0, z + dz);
    add(new THREE.BoxGeometry(3, 4, 3).translate(0, 2, 0), steel, x - 8, 4, z);              // intake duct down to the turbine
    // exhaust stack at the hot end, with stiffening rings
    add(new THREE.CylinderGeometry(2.4, 2.8, 28, 24).translate(0, 14, 0), stackMat, x + 9, 0, z);
    for (const y of [9, 16, 23]) add(new THREE.CylinderGeometry(2.75 - y * 0.012, 2.75 - y * 0.012, 0.4, 24), darkSteel, x + 9, y, z);
    add(new THREE.BoxGeometry(5, 5, 6).translate(0, 2.5, 0), stackMat, x + 6.5, 0, z);        // diffuser
    // generator transformer on a plinth
    add(new THREE.BoxGeometry(5, 0.5, 4), std(0x9a958c, 0.95), x - 2, 0.25, z + 7.5);
    add(new THREE.BoxGeometry(4, 3.8, 3).translate(0, 1.9, 0), std(0x6c7a6e, 0.55, 0.3), x - 2, 0.5, z + 7.5);
    for (const k of [-1, 0, 1]) add(new THREE.CylinderGeometry(0.22, 0.32, 1.6, 8).translate(0, 0.8, 0), std(0x8c5a3c, 0.4, 0.1), x - 2 + k * 1.2, 4.3, z + 7.5);
    emitters.push({ x: x + 9, y: 28, z, kind: "exhaust", size: 4 });
  }
  gtUnit(-82, -62);
  gtUnit(-82, -40);
  // gas receiving station: yellow gas pipes, valves and a metering skid
  {
    const gas = std(0xe0b53a, 0.45, 0.4);
    add(new THREE.CylinderGeometry(0.6, 0.6, 40, 12).rotateZ(Math.PI / 2), gas, -78, 1.2, -24);
    for (const x of [-96, -70, -60]) {
      add(new THREE.CylinderGeometry(0.6, 0.6, 14, 12), gas, x, 1.2, -31).rotation.x = Math.PI / 2;
      add(new THREE.CylinderGeometry(0.9, 0.9, 1.2, 12), std(0x2f6b4f, 0.5, 0.4), x, 1.2, -27);
      add(new THREE.TorusGeometry(0.7, 0.12, 6, 16), std(0xb63c2d, 0.5, 0.3), x, 2.4, -27).rotation.x = Math.PI / 2;
    }
    add(new THREE.BoxGeometry(6, 2.6, 3.5).translate(0, 1.3, 0), std(0xffffff, 0.6, 0.2, { map: claddingTex(204, { base: "#e6e3dc" }) }), -104, 0, -24);
    for (let k = 0; k < 8; k++) add(new THREE.BoxGeometry(0.4, 1.2, 0.4).translate(0, 0.6, 0), darkSteel, -96 + k * 5, 0, -24);
  }

  /* ---- fuel oil tank farm --------------------------------------------------- */
  function tankTex(seed) {
    const rr = mulberry32(seed);
    return canvasTex(512, 256, (ctx, w, h) => {
      grain(ctx, w, h, "#d9d5cb", 10, rr);
      ctx.fillStyle = "rgba(80,78,72,.18)";
      const courses = 6;
      for (let i = 1; i < courses; i++) ctx.fillRect(0, (i / courses) * h, w, 1.2);
      for (let i = 0; i < courses; i++) for (let j = 0; j < 10; j++) ctx.fillRect(((j + (i % 2) * 0.5) / 10) * w, (i / courses) * h, 1.2, h / courses);
      streaks(ctx, w, h, rr, "rgba(140,80,40,A)", 40, 0.3, true);
      streaks(ctx, w, h, rr, "rgba(70,66,60,A)", 30, 0.15, true);
    }, 2, 1);
  }
  function tank(x, z, R, H, floating, seed) {
    add(new THREE.CylinderGeometry(R, R, H, 48, 1, true).translate(0, H / 2, 0), std(0xffffff, 0.62, 0.12, { map: tankTex(seed), side: THREE.DoubleSide, envMapIntensity: 0.6 }), x, 0, z);
    add(new THREE.TorusGeometry(R, 0.18, 6, 48).rotateX(Math.PI / 2), darkSteel, x, H, z);            // top angle
    if (floating) {
      add(new THREE.CylinderGeometry(R - 0.3, R - 0.3, 0.4, 48), std(0x5d6064, 0.6, 0.5), x, H - 2.2, z);
      add(new THREE.CylinderGeometry(R * 0.35, R * 0.35, 0.3, 24), std(0x7c8084, 0.5, 0.5), x + R * 0.3, H - 1.9, z);
    } else {
      add(new THREE.ConeGeometry(R + 0.2, R * 0.18, 48).translate(0, R * 0.09, 0), std(0xd8d6d0, 0.5, 0.3), x, H, z);
    }
    // spiral stair: treads on a helix and a handrail
    const turns = 0.42, steps = Math.round(H * 2.2), a0 = r() * 6.28;
    const rail = [];
    for (let i = 0; i <= steps; i++) {
      const k = i / steps, a = a0 + k * turns * Math.PI * 2, y = k * H;
      const px = x + Math.cos(a) * (R + 0.8), pz = z + Math.sin(a) * (R + 0.8);
      const tread = add(new THREE.BoxGeometry(1.4, 0.12, 0.45), steel, px, y, pz); tread.rotation.y = -a;
      rail.push(new THREE.Vector3(x + Math.cos(a) * (R + 1.5), y + 1.1, z + Math.sin(a) * (R + 1.5)));
    }
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rail), steps * 2, 0.08, 5, false), std(0xd9b43a, 0.5, 0.4), 0, 0, 0);
  }
  const BX0 = -104, BX1 = -44, BZ0 = 4, BZ1 = 70;
  // bund floor (gravel) and concrete bund walls
  add(new THREE.BoxGeometry(BX1 - BX0, 0.2, BZ1 - BZ0), std(0xffffff, 1, 0, { map: canvasTex(128, 128, (c, w, h) => grain(c, w, h, "#bdb5a2", 40, r), 6, 6) }), (BX0 + BX1) / 2, 0.1, (BZ0 + BZ1) / 2);
  const wall = std(0xffffff, 0.9, 0, { map: concreteTex(205, { base: "#c7c1b5", streak: 20, rx: 6, ry: 1 }) });
  add(new THREE.BoxGeometry(BX1 - BX0, 2.2, 0.8).translate(0, 1.1, 0), wall, (BX0 + BX1) / 2, 0, BZ0);
  add(new THREE.BoxGeometry(BX1 - BX0, 2.2, 0.8).translate(0, 1.1, 0), wall, (BX0 + BX1) / 2, 0, BZ1);
  add(new THREE.BoxGeometry(0.8, 2.2, BZ1 - BZ0).translate(0, 1.1, 0), wall, BX0, 0, (BZ0 + BZ1) / 2);
  add(new THREE.BoxGeometry(0.8, 2.2, BZ1 - BZ0).translate(0, 1.1, 0), wall, BX1, 0, (BZ0 + BZ1) / 2);
  tank(-90, 22, 9, 13, true, 206);
  tank(-62, 22, 9, 13, false, 207);
  tank(-90, 52, 7, 11, false, 208);
  tank(-62, 54, 8, 12, true, 209);
  // manifold along the bund and a pipe out to the plant
  for (const z of [22, 53]) add(new THREE.CylinderGeometry(0.45, 0.45, 40, 10).rotateZ(Math.PI / 2), steel, -76, 1.4, z + 11);
  add(new THREE.CylinderGeometry(0.45, 0.45, 20, 10), steel, -46, 1.4, 44).rotation.x = Math.PI / 2;
  // tanker truck at the loading bay
  {
    const tg = new THREE.Group(); tg.position.set(-36, 0, 78); tg.rotation.y = Math.PI / 2 + 0.05; group.add(tg);
    add(new THREE.BoxGeometry(2.6, 2.6, 2.6).translate(0, 1.8, 0), std(0x2f5f94, 0.45, 0.3), -5.2, 0, 0, tg);
    add(new THREE.CylinderGeometry(1.25, 1.25, 8.5, 20).rotateZ(Math.PI / 2), std(0xdfe3e6, 0.25, 0.85), 0.8, 2.2, 0, tg);
    add(new THREE.BoxGeometry(9, 0.4, 2.2).translate(0, 0.9, 0), darkSteel, 0.6, 0, 0, tg);
    for (const wx of [-5.2, -1.2, 1.6, 4]) for (const wz of [-1.1, 1.1]) add(new THREE.CylinderGeometry(0.6, 0.6, 0.45, 12).rotateX(Math.PI / 2), std(0x1c1d1f, 0.9), wx, 0.6, wz, tg);
  }

  /* ---- refinery unit and flare ------------------------------------------------- */
  const colMat = std(0xffffff, 0.45, 0.45, { map: canvasTex(64, 256, (ctx, w, h) => {
    const rr = mulberry32(210); grain(ctx, w, h, "#d6d8d8", 10, rr);
    for (let i = 1; i < 10; i++) { ctx.fillStyle = "rgba(60,60,60,.15)"; ctx.fillRect(0, (i / 10) * h, w, 1); }
    streaks(ctx, w, h, rr, "rgba(130,80,45,A)", 12, 0.25, false);
  }) });
  function column(x, z, R, H) {
    add(new THREE.CylinderGeometry(R, R, H, 24).translate(0, H / 2, 0), colMat, x, 0, z);
    add(new THREE.SphereGeometry(R, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2), colMat, x, H, z);
    for (let y = 6; y < H; y += 7) {
      add(new THREE.CylinderGeometry(R + 1.3, R + 1.3, 0.3, 24, 1, false, 0, Math.PI * 1.2), std(0x7d858c, 0.5, 0.6), x, y, z);
      add(new THREE.CylinderGeometry(R + 1.3, R + 1.3, 1, 24, 1, true, 0, Math.PI * 1.2), std(0xd9b43a, 0.5, 0.4, { side: THREE.DoubleSide, transparent: true, opacity: 0.85 }), x, y + 0.6, z);
    }
    add(new THREE.BoxGeometry(0.6, H, 0.25).translate(0, H / 2, 0), steel, x - R - 0.4, 0, z);    // ladder
  }
  column(-110, -6, 2.4, 34);
  column(-100, -10, 1.8, 26);
  // pipe rack with trays between the columns and the tank farm
  for (let k = 0; k < 5; k++) add(new THREE.BoxGeometry(0.5, 7, 0.5).translate(0, 3.5, 0), darkSteel, -96 + k * 8, 0, -4);
  for (const dy of [6, 6.9]) add(new THREE.CylinderGeometry(0.35, 0.35, 36, 8).rotateZ(Math.PI / 2), steel, -80, dy, -4);
  add(new THREE.BoxGeometry(36, 0.3, 2.4), std(0xffffff, 0.55, 0.5, { map: trussTex(211, { base: "#868d94", panels: 9 }) }), -80, 6.4, -4);
  // flare stack: lattice support, slim riser and a flame
  const FX = -36, FZ = -82, FH = 46;
  add(new THREE.CylinderGeometry(0.6, 0.8, FH, 12).translate(0, FH / 2, 0), std(0x9c4a3a, 0.55, 0.5), FX, 0, FZ);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    const leg = add(new THREE.CylinderGeometry(0.18, 0.28, FH * 0.75, 6).translate(0, FH * 0.375, 0), darkSteel, FX + Math.cos(a) * 3.2, 0, FZ + Math.sin(a) * 3.2);
    leg.rotation.set(-Math.sin(a) * 0.06, 0, Math.cos(a) * 0.06);   // lean in towards the riser
  }
  for (let y = 8; y < FH * 0.7; y += 8) add(new THREE.TorusGeometry(3.2 - y * 0.05, 0.12, 4, 3), darkSteel, FX, y, FZ).rotation.x = Math.PI / 2;
  const flameTex = (() => {
    const c = document.createElement("canvas"); c.width = 128; c.height = 256;
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(64, 190, 4, 64, 150, 120);
    g.addColorStop(0, "rgba(255,250,220,1)"); g.addColorStop(0.25, "rgba(255,200,80,.95)"); g.addColorStop(0.55, "rgba(255,110,30,.7)"); g.addColorStop(1, "rgba(255,80,20,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(64, 150, 44, 104, 0, 0, Math.PI * 2); ctx.fill();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  flame.position.set(FX, FH + 4, FZ); flame.scale.set(4.5, 9, 1); group.add(flame);
  const glow = new THREE.PointLight(0xff8a3a, 30, 40, 2); glow.position.set(FX, FH + 3, FZ); group.add(glow);
  emitters.push({ x: FX, y: FH + 9, z: FZ, kind: "smoke", size: 3 });

  const noise = makeNoise(212);
  function pose(t) {
    const f = 0.85 + 0.3 * noise(t * 3, 1) - 0.05;
    flame.scale.set(4.5 * (0.9 + 0.2 * noise(t * 4, 7)), 9 * f, 1);
    flame.position.y = FH + 3.6 * f;
    glow.intensity = 26 * f;
  }
  return { group, emitters, pose };
}
