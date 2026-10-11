/* The "two sides" studio scene: renewable models on the left, coal and gas
 * plants on the right, a bar beside each that rises or falls with the
 * renewable and non-renewable share of Australian electricity each year.
 *
 * The models are symbols, not scale models. The bar heights are data:
 * left = renewable share of generation; right = the rest (100 - share).
 */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { build as buildCoalPlant } from "./models/coal-plant.js";
import { addBackdrop } from "./models/backdrop.js";
import { build as buildRenewable } from "./models/renewable.js";
import { build as buildGasOil } from "./models/gas-oil.js";

export const SOURCES = [
  { key: "hydro", label: "Hydro", color: "#5fb8f0" },
  { key: "biomass", label: "Biomass", color: "#8fcf62" },
  { key: "wind", label: "Wind", color: "#62d6b4" },
  { key: "solar", label: "Solar", color: "#f6b84a" },
  { key: "geothermal", label: "Geothermal", color: "#ff8a7a" },
];
export const FOSSIL_COLOR = "#5f646c";
export const RENEW_COLOR = "#1fae6e";
const BAR_SCALE = 1.25;           // scene units per percentage point
const LEFT_BAR = new THREE.Vector3(-58, 0, 52), RIGHT_BAR = new THREE.Vector3(58, 0, 52);

/* opts.inline: build into a group (no sky, floor or lights of its own) to
   place in another scene, posed by opts.camera; otherwise a whole studio */
