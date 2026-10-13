// Procedural 3D Spirit Chip spirit forms. Each form is built in local units
// (about 1 tall, base at y = 0, facing +z) from a few primitives merged per
// material, plus a handful of animated parts (wings, jaws, rings). Every
// vertex carries `aU` (0..1 along a body or tail) which the spirit shader
// uses for the travelling body wave. Built once per beast and pooled.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const TAU = Math.PI * 2;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();

// Tapered tube along a smooth curve through `points`; r(t) gives the radius.
export function tube(points, r, { radial = 10, segs = 40 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points);
  const fr = curve.computeFrenetFrames(segs, false);
  const pos = [], au = [], idx = [], P = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, P);
    const rad = typeof r === 'function' ? r(t) : r, N = fr.normals[i], B = fr.binormals[i];
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU, c = Math.cos(a) * rad, s = Math.sin(a) * rad;
      pos.push(P.x + c * N.x + s * B.x, P.y + c * N.y + s * B.y, P.z + c * N.z + s * B.z);
      au.push(t);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j, b = a + radial + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1); // outward winding
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aU', new THREE.Float32BufferAttribute(au, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return { geo: g, curve };
}

// Collects primitives with transforms and merges them into one mesh.
class Kit {
  constructor(q) { this.list = []; this.seg = q === 'low' ? 0.55 : q === 'medium' ? 0.8 : 1; }
  n(x) { return Math.max(3, Math.round(x * this.seg)); }
  add(geo, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1], u = 0, dir = null } = {}) {
    // merging needs identical layouts: non-indexed, position + normal + aU
    if (geo.index) { const flat = geo.toNonIndexed(); geo.dispose(); geo = flat; }
    if (geo.getAttribute('uv')) geo.deleteAttribute('uv');
    if (!geo.getAttribute('aU')) geo.setAttribute('aU', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count).fill(u), 1));
    if (dir) _q.setFromUnitVectors(V(0, 1, 0), dir.clone().normalize()); else _q.setFromEuler(_e.set(r[0], r[1], r[2]));
    geo.applyMatrix4(_m.compose(V(p[0], p[1], p[2]), _q, V(s[0], s[1], s[2])));
    this.list.push(geo);
    return this;
  }
  blob(rx, ry, rz, o) { return this.add(new THREE.SphereGeometry(1, this.n(16), this.n(12)), { ...o, s: [rx, ry, rz] }); }
  cone(radius, h, o) { const g = new THREE.ConeGeometry(radius, h, this.n(10)); g.translate(0, h / 2, 0); return this.add(g, o); }
  cyl(r0, r1, h, o) { const g = new THREE.CylinderGeometry(r1, r0, h, this.n(12)); g.translate(0, h / 2, 0); return this.add(g, o); }
  tube(points, r, o = {}) { return this.add(tube(points, r, { radial: this.n(o.radial || 10), segs: this.n(o.segs || 32) }).geo, o); }
  shape(pts, depth, o) {
    const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 4 });
    g.translate(0, 0, -depth / 2);
    return this.add(g, o);
  }
  mesh(mat) {
    const g = mergeGeometries(this.list, false);
    for (const x of this.list) x.dispose();
    this.list = [];
    return new THREE.Mesh(g, mat);
  }
}

// Each builder returns { group, animate(t, k) }; t = seconds, k = 0..1 of the manifestation.
function eyes(K, mats, pts, r = 0.018) {
  for (const p of pts) K.blob(r, r, r, { p });
  return K.mesh(mats.eye);
}

