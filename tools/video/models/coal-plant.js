/* Coal-fired power station, after Australian stations such as Bayswater
 * (NSW) and Loy Yang (Vic):
 *  - hyperbolic concrete cooling towers standing on a ring of slanted legs,
 *    with a pond at the base and pour lines and rain streaks on the shell
 *  - a tall clad boiler house with a lower, windowed turbine hall in front
 *  - electrostatic precipitators (dust filters) on legs with hoppers below,
 *    joined by ducts to a tall concrete stack with red and white bands
 *  - an enclosed conveyor gallery on trestles from the coal yard to the top
 *    of the boiler house; a stacker-reclaimer on rails beside the stockpile
 *  - a transformer yard, a pipe rack, roads and a few vehicles for scale
 *
 * Local units: the studio's diorama units (about 1.8 m each). The origin is
 * the centre of the grey platform, y = 0 its top surface. The returned
 * emitters are where steam and smoke should rise from.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { mulberry32, makeNoise, std, concreteTex, claddingTex, windowsTex, coalTex, trussTex, canvasTex, grain } from "./kit.js";

/* cooling tower shell: warm grey concrete, faint pour lifts, a damp dark
   band under the rim and long rain streaks running down from it */
function towerTex(seed) {
  const r = mulberry32(seed), noise = makeNoise(seed);
  return canvasTex(1024, 512, (ctx, w, h) => {
    grain(ctx, w, h, "#bfb8ab", 16, r);
    const img = ctx.getImageData(0, 0, w, h), d = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = (noise((x / w) * 9, (y / h) * 4) - 0.5) * 34;
      const i = (y * w + x) * 4; d[i] += k; d[i + 1] += k; d[i + 2] += k * 0.9;
    }
    ctx.putImageData(img, 0, 0);
    ctx.fillStyle = "rgba(60,54,46,.05)"; for (let i = 1; i < 14; i++) ctx.fillRect(0, (i / 14) * h, w, 1);
    const top = ctx.createLinearGradient(0, 0, 0, h * 0.22);
    top.addColorStop(0, "rgba(52,48,42,.55)"); top.addColorStop(1, "rgba(52,48,42,0)");
    ctx.fillStyle = top; ctx.fillRect(0, 0, w, h * 0.22);
    for (let i = 0; i < 260; i++) {
      const x = r() * w, len = h * (0.1 + r() * r() * 0.85), wd = 0.6 + r() * 2.6;
      const g = ctx.createLinearGradient(0, 0, 0, len);
      g.addColorStop(0, `rgba(48,44,38,${0.12 + r() * 0.22})`); g.addColorStop(1, "rgba(48,44,38,0)");
      ctx.fillStyle = g; ctx.fillRect(x, 0, wd, len);
    }
    const bot = ctx.createLinearGradient(0, h * 0.85, 0, h);
    bot.addColorStop(0, "rgba(90,78,60,0)"); bot.addColorStop(1, "rgba(90,78,60,.35)");
    ctx.fillStyle = bot; ctx.fillRect(0, h * 0.85, w, h * 0.15);
  }, 2, 1);
}

