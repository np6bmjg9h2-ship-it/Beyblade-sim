// Attack ring models from the meshes tools/blender/rings.py builds
// (src/render/assets/rings.js): thin moulded plates with hooked blades,
// windows and metal leading-face caps, in the anime look (two-tone cel
// shading, crease lines on hard edges, ink silhouettes). Palette slots:
// main (the ring / player colour), frame (dark hub), sec (second colour),
// metal, acc (bright accent), rubber, roller.
//
// A mesh is baked from the catalogue numbers; when the live contact layer
// differs (an item with other numbers, a core too wide for the baked hole)
// buildRingModel returns null and ring.js builds the procedural ring.

import * as THREE from 'three';
import { RING_MESHES } from '../assets/rings.js';
import { MM, partGroup, toonMaterial, inked, tone, inkFor, shellFinish } from './common.js';
import { mix, INK_LAYER, renderStyle } from '../toon.js';
import { decodeMesh } from '../meshAsset.js';

const CREASE_DEG = 35;
const FINISH = { main: 'plastic', frame: 'plastic', sec: 'gloss', metal: 'metal', acc: 'gloss', rubber: 'rubber', roller: 'gloss' };
const INK = { main: { px: 2, maxMm: 0.5 }, frame: { px: 1.5, maxMm: 0.4 }, sec: { px: 1.5, maxMm: 0.35 }, metal: { px: 1.5, maxMm: 0.35 }, acc: { px: 1, maxMm: 0.25 }, rubber: { px: 1.5, maxMm: 0.35 }, roller: { px: 1.5, maxMm: 0.4 } };

const near = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;
const dist = (a, b) => { const x = new THREE.Color(a), y = new THREE.Color(b); return Math.hypot(x.r - y.r, x.g - y.g, x.b - y.b); };
const lightness = (hex) => { const o = { h: 0, s: 0, l: 0 }; new THREE.Color(hex).getHSL(o, THREE.SRGBColorSpace); return o.l; };

// Does the baked mesh still match this ring's contact layer and core?
function fits(meta, part, ctx) {
  const s = meta.sig, L = ctx.layer;
  const hand = s.spin === 'R' ? -1 : s.spin === 'L' ? 1 : 0;
  const base = (s.blades > 0 ? s.rBase : s.rOut) * MM;
  if (part.thickness !== s.thickness || (part.slope || 0) !== s.slope) return false;
  if (L && !(near(L.radius, s.rOut * MM) && near(L.baseRadius, base) && (L.blades | 0) === s.blades && near(L.bladeWidth ?? 0.55, s.bladeWidth) && (L.hand || 0) === hand)) return false;
  if (!L && !(part.rOut === s.rOut && part.rBase === s.rBase && part.blades === s.blades && (part.bladeWidth ?? 0.55) === s.bladeWidth)) return false;
  return (ctx.parts?.core?.radius ?? 0) + 0.3 <= meta.hole;
}

export function hasRingModel(id) { return !!RING_MESHES[id]; }

function palette(part, ctx) {
  const main = ctx.accent || part.color || '#4fc3ff';
  const own = part.color && dist(part.color, main) > 0.3 ? part.color : null;
  const sec = own || (lightness(main) > 0.72 ? '#1e2433' : '#f2f5fb');
  const acc = dist(main, '#ffe14d') > 0.45 ? '#ffe14d' : '#ff4d6a';
  return {
    main: tone(main, 0, 0.04), frame: mix(main, '#14121f', 0.62), sec, acc,
    metal: '#a3afc0', rubber: '#24262c', roller: '#ff7a1f',
  };
}

// A ring PartModel from its Blender mesh, or null (use the procedural ring).
export function buildRingModel(part, ctx) {
  const meta = RING_MESHES[part.id];
  if (!meta || !fits(meta, part, ctx)) return null;
  const parts = decodeMesh(meta, CREASE_DEG);
  const C = palette(part, ctx);
  const rarity = ctx.rarity?.rank >= 1 ? ctx.rarity : null;
  if (rarity) C.frame = mix(C.frame, rarity.color, 0.55); // hub collar carries the rarity trim
  const glows = [];
  const group = partGroup('ring');
  const lines = renderStyle() !== 'realistic';
  const mats = {};
  const matOf = (slot) => {
    if (mats[slot]) return mats[slot];
    const finish = slot === 'main' ? shellFinish(part, FINISH.main) : FINISH[slot] || 'gloss';
    const glow = slot === 'frame' && rarity?.rank >= 3 ? { emissive: rarity.color, emissiveIntensity: 0.5 + 0.15 * (rarity.rank - 3) } : {};
    const m = toonMaterial(C[slot] || C.main, { finish, specEdge: slot === 'main' || slot === 'frame' ? 0.985 : undefined, rimColor: slot === 'main' ? tone(C.main, 0.3) : undefined, ink: inkFor(C[slot] || C.main, 0.75), ...glow });
    if (glow.emissive) glows.push(m);
    return (mats[slot] = m);
  };
  const addParts = (list, into) => {
    for (const p of list) {
      const mesh = inked(p.geo, matOf(p.mat), INK[p.mat] || INK.main);
      mesh.name = 'ring-' + p.mat;
      if (lines) {
        const line = new THREE.LineSegments(p.edges, new THREE.LineBasicMaterial({ color: inkFor(C[p.mat] || C.main, 0.45) }));
        line.layers.set(INK_LAYER);
        line.raycast = () => {};
        mesh.add(line);
      }
      into.add(mesh);
    }
  };
  addParts(parts, group);
  // free-spinning rollers: one holder per baked position, spun about local Y
  let spinners;
  const rollerParts = meta.spinners && decodeMesh(RING_MESHES[meta.spinnerMesh], CREASE_DEG);
  if (rollerParts) {
    spinners = meta.spinners.map(([x, y, z]) => {
      const holder = new THREE.Group(), spin = new THREE.Group();
      holder.position.set(x, y, z);
      addParts(rollerParts, spin);
      holder.add(spin);
      group.add(holder);
      return spin;
    });
  }
  return { group, height: part.thickness * MM, glows, spinners };
}