// Long coiled body rising around the top: dragon and serpent.
function coil(mats, q, { turns, thick, head }) {
  const K = new Kit(q), g = new THREE.Group();
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const s = i / 10, a = s * turns * TAU + 0.4, rad = 0.4 - 0.26 * s;
    pts.push(V(Math.cos(a) * rad, 0.04 + s * 0.74, Math.sin(a) * rad));
  }
  pts.push(V(0.04, 0.84, -0.02), V(0, 0.88, 0.08));
  const body = tube(pts, (t) => 0.012 + thick * Math.pow(t, 0.55), { radial: K.n(12), segs: K.n(64) });
  K.add(body.geo);
  const H = V(0, 0.89, 0.12);
  if (head === 'dragon') {
    // dorsal spines along the body
    const P = new THREE.Vector3(), T = new THREE.Vector3();
    for (let t = 0.18; t < 0.95; t += 0.07) {
      body.curve.getPointAt(t, P); body.curve.getTangentAt(t, T);
      const rr = 0.012 + thick * Math.pow(t, 0.55);
      K.cone(0.014 + 0.012 * t, 0.05 + 0.05 * t, { p: [P.x, P.y + rr * 0.8, P.z], dir: V(0, 1, 0).addScaledVector(T, -0.7), u: t });
    }
    K.blob(0.085, 0.07, 0.1, { p: [H.x, H.y, H.z] });
    K.blob(0.055, 0.04, 0.11, { p: [H.x, H.y - 0.015, H.z + 0.11] });
    for (const sx of [-1, 1]) {
      K.cone(0.02, 0.17, { p: [H.x + sx * 0.05, H.y + 0.05, H.z - 0.03], r: [-1.15, 0, sx * 0.3] });
      K.tube([V(sx * 0.04, H.y - 0.02, H.z + 0.19), V(sx * 0.15, H.y - 0.05, H.z + 0.17), V(sx * 0.26, H.y - 0.03, H.z + 0.06)], (t) => 0.008 * (1 - t) + 0.002, { radial: 5, segs: 12 });
      K.cone(0.016, 0.09, { p: [H.x + sx * 0.03, H.y + 0.03, H.z - 0.08], r: [-1.9, 0, sx * 0.5] });
    }
  } else {
    // hooded serpent head with fangs
    K.blob(0.17, 0.13, 0.03, { p: [H.x, H.y + 0.01, H.z - 0.05] });
    K.blob(0.07, 0.05, 0.1, { p: [H.x, H.y, H.z + 0.02] });
    for (const sx of [-1, 1]) K.cone(0.008, 0.04, { p: [H.x + sx * 0.02, H.y - 0.035, H.z + 0.09], r: [Math.PI, 0, 0] });
  }
  const main = K.mesh(mats.body);
  const jaw = new Kit(q).blob(0.045, 0.018, 0.09, { p: [0, -0.012, 0.07] }).mesh(mats.body);
  jaw.position.set(H.x, H.y - 0.03, H.z + (head === 'dragon' ? 0.02 : -0.02));
  g.add(main, jaw, eyes(new Kit(q), mats, head === 'dragon' ? [[0.045, H.y + 0.025, H.z + 0.07], [-0.045, H.y + 0.025, H.z + 0.07]] : [[0.035, H.y + 0.02, H.z + 0.08], [-0.035, H.y + 0.02, H.z + 0.08]]));
  return { group: g, wave: 0.045, fade: 0.2, animate(t) { g.rotation.y = Math.sin(t * 0.9) * 0.25; jaw.rotation.x = 0.25 + 0.25 * Math.sin(t * 7); } };
}

// Feathered or finned wing outline (x = span outward, y = up), mirrored by `side`.
function wingPoints(side, kind) {
  const pts = kind === 'raven'
    ? [[0, 0], [0.12, 0.2], [0.34, 0.3], [0.6, 0.26], [0.5, 0.18], [0.56, 0.12], [0.44, 0.07], [0.48, 0.0], [0.36, -0.02], [0.36, -0.1], [0.24, -0.06], [0.2, -0.14], [0.1, -0.05]]
    : [[0, 0], [0.1, 0.24], [0.3, 0.42], [0.56, 0.44], [0.5, 0.34], [0.58, 0.28], [0.46, 0.2], [0.52, 0.12], [0.38, 0.08], [0.42, -0.02], [0.28, 0.0], [0.26, -0.1], [0.12, -0.04]];
  return pts.map(([x, y]) => [x * side, y]);
}

function bird(mats, q, kind) {
  const K = new Kit(q), g = new THREE.Group();
  const raven = kind === 'raven';
  K.blob(0.085, 0.15, 0.08, { p: [0, 0.55, 0], r: [0.25, 0, 0] });
  K.blob(0.06, 0.06, 0.065, { p: [0, 0.74, 0.07] });
  K.cone(raven ? 0.018 : 0.022, raven ? 0.11 : 0.07, { p: [0, 0.73, 0.12], r: [Math.PI / 2, 0, 0] });
  if (raven) {
    K.shape([[0, 0], [0.16, -0.26], [0.05, -0.22], [0, -0.3], [-0.05, -0.22], [-0.16, -0.26]], 0.012, { p: [0, 0.44, -0.06], r: [0.5, 0, 0] });
  } else {
    for (const a of [-0.35, 0, 0.35]) K.cone(0.015, 0.1, { p: [0, 0.78, 0.04], r: [-0.9, 0, a] });
    for (const sx of [-1, 0, 1]) {
      K.tube([V(0, 0.45, -0.05), V(sx * 0.08, 0.3, -0.13), V(sx * 0.17, 0.13, -0.08), V(sx * 0.1, 0.0, 0.02)], (t) => 0.028 * (1 - t) + 0.004, { radial: 8, segs: 24, u: 0 });
    }
  }
  const main = K.mesh(mats.body);
  const wings = [-1, 1].map((side) => {
    const w = new Kit(q).shape(wingPoints(side, kind), 0.014, {}).mesh(mats.body);
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.05, 0.6, -0.01);
    pivot.rotation.order = 'XYZ';
    pivot.add(w);
    pivot.userData.side = side;
    return pivot;
  });
  g.add(main, ...wings, eyes(new Kit(q), mats, [[0.03, 0.76, 0.11], [-0.03, 0.76, 0.11]], 0.012));
  return {
    group: g, wave: 0, fade: 0.22,
    animate(t) {
      const flap = Math.sin(t * (raven ? 8 : 6));
      for (const p of wings) {
        // spread back toward horizontal so the wings read from the high broadcast camera too
        p.rotation.set(-0.75, p.userData.side * 0.18 * flap, p.userData.side * (0.15 + 0.2 * flap));
      }
      g.position.y = 0.03 * Math.sin(t * 3);
    },
  };
}

