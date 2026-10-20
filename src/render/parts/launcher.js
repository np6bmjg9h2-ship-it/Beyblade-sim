// Launcher models for launch setup, from the meshes tools/blender/launchers.py
// builds (src/render/assets/launchers.js). Anime look: two-tone cel shading,
// drawn crease lines on hard edges and bold ink silhouettes. The `accent`
// palette slot takes the item (or painted) colour.

import * as THREE from 'three';
import { LAUNCHER_MESHES } from '../assets/launchers.js';
import { toonMaterial, inkAll, inkFor } from '../toon.js';
import { decodeMesh } from '../meshAsset.js';

const PALETTE = { body: '#2c3766', panel: '#5468b0', accent2: '#ffc83d', metal: '#d5dbe4', lcd: '#a8bfa2', cap: '#e2312d' };
const FINISH = { body: 'plastic', panel: 'plastic', accent: 'gloss', accent2: 'gloss', metal: 'chrome', lcd: 'matte', cap: 'gloss' };
const CREASE_DEG = 35;
// launchers that share another's mesh in their own colours
const VARIANTS = {
  launcher_clipreverse: { mesh: 'launcher_clip', palette: { body: '#d9541e', panel: '#f08a3c' } },
  launcher_lefthand: { mesh: 'launcher_spark', palette: { body: '#2a2d36', panel: '#e9ecf3' } },
};

const decode = (id) => decodeMesh(LAUNCHER_MESHES[id], CREASE_DEG);

const meshOf = (id) => VARIANTS[id]?.mesh || id;
export function hasLauncherModel(id) { return !!LAUNCHER_MESHES[meshOf(id)]; }

// A launcher model for `id` in `accent`, or null when none is built yet.
// Geometry is shared between copies (three re-uploads it if a replaced
// model's disposal freed it); materials are per model.
export function buildLauncherModel(id, accent) {
  const parts = decode(meshOf(id));
  if (!parts) return null;
  const meta = LAUNCHER_MESHES[meshOf(id)];
  const palette = { ...PALETTE, ...meta.palette, ...VARIANTS[id]?.palette };
  const group = new THREE.Group();
  group.userData.hold = meta.hold || 'tangent';
  const mats = {};
  const line = new THREE.LineBasicMaterial({ color: inkFor(palette.body, 0.35) });
  for (const p of parts) {
    const color = p.mat === 'accent' ? accent : palette[p.mat] || palette.body;
    const mat = mats[p.mat] || (mats[p.mat] = toonMaterial(color, { finish: FINISH[p.mat] || 'gloss' }));
    const mesh = new THREE.Mesh(p.geo, mat);
    mesh.castShadow = true;
    mesh.add(new THREE.LineSegments(p.edges, line));
    group.add(mesh);
  }
  inkAll(group, { px: 3 });
  return group;
}
