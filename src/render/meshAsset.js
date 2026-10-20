// Decodes the compact meshes tools/blender/*.py write (via
// tools/blender/mesh-to-module.mjs): per mesh, bounds and groups by palette
// slot, each group base64 of int16 positions over the bounds, int8 normals
// and uint16 indices. Decoded once per mesh object and shared.

import * as THREE from 'three';

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
