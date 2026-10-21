// Blender-built tip models (tools/blender/tips.py -> src/render/assets/tips.js):
// thin seating plate, slim hub, gusset fins and the exact contact piece, in
// the anime look (two-tone cel materials, drawn crease lines, ink hull).
// Colours, rarity glow and the emblem decal come from tip.js's kit, so a
// model and its procedural fallback look the same part. Palette slots in the
// mesh are kit bins; `flange` / `tabs` resolve through the look's cap.

import * as THREE from 'three';
import { TIP_MESHES } from '../assets/tips.js';
import { decodeMesh } from '../meshAsset.js';
import { inked, inkFor } from './common.js';

const CREASE_DEG = 35;
const INK = { px: 2, maxMm: 0.45 };

export const hasTipModel = (id) => !!TIP_MESHES[id];

// Model result ({ group, height, spinners?, glows? }) for the kit's part, or
// null when no mesh is built for it.
export function buildTipModel(k) {
  const m = TIP_MESHES[k.part.id];
  const parts = decodeMesh(m, CREASE_DEG);
  if (!parts) return null;
  const cap = k.look.cap;
  const binOf = (slot) => (slot === 'flange' ? cap.flange : slot === 'tabs' ? cap.tabs || 'body' : slot);
  const mats = new Map();
  const meshes = [], spinners = [];
  for (const p of parts) {
    const bin = binOf(p.mat);
    let mat = mats.get(bin);
    if (!mat) {
      mats.set(bin, (mat = k.material(bin)));
      if (bin === 'trim' && mat.emissiveIntensity > 0) k.glows.push(mat);
    }
    let mesh;
    if (bin === 'clear') {
      mesh = new THREE.Mesh(p.geo, mat);
      mesh.userData.noInk = true;
      mesh.renderOrder = 1;
    } else {
      mesh = inked(p.geo, mat, INK);
      const ink = mat.color ? inkFor('#' + mat.color.getHexString(), 0.35) : '#150f22';
      mesh.add(new THREE.LineSegments(p.edges, new THREE.LineBasicMaterial({ color: ink })));
    }
    mesh.name = 'tip-' + p.mat;
    if (m.spin?.includes(p.mat)) spinners.push(mesh);
    meshes.push(mesh);
  }
  // printed emblem on the plate top (kit decal), then the kit's group
  k.emblem(m.plateR * (m.wide ? 0.66 : 0.78));
  const res = k.finish();
  for (const mesh of meshes) res.group.add(mesh);
  if (spinners.length) res.spinners = spinners;
  return res;
}