export function buildDiorama(renderer, envTexture, lib, opts = {}) {
  const { canvasTex, grain, mulberry32, turbineMat, towerGeo, rotorGeo, panelGeo, postGeo, panelMat, postMat } = lib;
  const scene = opts.inline ? new THREE.Group() : new THREE.Scene();
  const camera = opts.camera || new THREE.PerspectiveCamera(45, 1280 / 720, 2, 6000);   // wide enough to keep both platforms in frame
  const r = mulberry32(101);

  /* backdrop, floor and light */
  if (!opts.inline) {
    scene.environment = envTexture;
    scene.environmentIntensity = 0.18;
    addBackdrop(scene, { floorY: -10, seed: 404 });
    const sun = new THREE.DirectionalLight(0xfff0dc, 2.3);
    sun.position.set(-260, 420, 320); sun.target.position.set(0, 0, 0);
    sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
    Object.assign(sun.shadow.camera, { left: -420, right: 420, top: 300, bottom: -300, near: 50, far: 1400 });
    sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.4; sun.shadow.radius = 2;
    scene.add(sun, sun.target, new THREE.HemisphereLight(0xcfe0f2, 0x8a7a62, 0.4));
  }

  const add = (mesh, x, y, z) => { mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh); return mesh; };
  const std = (color, rough = 0.7, metal = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });

  /* two platforms with bevelled edges */
  function slab(w, d, color, texBase) {
    const shape = new THREE.Shape(), rr = 14;
    shape.moveTo(-w / 2 + rr, -d / 2); shape.lineTo(w / 2 - rr, -d / 2); shape.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + rr);
    shape.lineTo(w / 2, d / 2 - rr); shape.quadraticCurveTo(w / 2, d / 2, w / 2 - rr, d / 2);
    shape.lineTo(-w / 2 + rr, d / 2); shape.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - rr);
    shape.lineTo(-w / 2, -d / 2 + rr); shape.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + rr, -d / 2);
    const g = new THREE.ExtrudeGeometry(shape, { depth: 10, bevelEnabled: true, bevelThickness: 1.5, bevelSize: 1.5, bevelSegments: 2 });
    g.rotateX(-Math.PI / 2).translate(0, -10, 0);
    const m = new THREE.Mesh(g, std(color, 0.95, 0, { map: canvasTex(256, 256, (ctx, w2, h2) => grain(ctx, w2, h2, texBase, 46, r), 0.02) }));
    m.material.map.repeat.set(0.012, 0.012);
    return m;
  }
  add(slab(300, 180, 0x9fb36a, "#c9d6a0"), -195, 0, 0);
  add(slab(300, 180, 0x9a948b, "#cfcac2"), 195, 0, 0);

  /* ---- renewable models (left): built in models/renewable.js ---- */
  const ren = buildRenewable();
  ren.group.position.set(-195, 1.5, 0);
  scene.add(ren.group);

  /* ---- non-renewable models (right) ---- */
  // coal: a detailed station built in its own file (models/coal-plant.js)
  const coal = buildCoalPlant();
  coal.group.position.set(195, 1.5, 0);
  scene.add(coal.group);
  // gas and oil: built in models/gas-oil.js, in the left half of the grey platform
  const gas = buildGasOil();
  gas.group.position.set(195, 1.5, 0);
  scene.add(gas.group);

  /* ---- smoke and steam: sprites that rise and fade, posed from t ---- */
  const puffTex = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const g = c.getContext("2d"), gr = g.createRadialGradient(64, 64, 0, 64, 64, 62);
    gr.addColorStop(0, "rgba(255,255,255,.9)"); gr.addColorStop(0.5, "rgba(255,255,255,.4)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const plumes = [];
  function plume(x, y, z, color, kind, n = 9, rise = 70, size = 18) {
    const sprites = [];
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color, transparent: true, depthWrite: false, fog: true }));
      scene.add(s); sprites.push({ s, off: i / n, drift: (r() - 0.5) * 8 });
    }
    plumes.push({ x, y, z, kind, sprites, rise, size });
  }
  for (const e of coal.emitters) {
    const x = e.x + 195, y = e.y + 1.5, z = e.z;
    if (e.kind === "steam") plume(x, y, z, 0xffffff, "fossil", 12, 90, e.size);   // cooling tower steam
    else plume(x, y, z, 0x8e9095, "fossil", 9, 70, e.size * 2);                   // stack smoke
  }
  for (const e of gas.emitters) plume(e.x + 195, e.y + 1.5, e.z, e.kind === "exhaust" ? 0xb4b6ba : 0x7d7f84, "fossil", 7, 40, e.size * 2.4);
  for (const e of ren.emitters) plume(e.x - 195, e.y + 1.5, e.z, 0xf2f2f2, "geo", 6, 26 + e.size * 4, e.size * 2.2);

  /* ---- the bars ---- */
  const barGeo = new THREE.BoxGeometry(30, 1, 30).translate(0, 0.5, 0);
  const renewBar = new THREE.Mesh(barGeo, new THREE.MeshPhysicalMaterial({ color: RENEW_COLOR, roughness: 0.35, clearcoat: 0.6, emissive: RENEW_COLOR, emissiveIntensity: 0.08 }));
  renewBar.castShadow = true; scene.add(renewBar);
  const fossilBar = new THREE.Mesh(barGeo, new THREE.MeshPhysicalMaterial({ color: FOSSIL_COLOR, roughness: 0.4, clearcoat: 0.5 }));
  fossilBar.castShadow = true; scene.add(fossilBar);
  // bases under the bars (no outline box: the percentage labels give the scale)
  for (const p of [LEFT_BAR, RIGHT_BAR]) add(new THREE.Mesh(new THREE.BoxGeometry(40, 2, 40), std(0x5b636d, 0.5, 0.4)), p.x, 1, p.z);
  // the 2030 target (82%) on the renewable bar: a dashed frame a little wider than the bar
  const TARGET = 82;
  {
    const pts = [[-18, -18], [18, -18], [18, 18], [-18, 18], [-18, -18]].map(([x, z]) => new THREE.Vector3(x, 0, z));
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: 0x0f6b45, dashSize: 3, gapSize: 2 }));
    line.computeLineDistances(); line.position.set(LEFT_BAR.x, 2 + TARGET * BAR_SCALE, LEFT_BAR.z); scene.add(line);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(36, 36).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x1fae6e, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
    plate.position.copy(line.position); scene.add(plate);
  }


  /* ---- pose ---- */
  const tmp = new THREE.Vector3();
  function pose(t, vals) {
    // vals: { renewable %, fossil % (= 100 - renewable), fossilLevel 0..1 }
    renewBar.scale.y = Math.max(vals.renewable * BAR_SCALE, 0.001);
    renewBar.position.set(LEFT_BAR.x, 2, LEFT_BAR.z);
    fossilBar.scale.y = Math.max(vals.fossil * BAR_SCALE, 0.001);
    fossilBar.position.set(RIGHT_BAR.x, 2, RIGHT_BAR.z);

    ren.pose(t, vals);
    gas.pose(t);

    for (const p of plumes) {
      const level = p.kind === "fossil" ? 0.35 + 0.65 * vals.fossilLevel : p.kind === "geo" ? 0.35 : 0.55;
      for (const sp of p.sprites) {
        const k = (t * 0.22 + sp.off) % 1;
        sp.s.position.set(p.x + sp.drift * k + k * 18, p.y + k * p.rise, p.z - k * 6);
        sp.s.scale.setScalar(p.size * (0.6 + k * 1.6));
        sp.s.material.opacity = Math.sin(Math.PI * k) * 0.75 * level;
      }
    }
  }
  function project(v) {
    scene.updateMatrixWorld();
    tmp.copy(v); if (opts.inline) scene.localToWorld(tmp);
    tmp.project(camera);
    return [(tmp.x * 0.5 + 0.5) * 1280, (-tmp.y * 0.5 + 0.5) * 720];
  }
  const tops = (vals) => ({
    left: project(new THREE.Vector3(LEFT_BAR.x, 2 + vals.renewable * BAR_SCALE, LEFT_BAR.z)),
    right: project(new THREE.Vector3(RIGHT_BAR.x, 2 + vals.fossil * BAR_SCALE, RIGHT_BAR.z)),
    leftBase: project(new THREE.Vector3(-195, -12, 92)),
    rightBase: project(new THREE.Vector3(195, -12, 92)),
    target: project(new THREE.Vector3(LEFT_BAR.x - 18, 2 + TARGET * BAR_SCALE, LEFT_BAR.z + 18)),
    marks: [25, 50, 75, 100].map((l) => [l, project(new THREE.Vector3(0, 2 + l * BAR_SCALE, LEFT_BAR.z + 15.5))]),
  });
  const noAO = [];
  scene.traverse((o) => { if (o.isSprite || o.isLine || (o.material && !Array.isArray(o.material) && (o.material.alphaTest > 0 || o.material.transparent))) noAO.push(o); });
  return { scene, camera, pose, tops, noAO };
}
