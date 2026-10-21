// Decodes the compact meshes tools/blender/*.py write (via
// tools/blender/mesh-to-module.mjs): per mesh, bounds and groups by palette
// slot, each group base64 of int16 positions over the bounds, int8 normals
// and uint16 indices. Decoded once per mesh object and shared.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const decoded = new WeakMap(); // mesh record -> [{ mat, geo, edges }]

function b64(str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

// [{ mat: palette slot, geo, edges (crease lines at creaseDeg) }] or null.
export function decodeMesh(m, creaseDeg = 35) {
  if (!m) return null;
  if (decoded.has(m)) return decoded.get(m);
  const buf = b64(m.data);
  const lo = m.min, span = m.max.map((v, i) => v - lo[i]);
  let off = 0;
  const parts = m.groups.map((g) => {
    const q = new Int16Array(buf, off, g.verts * 3); off += g.verts * 6;
    const nq = new Int8Array(buf, off, g.verts * 3); off += g.verts * 3;
    if (off % 2) off += 1;
    const idx = new Uint16Array(buf, off, g.index); off += g.index * 2;
    if (off % 4) off += 4 - (off % 4);
    const pos = new Float32Array(g.verts * 3), nor = new Float32Array(g.verts * 3);
    for (let i = 0; i < g.verts * 3; i++) {
      const a = i % 3;
      pos[i] = lo[a] + ((q[i] + 32768) / 65535) * span[a];
      nor[i] = nq[i] / 127;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setIndex(new THREE.BufferAttribute(new Uint16Array(idx), 1));
    geo.computeBoundingSphere();
    return { mat: g.mat, geo, edges: new THREE.EdgesGeometry(geo, creaseDeg) };
  });
  decoded.set(m, parts);
  return parts;
}

// Fewer draw calls: decoded parts regrouped so each key (a material bin) is
// one geometry. keyOf(slot) -> key, or null to keep that part on its own
// (spinners). Order of first appearance is kept. Cached per parts list and
// slot -> key mapping; the result shares geometry like decodeMesh.
const merged = new WeakMap(); // parts -> Map(signature -> [{ key, slots, geo, edges }])

// Only the decoded attributes: a shared geometry may already carry extras
// (addInk's inkNormal) that the others lack, which mergeGeometries refuses.
function bare(g) {
  const b = new THREE.BufferGeometry();
  for (const name of ['position', 'normal']) if (g.attributes[name]) b.setAttribute(name, g.attributes[name]);
  if (g.index) b.setIndex(g.index);
  return b;
}

function mergeGeo(list) {
  if (list.length === 1) return list[0];
  const geo = mergeGeometries(list.map(bare), false);
  geo.computeBoundingSphere();
  return geo;
}

export function mergeParts(parts, keyOf) {
  if (!parts) return null;
  const keys = parts.map((p) => keyOf(p.mat));
  const sig = keys.map((k, i) => (k == null ? '#' + i : k)).join('|');
  let cache = merged.get(parts);
  if (!cache) merged.set(parts, (cache = new Map()));
  if (cache.has(sig)) return cache.get(sig);
  const byKey = new Map(), out = [];
  parts.forEach((p, i) => {
    const k = keys[i];
    const e = k == null ? null : byKey.get(k);
    if (e) { e.slots.push(p.mat); e.geos.push(p.geo); e.edgeGeos.push(p.edges); return; }
    const entry = { key: k ?? p.mat, slots: [p.mat], geos: [p.geo], edgeGeos: [p.edges] };
    if (k != null) byKey.set(k, entry);
    out.push(entry);
  });
  const res = out.map((e) => ({ key: e.key, slots: e.slots, geo: mergeGeo(e.geos), edges: mergeGeo(e.edgeGeos) }));
  cache.set(sig, res);
  return res;
}

// One LineSegments for many crease-line sets, coloured per set
// (items: [{ edges, color }]). The merged positions are cached per edges
// list; the colours are built per call (they follow the part's colours).
const linePos = new WeakMap(); // first edges geometry -> [{ list, attr }]

export function creaseLines(items) {
  const list = items.map((it) => it.edges);
  let cached = linePos.get(list[0])?.find((c) => c.list.length === list.length && c.list.every((g, i) => g === list[i]));
  if (!cached) {
    const geo = mergeGeo(list);
    cached = { list, attr: geo.getAttribute('position') };
    if (!linePos.has(list[0])) linePos.set(list[0], []);
    linePos.get(list[0]).push(cached);
  }
  const col = new Float32Array(cached.attr.count * 3);
  let at = 0;
  const c = new THREE.Color();
  for (const it of items) {
    c.set(it.color);
    for (let n = it.edges.getAttribute('position').count; n > 0; n--, at += 3) { col[at] = c.r; col[at + 1] = c.g; col[at + 2] = c.b; }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', cached.attr);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true }));
}
