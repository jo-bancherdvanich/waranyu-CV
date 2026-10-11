/* Step 5: the forecast as a chart standing in the landscape.
 *
 * A glowing line rises over the paddocks through the real yearly figures
 * (2005–2024), then continues as a dashed trend line to 2035 inside a
 * translucent band for the 95% prediction interval. Year posts stand at
 * each year; the ones for the forecast are dashed.
 *
 * buildForecast({ years, values, fit, x0, x1, z, yScale, floorAt }) builds
 * the group; set(reveal) reveals it up to the year `reveal` (fractional),
 * cutting everything east of that year with a shader clip.
 */
import * as THREE from "three";

/* the inverse normal CDF (Acklam), for spreading the bundle's threads */
function invNorm(p) {
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  if (p < pl) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - pl) return -invNorm(1 - p);
  const q = p - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

export function buildForecast({ years, values, fit, x0, x1, z, yScale, floorAt, share = null, colorHist = 0x7ad7ff, colorFc = 0xffcf8f }) {
  const group = new THREE.Group();
  const Y0 = years[0], Y1 = 2035;
  const X = (y) => x0 + ((y - Y0) / (Y1 - Y0)) * (x1 - x0);
  const base = floorAt(X(2020), z) + 6;                       // one flat floor for the whole chart
  const H = (v) => base + v * yScale;
  const reveal = { value: X(Y0) };
  const clipped = (mat) => {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uReveal = reveal;
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nvarying float vWx;")
        .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\n vWx = (modelMatrix * vec4(transformed, 1.0)).x;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vWx; uniform float uReveal;")
        .replace("#include <clipping_planes_fragment>", "if (vWx > uReveal) discard;\n#include <clipping_planes_fragment>");
    };
    return mat;
  };
  const tube = (pts, radius, color, intensity = 1.6) => {
    const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal", 0.5);
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, pts.length * 8, radius, 10, false),
      clipped(new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4, toneMapped: true })));
    m.castShadow = true; group.add(m); return m;
  };

  /* the history: a bright tube through every year's value, and a soft wall
     under it so the shape reads against the paddocks */
  const hist = years.map((y, i) => new THREE.Vector3(X(y), H(values[i]), z));
  tube(hist, 4.5, colorHist);
  {
    const pos = [], idx = [];
    hist.forEach((p, i) => { pos.push(p.x, base, p.z, p.x, p.y, p.z); if (i) idx.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i - 1, 2 * i + 1, 2 * i); });
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    group.add(new THREE.Mesh(g, clipped(new THREE.MeshBasicMaterial({ color: colorHist, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }))));
  }
  // posts at each year
  const postMat = clipped(new THREE.MeshStandardMaterial({ color: 0xe8eef4, roughness: 0.6 }));
  for (const [i, y] of years.entries()) {
    const h = values[i] * yScale;
    const p = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, h, 8).translate(0, h / 2, 0), postMat);
    p.position.set(X(y), base, z); p.castShadow = true; group.add(p);
  }

  /* the forecast: a dashed tube along the trend and a translucent band
     between the upper and lower prediction limits */
  const fc = [], up = [], lo = [];
  for (let y = 2024; y <= Y1 + 1e-6; y += 0.5) {
    fc.push(new THREE.Vector3(X(y), H(fit.at(y)), z));
    up.push(new THREE.Vector3(X(y), H(fit.at(y) + fit.pi(y)), z)); lo.push(new THREE.Vector3(X(y), H(fit.at(y) - fit.pi(y)), z));
  }
  // dashes: short tubes along the trend
  for (let y = 2024; y < Y1; y += 0.6) {
    const a = new THREE.Vector3(X(y), H(fit.at(y)), z), b = new THREE.Vector3(X(y + 0.36), H(fit.at(y + 0.36)), z);
    tube([a, a.clone().lerp(b, 0.5), b], 4.2, colorFc, 1.4);
  }
  {
    const pos = [], idx = [];
    up.forEach((p, i) => { pos.push(lo[i].x, lo[i].y, lo[i].z, p.x, p.y, p.z); if (i) idx.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i - 1, 2 * i + 1, 2 * i); });
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    group.add(new THREE.Mesh(g, clipped(new THREE.MeshBasicMaterial({ color: 0x2a1c06, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }))));
    // thin edges on the band
    tube(up, 2.2, colorFc, 1.2); tube(lo, 2.2, colorFc, 1.2);
  }
  /* the bundle of futures: thin threads fanning out from 2024, spread like
     the prediction distribution (normal quantiles, within the 95% band) */
  {
    const N = 36;
    const thread = clipped(new THREE.MeshBasicMaterial({ color: 0xfff1d2, transparent: true, opacity: 0.85, depthWrite: false }));
    for (let i = 0; i < N; i++) {
      const u = invNorm((i + 0.5) / N) / 1.96;            // -1..1 of the band's half-width
      const pts = [];
      for (let y = 2024; y <= Y1 + 1e-6; y += 0.5) pts.push(new THREE.Vector3(X(y), H(fit.at(y) + u * fit.pi(y)), z + (i % 2 ? 1 : -1) * (Math.abs(u) * 6)));
      const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal", 0.5);
      group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 3.0, 5, false), thread));
    }
  }
  // the end marker at 2035
  const end = new THREE.Mesh(new THREE.SphereGeometry(9, 24, 16), clipped(new THREE.MeshStandardMaterial({ color: colorFc, emissive: colorFc, emissiveIntensity: 2.2 })));
  end.position.set(X(Y1), H(fit.at(Y1)), z); group.add(end);

  // a thin baseline across the whole span, with a tick at each year
  const lineMat = clipped(new THREE.MeshBasicMaterial({ color: 0xf4f7fb, transparent: true, opacity: 0.7 }));
  const bl = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 1.2, 1.2), lineMat); bl.position.set((x0 + x1) / 2, base, z); group.add(bl);
  for (let y = Y0; y <= Y1; y++) {
    const big = (y - Y0) % 5 === 0 || y === Y1;
    const t = new THREE.Mesh(new THREE.BoxGeometry(1.2, big ? 10 : 5, 1.2), lineMat); t.position.set(X(y), base - (big ? 5 : 2.5), z); group.add(t);
  }

  /* the share gauge: a glass column beside 2035, 100% tall, with the 82%
     target as a ring; set(reveal) does not clip it, fill(k) fills it */
  let gauge = null;
  if (share) {
    const GX = X(Y1) + 110, GH = 300, GW = 40;
    const glass = new THREE.Mesh(new THREE.BoxGeometry(GW, GH, GW).translate(0, GH / 2, 0),
      new THREE.MeshPhysicalMaterial({ color: 0xdfeefa, transparent: true, opacity: 0.18, roughness: 0.1, transmission: 0, depthWrite: false }));
    glass.position.set(GX, base, z);
    const fillMesh = new THREE.Mesh(new THREE.BoxGeometry(GW - 4, 1, GW - 4).translate(0, 0.5, 0),
      new THREE.MeshStandardMaterial({ color: colorFc, emissive: colorFc, emissiveIntensity: 0.9, roughness: 0.4 }));
    fillMesh.position.set(GX, base, z); fillMesh.castShadow = true;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(GW * 0.78, 1.6, 8, 40).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xf4f7fb }));
    ring.position.set(GX, base + (share.target / 100) * GH, z);
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(GW + 16, 4, GW + 16), new THREE.MeshStandardMaterial({ color: 0x5b636d, roughness: 0.6 }));
    plinth.position.set(GX, base + 2, z);
    const gg = new THREE.Group(); gg.add(plinth, fillMesh, ring, glass); gg.visible = false; group.add(gg);
    gauge = {
      target: share.target,
      at: (pct) => new THREE.Vector3(GX, base + (pct / 100) * GH, z),
      set: (k) => { gg.visible = k > 0; fillMesh.scale.y = Math.max(0.001, (share.value * k / 100) * GH); },
    };
  }
  const point = (y, v) => new THREE.Vector3(X(y), H(v), z);
  return { group, X, H, base, point, gauge, set: (y) => { reveal.value = X(y); } };
}
