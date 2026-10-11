/* test-bench wrapper: the instanced gum trees from tree.js, one of each variant */
import * as THREE from "three";
import { makeGumTrees, plantGumTrees } from "./tree.js";
export function build() {
  const group = new THREE.Group();
  const trees = makeGumTrees(55, 4);
  plantGumTrees(group, [0, 1, 2, 3].map((i) => ({ x: (i - 1.5) * 40, y: 0, z: 0, s: 3, rot: i })), trees);
  return { group, emitters: [], pose: () => {} };
}
