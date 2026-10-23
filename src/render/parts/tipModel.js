// Blender-built tip models (tools/blender/tips.py -> src/render/assets/tips.js):
// thin seating plate, slim hub, gusset fins and the exact contact piece, in
// the anime look (two-tone cel materials, drawn crease lines, ink hull).
// Colours, rarity glow and the emblem decal come from tip.js's kit, so a
// model and its procedural fallback look the same part. Palette slots in the
// mesh are kit bins; `flange` / `tabs` resolve through the look's cap.

import * as THREE from 'three';
import { TIP_MESHES } from '../assets/tips.js';
import { decodeMesh, mergeParts, creaseLines } from '../meshAsset.js';
import { inked, inkFor } from './common.js';

const CREASE_DEG = 35;
const INK = { px: 2, maxMm: 0.45 };

export const hasTipModel = (id) => !!TIP_MESHES[id];

// Model result ({ group, height, spinners?, glows? }) for the kit's part, or
// null when no mesh is built for it.
export function buildTipModel(k) {
  const m = TIP_MESHES[k.part.model || k.part.id];
  const parts = decodeMesh(m, CREASE_DEG);
  if (!parts) return null;
  const cap = k.look.cap;
  const binOf = (slot) => (slot === 'flange' ? cap.flange : slot === 'tabs' ? cap.tabs || 'body' : slot);
  // one mesh per bin; spinning slots stay apart so they can turn
  const pieces = mergeParts(parts, (slot) => (m.spin?.includes(slot) ? null : binOf(slot)));
  const mats = new Map();
  const meshes = [], spinners = [], lines = [];
  for (const p of pieces) {
    const bin = binOf(p.slots[0]);
    let mat = mats.get(bin);
    if (!mat) {
      mats.set(bin, (mat = k.material(bin)));
      if (bin === 'trim' && mat.emissiveIntensity > 0) k.glows.push(mat);
    }
    let mesh;
    const ink = mat.color ? inkFor('#' + mat.color.getHexString(), 0.35) : '#150f22';
    if (bin === 'clear') {
      mesh = new THREE.Mesh(p.geo, mat);
      mesh.userData.noInk = true;
      mesh.renderOrder = 1;
    } else {
      mesh = inked(p.geo, mat, INK);
      if (m.spin?.includes(p.slots[0])) mesh.add(creaseLines([{ edges: p.edges, color: ink }]));
      else lines.push({ edges: p.edges, color: ink });
    }
    mesh.name = 'tip-' + bin;
    if (m.spin?.includes(p.slots[0])) spinners.push(mesh);
    meshes.push(mesh);
  }
  if (lines.length) {
    const crease = creaseLines(lines);
    crease.name = 'tip-lines';
    meshes.push(crease);
  }
  // printed emblem on the plate top (kit decal), then the kit's group
  k.emblem(m.plateR * (m.wide ? 0.66 : 0.78));
  const res = k.finish();
  for (const mesh of meshes) res.group.add(mesh);
  if (spinners.length) res.spinners = spinners;
  return res;
}
