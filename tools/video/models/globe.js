/* The Earth: the opening shot (from space, turning to Australia) and the
 * stage for the country comparison in step 4.
 *
 * The surface is NASA's Blue Marble (January) with NASA's Earth at Night on
 * the dark side, both public domain (see assets/README.md). Coastlines for
 * the country plates come from Natural Earth via the world-atlas package.
 * Clouds, an atmosphere rim and a star field are built in code.
 *
 * pose(t, k): the opening move, k 0..1 over the shot; t drives the clouds.
 * camAt(p, l): any camera, p and l as { lon, lat, r } (r = distance from
 * the centre), for the comparison scene.
 * plate(name, color): a country extruded out of the planet. set(h, fill)
 * raises it h units and fills it from the ground to fill (0..1) of its
 * height; the rest stays as tinted glass.
 * anchor(lon, lat, h): an Object3D standing on the surface, +y outward.
 */
import * as THREE from "three";
import { feature } from "../node_modules/topojson-client/src/index.js";
import { mulberry32, makeNoise } from "./kit.js";

export const R = 100;
/* lon/lat to a point on the sphere, matching SphereGeometry's UV layout */
export function lonLat(lon, lat, r = R) {
  const a = ((lon + 180) / 360) * Math.PI * 2, c = (lat * Math.PI) / 180;
  return new THREE.Vector3(-Math.cos(a) * Math.cos(c) * r, Math.sin(c) * r, Math.sin(a) * Math.cos(c) * r);
}
const smooth = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const ease = (x) => { x = Math.min(1, Math.max(0, x)); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };

export async function buildGlobe(renderer) {
  const land = await (await fetch("node_modules/world-atlas/land-50m.json")).json();
  const countries = await (await fetch("node_modules/world-atlas/countries-50m.json")).json();
  const landGeo = feature(land, land.objects.land);
  const countryGeo = (name) => feature(countries, { type: "GeometryCollection", geometries: countries.objects.countries.geometries.filter((g) => g.properties.name === name) });
  const aus = countryGeo("Australia");

  const TW = 4096, TH = 2048;
  const px = (lon) => ((lon + 180) / 360) * TW, py = (lat) => ((90 - lat) / 180) * TH;
  function trace(ctx, geo) {
    ctx.beginPath();
    for (const f of geo.features || [geo]) {
      const g = f.geometry, polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
      for (const poly of polys) for (const ring of poly) {
        ring.forEach(([lo, la], i) => (i ? ctx.lineTo(px(lo), py(la)) : ctx.moveTo(px(lo), py(la))));
        ctx.closePath();
      }
    }
  }

  /* ---- surface: the photographs, with a soft outline around Australia ---- */
  const loader = new THREE.TextureLoader();
  const [dayImg, nightTex] = await Promise.all([
    new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = "assets/earth-day.jpg"; }),
    loader.loadAsync("assets/earth-night.jpg"),
  ]);
  const col = document.createElement("canvas"); col.width = TW; col.height = TH;
  const cctx = col.getContext("2d");
  cctx.drawImage(dayImg, 0, 0, TW, TH);
  const colorTex = new THREE.CanvasTexture(col); colorTex.colorSpace = THREE.SRGBColorSpace; colorTex.anisotropy = 8;
  nightTex.colorSpace = THREE.SRGBColorSpace; nightTex.anisotropy = 4;

  // the outline lives on its own transparent layer so it can fade out
  const ol = document.createElement("canvas"); ol.width = TW; ol.height = TH;
  const octx = ol.getContext("2d");
  octx.save(); octx.shadowColor = "rgba(122,215,255,.9)"; octx.shadowBlur = 18;
  octx.strokeStyle = "rgba(160,230,255,.95)"; octx.lineWidth = 4; trace(octx, aus); octx.stroke(); octx.restore();
  const outlineTex = new THREE.CanvasTexture(ol); outlineTex.colorSpace = THREE.SRGBColorSpace;

  /* ---- clouds ---- */
  const cl = document.createElement("canvas"); cl.width = 2048; cl.height = 1024;
  const clx = cl.getContext("2d"), ci = clx.createImageData(2048, 1024), cd = ci.data, cn = makeNoise(83), cn2 = makeNoise(97);
  for (let y = 0; y < 1024; y++) for (let x = 0; x < 2048; x++) {
    const u = x / 2048, v = y / 1024, lat = 90 - v * 180;
    const band = 0.55 + 0.45 * Math.cos((lat / 90) * Math.PI * 2.2);
    let a = cn(u * 14, v * 7, 5) * 0.75 + cn2(u * 40, v * 20, 3) * 0.35;
    a = smooth((a * band - 0.42) * 3.2);
    const i = (y * 2048 + x) * 4; cd[i] = cd[i + 1] = cd[i + 2] = 255; cd[i + 3] = a * 215;
  }
  clx.putImageData(ci, 0, 0);
  const cloudTex = new THREE.CanvasTexture(cl); cloudTex.colorSpace = THREE.SRGBColorSpace;

  /* ---- scene ---- */
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x02040a);
  const camera = new THREE.PerspectiveCamera(36, 1280 / 720, 0.5, 20000);
  const SUN_DIR = lonLat(110, 5, 1).normalize();
  const sunView = { value: new THREE.Vector3() };
  // day on the lit side, city lights on the dark side (emissive, masked by the sun)
  const earthMat = new THREE.MeshLambertMaterial({ map: colorTex, emissive: 0xffd9a8, emissiveMap: nightTex, emissiveIntensity: 1.0 });
  earthMat.onBeforeCompile = (sh) => {
    sh.uniforms.sunView = sunView;
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 sunView;")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n totalEmissiveRadiance *= smoothstep(0.08, -0.18, dot(normalize(normal), sunView)) * 1.3;");
  };
  const earth = new THREE.Mesh(new THREE.SphereGeometry(R, 192, 96), earthMat);
  const outline = new THREE.Mesh(new THREE.SphereGeometry(R * 1.002, 128, 64),
    new THREE.MeshBasicMaterial({ map: outlineTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(R * 1.012, 128, 64),
    new THREE.MeshLambertMaterial({ map: cloudTex, transparent: true, depthWrite: false }));
  const rim = new THREE.Mesh(new THREE.SphereGeometry(R * 1.004, 96, 48), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: "varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }",
    fragmentShader: "varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - max(dot(vN, vV), 0.0), 2.2); gl_FragColor = vec4(0.45,0.72,1.0, 1.0) * f * 1.3; }",
  }));
  scene.add(earth, outline, clouds, rim);
  // stars
  {
    const rr = mulberry32(5), pos = [];
    for (let i = 0; i < 2600; i++) {
      const u = rr() * 2 - 1, a = rr() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      pos.push(Math.cos(a) * s * 8000, u * 8000, Math.sin(a) * s * 8000);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xcfe3ff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0.85 })));
  }
  // light: the sun over the Indian Ocean side, so Australia is in daylight
  const sun = new THREE.DirectionalLight(0xfff4e6, 3.4);
  sun.position.copy(SUN_DIR).multiplyScalar(1000); scene.add(sun);
  scene.add(new THREE.AmbientLight(0x6a7c9a, 0.35));

  /* ---- country plates ---------------------------------------------------- */
  /* Each plate is the country's own shape, triangulated in lon/lat, with
     every vertex on the unit sphere. A `top` attribute (0 at the ground, 1
     at the top) lets a shader raise the plate by a uniform height, and the
     same value in the fragment shader fills it from the ground up. */
  const plates = [];
  function plate(name, color) {
    const geo = countryGeo(name);
    const pos = [], nrm = [], top = [], lv = [], idx = [];
    // the fill runs south to north across the shape, so it reads from above like a gauge
    let latMin = 90, latMax = -90;
    for (const f of geo.features) for (const poly of (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates)) for (const [, la] of poly[0]) { latMin = Math.min(latMin, la); latMax = Math.max(latMax, la); }
    const V = (lon, lat, t, n) => { const p = lonLat(lon, lat, 1); pos.push(p.x, p.y, p.z); nrm.push(n.x, n.y, n.z); top.push(t); lv.push((lat - latMin) / (latMax - latMin)); return pos.length / 3 - 1; };
    for (const f of geo.features) {
      const g = f.geometry, polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
      for (const poly of polys) {
        const ring = poly[0].slice(0, -1);
        // skip specks (small islands): the plate reads as the mainland(s)
        let area = 0;
        for (let i = 0; i < ring.length; i++) { const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % ring.length]; area += x1 * y2 - x2 * y1; }
        if (Math.abs(area) / 2 < 0.8) continue;
        const pts = ring.map(([lo, la]) => new THREE.Vector2(lo, la));
        const tris = THREE.ShapeUtils.triangulateShape(pts, []);
        const base = pos.length / 3;
        for (const [lo, la] of ring) V(lo, la, 1, lonLat(lo, la, 1));
        for (const [a, b, c] of tris) idx.push(base + a, base + b, base + c);
        // walls: one quad per edge, with its own outward normal
        const n = ring.length;
        for (let i = 0; i < n; i++) {
          const [lo1, la1] = ring[i], [lo2, la2] = ring[(i + 1) % n];
          const p1 = lonLat(lo1, la1, 1), p2 = lonLat(lo2, la2, 1);
          const e = p2.clone().sub(p1), nn = e.clone().cross(p1).normalize();
          if (area < 0) nn.negate();                                   // ring orientation decides which side is out
          const a = V(lo1, la1, 0, nn), b = V(lo2, la2, 0, nn), c = V(lo2, la2, 1, nn), d = V(lo1, la1, 1, nn);
          idx.push(a, b, c, a, c, d);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute("top", new THREE.Float32BufferAttribute(top, 1));
    g.setAttribute("lv", new THREE.Float32BufferAttribute(lv, 1));
    g.setIndex(idx);
    const u = { uH: { value: 0 }, uFill: { value: 1 }, uGlass: { value: new THREE.Color(0xbfe3ff) } };
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.22, roughness: 0.4, metalness: 0.05, transparent: true, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float top; attribute float lv; varying float vTop; uniform float uH;")
        .replace("#include <begin_vertex>", "vec3 transformed = normalize(position) * (" + R.toFixed(1) + " + uH * top); vTop = lv;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vTop; uniform float uFill; uniform vec3 uGlass;")
        .replace("#include <color_fragment>", "#include <color_fragment>\n float solid = 1.0 - smoothstep(uFill - 0.004, uFill + 0.004, vTop); if (uFill >= 0.999) solid = 1.0; diffuseColor.a = mix(0.5, 0.97, solid); diffuseColor.rgb = mix(uGlass * 0.6, diffuseColor.rgb, solid);");
    };
    const mesh = new THREE.Mesh(g, mat);
    mesh.visible = false;
    scene.add(mesh);
    const p = { name, mesh, set(h, fill = 1) { u.uH.value = h; u.uFill.value = fill; mesh.visible = h > 0.01; } };
    plates.push(p);
    return p;
  }

  /* an Object3D on the surface at (lon, lat), h units up, with +y outward
     and +z roughly south (so a model's front faces the equator-side) */
  function anchor(lon, lat, h = 0) {
    const o = new THREE.Object3D();
    const up = lonLat(lon, lat, 1);
    o.position.copy(up).multiplyScalar(R + h);
    o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
    // spin about the local up so that local +z points south (towards the equator for the south, away for the north)
    const south = lonLat(lon, lat - 1, 1).sub(up.clone().multiplyScalar(lonLat(lon, lat - 1, 1).dot(up))).normalize();
    const localZ = new THREE.Vector3(0, 0, 1).applyQuaternion(o.quaternion);
    const ang = Math.atan2(localZ.clone().cross(south).dot(up), localZ.dot(south));
    o.rotateOnAxis(new THREE.Vector3(0, 1, 0), ang);
    scene.add(o);
    return o;
  }

  /* ---- cameras ---- */
  function camAt(p, l) {
    camera.position.copy(lonLat(p.lon, p.lat, p.r));
    camera.up.set(0, 1, 0);
    camera.lookAt(!l ? new THREE.Vector3() : l.isVector3 ? l : lonLat(l.lon, l.lat, l.r));
    camera.updateMatrixWorld();
    sunView.value.copy(SUN_DIR).transformDirection(camera.matrixWorldInverse);
  }
  /* the opening: from far over the Indian Ocean, turning to and zooming on Australia */
  const START = { lon: 72, lat: 6, dist: 470 }, END = { lon: 133.5, lat: -26, dist: 175 };
  function pose(t, k) {
    const e = ease(k);
    const lon = START.lon + (END.lon - START.lon) * e, lat = START.lat + (END.lat - START.lat) * e;
    const dist = START.dist + (END.dist - START.dist) * ease(Math.min(1, k * 1.1));
    camAt({ lon, lat, r: dist });
    clouds.rotation.y = t * 0.012;
  }
  function project(lon, lat, r = R * 1.01) {
    const v = lonLat(lon, lat, r).project(camera);
    return [(v.x * 0.5 + 0.5) * 1280, (-v.y * 0.5 + 0.5) * 720];
  }
  const setOutline = (a) => { outline.material.opacity = a; outline.visible = a > 0.01; };
  const setClouds = (a) => { clouds.material.opacity = a; clouds.visible = a > 0.01; };
  return { scene, camera, pose, camAt, project, plate, plates, anchor, setOutline, setClouds, clouds };
}