function manta(mats, q) {
  const K = new Kit(q), g = new THREE.Group();
  K.blob(0.12, 0.05, 0.16, { p: [0, 0.6, 0] });
  for (const sx of [-1, 1]) K.cone(0.02, 0.09, { p: [sx * 0.06, 0.6, 0.13], r: [1.3, 0, -sx * 0.3] });
  K.tube([V(0, 0.6, -0.14), V(0, 0.5, -0.35), V(0.06, 0.32, -0.45), V(0.0, 0.15, -0.5)], (t) => 0.014 * (1 - t) + 0.002, { radial: 6, segs: 24 });
  const main = K.mesh(mats.body);
  const halves = [-1, 1].map((side) => {
    const pts = [[0, 0.16], [0.18, 0.12], [0.36, 0.0], [0.52, -0.1], [0.3, -0.08], [0.12, -0.14], [0, -0.16]].map(([x, y]) => [x * side, y]);
    const m = new Kit(q).shape(pts, 0.02, { r: [-Math.PI / 2, 0, 0] }).mesh(mats.body);
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.06, 0.6, 0);
    pivot.add(m);
    pivot.userData.side = side;
    return pivot;
  });
  g.add(main, ...halves, eyes(new Kit(q), mats, [[0.07, 0.63, 0.1], [-0.07, 0.63, 0.1]], 0.012));
  g.scale.setScalar(1.35);
  return {
    group: g, wave: 0.02, fade: 0.25,
    animate(t) {
      for (const p of halves) p.rotation.z = p.userData.side * 0.45 * Math.sin(t * 3.5);
      g.rotation.x = 0.45 + 0.08 * Math.sin(t * 1.7);
      g.position.y = -0.1 + 0.04 * Math.sin(t * 2.2);
    },
  };
}

