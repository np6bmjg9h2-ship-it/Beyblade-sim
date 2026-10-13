// Shared helpers and the part-builder contract.
//
// Every slot has a builder `build<Slot>(part, ctx) -> PartModel` that models
// ONE part as its own object. Tops are then assembled by stacking the part
// models at the heights the physics uses (systems/assembly.js), so each part
// is visibly separate, can be exploded apart, inspected on its own, and flies
// off on its own when a top Shatters.
//
// PartModel = {
//   group:   THREE.Group. Origin = the part's base on the spin axis, +Y up,
//            units METRES (part data is in mm: multiply by MM). Nothing in
//            the group may be scaled; build geometry at final size.
//   height:  nominal height in metres (used for exploded-view spacing).
//   spinners?: Object3D[] spun around local Y independently (free-spin bands).
//   glows?:  materials whose emissiveIntensity may be pulsed (rarity, beast).
// }
//
// Base heights (where each origin is placed), see partPlacement() below:
//   tip  : tip contact end (y=0 touches the floor when upright)
//   lock : top of the tip (zLock0)          disc : zDisc0 (overlaps lock top 25%)
//   ring : zRing0 (overlaps disc top 15%)   core : zCore0 (sits in the ring hole)
//   aux  : depends on mount, see ctx.mount
//
// ctx = {
//   slot, parts (all parts of the build, mm data), spec (assembled physics
//   spec), geo (spec.geometry: stack heights in mm), layer (this part's
//   contact layer, metres, or null), mount (aux only), accent (player/top
//   colour hex), beast (Spirit Chip definition or null), rarity ({id, rank,
//   color} or null), quality ('high'|'medium'|'low'), spin ('R'|'L'|'dual').
// }
//
// Visual language (keep consistent across slots):
//   * cel-shaded toonMaterial() only; finishes: plastic/gloss for moulded
//     parts, metal/chrome for weights and metal faces, rubber for rubber,
//     clear for translucent, gem for crystals.
//   * every solid gets an ink outline (inked() / addInk()); tiny details
//     (<1.5 mm) use { px: 1 } or ink: false.
//   * two-tone paint: a main fill plus darker/lighter trim (tone()), small
//     bright accents in ctx.accent, rarity trim from rarityTrim().
//   * readable silhouettes: bevels and chamfers over smooth blobs; large
//     flat planes broken by panel lines and raised plates.

import * as THREE from 'three';
import { MM, toonMaterial, inked, addInk, tone, inkFor, segs, canvasTexture } from '../toon.js';
import { RARITY_INDEX } from '../../data/rarity.js';

export { MM, toonMaterial, inked, addInk, tone, inkFor, segs, canvasTexture };
export const TAU = Math.PI * 2;

// Rarity trim for an item instance (null for commons / plain definitions).
// An item's finish (systems/itemGen.js visual variant) as a material finish
// for the part's main plastic shell or its metal body.
const SHELL_FINISH = { matte: 'matte', satin: 'plastic', gloss: 'gloss', metallic: 'metal', pearl: 'gloss', prism: 'gem' };
const METAL_FINISH = { matte: 'metal', satin: 'metal', gloss: 'chrome', metallic: 'metal', pearl: 'chrome', prism: 'gem' };
export const shellFinish = (part, fallback) => SHELL_FINISH[part?.itemFinish] || fallback;
export const metalFinish = (part, fallback) => METAL_FINISH[part?.itemFinish] || fallback;

export function rarityTrim(part) {
  const r = part?._item?.rarity;
  const R = r ? RARITY_INDEX[r] : null;
  return R ? { id: r, rank: R.rank, color: R.color } : null;
}
// Emissive options for a rarity glow (epic and above glow faintly).
export function rarityGlow(rarity, strength = 1) {
  if (!rarity || rarity.rank < 3) return {};
  return { emissive: rarity.color, emissiveIntensity: (0.12 + 0.07 * (rarity.rank - 3)) * strength };
}

export function partGroup(name) {
  const g = new THREE.Group();
  g.name = name;
  return g;
}

// Lathe from [r, y] points in mm (r >= 0), revolved around +Y.
export function latheMm(points, segments = 32, phiStart = 0, phiLength = TAU) {
  const pts = points.map(([r, y]) => new THREE.Vector2(Math.max(1e-5, r * MM), y * MM));
  return new THREE.LatheGeometry(pts, segments, phiStart, phiLength);
}

// Annular block (washer) from rIn..rOut mm, y0..y1 mm, with optional chamfers
// (mm) on the outer top/bottom and inner top edges.
export function annulusMm(rIn, rOut, y0, y1, segments = 48, { chamferTop = 0, chamferBottom = 0, chamferInner = 0 } = {}) {
  const p = [];
  p.push([rIn, y0]);
  p.push([rOut - chamferBottom, y0]);
  if (chamferBottom) p.push([rOut, y0 + chamferBottom]);
  p.push([rOut, y1 - chamferTop]);
  if (chamferTop) p.push([rOut - chamferTop, y1]);
  p.push([rIn + chamferInner, y1]);
  if (chamferInner) p.push([rIn, y1 - chamferInner]);
  p.push([rIn, y0]);
  return latheMm(p, segments);
}

// Extrude a closed outline given as [x, z] pairs in METRES (the convention
// of physics/profile.js profileOutline) between y = 0 and `height` metres,
// with an optional circular hole (radius metres) and bevel.
export function extrudeOutline(outline, holeR, height, { bevel = 0.0004, curveSegments = 24, holes = [] } = {}) {
  const shape = new THREE.Shape();
  outline.forEach(([x, z], i) => (i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)));
  shape.closePath();
  if (holeR > 0) {
    const hole = new THREE.Path();
    hole.absarc(0, 0, holeR, 0, TAU, true);
    shape.holes.push(hole);
  }
  for (const h of holes) shape.holes.push(h);
  const depth = Math.max(0.0002, height - bevel * 2);
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, bevel, 0);
  return geo;
}

// Same as extrudeOutline but from a THREE.Shape in the XZ plane (shape x = x,
// shape y = -z).
export function extrudeShape(shape, height, { bevel = 0.0003, curveSegments = 16 } = {}) {
  const depth = Math.max(0.0002, height - bevel * 2);
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, bevel, 0);
  return geo;
}

// Push vertices radially by dr(y, r, angle) metres (for raked/sloped faces).
export function radialWarp(geo, fn) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-6) continue;
    const d = fn(y, r, Math.atan2(z, x));
    const k = (r + d) / r;
    p.setXYZ(i, x * k, y, z * k);
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

// Place n copies around the axis: fn(i, angle) returns an Object3D placed at
// the origin facing +X; it is rotated to its angle.
export function radialArray(n, fn, phase = 0) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * TAU;
    const o = fn(i, a);
    if (!o) continue;
    const pivot = new THREE.Group();
    pivot.rotation.y = -a;
    pivot.add(o);
    g.add(pivot);
  }
  return g;
}

// Simple canvas helper for printed decals/stickers.
export function makeCanvas(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  return c;
}

// Planar top-down UVs (x,z -> u,v) over a disc of radius R metres; use with
// a canvas texture so a decal spans the part's footprint.
export function planarUV(geo, R) {
  const p = geo.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = 0.5 + p.getX(i) / (2 * R);
    uv[i * 2 + 1] = 0.5 - p.getZ(i) / (2 * R);
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}