export function build() {
  const group = new THREE.Group();
  const r = mulberry32(4401);
  const add = (geo, mat, x = 0, y = 0, z = 0, parent = group) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true; parent.add(m); return m;
  };
  const steel = std(0x7f878e, 0.45, 0.7);
  const darkSteel = std(0x4b5157, 0.5, 0.6);
  const emitters = [];

  /* ---- cooling towers ---------------------------------------------------- */
  // r(y) = throat * sqrt(1 + ((y - yT) / c)^2), legs below y = 6
  const towerMat = std(0xd9d3c7, 0.92, 0, {
    side: THREE.DoubleSide,
    map: towerTex(11),
  });
  function coolingTower(x, z, s = 1) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); group.add(g);
    const throat = 13.5, yT = 52, c = 35.7, y0 = 6, y1 = 72;
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const y = y0 + ((y1 - y0) * i) / 40;
      pts.push(new THREE.Vector2(throat * Math.sqrt(1 + ((y - yT) / c) ** 2), y));
    }
    add(new THREE.LatheGeometry(pts, 72), towerMat, 0, 0, 0, g);
    // thickened rim at the top and a ring beam where the shell meets the legs
    const rTop = pts.at(-1).x, rBase = pts[0].x;
    add(new THREE.TorusGeometry(rTop, 0.55, 8, 72).rotateX(Math.PI / 2), std(0xc7c1b6, 0.9), 0, y1, 0, g);
    add(new THREE.TorusGeometry(rBase, 0.8, 8, 72).rotateX(Math.PI / 2), std(0xbdb7ab, 0.9), 0, y0, 0, g);
    // a ring of V-shaped legs
    const leg = new THREE.BoxGeometry(0.7, 6.6, 0.7).translate(0, 3.3, 0);
    const n = 44, legs = new THREE.InstancedMesh(leg, std(0xc9c3b8, 0.9), n * 2);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    for (let i = 0; i < n; i++) for (let k = 0; k < 2; k++) {
      const a = ((i + k * 0.5) / n) * Math.PI * 2;
      e.set(0, -a, (k ? 1 : -1) * 0.38, "YXZ"); q.setFromEuler(e);
      m.compose(new THREE.Vector3(Math.cos(a) * rBase, 0, Math.sin(a) * rBase), q, new THREE.Vector3(1, 1, 1));
      legs.setMatrixAt(i * 2 + k, m);
    }
    legs.castShadow = legs.receiveShadow = true; g.add(legs);
    // pond: a low wall and dark water, visible through the legs
    add(new THREE.CylinderGeometry(rBase + 2.4, rBase + 2.6, 1.6, 72, 1, true), std(0x8f897e, 0.95, 0, { side: THREE.DoubleSide, map: concreteTex(12, { base: "#a59f93", streak: 0, rx: 6 }) }), 0, 0.8, 0, g);
    add(new THREE.CircleGeometry(rBase + 2.4, 72).rotateX(-Math.PI / 2),
      new THREE.MeshPhysicalMaterial({ color: 0x1f3a46, roughness: 0.2, clearcoat: 0.8 }), 0, 0.9, 0, g);
    // the dark mouth seen from above
    add(new THREE.CircleGeometry(rTop - 0.4, 64).rotateX(-Math.PI / 2), std(0x2b2d2f, 1), 0, y0 + 4, 0, g);
    emitters.push({ x: x, y: y1 * s, z: z, kind: "steam", size: rTop * s * 1.9 });
  }
  coolingTower(62, -46);
  coolingTower(112, -14, 0.92);

  /* ---- boiler house and turbine hall ------------------------------------ */
  const cladA = std(0xffffff, 0.6, 0.25, { map: claddingTex(21, { base: "#c9c5bb", rx: 5, ry: 6, dirt: 0.35 }) });
  const cladB = std(0xffffff, 0.6, 0.25, { map: claddingTex(22, { base: "#6c7278", rx: 4, ry: 1, dirt: 0.2 }) });
  const BX = -2, BZ = -48;
  add(new THREE.BoxGeometry(32, 54, 28).translate(0, 27, 0), cladA, BX, 0, BZ);
  // a darker band at the top, the roof plant and a stair tower with windows
  add(new THREE.BoxGeometry(32.6, 6, 28.6).translate(0, 3, 0), cladB, BX, 48, BZ);
  add(new THREE.BoxGeometry(12, 6, 10).translate(0, 3, 0), cladB, BX - 6, 54, BZ - 4);
  add(new THREE.BoxGeometry(7, 4, 7).translate(0, 2, 0), steel, BX + 9, 54, BZ + 5);
  add(new THREE.BoxGeometry(6, 58, 6).translate(0, 29, 0),
    std(0xffffff, 0.6, 0.2, { map: windowsTex(23, { base: "#cfcbc2", rows: 14, cols: 2, rx: 1, ry: 1, w: 128, h: 1024 }) }), BX - 18.5, 0, BZ + 8);
  // exposed steel columns at the corners and midpoints
  for (const [dx, dz] of [[-16, -14], [16, -14], [-16, 14], [16, 14], [0, 14], [0, -14]])
    add(new THREE.BoxGeometry(1.1, 54.5, 1.1).translate(0, 27.25, 0), darkSteel, BX + dx, 0, BZ + dz);

  const TZ = BZ + 27;
  const hallMat = std(0xffffff, 0.55, 0.25, { map: windowsTex(24, { base: "#d3cfc6", rows: 2, cols: 16, rx: 1, ry: 1 }) });
  add(new THREE.BoxGeometry(58, 26, 26).translate(0, 13, 0), [cladA, cladA, cladB, cladB, hallMat, hallMat], BX + 8, 0, TZ);
  // ribbed roof: a row of shallow pitched bays with a raised ridge vent
  for (let i = 0; i < 6; i++) {
    const shape = new THREE.Shape(); shape.moveTo(-4.8, 0); shape.lineTo(0, 2.2); shape.lineTo(4.8, 0); shape.lineTo(-4.8, 0);
    const bay = new THREE.ExtrudeGeometry(shape, { depth: 26, bevelEnabled: false }).translate(0, 0, -13);
    add(bay, std(0x8a8d8f, 0.6, 0.45), BX + 8 - 24 + i * 9.6, 26, TZ);
  }
  add(new THREE.BoxGeometry(2, 1.6, 26).translate(0, 0.8, 0), darkSteel, BX + 8, 28.2, TZ);

  /* ---- precipitators, ducts and stack ------------------------------------ */
  const espMat = std(0xffffff, 0.65, 0.3, { map: claddingTex(31, { base: "#a7a59e", rib: 12, rx: 2, ry: 2, dirt: 0.45 }) });
  for (const dx of [-9, 9]) {
    const ex = BX + 22 + dx, ez = BZ - 30;
    add(new THREE.BoxGeometry(15, 16, 20).translate(0, 8, 0), espMat, ex, 14, ez);
    for (const hx of [-4, 4]) for (const hz of [-6, 0, 6])
      add(new THREE.ConeGeometry(3.4, 6, 4).rotateX(Math.PI).rotateY(Math.PI / 4), espMat, ex + hx, 11, ez + hz);
    for (const lx of [-7, 7]) for (const lz of [-9.5, 9.5])
      add(new THREE.BoxGeometry(0.9, 14, 0.9).translate(0, 7, 0), darkSteel, ex + lx, 0, ez + lz);
  }
  // gas duct from the boiler to the filters, and from the filters to the stack
  add(new THREE.BoxGeometry(5, 5, 18), steel, BX + 13, 38, BZ - 18);
  add(new THREE.BoxGeometry(5, 5, 9), steel, BX + 22, 25, BZ - 18).rotation.x = 0;
  const SX = BX + 42, SZ = BZ - 36;
  add(new THREE.BoxGeometry(14, 4.5, 4.5), steel, SX - 9, 22, SZ + 4);

  const stackMat = std(0xffffff, 0.9, 0, {
    map: canvasTex(256, 1024, (ctx, w, h) => {
      const rr = mulberry32(41); grain(ctx, w, h, "#cdc7bd", 18, rr);
      ctx.fillStyle = "rgba(70,62,52,.12)"; for (let i = 1; i < 30; i++) ctx.fillRect(0, (i / 30) * h, w, 1.5);
      // aviation bands and soot near the top
      const bands = ["#c23a30", "#f2efe9", "#c23a30", "#f2efe9", "#c23a30"];
      bands.forEach((col, i) => { ctx.fillStyle = col; ctx.fillRect(0, i * h * 0.024, w, h * 0.024); });
      const g = ctx.createLinearGradient(0, 0, 0, h * 0.2); g.addColorStop(0, "rgba(20,20,20,.65)"); g.addColorStop(1, "rgba(20,20,20,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h * 0.2);
      for (let i = 0; i < 40; i++) { ctx.fillStyle = `rgba(55,50,44,${0.05 + rr() * 0.1})`; ctx.fillRect(rr() * w, 0, 1 + rr() * 3, h * (0.1 + rr() * 0.5)); }
    }, 2, 1),
  });
  add(new THREE.CylinderGeometry(3.0, 4.6, 112, 32, 1).translate(0, 56, 0), stackMat, SX, 0, SZ);
  add(new THREE.CylinderGeometry(4.6, 4.6, 0.6, 32), darkSteel, SX, 100, SZ);           // service platform
  add(new THREE.CylinderGeometry(4.65, 4.65, 1.2, 32, 1, true), std(0x56595e, 0.5, 0.6, { wireframe: false, side: THREE.DoubleSide, transparent: true, opacity: 0.55 }), SX, 101, SZ);
  add(new THREE.CylinderGeometry(4.0, 4.0, 0.5, 32), darkSteel, SX, 76, SZ);
  emitters.push({ x: SX, y: 112, z: SZ, kind: "smoke", size: 7 });

  /* ---- coal yard --------------------------------------------------------- */
  const noise = makeNoise(77);
  const coalMat = std(0xffffff, 0.86, 0, { map: coalTex(5, 10, 4), vertexColors: true });
  /* a windrow: triangular cross-section with a rounded ridge, tapered ends,
     lumpy surface, and lighter dusty grey towards the toe */
  function pile(x, z, len, halfW, h, seed) {
    const nx = 120, nz = 36, geo = new THREE.PlaneGeometry(len, halfW * 2.4, nx, nz).rotateX(-Math.PI / 2);
    const p = geo.attributes.position, col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const px = p.getX(i), pz = p.getZ(i);
      const u = Math.abs(px) / (len / 2), v = Math.abs(pz) / halfW;
      const end = Math.max(0, 1 - Math.max(0, u - 0.55) / 0.45) ** 0.8;
      let y = h * Math.max(0, 1 - v) ** 1.25 * Math.min(1, end * 1.2);
      y = Math.min(y, h * 0.93) * (1 + (noise(px * 0.35 + seed, pz * 0.35) - 0.5) * 0.35);
      y += (noise(px * 1.4, pz * 1.4 + seed) - 0.5) * 0.5;
      p.setY(i, Math.max(y, -0.2));
      const dust = Math.min(1, Math.max(0, 1 - y / (h * 0.45)));
      const c = 0.9 + dust * 1.1 + (noise(px * 0.8, pz * 0.8 + 3) - 0.5) * 0.5;
      col.set([c, c, c * 1.02], i * 3);
    }
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    add(geo, coalMat, x, 0, z);
    // coal dust staining the ground around the pile
    const stain = canvasTex(256, 128, (ctx, w, hh) => {
      const g = ctx.createRadialGradient(w / 2, hh / 2, 0, w / 2, hh / 2, w / 2);
      g.addColorStop(0, "rgba(28,28,30,.85)"); g.addColorStop(0.55, "rgba(35,34,33,.5)"); g.addColorStop(1, "rgba(40,38,36,0)");
      ctx.setTransform(1, 0, 0, 0.5, 0, hh / 4); ctx.fillStyle = g; ctx.fillRect(0, 0, w, w);
    });
    const ap = new THREE.Mesh(new THREE.PlaneGeometry(len * 1.25, halfW * 4.4).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ map: stain, transparent: true, depthWrite: false, roughness: 1 }));
    ap.position.set(x, 0.08, z); ap.receiveShadow = true; group.add(ap);
  }
  pile(92, 50, 88, 11, 10, 3);
  pile(96, 78, 64, 7, 6, 8);
  // stacker-reclaimer on two rails between the piles
  for (const dz of [-1.2, 1.2]) add(new THREE.BoxGeometry(110, 0.5, 0.5), darkSteel, 92, 0.25, 64 + dz);
  {
    const sx = 76, sz = 64;
    add(new THREE.BoxGeometry(8, 5, 6).translate(0, 2.5, 0), std(0xd9b43a, 0.6, 0.3), sx, 0.5, sz);      // yellow machine body
    add(new THREE.BoxGeometry(3, 3, 3).translate(0, 1.5, 0), std(0xc9cfd4, 0.5, 0.3), sx - 2, 5.5, sz + 1.5);
    const boom = add(new THREE.BoxGeometry(34, 1.6, 1.6), std(0xffffff, 0.55, 0.5, { map: trussTex(51, { base: "#d6b13c", panels: 10 }) }), sx + 14, 7, sz - 3);
    boom.rotation.y = 0.25; boom.rotation.z = -0.12;
    add(new THREE.CylinderGeometry(3, 3, 1, 16).rotateX(Math.PI / 2), std(0xc9a531, 0.6, 0.4), sx + 30, 4, sz - 7.5);
    add(new THREE.BoxGeometry(14, 1, 1), darkSteel, sx + 6, 11, sz).rotation.z = 0.5;
  }
  // transfer tower and the enclosed conveyor up to the boiler house
  add(new THREE.BoxGeometry(7, 22, 7).translate(0, 11, 0), cladB, 58, 0, 34);
  {
    const a = new THREE.Vector3(58, 20, 34), b = new THREE.Vector3(BX + 14, 46, BZ + 6);
    const len = a.distanceTo(b), mid = a.clone().add(b).multiplyScalar(0.5);
    const gal = new THREE.Mesh(new THREE.BoxGeometry(len, 3.6, 3.6),
      std(0xffffff, 0.6, 0.4, { map: trussTex(52, { base: "#9ba3aa", panels: 18 }) }));
    gal.position.copy(mid);
    gal.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), b.clone().sub(a).normalize());
    gal.castShadow = gal.receiveShadow = true; group.add(gal);
    for (let k = 1; k < 5; k++) {
      const p = a.clone().lerp(b, k / 5);
      add(new THREE.BoxGeometry(1, p.y - 1.8, 1).translate(0, (p.y - 1.8) / 2, 0), darkSteel, p.x, 0, p.z);
    }
  }

  /* ---- transformers, pipe rack, roads and vehicles ----------------------- */
  for (let i = 0; i < 3; i++) {
    const tx = BX + 44 + i * 9, tz = TZ + 4;
    add(new THREE.BoxGeometry(6, 5, 4.5).translate(0, 2.5, 0), std(0x6c7a6e, 0.55, 0.3), tx, 0, tz);
    for (let f = 0; f < 6; f++) add(new THREE.BoxGeometry(0.25, 4, 2.6).translate(0, 2, 0), std(0x5f6c62, 0.5, 0.4), tx - 3.6, 0.4, tz - 1.6 + f * 0.65);
    for (let k = -1; k <= 1; k++) add(new THREE.CylinderGeometry(0.3, 0.45, 2.2, 8).translate(0, 1.1, 0), std(0x8c5a3c, 0.4, 0.1), tx + k * 1.6, 5, tz);
    add(new THREE.BoxGeometry(7, 0.4, 5.5), std(0x9a958c, 0.95), tx, 0.2, tz);
  }
  // pipe rack from the turbine hall to the towers
  for (let k = 0; k < 6; k++) add(new THREE.BoxGeometry(0.6, 6, 6).translate(0, 3, 0), darkSteel, 34 + k * 10, 0, -22 + k * 2);
  for (const dy of [5.2, 6.4]) {
    const p = add(new THREE.CylinderGeometry(0.75, 0.75, 54, 12).rotateZ(Math.PI / 2), std(0x9aa0a5, 0.4, 0.75), 59, dy, -17);
    p.rotation.y = -0.2;
  }
  // roads (darker asphalt strips) and a few vehicles for scale
  const asphalt = std(0xffffff, 0.95, 0, { map: canvasTex(256, 64, (c, w, h) => grain(c, w, h, "#55585b", 30, r), 6, 1) });
  add(new THREE.BoxGeometry(150, 0.25, 7), asphalt, 40, 0.13, 30);
  add(new THREE.BoxGeometry(7, 0.25, 70), asphalt, 40, 0.14, -4);
  const car = (x, z, col, rot = 0) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; group.add(g);
    add(new THREE.BoxGeometry(2.6, 0.8, 1.2).translate(0, 0.6, 0), std(col, 0.35, 0.4), 0, 0, 0, g);
    add(new THREE.BoxGeometry(1.4, 0.6, 1.1).translate(0, 1.3, 0), std(0x2a3036, 0.2, 0.3), -0.2, 0, 0, g);
  };
  car(18, 33, 0xe8e6e1); car(23, 33, 0x3b5b8a); car(28, 27, 0xb33a2e, Math.PI);
  // a haul truck by the stockpile
  {
    const g = new THREE.Group(); g.position.set(62, 0, 56); g.rotation.y = 0.4; group.add(g);
    add(new THREE.BoxGeometry(5.5, 2.2, 2.6).translate(0, 1.7, 0), std(0xd8b434, 0.6, 0.2), 0.8, 0, 0, g);
    add(new THREE.BoxGeometry(2, 2, 2.4).translate(0, 1.6, 0), std(0xd8b434, 0.6, 0.2), -2.8, 0, 0, g);
    for (const [wx, wz] of [[-2.6, 1.2], [-2.6, -1.2], [1.6, 1.2], [1.6, -1.2]])
      add(new THREE.CylinderGeometry(0.75, 0.75, 0.6, 12).rotateX(Math.PI / 2), std(0x1c1d1f, 0.9), wx, 0.75, wz, g);
  }

  return { group, emitters };
}