// Head-and-shoulders beasts rearing up: wolf, lion, stag.
function bust(mats, q, kind) {
  const K = new Kit(q), g = new THREE.Group();
  K.blob(0.14, 0.16, 0.12, { p: [0, 0.26, 0] });
  K.blob(0.09, 0.15, 0.09, { p: [0, 0.44, 0.04], r: [0.35, 0, 0] });
  for (const sx of [-1, 1]) K.cyl(0.035, 0.028, 0.2, { p: [sx * 0.08, 0.0, 0.07] });
  const H = kind === 'stag' ? V(0, 0.62, 0.1) : V(0, 0.6, 0.1);
  const head = new Kit(q);
  if (kind === 'wolf') {
    head.blob(0.1, 0.09, 0.12, { p: [0, 0, 0] });
    head.cyl(0.06, 0.03, 0.15, { p: [0, -0.02, 0.06], r: [Math.PI / 2, 0, 0] });
    head.blob(0.018, 0.016, 0.016, { p: [0, -0.005, 0.22] });
    for (const sx of [-1, 1]) {
      head.cone(0.035, 0.12, { p: [sx * 0.055, 0.07, -0.03], r: [-0.25, 0, -sx * 0.3] });
      for (let i = 0; i < 3; i++) head.cone(0.025, 0.09, { p: [sx * 0.08, -0.04 - i * 0.03, -0.03], r: [-0.6, 0, -sx * (1.6 + i * 0.25)] });
    }
  } else if (kind === 'lion') {
    head.blob(0.11, 0.1, 0.11, { p: [0, 0, 0] });
    head.blob(0.065, 0.05, 0.065, { p: [0, -0.03, 0.09] });
    const n = 16;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, len = i % 2 ? 0.14 : 0.19;
      head.cone(0.045, len, { p: [Math.cos(a) * 0.08, Math.sin(a) * 0.08, -0.05], dir: V(Math.cos(a), Math.sin(a), -0.35) });
    }
    for (const sx of [-1, 1]) head.blob(0.025, 0.03, 0.015, { p: [sx * 0.08, 0.09, 0.0] });
  } else {
    head.blob(0.07, 0.07, 0.13, { p: [0, 0, 0] });
    head.blob(0.045, 0.04, 0.06, { p: [0, -0.02, 0.12] });
    for (const sx of [-1, 1]) {
      head.cone(0.025, 0.08, { p: [sx * 0.06, 0.03, -0.03], r: [0, 0, -sx * 1.3] });
      const beam = [V(sx * 0.04, 0.05, -0.02), V(sx * 0.12, 0.17, -0.06), V(sx * 0.2, 0.28, -0.08), V(sx * 0.26, 0.4, -0.04)];
      head.tube(beam, (t) => 0.016 * (1 - t) + 0.005, { radial: 6, segs: 16 });
      for (const [i, len] of [[1, 0.1], [2, 0.12], [3, 0.08]]) {
        const b = beam[i];
        head.tube([b, V(b.x + sx * 0.01, b.y + len, b.z + 0.04)], (t) => 0.01 * (1 - t) + 0.003, { radial: 5, segs: 6 });
      }
    }
  }
  const headMesh = head.mesh(mats.body);
  const headGroup = new THREE.Group();
  headGroup.position.copy(H);
  headGroup.scale.setScalar(kind === 'stag' ? 1.3 : 1.6); // antlers make the stag tall enough
  const jaw = new Kit(q).blob(kind === 'stag' ? 0.035 : 0.05, 0.018, kind === 'stag' ? 0.09 : 0.1, { p: [0, -0.01, 0.07] }).mesh(mats.body);
  jaw.position.set(0, -0.05, 0.02);
  const eyePts = kind === 'stag' ? [[0.05, 0.02, 0.06], [-0.05, 0.02, 0.06]] : [[0.045, 0.025, 0.085], [-0.045, 0.025, 0.085]];
  headGroup.add(headMesh, jaw, eyes(new Kit(q), mats, eyePts, 0.014));
  g.add(K.mesh(mats.body), headGroup);
  return {
    group: g, wave: 0, fade: 0.18,
    animate(t, k) {
      const roar = Math.max(0, Math.sin(Math.min(1, k * 2.2) * Math.PI));
      jaw.rotation.x = 0.1 + 0.6 * roar;
      headGroup.rotation.x = -0.35 * roar + 0.05 * Math.sin(t * 2);
      g.rotation.x = -0.12 * roar;
    },
  };
}

function tortoise(mats, q) {
  const K = new Kit(q), g = new THREE.Group();
  K.add(new THREE.SphereGeometry(1, 6, 3, 0, TAU, 0, Math.PI / 2), { p: [0, 0.16, 0], s: [0.4, 0.26, 0.4] });
  K.cyl(0.42, 0.4, 0.04, { p: [0, 0.12, 0], s: [1, 1, 1] });
  K.tube([V(0, 0.18, 0.3), V(0, 0.24, 0.42), V(0, 0.26, 0.5)], 0.045, { radial: 8, segs: 8 });
  K.blob(0.075, 0.065, 0.09, { p: [0, 0.27, 0.54] });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) K.cyl(0.06, 0.05, 0.14, { p: [sx * 0.26, 0.0, sz * 0.22] });
  const main = K.mesh(mats.body);
  const C = new Kit(q);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + Math.PI / 6;
    C.add(new THREE.OctahedronGeometry(0.05), { p: [Math.cos(a) * 0.22, 0.33, Math.sin(a) * 0.22], s: [1, 2.4, 1] });
  }
  C.add(new THREE.OctahedronGeometry(0.07), { p: [0, 0.5, 0], s: [1, 3, 1] });
  const crystals = C.mesh(mats.body);
  g.add(main, crystals, eyes(new Kit(q), mats, [[0.04, 0.29, 0.6], [-0.04, 0.29, 0.6]], 0.012));
  return { group: g, wave: 0, fade: 0.04, animate(t) { crystals.rotation.y = t * 0.8; crystals.scale.setScalar(1 + 0.06 * Math.sin(t * 5)); } };
}

