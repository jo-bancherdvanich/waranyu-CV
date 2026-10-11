/* test-bench wrapper: one miniature from minis.js */
import * as THREE from "three";
import { makeMinis } from "./minis.js";
export function build() {
  const { minis, spinners } = makeMinis();
  const group = new THREE.Group(); minis.geoField(group); group.scale.setScalar(3);
  return { group, emitters: [], pose: (t) => spinners.forEach((ro) => { ro.rotation.z = ro.userData.phase + t * 1.6; }) };
}
