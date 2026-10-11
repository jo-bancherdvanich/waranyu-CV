/* Step 3: the five renewable sources side by side, as a 3D bar race.
 *
 * Each source stands on its own plinth: a miniature of its model in front
 * and a column behind it whose height is that source's generation in TWh
 * for the year on screen. The plinths are placed by the caller (pose gets
 * an x for each source), so they can slide into a new order whenever one
 * source overtakes another.
 *
 * Column heights are data (TWh, from the project's data); the models are
 * symbols. Local units match the studio scene.
 */
import * as THREE from "three";
import { mulberry32, std } from "./kit.js";
import { makeMinis } from "./minis.js";
import { addBackdrop } from "./backdrop.js";

export const SOURCES = [
  { key: "solar", label: "Solar", color: "#f2b13a" },
  { key: "wind", label: "Wind", color: "#3fbf9b" },
  { key: "hydro", label: "Hydro", color: "#4aa3e0" },
  { key: "biomass", label: "Biomass", color: "#8cc152" },
  { key: "geothermal", label: "Geothermal", color: "#ef7f6d" },
];
export const COL_SCALE = 3.4;          // scene units per TWh
const COL_Z = -12, COL_W = 20;

export function buildLineup(renderer, envTexture) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1280 / 720, 2, 6000);
  const r = mulberry32(777);

  /* the same backdrop as step 2 */
  scene.environment = envTexture; scene.environmentIntensity = 0.18;
  addBackdrop(scene, { floorY: -6, seed: 405 });
  const sun = new THREE.DirectionalLight(0xfff0dc, 2.3);
  sun.position.set(-260, 420, 320); sun.target.position.set(0, 0, 0);
  sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -420, right: 420, top: 320, bottom: -320, near: 50, far: 1400 });
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.4;
  scene.add(sun, sun.target, new THREE.HemisphereLight(0xcfe0f2, 0x8a7a62, 0.4));

  const add = (geo, mat, x = 0, y = 0, z = 0, parent) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true; parent.add(m); return m;
  };
  /* ---- one miniature per source, built around (0, 0, 0) on its plinth top ---- */
  const { minis, spinners, steams } = makeMinis();

  /* ---- icons: each miniature on its own, no plinth or tile --------------------
     Rendered once at load by a small second renderer with a transparent
     background, so the overlay can place the bare model beside its bar. A
     shadow-only floor keeps a soft contact shadow under each model. */
  function makeIcons(dpr) {
    const size = Math.round(220 * dpr);
    const ir = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    ir.setPixelRatio(1); ir.setSize(size, size, false);
    ir.toneMapping = THREE.ACESFilmicToneMapping; ir.toneMappingExposure = 0.62;
    ir.outputColorSpace = THREE.SRGBColorSpace;
    ir.shadowMap.enabled = true; ir.shadowMap.type = THREE.PCFShadowMap;
    ir.setClearColor(0x000000, 0);
    const iconScene = new THREE.Scene();
    const isun = new THREE.DirectionalLight(0xfff0dc, 3.0);
    isun.position.set(-60, 110, 90); isun.castShadow = true; isun.shadow.mapSize.set(1024, 1024);
    Object.assign(isun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 10, far: 400 });
    iconScene.add(isun, new THREE.HemisphereLight(0xdde8f4, 0x8a7a62, 1.1), new THREE.AmbientLight(0xffffff, 0.35));
    const floorShadow = new THREE.Mesh(new THREE.PlaneGeometry(300, 300).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.22 }));
    floorShadow.receiveShadow = true; iconScene.add(floorShadow);
    const icam = new THREE.PerspectiveCamera(30, 1, 1, 2000);
    const icons = {};
    for (const s of SOURCES) {
      const mini = new THREE.Group(); iconScene.add(mini);
      minis[s.key](mini);
      spinners.forEach((ro) => { ro.rotation.z = ro.userData.phase; });
      const box = new THREE.Box3().setFromObject(mini), c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
      const R = Math.max(sz.x, sz.z, sz.y * 1.3) * 0.5 + 2, dist = R / Math.tan((15 * Math.PI) / 180) * 0.95;
      icam.position.set(c.x, c.y + dist * 0.42, c.z + dist * 0.9); icam.lookAt(c);
      ir.render(iconScene, icam);
      const cv = document.createElement("canvas"); cv.width = cv.height = size;
      cv.getContext("2d").drawImage(ir.domElement, 0, 0);
      icons[s.key] = cv;
      iconScene.remove(mini);
    }
    ir.dispose();
    return icons;
  }
  return { scene, camera, makeIcons };
}
