/* Gum trees for instancing, after paddock eucalypts: a pale, slightly
 * leaning trunk that forks into two or three limbs, with the foliage in
 * loose, separate clumps near the limb tips rather than one round crown,
 * so sky shows through the canopy. Each clump is three crossed leaf cards
 * with an alpha-tested leaf texture; their normals point out of the crown
 * so the clumps shade like a volume.
 *
 * makeGumTrees(seed, n) returns n variants, each { trunkGeo, leafGeo } in
 * metres (about 10–13 m tall, origin at the ground), plus the shared
 * materials { barkMat, leafMat, leafDepth }. Instance both geometries with
 * the same matrix; give the leaf mesh customDepthMaterial = leafDepth so
 * its shadow has holes too.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { mulberry32, canvasTex, grain } from "./kit.js";

export function makeGumTrees(seed = 55, n = 3) {
  // leaves: a sprig of long, drooping leaves, lighter towards the tips
  const leafTex = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 256;
    const ctx = c.getContext("2d"), rr = mulberry32(seed);
    for (let i = 0; i < 640; i++) {
      const x = 128 + (rr() - 0.5) * 200, y = 30 + rr() * 200, a = Math.PI / 2 + (rr() - 0.5) * 1.1;
      const l = 16 + rr() * 24, g = 104 + rr() * 60, k = rr();
      ctx.strokeStyle = `rgb(${g - 18 + k * 22},${g + 6},${g - 34})`;        // grey-green, as gum leaves are ctx.lineWidth = 3.2 + rr() * 3.0; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + 5, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  })();
  const leafMat = new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: 0.32, side: THREE.DoubleSide, roughness: 0.9, color: 0xd4dcb8 });
  const leafDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: leafTex, alphaTest: 0.32 });
  // bark: smooth and pale, with grey and tan streaks where the old bark has shed
  const barkMat = new THREE.MeshStandardMaterial({ roughness: 0.9, map: canvasTex(64, 256, (ctx, w, h) => {
    const rr = mulberry32(seed + 11); grain(ctx, w, h, "#d9d1c0", 18, rr);
    for (let i = 0; i < 46; i++) { ctx.fillStyle = rr() < 0.5 ? "rgba(150,135,110,.45)" : "rgba(118,122,118,.38)"; ctx.fillRect(rr() * w, rr() * h, 2 + rr() * 8, 10 + rr() * 70); }
  }, 1, 1) });

  const Y = new THREE.Vector3(0, 1, 0);
  const limb = (from, dir, len, r0, r1) => {
    const g = new THREE.CylinderGeometry(r1, r0, len, 7).translate(0, len / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(Y, dir.clone().normalize());
    return g.applyQuaternion(q).translate(from.x, from.y, from.z);
  };
  const variants = [];
  for (let v = 0; v < n; v++) {
    const rr = mulberry32(seed + 100 + v * 7);
    const trunks = [], cards = [];
    // trunk: two stacked segments with a slight lean, so it is not a straight pipe
    const lean = new THREE.Vector3((rr() - 0.5) * 0.25, 1, (rr() - 0.5) * 0.25);
    const h1 = 2.6 + rr() * 1.4, h2 = 1.4 + rr() * 1.2;
    const top1 = lean.clone().normalize().multiplyScalar(h1);
    trunks.push(limb(new THREE.Vector3(0, -0.3, 0), lean, h1 + 0.3, 0.6, 0.44));
    const lean2 = lean.clone().add(new THREE.Vector3((rr() - 0.5) * 0.3, 0, (rr() - 0.5) * 0.3));
    const fork = top1.clone().add(lean2.clone().normalize().multiplyScalar(h2));
    trunks.push(limb(top1, lean2, h2 + 0.2, 0.44, 0.34));
    // limbs from the fork, each carrying its clumps
    const nb = 2 + Math.floor(rr() * 2), tips = [];
    for (let i = 0; i < nb; i++) {
      const a = (i / nb) * 6.28 + rr() * 1.2, spread = 0.55 + rr() * 0.4, len = 3.6 + rr() * 2.8;
      const dir = new THREE.Vector3(Math.cos(a) * Math.sin(spread), Math.cos(spread), Math.sin(a) * Math.sin(spread));
      trunks.push(limb(fork, dir, len, 0.34, 0.14));
      const tip = fork.clone().addScaledVector(dir, len);
      tips.push(tip);
      // a secondary branch off each limb
      const a2 = a + (rr() - 0.5) * 2.4, s2 = spread + 0.55, len2 = 2.4 + rr() * 2.0;
      const dir2 = new THREE.Vector3(Math.cos(a2) * Math.sin(s2), Math.cos(s2), Math.sin(a2) * Math.sin(s2));
      const from2 = fork.clone().addScaledVector(dir, len * (0.45 + rr() * 0.25));
      trunks.push(limb(from2, dir2, len2, 0.17, 0.07));
      tips.push(from2.clone().addScaledVector(dir2, len2));
    }
    const crown = tips.reduce((acc, p) => acc.add(p), new THREE.Vector3()).multiplyScalar(1 / tips.length).add(new THREE.Vector3(0, 0.8, 0));
    // open, wide crown: clumps spread out from each tip, some hanging below it
    for (const tip of tips) for (let k = 0; k < 4; k++) {
      const cen = tip.clone().add(new THREE.Vector3((rr() - 0.5) * 3.6, -0.6 + rr() * 2.2, (rr() - 0.5) * 3.6));
      const size = 3.2 + rr() * 2.4;
      for (let j = 0; j < 3; j++) {
        const g = new THREE.PlaneGeometry(size, size * 0.9).rotateY((j * Math.PI) / 3 + rr()).rotateX((rr() - 0.5) * 0.7).translate(cen.x, cen.y, cen.z);
        const nrm = g.attributes.normal, pp = g.attributes.position;
        for (let i = 0; i < pp.count; i++) {
          const d = new THREE.Vector3(pp.getX(i), pp.getY(i), pp.getZ(i)).sub(crown).normalize();
          nrm.setXYZ(i, d.x, d.y, d.z);
        }
        cards.push(g);
      }
    }
    variants.push({ trunkGeo: mergeGeometries(trunks), leafGeo: mergeGeometries(cards) });
  }
  return { variants, barkMat, leafMat, leafDepth };
}

/* Instance `pts` ({ x, y, z, s, rot, hue? }) into a scene, spread across the
   variants. Returns the meshes (trunks and leaves) that were added. */
export function plantGumTrees(scene, pts, trees, { tint = null } = {}) {
  const { variants, barkMat, leafMat, leafDepth } = trees;
  const groups = variants.map(() => []);
  pts.forEach((p, i) => groups[i % variants.length].push(p));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color(), out = [];
  variants.forEach((v, k) => {
    const list = groups[k]; if (!list.length) return;
    const trunk = new THREE.InstancedMesh(v.trunkGeo, barkMat, list.length);
    const leaves = new THREE.InstancedMesh(v.leafGeo, leafMat, list.length);
    leaves.customDepthMaterial = leafDepth;
    list.forEach((p, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rot || 0);
      m.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(p.s, p.s * (p.sy || 1), p.s));
      trunk.setMatrixAt(i, m); leaves.setMatrixAt(i, m);
      if (tint) { tint(c, p, i); leaves.setColorAt(i, c); }
    });
    trunk.castShadow = trunk.receiveShadow = true; leaves.castShadow = true;
    scene.add(trunk, leaves); out.push(trunk, leaves);
  });
  return out;
}
