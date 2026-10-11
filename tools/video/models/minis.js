/* The five source miniatures, shared by the bar race (step 3) and the
 * country plates on the globe (step 4). Each builder fills a group around
 * (0, 0, 0), on the ground plane, in the studio's units.
 *
 * makeMinis() returns { minis, spinners, steams }: minis[key](group) builds
 * one; spinners are rotor groups to turn in pose; steams are emitters.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mulberry32, std, canvasTex, grain, claddingTex, concreteTex } from "./kit.js";
import { bladeGeo } from "./renewable.js";

export function makeMinis(seed = 778) {
  const r = mulberry32(seed);
  const add = (geo, mat, x = 0, y = 0, z = 0, parent) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true; parent.add(m); return m;
  };
  const white = std(0xeef0f1, 0.42, 0.08), steel = std(0x8b9298, 0.42, 0.75);
  const grass = std(0xffffff, 0.95, 0, { map: canvasTex(128, 128, (c, w, h) => grain(c, w, h, "#9db866", 40, r), 3) });
  const spinners = [], steams = [];
  const minis = {
    solar(g) {
      // two fixed-tilt arrays facing the viewer (and the sun), raised on frames
      const tex = canvasTex(512, 128, (ctx, w, h) => {
        const rr = mulberry32(31); ctx.fillStyle = "#d4d8dc"; ctx.fillRect(0, 0, w, h);      // aluminium frames
        const cols = 8, rows = 2, mw = w / cols, mh = h / rows;
        for (let m = 0; m < cols; m++) for (let row = 0; row < rows; row++) {
          const x0 = m * mw + 3, y0 = row * mh + 3, ww = mw - 6, hh = mh - 6;
          const g2 = ctx.createLinearGradient(x0, y0, x0 + ww, y0 + hh);
          g2.addColorStop(0, "#2d5aa0"); g2.addColorStop(1, "#173a74");
          ctx.fillStyle = g2; ctx.fillRect(x0, y0, ww, hh);
          ctx.strokeStyle = "rgba(170,200,240,.35)"; ctx.lineWidth = 1;
          for (let a = 1; a < 6; a++) { ctx.beginPath(); ctx.moveTo(x0 + (a * ww) / 6, y0); ctx.lineTo(x0 + (a * ww) / 6, y0 + hh); ctx.stroke(); }
          for (let b = 1; b < 10; b++) { ctx.beginPath(); ctx.moveTo(x0, y0 + (b * hh) / 10); ctx.lineTo(x0 + ww, y0 + (b * hh) / 10); ctx.stroke(); }
          ctx.fillStyle = `rgba(255,255,255,${0.05 + rr() * 0.08})`; ctx.fillRect(x0, y0, ww * 0.5, hh * 0.35);   // a little sky glint
        }
      });
      const pm = new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.18, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.2 });
      const TILT = 0.6, D = 10, L = 42;
      for (const zc of [2, 15]) {
        const lowY = 2.2, highY = lowY + D * Math.sin(TILT);
        const panel = add(new THREE.BoxGeometry(L, 0.3, D), pm, 0, (lowY + highY) / 2 + 0.3, zc, g);
        panel.rotation.x = TILT;                                   // tilted up at the back, facing the camera
        const back = zc - (D / 2) * Math.cos(TILT), front = zc + (D / 2) * Math.cos(TILT);
        for (let x = -L / 2 + 2; x <= L / 2 - 2; x += 7.6) {
          add(new THREE.BoxGeometry(0.35, lowY, 0.35).translate(0, lowY / 2, 0), steel, x, 0, front - 0.6, g);
          add(new THREE.BoxGeometry(0.35, highY, 0.35).translate(0, highY / 2, 0), steel, x, 0, back + 0.6, g);
          const br = add(new THREE.BoxGeometry(0.2, 0.2, Math.hypot(front - back, highY - lowY)), steel, x, (lowY + highY) / 2 - 0.6, zc, g);
          br.rotation.x = TILT;
        }
      }
      add(new THREE.BoxGeometry(6, 3, 3).translate(0, 1.5, 0), std(0xe9e9e6, 0.5, 0.2), 16, 0, 24, g);   // inverter
      add(new THREE.BoxGeometry(3, 2.4, 2.4).translate(0, 1.2, 0), std(0x6e7f74, 0.5, 0.3), 10, 0, 24, g);
    },
    wind(g) {
      const H = 34, tw = std(0xffffff, 0.45, 0.1, { map: canvasTex(32, 256, (c, w, h) => grain(c, w, h, "#eef0ef", 8, r)) });
      for (const [x, z, s] of [[-6, 6, 1], [10, 14, 0.75]]) {
        const t = new THREE.Group(); t.position.set(x, 0, z); t.scale.setScalar(s); t.rotation.y = 0.3; g.add(t);
        add(new THREE.CylinderGeometry(0.75, 1.3, H, 24).translate(0, H / 2, 0), tw, 0, 0, 0, t);
        add(new RoundedBoxGeometry(1.7, 1.7, 5, 3, 0.4), white, 0, H + 0.8, -1, t);
        const rotor = new THREE.Group(); rotor.position.set(0, H + 0.8, 1.9); t.add(rotor);
        add(new THREE.SphereGeometry(0.9, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(1, 1, 1.5), white, 0, 0, 0, rotor);
        const B = bladeGeo(18);
        for (let k = 0; k < 3; k++) { const b = add(B, white, 0, 0, 0.15, rotor); b.rotation.z = (k * 2 * Math.PI) / 3; b.translateY(0.55); }
        rotor.userData.phase = r() * 6.28; spinners.push(rotor);
        add(new THREE.CircleGeometry(4, 20).rotateX(-Math.PI / 2), std(0xb9b19e, 1), 0, 0.1, 0, t);
      }
    },
    hydro(g) {
      const conc = std(0xffffff, 0.88, 0, { map: concreteTex(41, { base: "#cbc5ba", lifts: 6, streak: 40, rx: 2 }) });
      const R = 22, span = 0.95, H = 16;
      const wall = add(new THREE.CylinderGeometry(R, R + 3, H, 32, 2, true, Math.PI - span / 2, span).translate(0, H / 2, 0), conc, 0, 0, R + 4, g);
      wall.material.side = THREE.DoubleSide;
      for (const sx of [-1, 1]) {
        const hill = add(new THREE.SphereGeometry(13, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.25, 1.3), grass, sx * 21, 0, -2, g);
        hill.rotation.y = sx * 0.3;
      }
      add(new THREE.BoxGeometry(36, 0.4, 14), new THREE.MeshPhysicalMaterial({ color: 0x2b5a72, roughness: 0.06, clearcoat: 1 }), 0, 13, -6, g).castShadow = false;
      for (const k of [-4, 0, 4]) add(new THREE.CylinderGeometry(0.6, 0.6, 15, 10), std(0x8a9096, 0.4, 0.75), k, 8, 6.5, g).rotation.x = 0.3;
      add(new THREE.BoxGeometry(14, 5, 6).translate(0, 2.5, 0), std(0xd8d4cb, 0.7, 0.1), 0, 0, 12, g);
      add(new THREE.BoxGeometry(6, 0.3, 14).translate(0, 0.15, 0), new THREE.MeshPhysicalMaterial({ color: 0x3b7896, roughness: 0.12, clearcoat: 1 }), 0, 0, 22, g);
    },
    biomass(g) {
      add(new THREE.BoxGeometry(14, 14, 10).translate(0, 7, 0), std(0xffffff, 0.6, 0.2, { map: claddingTex(51, { base: "#d9d2c3", rx: 2, ry: 2 }) }), -4, 0, 6, g);
      add(new THREE.BoxGeometry(14.3, 2.2, 10.3).translate(0, 1.1, 0), std(0x2f6b4f, 0.6, 0.3), -4, 12, 6, g);
      add(new THREE.CylinderGeometry(3, 3, 11, 20).translate(0, 5.5, 0), std(0xd0d3d6, 0.45, 0.55), 8, 0, 6, g);
      add(new THREE.ConeGeometry(3, 2, 20).translate(0, 12, 0), std(0xb8bcc0, 0.45, 0.55), 8, 0, 6, g);
      add(new THREE.CylinderGeometry(0.7, 1, 24, 12).translate(0, 12, 0), std(0xc9c4ba, 0.7, 0.3), -9, 0, 1, g);
      const chips = std(0xffffff, 0.98, 0, { map: canvasTex(64, 64, (c, w, h) => grain(c, w, h, "#8a7458", 46, r), 3) });
      add(new THREE.ConeGeometry(6, 4.5, 24).translate(0, 2.25, 0), chips, 6, 0, 18, g);
      steams.push({ x: -9, y: 24, z: 1, g, size: 4 });
    },
    geothermal(g) {
      add(new THREE.BoxGeometry(6, 0.4, 6), std(0xa9a397, 0.95), 0, 0.2, 10, g);
      add(new THREE.CylinderGeometry(0.55, 0.55, 3.4, 12).translate(0, 1.7, 0), std(0x2f6b4f, 0.5, 0.4), 0, 0.4, 10, g);
      add(new THREE.TorusGeometry(0.75, 0.13, 6, 16).rotateX(Math.PI / 2), std(0xb63c2d, 0.5, 0.3), 0, 3.2, 10, g);
      add(new THREE.CylinderGeometry(0.4, 0.4, 9, 10).rotateZ(Math.PI / 2), std(0xdfe3e6, 0.3, 0.85), 5.5, 1.5, 10, g);
      steams.push({ x: 0, y: 4, z: 10, g, size: 3 });
    },

    /* ---- country variants for the globe, after real sites ---------------- */
    // China: a long concrete gravity dam with a gated spillway, red gantry
    // cranes along the crest and a powerhouse at the foot (Three Gorges)
    gravityDam(g) {
      const conc = std(0xffffff, 0.9, 0, { map: concreteTex(43, { base: "#c8c3b8", lifts: 8, streak: 50, rx: 4, ry: 1 }) });
      const L = 56, H = 15;
      // the wall: a trapezoid in section, steep downstream face
      const sec = new THREE.Shape(); sec.moveTo(-5, 0); sec.lineTo(5, 0); sec.lineTo(2, H); sec.lineTo(-2, H); sec.closePath();
      const wall = add(new THREE.ExtrudeGeometry(sec, { depth: L, bevelEnabled: false }).rotateY(Math.PI / 2).translate(-L / 2, 0, 0), conc, 0, 0, 0, g);
      // spillway: gated bays in the middle, white water down the chute
      const gate = std(0xb9402c, 0.5, 0.3), pier = std(0xd8d3c8, 0.85, 0);
      // piers stand a little above the crest; a radial gate sits in each bay
      for (let i = -3; i <= 3; i++) {
        add(new THREE.BoxGeometry(1.0, 3.6, 7.0).translate(0, 1.8, 0), pier, i * 3.3, H - 1.8, 0.4, g);
        if (i < 3) add(new THREE.BoxGeometry(2.2, 2.6, 0.5).translate(0, 1.3, 0), gate, i * 3.3 + 1.65, H - 1.6, 2.6, g);
      }
      // white water down the downstream face below the gates
      const foam = std(0xffffff, 0.3, 0, { map: canvasTex(128, 256, (c, w, h) => { grain(c, w, h, "#dfeef5", 30, r); c.fillStyle = "rgba(255,255,255,.5)"; for (let i = 0; i < 90; i++) c.fillRect(r() * w, r() * h, 2, 6 + r() * 14); }, 2, 1), transparent: true, opacity: 0.85 });
      const slope = Math.atan2(3, H);                                              // the downstream face: x 5 at the foot to 2 at the crest
      const chute = add(new THREE.PlaneGeometry(22, Math.hypot(3, H)), foam, 0, H / 2, 3.5 + 0.12, g);
      chute.rotation.x = -slope; chute.castShadow = false;
      // crest road and the red gantry cranes
      add(new THREE.BoxGeometry(L, 0.3, 4.2).translate(0, 0.15, 0), std(0x6c6f72, 0.9), 0, H, 0, g);
      const red = std(0xc23b25, 0.45, 0.35);
      for (const x of [-20, -13, 13, 20]) {
        for (const z of [-1.6, 1.6]) add(new THREE.BoxGeometry(0.5, 5.5, 0.5).translate(0, 2.75, 0), red, x, H + 0.3, z, g);
        add(new THREE.BoxGeometry(2.6, 0.7, 4.4).translate(0, 0.35, 0), red, x, H + 5.6, 0, g);
      }
      // powerhouse at the downstream foot, with penstock stubs
      add(new THREE.BoxGeometry(24, 6, 7).translate(0, 3, 0), std(0xdad6cd, 0.7, 0.1, { map: claddingTex(44, { base: "#d9d5cc", rx: 6 }) }), -14, 0, 9, g);
      for (let x = -24; x <= -4; x += 4) add(new THREE.CylinderGeometry(0.7, 0.7, 7, 10).rotateX(Math.PI / 2 - 0.5), std(0x8a9096, 0.4, 0.7), x, 5, 5.2, g);
      // reservoir behind, the river below
      const water = (w, d, col) => new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, d).translate(0, 0.15, 0), new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.08, clearcoat: 1 }));
      const lake = water(L + 8, 20, 0x2d5f78); lake.position.set(0, H - 2.6, -13); lake.receiveShadow = true; g.add(lake);
      const river = water(L + 8, 9, 0x3b7896); river.position.set(0, 0, 16); river.receiveShadow = true; g.add(river);
      // valley sides so the wall has something to hold back: low, wooded ridges
      const wood = std(0x55703f, 0.95, 0, { flatShading: true });
      for (const sx of [-1, 1]) {
        const hill = add(new THREE.IcosahedronGeometry(12, 2).scale(1.3, 1.0, 2.0).translate(0, -3, 0), grass, sx * 36, 0, -2, g);
        hill.rotation.y = sx * 0.15;
        for (let i = 0; i < 14; i++) {
          const a = r() * 6.28, d = 3 + r() * 9, x = sx * 36 + Math.cos(a) * d * 1.2, z = -2 + Math.sin(a) * d * 1.8;
          const y = Math.max(0, 9 - 9 * (d / 12) ** 2) - 3 + 2.5;
          add(new THREE.ConeGeometry(1.1 + r() * 0.6, 3 + r() * 2, 6).translate(0, 1.5, 0), wood, x, y, z, g);
        }
      }
    },
    // Germany: an offshore wind farm, turbines on yellow monopiles in rows
    // out in the sea (German Bight), with a service vessel
    offshoreWind(g) {
      const sea = new THREE.Mesh(new THREE.BoxGeometry(64, 0.3, 44).translate(0, 0.15, 0), new THREE.MeshPhysicalMaterial({ color: 0x24506a, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.08 }));
      sea.receiveShadow = true; g.add(sea);
      const yellow = std(0xe8b619, 0.5, 0.3), tw = std(0xffffff, 0.45, 0.1, { map: canvasTex(32, 256, (c, w, h) => grain(c, w, h, "#eef0ef", 8, r)) });
      const H = 26, B = bladeGeo(13);
      let k = 0;
      for (const [x, z] of [[-20, -10], [-4, -14], [12, -10], [-12, 4], [4, 1], [20, 4], [-20, 16], [12, 15]]) {
        const t = new THREE.Group(); t.position.set(x, 0, z); t.rotation.y = 0.25; g.add(t);
        add(new THREE.CylinderGeometry(1.1, 1.1, 4.2, 16).translate(0, 2.1, 0), yellow, 0, 0, 0, t);         // transition piece
        add(new THREE.BoxGeometry(3.4, 0.3, 3.4).translate(0, 4.2, 0), yellow, 0, 0, 0, t);                  // platform
        add(new THREE.CylinderGeometry(0.62, 1.0, H, 20).translate(0, H / 2 + 4, 0), tw, 0, 0, 0, t);
        add(new RoundedBoxGeometry(1.5, 1.5, 4.4, 3, 0.35), white, 0, H + 4.6, -0.9, t);
        const rotor = new THREE.Group(); rotor.position.set(0, H + 4.6, 1.7); t.add(rotor);
        add(new THREE.SphereGeometry(0.75, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(1, 1, 1.5), white, 0, 0, 0, rotor);
        for (let b = 0; b < 3; b++) { const bl = add(B, white, 0, 0, 0.12, rotor); bl.rotation.z = (b * 2 * Math.PI) / 3; bl.translateY(0.45); }
        rotor.userData.phase = r() * 6.28 + k++; spinners.push(rotor);
      }
      // a crew transfer vessel heading out
      const boat = new THREE.Group(); boat.position.set(-6, 0.3, 19); boat.rotation.y = -0.4; g.add(boat);
      add(new THREE.BoxGeometry(5, 1, 1.6).translate(0, 0.5, 0), std(0xeceeee, 0.5, 0.1), 0, 0, 0, boat);
      add(new THREE.BoxGeometry(1.6, 1, 1.3).translate(0, 0.5, 0), std(0x2a5d8f, 0.5, 0.1), -0.8, 1, 0, boat);
      add(new THREE.BoxGeometry(5.4, 0.25, 2).translate(0, 0.1, 0), std(0xd0372b, 0.5), 0, -0.2, 0, boat);
    },
    // New Zealand: a geothermal field, silver steam pipelines with expansion
    // loops across a flat pad, well heads, separators and a steaming cooling
    // tower (Wairakei)
    geoField(g) {
      const pad = std(0xffffff, 0.95, 0, { map: canvasTex(128, 128, (c, w, h) => grain(c, w, h, "#b7ad9c", 36, r), 4) });
      add(new THREE.BoxGeometry(58, 0.4, 40).translate(0, 0.2, 0), pad, 0, 0, 0, g);
      const pipe = std(0xdfe3e6, 0.28, 0.85), dark = std(0x4b5157, 0.6, 0.5), green = std(0x2f6b4f, 0.5, 0.4);
      // two long pipelines running across, each with an expansion loop
      for (const [z, y, loopX] of [[-9, 1.6, -8], [-3, 2.1, 12]]) {
        for (const [x0, x1] of [[-28, loopX - 3], [loopX + 3, 28]]) {
          const L = x1 - x0; add(new THREE.CylinderGeometry(0.55, 0.55, L, 12).rotateZ(Math.PI / 2), pipe, (x0 + x1) / 2, y, z, g);
          for (let x = x0 + 2; x < x1; x += 6) add(new THREE.BoxGeometry(1.2, y, 1.2).translate(0, y / 2, 0), dark, x, 0.4, z, g);   // supports
        }
        // the loop: up, across, down
        for (const sx of [-1, 1]) add(new THREE.CylinderGeometry(0.55, 0.55, 4, 12), pipe, loopX + sx * 3, y + 2, z, g);
        add(new THREE.CylinderGeometry(0.55, 0.55, 6.6, 12).rotateZ(Math.PI / 2), pipe, loopX, y + 4, z, g);
      }
      // well heads in concrete cellars, each tied into the line
      for (const x of [-18, 2, 20]) {
        add(new THREE.BoxGeometry(5, 0.5, 5).translate(0, 0.25, 0), std(0xa9a397, 0.95), x, 0.4, 7, g);
        add(new THREE.CylinderGeometry(0.5, 0.5, 3.2, 12).translate(0, 1.6, 0), green, x, 0.9, 7, g);
        add(new THREE.TorusGeometry(0.7, 0.12, 6, 16).rotateX(Math.PI / 2), std(0xb63c2d, 0.5, 0.3), x, 3.6, 7, g);
        add(new THREE.CylinderGeometry(0.4, 0.4, 10, 10).rotateX(Math.PI / 2), pipe, x, 2.1, 2, g);
      }
      // separators: tall silver vessels on a frame
      for (const x of [-10, -5]) add(new THREE.CylinderGeometry(1.4, 1.4, 7, 18).translate(0, 3.5, 0), pipe, x, 0.4, -15, g);
      add(new THREE.BoxGeometry(9, 0.5, 5).translate(0, 0.25, 0), dark, -7.5, 0.4, -15, g);
      // the cooling tower: a long louvred block with fans on top, steaming
      add(new THREE.BoxGeometry(18, 6, 7).translate(0, 3, 0), std(0xd4d7d9, 0.7, 0.2, { map: claddingTex(45, { base: "#cfd3d5", rx: 5 }) }), 14, 0.4, -13, g);
      for (const x of [8, 14, 20]) {
        add(new THREE.CylinderGeometry(2.4, 2.4, 1.6, 20).translate(0, 0.8, 0), std(0x8d9398, 0.5, 0.5), x, 6.4, -13, g);
        steams.push({ x, y: 8.2, z: -13, g, size: 5 });
      }
      // a few trees along the edge
      const leaf = std(0x4f6a3b, 0.95, 0, { flatShading: true });
      for (const [x, z] of [[-26, 16], [-20, 18], [26, 17], [22, -18], [-27, -17]]) {
        add(new THREE.CylinderGeometry(0.25, 0.4, 3, 6).translate(0, 1.5, 0), std(0xcfc6b4, 0.9), x, 0.4, z, g);
        add(new THREE.IcosahedronGeometry(2.2, 1).scale(1, 0.8, 1), leaf, x, 4.4, z, g);
      }
    },
  };
  return { minis, spinners, steams };
}