function scorpion(mats, q) {
  const K = new Kit(q), g = new THREE.Group();
  K.blob(0.1, 0.06, 0.11, { p: [0, 0.12, 0.14] });
  K.blob(0.12, 0.065, 0.12, { p: [0, 0.13, 0.0] });
  K.blob(0.09, 0.055, 0.1, { p: [0, 0.13, -0.15] });
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const z = 0.1 - i * 0.12;
      K.tube([V(sx * 0.08, 0.13, z), V(sx * 0.2, 0.18, z - 0.02), V(sx * 0.27, 0.0, z - 0.05)], 0.012, { radial: 5, segs: 10 });
    }
    K.tube([V(sx * 0.07, 0.13, 0.22), V(sx * 0.2, 0.2, 0.32), V(sx * 0.13, 0.22, 0.44)], 0.022, { radial: 7, segs: 12 });
    K.blob(0.05, 0.035, 0.06, { p: [sx * 0.13, 0.22, 0.49] });
    K.cone(0.02, 0.08, { p: [sx * 0.11, 0.24, 0.53], r: [1.3, 0, sx * 0.4] });
  }
  K.tube([V(0, 0.15, -0.22), V(0, 0.3, -0.34), V(0, 0.55, -0.34), V(0, 0.74, -0.18), V(0, 0.78, 0.02), V(0, 0.7, 0.12)],
    (t) => (0.055 - 0.03 * t) * (0.82 + 0.18 * Math.abs(Math.sin(t * Math.PI * 6))), { radial: 10, segs: 48, u: 0 });
  K.cone(0.03, 0.1, { p: [0, 0.7, 0.13], r: [2.3, 0, 0] });
  const main = K.mesh(mats.body);
  g.add(main, eyes(new Kit(q), mats, [[0.03, 0.17, 0.22], [-0.03, 0.17, 0.22]], 0.012));
  return { group: g, wave: 0, fade: 0.03, animate(t, k) { main.rotation.x = -0.08 * Math.max(0, Math.sin(k * Math.PI * 2.5)); g.position.y = 0.01 * Math.sin(t * 4); } };
}

// Armillary sphere: a glowing core inside counter-rotating rings with orbiting stars.
function orrery(mats, q) {
  const K = new Kit(q), g = new THREE.Group();
  K.blob(0.11, 0.11, 0.11, { p: [0, 0.55, 0] });
  K.cone(0.03, 0.22, { p: [0, 0.62, 0] });
  K.cone(0.03, 0.22, { p: [0, 0.48, 0], r: [Math.PI, 0, 0] });
  const core = K.mesh(mats.body);
  const rings = [[0.34, 0.2, 0.3], [0.27, 1.2, -0.5], [0.4, -0.9, 0.8]].map(([R, tx, tz]) => {
    const m = new Kit(q).add(new THREE.TorusGeometry(R, 0.026, 8, Math.round(64 * (q === 'low' ? 0.5 : 1))), { r: [Math.PI / 2, 0, 0] }).mesh(mats.body);
    const p = new THREE.Group(); p.position.y = 0.55; p.rotation.set(tx, 0, tz); p.add(m);
    return { p, m };
  });
  const S = new Kit(q);
  for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; S.blob(0.03, 0.03, 0.03, { p: [Math.cos(a) * 0.34, 0, Math.sin(a) * 0.34] }); }
  const stars = S.mesh(mats.eye);
  rings[0].p.add(stars);
  g.add(core, ...rings.map((r) => r.p));
  return {
    group: g, wave: 0, fade: 0.2,
    animate(t) { rings.forEach((r, i) => { r.m.rotation.z = t * (0.9 + i * 0.5) * (i % 2 ? -1 : 1); }); stars.rotation.y = t * 1.4; core.rotation.y = t * 0.6; },
  };
}

export const SPIRIT_FORMS = {
  dragon: (m, q) => coil(m, q, { turns: 1.15, thick: 0.07, head: 'dragon' }),
  serpent: (m, q) => coil(m, q, { turns: 1.6, thick: 0.085, head: 'serpent' }),
  phoenix: (m, q) => bird(m, q, 'phoenix'),
  raven: (m, q) => bird(m, q, 'raven'),
  manta: (m, q) => manta(m, q),
  wolf: (m, q) => bust(m, q, 'wolf'),
  lion: (m, q) => bust(m, q, 'lion'),
  stag: (m, q) => bust(m, q, 'stag'),
  tortoise: (m, q) => tortoise(m, q),
  scorpion: (m, q) => scorpion(m, q),
  zero: (m, q) => orrery(m, q),
};

// mats: { body, eye }. Unknown emblems fall back to the orrery.
export function buildSpiritForm(emblem, mats, quality = 'high') {
  return (SPIRIT_FORMS[emblem] || SPIRIT_FORMS.zero)(mats, quality);
}
