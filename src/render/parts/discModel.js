// Weight disc models from the meshes tools/blender/discs.py builds
// (src/render/assets/discs.js). Anime look: two-tone cel shading, drawn
// crease lines on chamfers and hard edges, bold ink silhouettes. The caller
// (disc.js, discClassic.js) owns the colours: it passes one material factory
// per palette slot (main, dark, accent, chrome, alt) and adds its own decals.
//
// A mesh is used only while the catalogue numbers it was built from still
// match the part (rIn, rOut, thickness); otherwise the procedural model runs.

import * as THREE from 'three';
import { DISC_MESHES } from '../assets/discs.js';
import { decodeMesh, mergeParts, creaseLines } from '../meshAsset.js';
import { partGroup, inkFor } from './common.js';
import { addInk } from '../toon.js';

const CREASE_DEG = 35;
const near = (a, b) => Math.abs((a ?? 0) - (b ?? 0)) < 1e-3;

// The mesh record for a part, or null when none matches its numbers.
export function discMesh(part) {
  const m = DISC_MESHES[part.id];
  if (!m || !near(m.rIn, part.rIn ?? 6) || !near(m.rOut, part.rOut) || !near(m.T, part.thickness)) return null;
  return m;
}

// { group, glows, meta } or null. mats: { slot: () => material };
// inkOpts: { slot: addInk options }; ctx.spin 'L' mirrors handed designs.
export function buildDiscModel(part, ctx, mats, inkOpts = {}) {
  const meta = discMesh(part);
  if (!meta) return null;
  const parts = decodeMesh(meta, CREASE_DEG);
  const g = partGroup('disc');
  const body = new THREE.Group();
  if (meta.handed && ctx.spin === 'L') body.scale.z = -1;
  g.add(body);
  const made = {}, glows = [], lines = [];
  for (const p of mergeParts(parts, (slot) => (mats[slot] ? slot : 'main'))) {
    const slot = p.key;
    let mat = made[slot];
    if (!mat) {
      mat = made[slot] = mats[slot]();
      if (slot === 'main' && ctx.rarity?.rank >= 3) glows.push(mat);
    }
    const mesh = new THREE.Mesh(p.geo, mat);
    mesh.castShadow = true;
    lines.push({ edges: p.edges, color: inkFor('#' + mat.color.getHexString(), 0.35) });
    addInk(mesh, inkOpts[slot] || {});
    body.add(mesh);
  }
  body.add(creaseLines(lines));
  return { group: g, glows, meta };
}
