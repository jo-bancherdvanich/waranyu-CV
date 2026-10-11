/* The renewable side of the studio scene, after real Australian sites:
 *  - wind: modern turbines (Collgar, Yandin) — tapered steel tower in
 *    flanged sections, rounded nacelle, spinner, long tapered and twisted
 *    blades, a pad-mounted transformer and gravel hardstand at the base
 *  - solar: a single-axis tracker farm — long rows of panels on a torque
 *    tube and posts, an inverter station, a security fence
 *  - hydro: a concrete arch dam in a valley (Snowy Hydro) with the lake
 *    behind it, a spillway chute, penstocks down to a power house, and the
 *    river leaving below
 *  - biomass: a clad boiler hall, an open fuel shed with wood-chip heaps,
 *    log stacks, a conveyor and a slim stack
 *  - geothermal: well heads in concrete cellars, silver insulated pipelines
 *    with expansion loops, separator vessels and a fan-cooled condenser
 *  - gum trees: forked pale trunks with separate leaf clumps
 *
 * Local units are the studio's diorama units; the origin is the centre of
 * the green platform and y = 0 its top surface. build() returns the group,
 * a pose(t) that turns the rotors, and emitters for steam.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mulberry32, makeNoise, std, clamp, lerp, canvasTex, grain, blotches, streaks,
  concreteTex, claddingTex, windowsTex, trussTex } from "./kit.js";

const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };

// a blade: elliptical sections lofted along its length, tapered and twisted
export function bladeGeo(L) {
  const st = 18, M = 14, pos = [], idx = [];
  for (let i = 0; i <= st; i++) {
    const t = i / st, y = t * L;
    const chord = t < 0.04 ? 0.9 : t < 0.22 ? lerp(1.0, 2.6, (t - 0.04) / 0.18) : lerp(2.6, 0.35, ((t - 0.22) / 0.78) ** 0.9);
    const thick = t < 0.04 ? 0.9 : chord * lerp(0.42, 0.14, Math.min(1, t * 1.5));
    const tw = lerp(0.35, 0, t);
    for (let j = 0; j < M; j++) {
      const a = (j / M) * Math.PI * 2;
      let x = Math.cos(a) * chord / 2, z = Math.sin(a) * thick / 2;
      if (x < 0) x *= 0.75;                                       // blunt leading, sharp trailing edge
      pos.push(x * Math.cos(tw) - z * Math.sin(tw), y, x * Math.sin(tw) + z * Math.cos(tw));
    }
  }
  for (let i = 0; i < st; i++) for (let j = 0; j < M; j++) {
    const a = i * M + j, b = i * M + ((j + 1) % M), c = a + M, d = b + M;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

export function build() {
  const group = new THREE.Group();
  const r = mulberry32(9101);
  const add = (geo, mat, x = 0, y = 0, z = 0, parent = group) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true; parent.add(m); return m;
  };
  const white = std(0xeef0f1, 0.42, 0.08);
  const steel = std(0x8b9298, 0.42, 0.75);
  const darkSteel = std(0x50565c, 0.5, 0.6);
  const emitters = [];
  const rotors = [];
  const turbines = [];      // in build order; pose() raises them as wind output grows
  const solarSegs = [];     // tracker sections in build order; pose() fills them as solar output grows

  /* ---- terrain: two ridges with a valley for the dam ---------------------- */
  const VX = -30, DAM_Z = -50, LAKE = 25;
  const LCZ = -68, LRX = 36, LRZ = 15;          // the lake: an oval behind the dam
  const noise = makeNoise(303);
  function terrainH(x, z) {
    const e = Math.hypot((x - VX) / LRX, (z - LCZ) / LRZ);
    let h = 31 * smooth((e - 0.9) / 0.7) ** 0.8 * (1 - smooth((e - 1.75) / 1.1));   // a ring of hills
    // the valley the dam closes, opening towards the front
    const gap = 1 - smooth((Math.abs(x - VX) - 9) / 14);
    h *= 1 - gap * smooth((z - (DAM_Z - 6)) / 6);
    h += (noise(x * 0.05, z * 0.05) - 0.5) * 9 * smooth(h / 10);
    // fade to the platform at the edges of the terrain patch
    h *= smooth((x + 118) / 14) * smooth((50 - x) / 14) * smooth((-6 - z) / 12);
    if (e < 1.02) h = Math.min(h, LAKE - 4);                                    // lake bed
    return Math.max(0, h);
  }
  {
    const geo = new THREE.PlaneGeometry(170, 86, 150, 80).rotateX(-Math.PI / 2).translate(-34, 0, -47);
    const p = geo.attributes.position, col = new Float32Array(p.count * 3);
    const flat = new THREE.Color(0x94b354), grass = new THREE.Color(0x8fa45c), dry = new THREE.Color(0xa99a62), rock = new THREE.Color(0x8b8274), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), y = terrainH(x, z);
      p.setY(i, y + 0.06);
      c.copy(grass).lerp(dry, smooth((noise(x * 0.04 + 9, z * 0.04) - 0.4) * 3)).lerp(rock, smooth((y - 26) / 12) * 0.55);
      if (Math.abs(y - LAKE) < 1.6 && y < LAKE + 1.6) c.lerp(new THREE.Color(0xb6a98a), 0.6);   // pale shoreline
      c.lerp(flat, 1 - smooth(y / 4));                        // meet the platform's green at the foot
      col.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const map = canvasTex(256, 256, (ctx, w, h) => {
      grain(ctx, w, h, "#d8d6c8", 60, r);
      for (let i = 0; i < 1500; i++) { ctx.fillStyle = r() < 0.6 ? "rgba(70,80,40,.35)" : "rgba(235,230,210,.3)"; ctx.fillRect(r() * w, r() * h, 1 + r() * 2, 2 + r() * 3); }
    }, 14, 7);
    add(geo, std(0xffffff, 0.97, 0, { map, vertexColors: true }));
  }

  /* ---- gum trees ------------------------------------------------------------ */
  const leafTex = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 256;
    const ctx = c.getContext("2d"), rr = mulberry32(55);
    for (let i = 0; i < 260; i++) {
      const x = 128 + (rr() - 0.5) * 210, y = 40 + rr() * 190, a = Math.PI / 2 + (rr() - 0.5) * 0.9;
      const l = 14 + rr() * 22, g = 90 + rr() * 50;
      ctx.strokeStyle = `rgb(${g - 30},${g + 10},${g - 50})`; ctx.lineWidth = 2.4 + rr() * 2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + 4, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const leafMat = new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9, color: 0xb9c79a });
  const leafDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: leafTex, alphaTest: 0.45 });
  const barkMat = std(0xffffff, 0.9, 0, { map: canvasTex(64, 256, (ctx, w, h) => {
    const rr = mulberry32(66); grain(ctx, w, h, "#ddd5c4", 18, rr);
    for (let i = 0; i < 40; i++) { ctx.fillStyle = rr() < 0.5 ? "rgba(150,135,110,.45)" : "rgba(120,125,120,.35)"; ctx.fillRect(rr() * w, rr() * h, 2 + rr() * 8, 10 + rr() * 60); }
  }, 1, 1) });
  function gumTree(x, z, s, seed) {
    const rr = mulberry32(seed);
    const g = new THREE.Group(); g.position.set(x, terrainH(x, z) - 0.3, z); g.scale.setScalar(s); g.rotation.y = rr() * 6.28; group.add(g);
    const trunkH = 3.5 + rr() * 1.5;
    add(new THREE.CylinderGeometry(0.32, 0.45, trunkH, 7).translate(0, trunkH / 2, 0), barkMat, 0, 0, 0, g);
    const nb = 2 + Math.floor(rr() * 2);
    const tips = [];
    for (let i = 0; i < nb; i++) {
      const a = (i / nb) * 6.28 + rr(), lean = 0.35 + rr() * 0.3, len = 4 + rr() * 2.5;
      const dir = new THREE.Vector3(Math.cos(a) * Math.sin(lean), Math.cos(lean), Math.sin(a) * Math.sin(lean));
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.28, len, 6).translate(0, len / 2, 0), barkMat);
      b.position.set(0, trunkH - 0.2, 0); b.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      b.castShadow = true; g.add(b);
      tips.push(new THREE.Vector3(0, trunkH - 0.2, 0).addScaledVector(dir, len));
    }
    // leaf clumps: three crossed cards each, normals pointing out of the crown
    const crown = tips.reduce((a, v) => a.add(v), new THREE.Vector3()).multiplyScalar(1 / tips.length).add(new THREE.Vector3(0, 1, 0));
    for (const tip of tips) for (let k = 0; k < 4; k++) {
      const cen = tip.clone().add(new THREE.Vector3((rr() - 0.5) * 2.2, 0.6 + rr() * 1.2, (rr() - 0.5) * 2.2));
      const size = 3.0 + rr() * 1.8;
      const cards = [];
      for (let j = 0; j < 3; j++) cards.push(new THREE.PlaneGeometry(size, size * 0.8).rotateY((j * Math.PI) / 3 + rr()).rotateX((rr() - 0.5) * 0.4));
      const geo = mergeGeometries(cards);
      const n = geo.attributes.normal, pp = geo.attributes.position;
      for (let i = 0; i < pp.count; i++) {
        const v = new THREE.Vector3(pp.getX(i), pp.getY(i), pp.getZ(i)).add(cen).sub(crown).normalize();
        n.setXYZ(i, v.x, v.y, v.z);
      }
      const m = add(geo, leafMat, cen.x, cen.y, cen.z, g); m.receiveShadow = false; m.customDepthMaterial = leafDepth;
    }
  }

  /* ---- wind ------------------------------------------------------------------ */
  const BLADE = bladeGeo(34);
  const towerTex = canvasTex(64, 512, (ctx, w, h) => {
    const rr = mulberry32(71); grain(ctx, w, h, "#eef0ef", 8, rr);
    streaks(ctx, w, h, rr, "rgba(120,118,110,A)", 10, 0.12, false);
    const g = ctx.createLinearGradient(0, h * 0.9, 0, h); g.addColorStop(0, "rgba(140,120,90,0)"); g.addColorStop(1, "rgba(140,120,90,.35)");
    ctx.fillStyle = g; ctx.fillRect(0, h * 0.9, w, h * 0.1);
  });
  const towerMat = std(0xffffff, 0.45, 0.1, { map: towerTex });
  function turbine(x, z, s, yaw) {
    const y0 = terrainH(x, z);
    const g = new THREE.Group(); g.position.set(x, y0, z); g.rotation.y = yaw; g.scale.setScalar(s); group.add(g);
    const H = 64;
    add(new THREE.CylinderGeometry(1.25, 2.2, H, 32).translate(0, H / 2, 0), towerMat, 0, 0, 0, g);
    for (const fy of [21, 42]) add(new THREE.CylinderGeometry(lerp(2.2, 1.25, fy / H) + 0.06, lerp(2.2, 1.25, fy / H) + 0.06, 0.35, 32), white, 0, fy, 0, g);
    add(new THREE.BoxGeometry(0.9, 1.7, 0.2), darkSteel, 0, 0.9, 2.15, g);                       // door
    add(new THREE.BoxGeometry(1.2, 0.4, 0.9), steel, 0, 2.1, 2.5, g);                            // landing
    // nacelle and spinner
    add(new RoundedBoxGeometry(2.8, 2.8, 8.5, 3, 0.7), white, 0, H + 1.4, -1.6, g);
    add(new THREE.BoxGeometry(2, 0.3, 2).translate(0, 0.15, 0), darkSteel, 0, H + 2.8, -4.5, g);   // cooler on top
    const rotor = new THREE.Group(); rotor.position.set(0, H + 1.4, 3.1); g.add(rotor);
    add(new THREE.SphereGeometry(1.45, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(1, 1, 1.5), white, 0, 0, 0, rotor);
    for (let k = 0; k < 3; k++) {
      const b = add(BLADE, white, 0, 0, 0.2, rotor);
      b.rotation.z = (k * 2 * Math.PI) / 3; b.position.add(new THREE.Vector3(0, 0, 0));
      b.geometry = BLADE; b.translateY(0.9);
    }
    rotor.userData.phase = r() * 6.28; rotors.push(rotor);
    turbines.push({ g, s, rotor });
    // hardstand and pad-mounted transformer
    add(new THREE.CircleGeometry(7, 24).rotateX(-Math.PI / 2), std(0xb9b19e, 1), 0, 0.12, 0, g);
    add(new THREE.BoxGeometry(2.2, 2, 1.8).translate(0, 1, 0), std(0x6e7f74, 0.55, 0.3), 3.6, 0, 2.2, g);
  }
  // the first stands in 2005; the rest follow wind output (see pose)
  for (const [x, z, s] of [[-112, -26, 0.55], [-128, 2, 0.5], [-74, -58, 0.62], [-142, -34, 0.5],
    [-96, 2, 0.5], [10, -80, 0.55], [-50, -86, 0.55], [-146, -62, 0.5]]) turbine(x, z, s, 0.35);

  /* ---- solar tracker farm ------------------------------------------------------ */
  {
    const panelTex = canvasTex(1024, 128, (ctx, w, h) => {
      const rr = mulberry32(81);
      ctx.fillStyle = "#c3c8cc"; ctx.fillRect(0, 0, w, h);
      const mods = 16, mw = w / mods;
      for (let m = 0; m < mods; m++) for (let row = 0; row < 2; row++) {
        const x0 = m * mw + 2, y0 = row * (h / 2) + 2, ww = mw - 4, hh = h / 2 - 4;
        ctx.fillStyle = "#14223b"; ctx.fillRect(x0, y0, ww, hh);
        for (let a = 0; a < 6; a++) for (let b = 0; b < 4; b++) {
          const v = 18 + rr() * 12; ctx.fillStyle = `rgb(${v},${v + 16},${v + 46})`;
          ctx.fillRect(x0 + 1 + a * (ww / 6), y0 + 1 + b * (hh / 4), ww / 6 - 1.2, hh / 4 - 1.2);
        }
      }
    }, 5, 1);
    const panelMat = new THREE.MeshPhysicalMaterial({ map: panelTex, roughness: 0.22, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08 });
    const X0 = -128, X1 = -46, rows = 7, Z0 = 30, DZ = 7;
    const len = X1 - X0;
    const SEGS = 6, sl = len / SEGS;
    panelTex.repeat.set(5 / SEGS, 1);
    for (let i = 0; i < rows; i++) for (let k = SEGS - 1; k >= 0; k--) {
      const z = Z0 + i * DZ, cx = X0 + sl * (k + 0.5);
      const seg = new THREE.Group(); seg.position.set(cx, 0, z); group.add(seg);
      add(new THREE.CylinderGeometry(0.22, 0.22, sl - 0.3, 8).rotateZ(Math.PI / 2), steel, 0, 2.4, 0, seg);
      add(new THREE.BoxGeometry(sl - 0.5, 0.14, 4.0), panelMat, 0, 2.6, 0, seg).rotation.x = -0.42;
      for (let x = -sl / 2 + 1.5; x < sl / 2; x += 6) add(new THREE.BoxGeometry(0.3, 2.4, 0.3).translate(0, 1.2, 0), steel, x, 0, 0, seg);
      solarSegs.push(seg);
    }
    // inverter station
    add(new THREE.BoxGeometry(7, 3, 3).translate(0, 1.5, 0), std(0xffffff, 0.5, 0.2, { map: claddingTex(82, { base: "#e9e9e6", rib: 10, dirt: 0.15 }) }), X1 + 7, 0, Z0 + 14);
    add(new THREE.BoxGeometry(2.6, 2.4, 2.2).translate(0, 1.2, 0), std(0x6e7f74, 0.5, 0.3), X1 + 7, 0, Z0 + 19);
    // fence: posts and a see-through mesh
    const meshTex = canvasTex(64, 64, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h); ctx.strokeStyle = "rgba(150,155,160,.9)"; ctx.lineWidth = 1.2;
      for (let i = -64; i < 128; i += 8) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 64, 64); ctx.moveTo(i + 64, 0); ctx.lineTo(i, 64); ctx.stroke(); }
    });
    const fenceMat = new THREE.MeshStandardMaterial({ map: meshTex, transparent: true, alphaTest: 0.2, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.5 });
    const fx0 = X0 - 4, fx1 = X1 + 12, fz0 = Z0 - 6, fz1 = Z0 + (rows - 1) * DZ + 6;
    const sides = [[fx0, fz0, fx1, fz0], [fx1, fz0, fx1, fz1], [fx1, fz1, fx0, fz1], [fx0, fz1, fx0, fz0]];
    for (const [ax, az, bx, bz] of sides) {
      const L = Math.hypot(bx - ax, bz - az);
      meshTex.repeat.set(L / 2.4, 1);
      const f = add(new THREE.PlaneGeometry(L, 2.2), fenceMat, (ax + bx) / 2, 1.1, (az + bz) / 2);
      f.rotation.y = -Math.atan2(bz - az, bx - ax); f.castShadow = false;
      for (let k = 0; k <= L; k += 5) add(new THREE.CylinderGeometry(0.1, 0.1, 2.4, 6).translate(0, 1.2, 0), steel, lerp(ax, bx, k / L), 0, lerp(az, bz, k / L));
    }
  }

  /* ---- hydro: arch dam, lake, spillway, penstocks, power house, river --------- */
  {
    const conc = std(0xffffff, 0.88, 0, { map: concreteTex(91, { base: "#cbc5ba", lifts: 10, streak: 90, rx: 3, ry: 1 }) });
    const R = 40, span = 0.78, H = LAKE + 4;
    const cx = VX, cz = DAM_Z + R;                     // arch centre downstream, face bowed upstream
    const outer = new THREE.CylinderGeometry(R, R + 6, H, 48, 4, true, Math.PI - span / 2, span).translate(0, H / 2, 0);
    add(outer, conc, cx, 0, cz).material.side = THREE.DoubleSide;
    const inner = new THREE.CylinderGeometry(R + 3.2, R + 3.2, H, 48, 1, true, Math.PI - span / 2, span).translate(0, H / 2, 0);
    add(inner, conc, cx, 0, cz).material.side = THREE.DoubleSide;
    // crest road with a parapet
    const crest = new THREE.RingGeometry(R - 0.2, R + 3.4, 48, 1, Math.PI / 2 + span / 2 - span, span).rotateX(-Math.PI / 2);
    add(crest, std(0xbcb6aa, 0.9, 0, { side: THREE.DoubleSide }), cx, H + 0.05, cz).rotation.y = 0;
    // lake
    const lakeGeo = new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2).scale(LRX * 1.3, 1, LRZ * 1.3);
    add(lakeGeo, new THREE.MeshPhysicalMaterial({ color: 0x2b5a72, roughness: 0.06, clearcoat: 1, envMapIntensity: 1.2 }), VX, LAKE, LCZ).castShadow = false;
    // spillway chute on the right abutment, with white water
    const foam = std(0xffffff, 0.35, 0, { map: canvasTex(64, 256, (ctx, w, h) => {
      const rr = mulberry32(92); grain(ctx, w, h, "#e9f3f8", 30, rr);
      for (let i = 0; i < 60; i++) { ctx.fillStyle = `rgba(120,170,200,${0.2 + rr() * 0.3})`; ctx.fillRect(rr() * w, rr() * h, 1 + rr() * 3, 6 + rr() * 30); }
    }, 1, 2), emissive: 0x9fc4d8, emissiveIntensity: 0.15 });
    for (const k of [-2, -1, 0, 1, 2]) {
      const gx = VX + k * 4.2, gz = DAM_Z + 0.4;
      add(new THREE.BoxGeometry(1, 3.2, 3.6).translate(0, 1.6, 0), conc, gx - 2.1, H, gz);
      if (k < 2) add(new THREE.BoxGeometry(3.2, 1.6, 0.4).translate(0, 0.8, 0), std(0x3f6f8a, 0.5, 0.6), gx, H + 1.2, gz);
    }
    const plunge = add(new THREE.CircleGeometry(6, 32).rotateX(-Math.PI / 2), foam, VX, 0.35, DAM_Z + 14); plunge.castShadow = false;
    // power house at the toe, penstocks down the dam face
    const ph = std(0xffffff, 0.7, 0.1, { map: windowsTex(93, { base: "#d8d4cb", rows: 1, cols: 6, rx: 1, ry: 1 }) });
    add(new THREE.BoxGeometry(20, 8, 9).translate(0, 4, 0), ph, VX - 2, 0, DAM_Z + 9);
    add(new THREE.BoxGeometry(21, 0.6, 10), std(0x6d7176, 0.5, 0.5), VX - 2, 8.2, DAM_Z + 9);
    for (const k of [-6, 0, 6]) {
      const pipe = add(new THREE.CylinderGeometry(0.9, 0.9, 26, 14), std(0x8a9096, 0.4, 0.75), VX - 2 + k, 17, DAM_Z + 2.5);
      pipe.rotation.x = 0.32;
    }
    // river leaving the power house towards the front
    const riverCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(VX - 2, 0.25, DAM_Z + 14), new THREE.Vector3(VX + 4, 0.25, DAM_Z + 30),
      new THREE.Vector3(VX - 6, 0.25, DAM_Z + 48), new THREE.Vector3(VX + 8, 0.25, DAM_Z + 70)]);
    const pts = riverCurve.getPoints(60), pos = [], idx = [];
    pts.forEach((p, i) => {
      const t = riverCurve.getTangent(i / 60), n = new THREE.Vector3(-t.z, 0, t.x).normalize(), w = 4 + i * 0.04;
      const a = p.clone().addScaledVector(n, w), b = p.clone().addScaledVector(n, -w);
      a.y = terrainH(a.x, a.z) + 0.3; b.y = terrainH(b.x, b.z) + 0.3; a.y = b.y = Math.min(a.y, b.y, 4);
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      if (i) idx.push((i - 1) * 2, i * 2, (i - 1) * 2 + 1, (i - 1) * 2 + 1, i * 2, i * 2 + 1);
    });
    const rg = new THREE.BufferGeometry(); rg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); rg.setIndex(idx); rg.computeVertexNormals();
    add(rg, new THREE.MeshPhysicalMaterial({ color: 0x3b7896, roughness: 0.12, clearcoat: 1, side: THREE.DoubleSide })).castShadow = false;
  }

  /* ---- biomass plant ----------------------------------------------------------- */
  {
    const BXc = 62, BZc = 30;
    const clad = std(0xffffff, 0.6, 0.2, { map: claddingTex(101, { base: "#d9d2c3", rx: 3, ry: 2, dirt: 0.3 }) });
    add(new THREE.BoxGeometry(20, 22, 15).translate(0, 11, 0), clad, BXc, 0, BZc);
    add(new THREE.BoxGeometry(20.4, 3, 15.4).translate(0, 1.5, 0), std(0x2f6b4f, 0.6, 0.3), BXc, 19, BZc);   // green band
    add(new THREE.BoxGeometry(14, 12, 12).translate(0, 6, 0), std(0xffffff, 0.6, 0.2, { map: windowsTex(102, { base: "#dcd6c8", rows: 2, cols: 6 }) }), BXc - 16, 0, BZc + 2);
    add(new THREE.CylinderGeometry(1.1, 1.5, 38, 16).translate(0, 19, 0), std(0xc9c4ba, 0.7, 0.3), BXc + 8, 0, BZc - 9);
    add(new THREE.CylinderGeometry(4.5, 4.5, 16, 24).translate(0, 8, 0), std(0xd0d3d6, 0.45, 0.55), BXc + 14, 0, BZc + 4);   // silo
    add(new THREE.ConeGeometry(4.5, 3, 24).translate(0, 17.5, 0), std(0xb8bcc0, 0.45, 0.55), BXc + 14, 0, BZc + 4);
    emitters.push({ x: BXc + 8, y: 38, z: BZc - 9, kind: "steam", size: 5 });
    // open-front fuel shed with chips inside, chip heaps and log stacks outside
    const sx = 30, sz = 60;
    for (const dx of [-12, -4, 4, 12]) add(new THREE.BoxGeometry(0.6, 9, 0.6).translate(0, 4.5, 0), darkSteel, sx + dx, 0, sz + 6);
    add(new THREE.BoxGeometry(26, 9, 0.6).translate(0, 4.5, 0), std(0xffffff, 0.6, 0.2, { map: claddingTex(103, { base: "#b7b1a4", rx: 3 }) }), sx, 0, sz - 6);
    const roof = add(new THREE.BoxGeometry(27, 0.5, 14), std(0x8d9196, 0.5, 0.5), sx, 9.6, sz); roof.rotation.x = -0.08;
    const chips = std(0xffffff, 0.98, 0, { map: canvasTex(128, 128, (ctx, w, h) => {
      const rr = mulberry32(104); grain(ctx, w, h, "#8a7458", 46, rr);
      for (let i = 0; i < 500; i++) { ctx.fillStyle = rr() < 0.5 ? "rgba(190,165,125,.55)" : "rgba(70,55,38,.55)"; ctx.fillRect(rr() * w, rr() * h, 1 + rr() * 3, 1 + rr() * 2); }
    }, 4, 4) });
    const heap = (x, z, rad, h, seed) => {
      const geo = new THREE.ConeGeometry(rad, h, 40, 6);
      geo.translate(0, h / 2, 0);
      const p = geo.attributes.position, nz = makeNoise(seed);
      for (let i = 0; i < p.count; i++) { const k = 1 + (nz(p.getX(i) * 0.5, p.getZ(i) * 0.5) - 0.5) * 0.35; const yy = p.getY(i); p.setXYZ(i, p.getX(i) * k, Math.min(yy, h * 0.86) * (0.92 + (k - 1) * 0.6), p.getZ(i) * k); }
      geo.computeVertexNormals(); add(geo, chips, x, 0, z);
    };
    heap(sx - 5, sz - 1, 7, 6, 1); heap(sx + 6, sz, 6, 5, 2); heap(sx + 4, sz + 13, 6, 4, 3);
    const logMat = std(0xffffff, 0.9, 0, { map: canvasTex(64, 64, (ctx, w, h) => grain(ctx, w, h, "#8a6a4a", 40, mulberry32(105))) });
    const logEnd = std(0xd8b98c, 0.9);
    for (let layer = 0; layer < 3; layer++) for (let i = 0; i < 6 - layer; i++) {
      const l = add(new THREE.CylinderGeometry(0.6, 0.6, 12, 10).rotateX(Math.PI / 2), [logMat, logEnd, logEnd], 82 + i * 1.25 + layer * 0.62, 0.6 + layer * 1.05, 62);
      l.material = [logMat, logEnd, logEnd];
    }
    // conveyor from the shed to the boiler hall
    const a = new THREE.Vector3(sx + 10, 3, sz - 4), b = new THREE.Vector3(BXc - 10, 18, BZc + 3);
    const gal = new THREE.Mesh(new THREE.BoxGeometry(a.distanceTo(b), 1.8, 1.8), std(0xffffff, 0.6, 0.4, { map: trussTex(106, { base: "#9aa1a7", panels: 10 }) }));
    gal.position.copy(a.clone().add(b).multiplyScalar(0.5));
    gal.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), b.clone().sub(a).normalize());
    gal.castShadow = true; group.add(gal);
    for (let k = 1; k < 3; k++) { const p = a.clone().lerp(b, k / 3); add(new THREE.BoxGeometry(0.5, p.y - 0.9, 0.5).translate(0, (p.y - 0.9) / 2, 0), darkSteel, p.x, 0, p.z); }
    // a log truck
    const tg = new THREE.Group(); tg.position.set(52, 0, 74); tg.rotation.y = 0.1; group.add(tg);
    add(new THREE.BoxGeometry(2.4, 2.4, 2.4).translate(0, 1.7, 0), std(0xb53d2f, 0.5, 0.3), -5, 0, 0, tg);
    add(new THREE.BoxGeometry(8, 0.5, 2.4).translate(0, 1.1, 0), darkSteel, 0.6, 0, 0, tg);
    for (let i = 0; i < 5; i++) add(new THREE.CylinderGeometry(0.45, 0.45, 7.5, 8).rotateZ(Math.PI / 2), [logMat, logEnd, logEnd], 0.6, 1.8 + (i % 2) * 0.8, -0.9 + (i % 3) * 0.9, tg);
    for (const wx of [-5, -1, 3]) for (const wz of [-1.2, 1.2]) add(new THREE.CylinderGeometry(0.6, 0.6, 0.5, 12).rotateX(Math.PI / 2), std(0x1c1d1f, 0.9), wx, 0.6, wz, tg);
  }

  /* ---- geothermal: a single small well ------------------------------------------
     Geothermal is close to 0% of Australian generation (the small Birdsville
     plant was the only one in operation), so it is shown as one modest well
     head with a wisp of steam rather than a full plant. */
  {
    const GX = 84, GZ = -48;
    add(new THREE.BoxGeometry(7, 0.5, 7), std(0xa9a397, 0.95), GX, 0.25, GZ);                         // concrete cellar slab
    add(new THREE.CylinderGeometry(0.6, 0.6, 3.6, 12).translate(0, 1.8, 0), std(0x2f6b4f, 0.5, 0.4), GX, 0.5, GZ);   // casing and valve tree
    add(new THREE.CylinderGeometry(0.9, 0.9, 0.5, 12), std(0x2f6b4f, 0.5, 0.4), GX, 2.2, GZ);
    add(new THREE.TorusGeometry(0.8, 0.14, 6, 16).rotateX(Math.PI / 2), std(0xb63c2d, 0.5, 0.3), GX, 3.4, GZ);
    const pipe = add(new THREE.CylinderGeometry(0.45, 0.45, 10, 10).rotateZ(Math.PI / 2), std(0xdfe3e6, 0.3, 0.85), GX + 6, 1.6, GZ);
    for (const dx of [3, 9]) add(new THREE.BoxGeometry(0.4, 1.4, 1).translate(0, 0.7, 0), darkSteel, GX + dx, 0, GZ);
    add(new THREE.BoxGeometry(3.4, 2.4, 2.6).translate(0, 1.2, 0), std(0xffffff, 0.6, 0.2, { map: claddingTex(113, { base: "#e2e0da" }) }), GX + 12.5, 0, GZ);   // small skid hut
    emitters.push({ x: GX, y: 4, z: GZ, kind: "steam", size: 2.5 });
  }

  /* ---- gravel roads and trees ------------------------------------------------------ */
  const gravel = std(0xffffff, 1, 0, { map: canvasTex(128, 32, (ctx, w, h) => grain(ctx, w, h, "#bdb4a0", 40, r), 8, 1) });
  add(new THREE.BoxGeometry(250, 0.2, 5), gravel, -12, 0.1, 18);
  add(new THREE.BoxGeometry(5, 0.2, 60), gravel, 50, 0.1, -12);
  const treeSpots = [
    [-136, -48], [-96, -82], [24, -66], [-144, 40], [-142, 72], [-36, 82], [-20, 72],
    [8, 40], [16, 60], [-8, 30], [100, 10], [104, 30], [110, -6], [40, 84], [92, 82], [118, -86], [60, -86], [-48, 4], [-62, -10],
    [-140, -10], [20, -30], [14, 8], [70, -30], [104, -40], [96, -70], [62, -62],
  ];
  treeSpots.forEach(([x, z], i) => gumTree(x, z, 1.15 + ((i * 37) % 10) / 14, 1000 + i));

  /* v.windFrac and v.solarFrac run 0..1 from the 2005 value to the series
     maximum. Turbine 1 stands in 2005; the other seven rise in step with
     wind output. The 42 tracker sections fill in step with solar output. */
  const ease = (x) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  function pose(t, v = { windFrac: 1, solarFrac: 1 }) {
    const nT = 1 + (turbines.length - 1) * v.windFrac;
    turbines.forEach((tb, i) => {
      const k = i === 0 ? 1 : ease(clamp((nT - i) * 1.4));
      tb.g.scale.setScalar(tb.s * Math.max(k, 1e-4)); tb.g.visible = k > 0.002;
      tb.rotor.rotation.z = tb.rotor.userData.phase + t * 1.6 * k;
    });
    const nS = solarSegs.length * v.solarFrac;
    solarSegs.forEach((sg, i) => {
      const k = ease(clamp((nS - i) * 1.2));
      sg.scale.set(1, Math.max(k, 1e-4), 1); sg.visible = k > 0.002;
    });
  }
  return { group, emitters, pose };
}
