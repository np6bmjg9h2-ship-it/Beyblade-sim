// Scene lighting shared by the game renderer and the part preview tools.
// Cel shading wants a mostly flat ambient fill and one strong key light, so
// the hard light bands come from a single direction; two coloured rim lights
// pick out silhouettes in the stadium's colours.

import * as THREE from 'three';

export const TONE = { mapping: THREE.NeutralToneMapping, exposure: 1.05 };

export function createLights(scene) {
  const hemi = new THREE.HemisphereLight('#dfe6ff', '#8f95b8', 0.95);
  const key = new THREE.DirectionalLight('#fff6ea', 1.9);
  key.position.set(0.6, 1.4, 0.4);
  key.shadow.camera.left = -0.3; key.shadow.camera.right = 0.3;
  key.shadow.camera.top = 0.3; key.shadow.camera.bottom = -0.3;
  key.shadow.camera.near = 0.5; key.shadow.camera.far = 3;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.0006;
  const rimA = new THREE.PointLight('#4fc3ff', 0.9, 2, 1.5);
  rimA.position.set(-0.4, 0.25, -0.3);
  const rimB = new THREE.PointLight('#ff7a3d', 0.8, 2, 1.5);
  rimB.position.set(0.4, 0.25, 0.35);
  const spot = new THREE.SpotLight('#ffffff', 2.2, 3, 0.55, 0.35, 1.2);
  spot.position.set(0, 1.2, 0);
  spot.target.position.set(0, 0, 0);
  scene.add(hemi, key, rimA, rimB, spot, spot.target);
  return { hemi, key, rimA, rimB, spot };
}
