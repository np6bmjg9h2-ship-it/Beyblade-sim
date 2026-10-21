// Weight disc models: the metal disc between the lock and the attack ring.
//
// Each disc is built from separate pieces, the way the toy is made: a
// machined metal body (hard-edged lathe profiles and pierced plates), dark
// anodised trim (bands, webs, bumpers, spacers), accent-painted inserts,
// chrome hardware (screws, slugs, rivets), an optional second metal (the
// brass counterweight) and an engraved top print. Pieces are merged per
// material, so a disc is at most 6 meshes.
//
// The ring sits on the disc from 0.85 * thickness and hides most of its top,
// so each design puts its character where it shows: the side wall (bands,
// belts, notches, pads), the underside (steps, pockets, cut-outs) and any
// rim reaching past the ring. Physics shows through: rim-heavy discs get a
// thick rim over a thin pierced web, light ones are skeletal, eccentric ones
// carry their weight on +X, contact discs wear a bumper.
//
// Envelope: annulus rIn..rOut (+0.2 for raised hardware), y in [0, thickness];
// the bore r < rIn stays open for the lock boss.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MM, TAU, partGroup, toonMaterial, inked, segs, canvasTexture, rarityGlow, extrudeShape, metalFinish } from './common.js';
import { CLASSIC_DISCS, buildClassicDisc } from './discClassic.js';
import { buildDiscModel } from './discModel.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const PI = Math.PI;

// ------------------------------------------------------------ designs
//
// kind picks the construction; sig is the accent used when the player colour
// doesn't contrast with the metal; label is the engraved code.
const DESIGNS = {
  // decagonal even plate, dark mid band with accent studs on every other facet
  disc_ten: { kind: 'ten', facets: 10, label: 'TEN', sig: '#ff4a6e' },
  // flywheel: full-height rim with a protruding chrome belt over a thin dark web pierced by kidney cut-outs
  disc_heavyring: { kind: 'heavy', cutouts: 5, label: 'HEAVY RING', sig: '#ffb21e' },
  // skeletal: swept feather tips on a dark spine ring, lancet slots between spokes
  disc_feather: { kind: 'feather', feathers: 12, label: 'FEATHER', sig: '#36d6ff' },
  // centre plate inside a dark bumper ring with accent contact pads
  disc_wide: { kind: 'wide', pockets: 8, label: 'WIDE', sig: '#ff7a1f' },
  // bronze plate with a segmented brass crescent weight on +X
  disc_counter: { kind: 'counter', label: 'CW', sig: '#ff3b5c', alt: '#e0aa3c' },
  // rim-weighted with a dark mount channel and four skirt ports holding accent latches
  disc_orbit: { kind: 'orbit', ports: 4, label: 'ORBIT', sig: '#8a5cff' },
  // slim reeded coin with an accent pinstripe and a dark inlay ring
  disc_compact: { kind: 'compact', label: 'COMPACT', sig: '#1fe0a6' },
  // ziggurat: stepped underside, six armour blocks with chevrons and bolts
  disc_titan: { kind: 'titan', blocks: 6, label: 'TITAN', sig: '#ff5a1f', shade: -0.04 },
};

// Design for an unknown disc, from its numbers alone.
function autoDesign(part) {
  const T = part.thickness || 4, md = part.massDist || 0, mass = part.mass || 18;
  const kind = (part.ecc || 0) >= 0.08 ? 'counter'
    : part.contact ? 'wide'
    : part.auxPort ? 'orbit'
    : mass <= 13 ? 'feather'
    : T <= 3.4 ? 'compact'
    : md >= 0.55 && (mass >= 27 || T >= 5.3) ? 'titan'
    : md >= 0.5 ? 'heavy'
    : 'ten';
  const words = (part.name || 'DISC').replace(/disc/i, '').trim().split(/\s+/).filter(Boolean);
  const label = (words.length > 1 ? words.map((w) => w[0]).join('') : (words[0] || 'DISC').slice(0, 6)).toUpperCase();
  return {
    kind, label,
    facets: clamp(2 * Math.round(mass / 4), 6, 12), // even, so studs alternate
    cutouts: md > 0.7 ? 5 : 6, blocks: mass >= 30 ? 8 : 6,
    alt: kind === 'counter' ? '#dca23e' : undefined, // brass counterweight
    shade: kind === 'titan' ? -0.04 : undefined,
  };
}

// ------------------------------------------------------------ colours

const _a = new THREE.Color(), _b = new THREE.Color();
const hslOf = (hex) => _a.set(hex).getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace);
const hslHex = (h, s, l) => '#' + _a.setHSL(h, s, l, THREE.SRGBColorSpace).getHexString();

// Accent follows the player colour unless it is grey or too close to the
// metal (then the design's signature colour); kept saturated and mid-bright.
function pickAccent(acc, main, sig) {
  const h = hslOf(acc);
  _a.set(acc); _b.set(main);
  const dist = Math.abs(_a.r - _b.r) + Math.abs(_a.g - _b.g) + Math.abs(_a.b - _b.b);
  if (h.s < 0.3 || dist < 0.45) return sig;
  return hslHex(h.h, Math.max(h.s, 0.65), clamp(h.l, 0.48, 0.64));
}

// Catalogue colours are pale and wash out under the key light, so the metal
// is pushed deeper (but kept clear of the dark trim, which is a deep shade
// of the same hue).
function palette(part, ctx, d) {
  const base = part.color || '#b8bec8';
  const m = hslOf(base);
  const main = hslHex(m.h, clamp(m.s * 1.2 + 0.03, 0, 0.6), clamp(m.l + (d.shade ?? -0.17), 0.36, 0.8));
  const dark = d.dark || hslHex(m.h, clamp(m.s * 0.8 + 0.14, 0.14, 0.4), m.l < 0.5 ? 0.11 : 0.15);
  const sig = d.sig || hslHex((m.h + 0.5) % 1, 0.85, 0.55);
  const accent = pickAccent(ctx.accent || sig, base, sig);
  const alt = d.alt || hslHex((m.h + 0.08) % 1, 0.6, 0.55);
  const print = { main: hslHex(m.h, 0.3, 0.16), dark: '#e9eef6', alt: '#4a2c0c' };
  return { main, dark, accent, alt, print, rarity: ctx.rarity?.color || null };
}

// ------------------------------------------------------------ geometry helpers

const V = (r, y, a) => new THREE.Vector3(r * Math.cos(a) * MM, y * MM, r * Math.sin(a) * MM);
const pol = (r, a) => [r * Math.cos(a), r * Math.sin(a)];

// Append a triangle, flipped if needed so its face points along `ref`.
function tri(o, A, B, C, nA, nB, nC, tA, tB, tC, ref) {
  const c = new THREE.Vector3().subVectors(B, A).cross(new THREE.Vector3().subVectors(C, A));
  if (c.lengthSq() < 1e-26) return;
  if (c.dot(ref) < 0) { [B, C] = [C, B]; [nB, nC] = [nC, nB]; [tB, tC] = [tC, tB]; }
  o.p.push(A.x, A.y, A.z, B.x, B.y, B.z, C.x, C.y, C.z);
  o.n.push(nA.x, nA.y, nA.z, nB.x, nB.y, nB.z, nC.x, nC.y, nC.z);
  o.u.push(tA[0], tA[1], tB[0], tB[1], tC[0], tC[1]);
}

function toGeo(o) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(o.p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(o.n, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(o.u, 2));
  return g;
}

// Hard-edged lathe of a CLOSED [r, y] mm profile (either winding; it is
// normalised so faces point out). Every profile segment gets its own normals
// (crisp chamfers). facets > 0 gives a flat-sided polygon with vertices at
// a0 + k * span / facets. A partial sweep with caps closes the cut ends.
function lathe(pts, { n = 48, facets = 0, a0 = 0, span = TAU, caps = false } = {}) {
  let P = pts.filter((p, i) => i === 0 || Math.abs(p[0] - pts[i - 1][0]) + Math.abs(p[1] - pts[i - 1][1]) > 1e-6);
  if (P.length > 2 && Math.abs(P[0][0] - P.at(-1)[0]) + Math.abs(P[0][1] - P.at(-1)[1]) < 1e-6) P.pop();
  let area = 0;
  for (let i = 0; i < P.length; i++) { const [a, b] = P[i], [c, d] = P[(i + 1) % P.length]; area += a * d - c * b; }
  if (area < 0) P = P.slice().reverse();
  const M = P.length, N = facets || n, step = span / N, k = facets ? Math.cos(step / 2) : 1;
  const o = { p: [], n: [], u: [] };
  const acc = [0];
  for (let i = 0; i < M; i++) { const q = P[(i + 1) % M]; acc.push(acc[i] + Math.hypot(q[0] - P[i][0], q[1] - P[i][1])); }
  for (let i = 0; i < M; i++) {
    const [r0, y0] = P[i], [r1, y1] = P[(i + 1) % M];
    const dr = r1 - r0, dy = y1 - y0;
    const l = Math.hypot(dy, dr * k) || 1, nr = dy / l, ny = (-dr * k) / l;
    const nAt = (a) => new THREE.Vector3(nr * Math.cos(a), ny, nr * Math.sin(a));
    const v0 = acc[i] / acc[M], v1 = acc[i + 1] / acc[M];
    for (let j = 0; j < N; j++) {
      const a = a0 + j * step, b = a + step, m = a + step / 2;
      const nm = nAt(m), na = facets ? nm : nAt(a), nb = facets ? nm : nAt(b);
      const A = V(r0, y0, a), B = V(r0, y0, b), C = V(r1, y1, b), D = V(r1, y1, a);
      const ua = j / N, ub = (j + 1) / N;
      tri(o, A, D, C, na, na, nb, [ua, v0], [ua, v1], [ub, v1], nm);
      tri(o, A, C, B, na, nb, nb, [ua, v0], [ub, v1], [ub, v0], nm);
    }
  }
  if (caps && span < TAU - 1e-6) {
    const faces = THREE.ShapeUtils.triangulateShape(P.map(([r, y]) => new THREE.Vector2(r, y)), []);
    for (const [a, sgn] of [[a0, -1], [a0 + span, 1]]) {
      const nrm = new THREE.Vector3(-Math.sin(a) * sgn, 0, Math.cos(a) * sgn);
      for (const [i, j, q] of faces) tri(o, V(...P[i], a), V(...P[j], a), V(...P[q], a), nrm, nrm, nrm, [0, 0], [0, 0], [0, 0], nrm);
    }
  }
  return toGeo(o);
}

// Round bore collar r0..rH, y0..y1 (mm) with small chamfers.
function hub(L, rH, y0, y1) {
  const c = Math.min(0.4, (y1 - y0) * 0.15, (rH - L.r0) * 0.3);
  return lathe([[L.r0 + c, y0], [rH - c, y0], [rH, y0 + c], [rH, y1 - c], [rH - c, y1], [L.r0 + c, y1], [L.r0, y1 - c], [L.r0, y0 + c]], { n: L.nh });
}

// Flat plate between y0 and y1 (mm) from an outline [[x, z], ...] mm with
// holes, bevelled. The bevel grows the outline (and shrinks holes) by `bevel`.
function plate(outer, holes, y0, y1, bevel = 0.15) {
  const v2 = (pts) => pts.map(([x, z]) => new THREE.Vector2(x * MM, -z * MM));
  const s = new THREE.Shape(v2(outer));
  for (const h of holes) s.holes.push(new THREE.Path(v2(h)));
  const g = extrudeShape(s, (y1 - y0) * MM, { bevel: bevel * MM, curveSegments: 1 });
  g.translate(0, y0 * MM, 0);
  return g;
}

// Bevelled block x0..x1 (radial), |z| <= hw, y0..y1 (final extents), on +X.
function box(x0, x1, hw, y0, y1, bevel = 0.06) {
  const b = bevel;
  return plate([[x0 + b, -hw + b], [x1 - b, -hw + b], [x1 - b, hw - b], [x0 + b, hw - b]], [], y0, y1, b);
}

// Shape in the (tangent t, height y) plane, mm, extruded radially r0..r1 on +X.
function facePlate(pts, r0, r1, bevel = 0.05) {
  const s = new THREE.Shape(pts.map(([t, y]) => new THREE.Vector2(t * MM, y * MM)));
  const depth = Math.max(0.02, r1 - r0 - 2 * bevel) * MM;
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel * MM, bevelSize: bevel * MM, bevelSegments: 1, curveSegments: 2 });
  g.translate(0, 0, bevel * MM);
  g.rotateY(PI / 2); // depth -> +X (radial), t -> -Z
  g.translate(r0 * MM, 0, 0);
  return g;
}

// Shape in the radial (r, y) plane, mm, extruded tangentially to width w
// (centred on +X): gussets and ribs. The bevel grows the shape by `bevel`.
function rib(pts, w, bevel = 0.06) {
  const s = new THREE.Shape(pts.map(([r, y]) => new THREE.Vector2(r * MM, y * MM)));
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.02, w - 2 * bevel) * MM, bevelEnabled: bevel > 0, bevelThickness: bevel * MM, bevelSize: bevel * MM, bevelSegments: 1, curveSegments: 1 });
  g.translate(0, 0, -(w / 2 - bevel) * MM);
  return g;
}

// Rotate a geometry built on +X to polar angle a (same convention as lathe).
const at = (geo, a) => geo.rotateY(-a);

// Hex screw head standing on a face at y, radius r, angle a (mm).
function screw(r, a, y, size = 0.42, h = 0.22) {
  const g = new THREE.CylinderGeometry(size * MM, size * 1.12 * MM, h * MM, 6);
  g.translate(r * MM, (y + h / 2) * MM, 0);
  return at(g, a + 0.3);
}
// Dome-less rivet on a vertical wall (outward along +X from radius r), angle a.
function rivet(r, a, y, size = 0.34, h = 0.18) {
  const g = new THREE.CylinderGeometry(size * 0.75 * MM, size * MM, h * MM, 8);
  g.rotateZ(-PI / 2);
  g.translate((r + h / 2) * MM, y * MM, 0);
  return at(g, a);
}
// Round slug / puck standing vertically from y0 to y1 at radius r, angle a.
function puck(r, a, y0, y1, rad, n = 12) {
  const g = new THREE.CylinderGeometry(rad * MM, rad * MM, (y1 - y0) * MM, n);
  g.translate(r * MM, ((y0 + y1) / 2) * MM, 0);
  return at(g, a);
}

// Outline helpers, [x, z] mm.
function circle(r, n, cx = 0, cz = 0) {
  return Array.from({ length: n }, (_, i) => { const a = (i / n) * TAU; return [cx + r * Math.cos(a), cz + r * Math.sin(a)]; });
}
// Kidney slot: centreline radius rc, radial width w, centre angle a, arc
// half-angle h, round ends.
function kidney(rc, w, a, h, m = 8, mc = 5) {
  const pts = [], ro = rc + w / 2, ri = rc - w / 2;
  for (let i = 0; i <= m; i++) pts.push(pol(ro, a - h + (2 * h * i) / m));
  const cap = (ac, sgn) => {
    const [cx, cz] = pol(rc, ac), ux = Math.cos(ac), uz = Math.sin(ac), tx = -uz * sgn, tz = ux * sgn;
    for (let k = 1; k < mc; k++) {
      const th = (k / mc) * PI, cr = Math.cos(th) * (w / 2) * sgn, sr = Math.sin(th) * (w / 2);
      pts.push([cx + ux * cr + tx * sr, cz + uz * cr + tz * sr]);
    }
  };
  cap(a + h, 1);
  for (let i = m; i >= 0; i--) pts.push(pol(ri, a - h + (2 * h * i) / m));
  cap(a - h, -1);
  return pts;
}
// Pocket between straight spokes of half-width hs: r0..r1 around angle a in
// a sector of angular pitch sp.
function pocket(r0, r1, a, sp, hs) {
  const h0 = sp / 2 - hs / r0, h1 = sp / 2 - hs / r1;
  return [pol(r0, a - h0), pol(r1, a - h1), pol(r1, a), pol(r1, a + h1), pol(r0, a + h0)];
}

// Smooth the outer walls of an extruded round plate: outward-facing vertices
// beyond rMin get radial normals (keeping their vertical part), so a polygon
// edge shades like a turned rim instead of flat facets.
function smoothRadial(geo, rMin) {
  const p = geo.attributes.position, nn = geo.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z);
    if (r < rMin * MM) continue;
    const nx = nn.getX(i), ny = nn.getY(i), nz = nn.getZ(i), hz = Math.hypot(nx, nz);
    if ((nx * x + nz * z) / (r * (hz || 1)) < 0.3) continue;
    nn.setXYZ(i, (x / r) * hz, ny, (z / r) * hz);
  }
  nn.needsUpdate = true;
  return geo;
}

// Non-indexed, position/normal/uv only (the shape mergeGeometries needs).
function prep(geo) {
  let g = geo;
  if (g.index) { g = geo.toNonIndexed(); geo.dispose(); }
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  g.clearGroups();
  return g;
}

// Flat upward annulus rA..rB at y (mm) with polar-planar UVs over radius Re.
function flatRing(rA, rB, y, n, Re, a0 = 0, span = TAU) {
  const o = { p: [], n: [], u: [] }, up = new THREE.Vector3(0, 1, 0);
  const uv = (r, a) => [0.5 + (r * Math.cos(a)) / (2 * Re), 0.5 - (r * Math.sin(a)) / (2 * Re)];
  for (let j = 0; j < n; j++) {
    const a = a0 + (j / n) * span, b = a0 + ((j + 1) / n) * span;
    const A = V(rA, y, a), B = V(rB, y, a), C = V(rB, y, b), D = V(rA, y, b);
    tri(o, A, B, C, up, up, up, uv(rA, a), uv(rB, a), uv(rB, b), up);
    tri(o, A, C, D, up, up, up, uv(rA, a), uv(rB, b), uv(rA, b), up);
  }
  return toGeo(o);
}

// ------------------------------------------------------------ constructions
//
// Each kind fills material buckets K (main, dark, alt, accent, chrome) with
// geometries and pushes decal regions to `deco`:
//   { rA, rB, y, a0?, span?, on: 'main'|'dark'|'alt', texts: [{ s, a }], marks: [a] }

const arcN = (L, span) => Math.max(3, Math.round((L.n * span) / TAU));

const KINDS = {
  // Decagonal even plate. Faceted body with an underside relief ring and a top
  // recess; a dark band runs round the facets with accent studs on every
  // other facet; screws in the recess.
  ten(K, L, d, deco) {
    const { r0, R, T, S } = L;
    const F = d.facets || 10, st = TAU / F, kf = Math.cos(st / 2), fac = { facets: F, a0: -st / 2 };
    const c = clamp(0.15 * T, 0.35, 0.75), rH = r0 + 0.27 * S, rb = rH - 0.4;
    const rU1 = R - clamp(0.17 * S, 1.6, 3), g0 = 0.34 * T, g1 = 0.62 * T, gd = 0.6;
    const rr0 = r0 + 0.45 * S, rr1 = R - clamp(0.1 * S, 1, 1.8), dr = 0.3;
    K.main.push(hub(L, rH, 0, T - 0.12));
    K.main.push(lathe([[rb, 0.35], [rU1, 0.35], [rU1, 0], [R - c, 0], [R, c], [R, g0], [R - gd, g0], [R - gd, g1], [R, g1], [R, T - c], [R - c, T], [rr1, T], [rr1, T - dr], [rr0, T - dr], [rr0, T], [rb, T]], fac));
    K.dark.push(lathe([[R - gd - 0.05, g0 + 0.05], [R - 0.3, g0 + 0.05], [R - 0.3, g1 - 0.05], [R - gd - 0.05, g1 - 0.05]], fac));
    const hw = clamp(0.2 * R * Math.sin(st / 2), 0.6, 1.4);
    for (let j = 0; j < F; j += 2) K.accent.push(at(box((R - gd + 0.1) * kf, (R - 0.1) * kf, hw, g0 + 0.1, g1 - 0.1), j * st));
    // underside: a dark faceted inlay ring round the hub, then a short radial
    // rib under every facet vertex out to the relief step (a gear-like rosette)
    const yR = 0.35, rI0 = rb + 1.0, rI1 = lerp(rb, rU1, 0.55);
    K.dark.push(lathe([[rI0, yR + 0.02], [rI1, yR + 0.02], [rI1, 0.16], [rI1 - 0.15, 0.08], [rI0 + 0.15, 0.08], [rI0, 0.16]], fac));
    for (let j = 0; j < F; j++) K.main.push(at(rib([[rI1 + 0.5, yR + 0.1], [rU1 + 0.2, yR + 0.1], [rU1 + 0.2, 0.12], [rI1 + 1.1, 0.12]], 0.9), j * st + st / 2));
    if (L.micro) {
      for (let j = 0; j < F; j++) K.chrome.push(screw(rr0 + 0.75, j * st + st / 2, T - dr));
      // rivets on the dark band of the facets without a stud
      for (let j = 1; j < F; j += 2) K.chrome.push(rivet((R - 0.3) * kf, j * st, (g0 + g1) / 2, 0.3, 0.2));
    }
    deco.push({ rA: rr0 + 1.45, rB: rr1 * kf - 0.15, y: T - dr, on: 'main', texts: [{ s: d.label, a: -PI / 2 }, { s: L.massTxt, a: PI / 2 }], marks: [0, PI] });
  },

  // Flywheel. Thick full-height rim with a protruding chrome belt (accent
  // ticks across it), a thin dark web pierced by kidney cut-outs, a hub.
  heavy(K, L, d, deco) {
    const { r0, R, T, S, n } = L;
    const c = clamp(0.12 * T, 0.35, 0.7), rH = r0 + 0.2 * S;
    const rRi = R - clamp(0.36 * S, 3.5, 6.5), Rw = R - 0.4, yt = T - 0.25, yb0 = 0.3 * T, yb1 = 0.7 * T;
    K.main.push(hub(L, rH, 0, T));
    K.main.push(lathe([[rRi + 0.5, 0], [Rw - c, 0], [Rw, c], [Rw, yb0 - 0.05], [Rw - 0.55, yb0 - 0.05], [Rw - 0.55, yb1 + 0.05], [Rw, yb1 + 0.05], [Rw, yt - c], [Rw - c, yt], [rRi + 0.5, yt], [rRi, yt - 0.5], [rRi, 0.5]], { n }));
    K.chrome.push(lathe([[Rw - 0.6, yb0], [R - 0.18, yb0], [R, yb0 + 0.18], [R, yb1 - 0.18], [R - 0.18, yb1], [Rw - 0.6, yb1]], { n }));
    const NC = d.cutouts || 5, sp = TAU / NC;
    const rc = (rH + rRi) / 2, wr = (rRi - rH) * 0.6, sw = Math.max(2.2, 0.18 * rc);
    const h = Math.max(0.08, (sp - (wr + sw) / rc) / 2);
    const holes = [circle(rH - 0.3, 24)];
    for (let k = 0; k < NC; k++) holes.push(kidney(rc, wr, k * sp, h, L.micro ? 6 : 4, L.micro ? 5 : 3));
    K.dark.push(plate(circle(rRi + 0.35, 40), holes, 0.34 * T, 0.66 * T, 0.15));
    for (let k = 0; k < NC; k++) K.accent.push(at(box(R - 0.6, R + 0.08, 0.75, yb0 + 0.22, yb1 - 0.22), k * sp + sp / 2));
    if (L.micro) for (let k = 0; k < 2 * NC; k++) K.chrome.push(screw(rRi + 0.95, (k + 0.5) * sp / 2, yt));
    deco.push({ rA: rRi + 1.75, rB: Rw - c - 0.15, y: yt, on: 'main', texts: [{ s: d.label, a: -PI / 2 }, { s: L.massTxt, a: PI / 2 }], marks: [0, PI] });
  },

  // Skeletal. Swept feather tips fanning out of a dark spine ring, a thin
  // plate whose spokes are separated by lancet slots, accent inlays on every
  // other feather, rivets on the spine.
  feather(K, L, d, deco) {
    const { r0, R, T, S, n, hand } = L;
    const rH = r0 + 0.2 * S, NF = d.feathers || 12, st = TAU / NF;
    const bv = 0.12, Rt = R - bv, Rb = R - clamp(0.22 * S, 1.8, 3.2), dR = Rt - Rb;
    const rS0 = Rb - clamp(0.17 * S, 1.6, 2.6), rS1 = Rb + 0.25, yS = 0.8 * T, yP0 = 0.2 * T, yP1 = 0.66 * T;
    const M = (pts) => (hand < 0 ? pts.map(([x, z]) => [x, -z]) : pts); // mirror for left spin
    const P = (r, f, k) => pol(r, (k + f) * st);
    K.main.push(hub(L, rH, 0, T));
    K.dark.push(lathe([[rS0 + 0.3, 0], [rS1 - 0.3, 0], [rS1, 0.3], [rS1, yS - 0.3], [rS1 - 0.3, yS], [rS0 + 0.3, yS], [rS0, yS - 0.3], [rS0, 0.3]], { n }));
    const outer = [];
    for (let k = 0; k < NF; k++) outer.push(P(Rb, 0, k), P(Rb + 0.45 * dR, 0.22, k), P(Rb + 0.85 * dR, 0.47, k), P(Rt, 0.62, k), P(Rt - 0.3 * dR, 0.72, k), P(Rb + 0.25 * dR, 0.9, k));
    const holes = [circle(rH - 0.3, 24)];
    const rA = rH + 0.9, rB = rS0 - 0.6, sw = 0.45 * st, hh = 0.27 * st, m = L.micro ? 4 : 2;
    for (let k = 0; k < NF; k++) {
      const phi = (k + 0.3) * st, left = [], right = [];
      for (let i = 0; i <= m; i++) { const t = i / m, r = lerp(rA, rB, t), a = phi + sw * t; left.push(pol(r, a - hh)); right.push(pol(r, a + hh)); }
      holes.push([pol(rA - 0.5, phi), ...left, pol(rB + 0.6, phi + sw), ...right.reverse()]);
    }
    K.main.push(plate(M(outer), holes.map(M), yP0, yP1, bv));
    for (let k = 0; k < NF; k += 2) {
      K.accent.push(plate(M([P(Rb + 0.35, 0.14, k), P(Rb + 0.5 * dR, 0.3, k), P(Rt - 0.4, 0.6, k), P(Rb + 0.55 * dR, 0.55, k), P(Rb + 0.35, 0.3, k)]), [], yP1 - 0.03, yP1 + 0.16, 0.04));
    }
    if (L.micro) for (let k = 0; k < 6; k++) K.chrome.push(puck((rS0 + rS1) / 2, (k + 0.5) * (TAU / 6), yS - 0.1, yS + 0.16, 0.38, 8));
    deco.push({ rA: rS0 + 0.32, rB: rS1 - 0.32, y: yS, on: 'dark', ticks: 96, texts: [], marks: [] });
  },

  // Bumper plate. A pocketed centre plate inside a dark bumper ring that
  // reaches past the attack ring; accent contact pads round the bumper belt.
  wide(K, L, d, deco) {
    const { r0, R, T, S, n } = L;
    const rH = r0 + 0.2 * S, Rp = R - clamp(0.2 * S, 2.5, 4.5), rb0 = Rp - 0.6;
    const yb0 = 0.08 * T, ybT = 0.82 * T, cb = 0.22 * T, yB0 = yb0 + cb, yB1 = ybT - 0.2 * T;
    K.main.push(hub(L, rH, 0, T));
    K.dark.push(lathe([[rb0 + 0.3, yb0], [R - 1.3 * cb, yb0], [R, yB0], [R, yB1], [R - cb, ybT], [rb0 + 0.3, ybT], [rb0, ybT - 0.3], [rb0, yb0 + 0.3]], { n }));
    const NP = d.pockets || 8, sp = TAU / NP, yp1 = 0.9 * T;
    const holes = [circle(rH - 0.3, 24)];
    for (let k = 0; k < NP; k++) holes.push(pocket(rH + 1.4, rb0 - 1.5, (k + 0.5) * sp, sp, 1.2));
    K.main.push(smoothRadial(plate(circle(Rp - 0.15, n), holes, 0.18 * T, yp1, 0.15), Rp - 1));
    for (let k = 0; k < NP; k++) K.accent.push(at(box(R - 0.45, R + 0.06, 1.8, yB0, yB1), k * sp));
    if (L.micro) for (let k = 0; k < NP; k++) K.chrome.push(screw(Rp - 1.0, k * sp, yp1));
    deco.push({ rA: rb0 + 0.4, rB: R - cb - 0.1, y: ybT, on: 'dark', texts: [{ s: d.label, a: -PI / 2 + sp / 2 }, { s: L.massTxt, a: PI / 2 + sp / 2 }], marks: [sp / 2 + PI / 4, sp / 2 - (3 * PI) / 4] });
  },

  // Counterweight. A bronze plate (lightening holes and an accent stripe on
  // the light side) under a brass crescent of three blocks on +X separated by
  // dark spacers, bolted on top and riveted round the outside.
  counter(K, L, d, deco) {
    const { r0, R, T, S, n } = L;
    const rH = r0 + 0.22 * S, Rp = R - 0.5, yp1 = 0.75 * T;
    K.dark.push(hub(L, rH, 0, T - 0.1));
    const rL = (rH + Rp) / 2 + 0.3, rl = clamp(0.13 * S, 1, 2);
    const holes = [circle(rH - 0.3, 24)];
    for (const a of [PI - 0.55, PI, PI + 0.55]) holes.push(circle(rl, 14, ...pol(rL, a)));
    K.main.push(smoothRadial(plate(circle(Rp - 0.2, n), holes, 0.06 * T, yp1, 0.2), Rp - 1));
    const cs = d.span || 0.84 * PI, rc0 = r0 + 0.42 * S, yc = T - 0.25, c = clamp(0.12 * T, 0.35, 0.7);
    const gap = 0.05, seg = (cs - 2 * gap) / 3;
    const prof = [[rc0 + 0.4, 0], [R - c, 0], [R, c], [R, yc - c], [R - c, yc], [rc0 + 0.4, yc], [rc0, yc - 0.4], [rc0, 0.4]];
    const mid = (i) => -cs / 2 + i * (seg + gap) + seg / 2;
    for (let i = 0; i < 3; i++) K.alt.push(lathe(prof, { n: arcN(L, seg), a0: -cs / 2 + i * (seg + gap), span: seg, caps: true }));
    for (let i = 1; i < 3; i++) {
      const a = -cs / 2 + i * (seg + gap) - gap;
      K.dark.push(lathe([[rc0 + 0.6, 0.25], [R - 0.3, 0.25], [R - 0.3, yc - 0.25], [rc0 + 0.6, yc - 0.25]], { n: 2, a0: a - 0.02, span: gap + 0.04, caps: true }));
    }
    const ab = cs / 2 + 0.3;
    K.accent.push(lathe([[Rp - 0.3, 0.3 * T], [Rp + 0.12, 0.3 * T], [Rp + 0.12, 0.5 * T], [Rp - 0.3, 0.5 * T]], { n: arcN(L, TAU - 2 * ab), a0: ab, span: TAU - 2 * ab, caps: true }));
    if (L.micro) {
      for (let i = 0; i < 3; i++) {
        K.chrome.push(screw((rc0 + R) / 2 + 0.3, mid(i), yc, 0.7, 0.22));
        for (const s of [-1, 1]) K.chrome.push(rivet(R, mid(i) + s * seg * 0.3, 0.5 * yc));
      }
    }
    deco.push({ rA: rc0 + 0.45, rB: R - c - 0.2, y: yc, a0: -cs / 2, span: cs, on: 'alt', texts: [{ s: d.label, a: -(seg + gap) / 2 }, { s: L.massTxt, a: (seg + gap) / 2 }], marks: [] });
  },

  // Satellite rim. Rim-weighted: a continuous inner rim, outer rim segments
  // with a dark mount channel, and skirt ports (notches) holding accent
  // latches; a web with planet holes and chrome pucks on the rim.
  orbit(K, L, d, deco) {
    const { r0, R, T, S, n } = L;
    const rH = r0 + 0.2 * S, rRi = R - clamp(0.33 * S, 3.5, 6), yt = T - 0.22, c = clamp(0.12 * T, 0.35, 0.6);
    const NS = d.ports || 4, sp = TAU / NS, wn = clamp(0.32 * S, 4.5, 7) / R, rN = R - 0.42 * (R - rRi), yc0 = 0.34 * T, yc1 = 0.64 * T;
    K.main.push(hub(L, rH, 0, T));
    K.main.push(lathe([[rRi + 0.4, 0], [rN - 0.3, 0], [rN, 0.3], [rN, yt - 0.3], [rN - 0.3, yt], [rRi + 0.4, yt], [rRi, yt - 0.4], [rRi, 0.4]], { n }));
    const seg = sp - wn;
    for (let k = 0; k < NS; k++) {
      const a0 = (k + 0.5) * sp + wn / 2, o = { n: arcN(L, seg), a0, span: seg, caps: true };
      K.main.push(lathe([[rN - 0.3, 0], [R - c, 0], [R, c], [R, yc0], [R - 0.9, yc0], [R - 0.9, yc1], [R, yc1], [R, yt - c], [R - c, yt], [rN - 0.3, yt]], o));
      K.dark.push(lathe([[R - 0.95, yc0 + 0.05], [R - 0.35, yc0 + 0.05], [R - 0.35, yc1 - 0.05], [R - 0.95, yc1 - 0.05]], o));
      // skirt port: a full-height notch in the outer rim, lined with a dark
      // mount plate, holding an accent T-latch (stem + wider clip head)
      const an = (k + 0.5) * sp, hn = (wn * rN) / 2, hs = 0.24 * hn;
      K.dark.push(at(box(rN - 0.25, rN + 0.4, hn + 0.1, 0.15, yt - 0.12), an));
      K.accent.push(at(box(rN + 0.3, R - 0.7, hs, 0.18 * T, yt - 0.3, 0.08), an));
      K.accent.push(at(box(R - 0.85, R - 0.12, 2.1 * hs, 0.3 * T, 0.78 * T, 0.08), an));
      if (L.micro) K.chrome.push(rivet(R - 0.12, an, 0.54 * T, 0.32, 0.12));
    }
    const rc = (rH + rRi) / 2, rh1 = clamp(0.13 * S, 1, 2);
    const holes = [circle(rH - 0.3, 24)];
    for (let k = 0; k < NS; k++) { holes.push(circle(rh1, 12, ...pol(rc, (k + 0.5) * sp))); holes.push(circle(rh1 * 0.5, 8, ...pol(rc, k * sp))); }
    K.main.push(plate(circle(rRi + 0.3, 36), holes, 0.27 * T, 0.71 * T, 0.15));
    if (L.micro) for (let k = 0; k < NS; k++) K.chrome.push(puck((rRi + rN - 0.3) / 2, k * sp, yt - 0.25, yt + 0.16, Math.min(0.9, (rN - rRi) / 2 - 0.45)));
    deco.push({ rA: rRi + 0.45, rB: rN - 0.4, y: yt, on: 'main', texts: [{ s: d.label, a: sp / 2 + PI }, { s: L.massTxt, a: sp / 2 }], marks: [] });
  },

  // Reeded coin. Slim, dense: a finely reeded outer band split by an accent
  // pinstripe, a recessed face carrying a dark inlay ring with chrome slugs.
  compact(K, L, d, deco) {
    const { r0, R, T, S, n, q } = L;
    const rH = r0 + 0.2 * S, rRb = R - clamp(0.26 * S, 2.6, 4.5), bv = 0.12;
    const NR = d.ridges || segs(q, 40, 32, 24), rs = TAU / NR;
    const reed = [];
    for (let i = 0; i < NR; i++) reed.push(pol(R - bv, i * rs), pol(R - bv - 0.34, (i + 0.5) * rs));
    const hole = [circle(rRb + bv, 40)], ys0 = 0.42 * T, ys1 = 0.6 * T, yf = T - 0.5;
    K.main.push(hub(L, rH, 0, T));
    K.main.push(plate(reed, hole, 0, ys0, bv), plate(reed, hole, ys1, T, bv));
    K.accent.push(lathe([[rRb + 0.3, ys0], [R - 0.3, ys0], [R - 0.3, ys1], [rRb + 0.3, ys1]], { n }));
    K.main.push(lathe([[rH - 0.3, 0.12 * T], [rRb + 0.3, 0.12 * T], [rRb + 0.3, yf], [rH - 0.3, yf]], { n }));
    const rD0 = rH + 0.8, rD1 = rRb - 0.6;
    K.dark.push(lathe([[rD0, yf], [rD1, yf], [rD1, yf + 0.12], [rD1 - 0.08, yf + 0.2], [rD0 + 0.08, yf + 0.2], [rD0, yf + 0.12]], { n }));
    // underside: a dark dodecagonal inlay under the face; the six slugs go
    // right through the disc and show on both faces (dense core)
    const yu = 0.12 * T, st = TAU / 12, fac = { facets: 12, a0: -st / 2 };
    K.dark.push(lathe([[rH + 0.5, yu + 0.02], [rRb - 0.5, yu + 0.02], [rRb - 0.5, 0.18], [rRb - 0.65, 0.06], [rH + 0.65, 0.06], [rH + 0.5, 0.18]], fac));
    if (L.micro) {
      for (let k = 0; k < 6; k++) {
        const a = (k + 0.5) * (TAU / 6), rs = (rD0 + rD1) / 2;
        K.chrome.push(puck(rs, a, yf + 0.05, yf + 0.3, 0.7), puck(rs, a, 0.0, 0.12, 0.7));
      }
    }
    deco.push({ rA: rD0 + 0.25, rB: rD1 - 0.25, y: yf + 0.2, on: 'dark', texts: [{ s: d.label, a: 0 }, { s: L.massTxt, a: PI }], marks: [] });
  },

  // Ziggurat. Massive: a dark body stepped underneath like an inverted
  // pyramid, ringed by armour blocks (stepped plinth, accent chevron, two
  // bolts each) with deep dark slots between them.
  titan(K, L, d, deco) {
    const { r0, R, T, S, n } = L;
    const rH = r0 + 0.25 * S, rBo = R - 1.5, s1 = r0 + 0.5 * S, s2 = Math.min(r0 + 0.72 * S, rBo - 1.2);
    K.dark.push(hub(L, rH, 0, T));
    K.dark.push(lathe([[rH - 0.3, 0.32 * T], [s1, 0.32 * T], [s1, 0.16 * T], [s2, 0.16 * T], [s2, 0], [rBo - 0.4, 0], [rBo, 0.4], [rBo, T - 0.55], [rH - 0.3, T - 0.55]], { n }));
    const NB = d.blocks || 6, sp = TAU / NB, span = sp - 2.2 / R, y1 = 0.28 * T;
    // top terrace: a raised armour collar (2 x blocks facets) round the bore,
    // so the top steps up towards the centre like the underside steps down
    const rT = rH + clamp(0.17 * S, 1.6, 2.8), stT = TAU / (2 * NB);
    K.main.push(lathe([[rH - 0.3, T - 0.7], [rT, T - 0.7], [rT, T - 0.18], [rT - 0.16, T - 0.02], [rH - 0.3, T - 0.02]], { facets: 2 * NB, a0: -stT / 2 }));
    const prof = [[rBo - 0.2, 0], [R - 1.3, 0], [R - 0.9, 0.4], [R - 0.9, y1], [R - 0.2, y1 + 0.6], [R - 0.2, T - 0.75], [R - 0.75, T - 0.2], [rBo - 0.2, T - 0.2]];
    const ch = clamp((T - 0.75 - y1 - 0.6 - 0.6) / 1.7, 0.4, 1), cy = y1 + 0.85;
    const chev = [[-1.6, 0], [0, 1.0], [1.6, 0], [1.6, 0.7], [0, 1.7], [-1.6, 0.7]].map(([t, y]) => [t * ch, cy + y * ch]);
    for (let k = 0; k < NB; k++) {
      const a = k * sp;
      K.main.push(lathe(prof, { n: arcN(L, span), a0: a - span / 2, span, caps: true }));
      // diagonal gusset bracing the stepped underside under each block
      K.main.push(at(rib([[rH + 0.3, 0.33 * T], [rH + 0.3, 0.25 * T], [s2 - 0.3, 0.1], [s2 + 0.6, 0.1], [s2 + 0.6, 0.17 * T], [s1, 0.33 * T]], 1.4), a));
      K.accent.push(at(facePlate(chev, R - 0.45, R - 0.06), a));
      if (L.micro) for (const s of [-1, 1]) K.chrome.push(rivet(R - 0.2, a + s * 0.3 * span, 0.66 * T, 0.36, 0.22));
    }
    deco.push({ rA: rT + 0.4, rB: rBo - 0.9, y: T - 0.55, on: 'dark', texts: [{ s: d.label, a: -PI / 2 + sp / 2 }, { s: L.massTxt, a: PI / 2 + sp / 2 }], marks: [sp / 2, sp / 2 + PI] });
  },
};

// ------------------------------------------------------------ engraved print
//
// One 512px canvas per look, polar-planar over radius Re (canvas angle =
// world angle). Canvases are cached; textures are per build.

const CANVASES = new Map();

function textArc(x, s, r, a) {
  const ws = [...s].map((ch) => x.measureText(ch).width + r * 0.012);
  const total = ws.reduce((p, w) => p + w, 0);
  let t = a - total / 2 / r;
  [...s].forEach((ch, i) => {
    const m = t + ws[i] / 2 / r;
    x.save();
    x.rotate(m + PI / 2);
    x.fillText(ch, 0, -r);
    x.restore();
    t += ws[i] / r;
  });
}

function drawRegion(x, D, C, k) {
  const { rA, rB, a0 = 0, span = TAU } = D, w = rB - rA, full = span >= TAU - 1e-6;
  const ink = C.print[D.on] || C.print.main;
  x.save();
  x.beginPath();
  x.arc(0, 0, rB * k, a0, a0 + span);
  x.arc(0, 0, rA * k, a0 + span, a0, true);
  x.closePath();
  x.clip();
  x.strokeStyle = ink;
  x.fillStyle = ink;
  // graduation ticks round the outer edge
  const nt = D.ticks ?? 72;
  for (let i = 0; i < nt; i++) {
    const a = (i / nt) * TAU, long = i % 6 === 0;
    x.lineWidth = Math.max(1, (long ? 0.14 : 0.08) * k);
    const ri = rB - (D.texts.length ? (long ? 0.34 : 0.2) : long ? 0.75 : 0.45) * w;
    x.beginPath(); x.moveTo(Math.cos(a) * ri * k, Math.sin(a) * ri * k); x.lineTo(Math.cos(a) * (rB - 0.08) * k, Math.sin(a) * (rB - 0.08) * k); x.stroke();
  }
  x.lineWidth = Math.max(1, 0.08 * k);
  x.beginPath(); x.arc(0, 0, (rA + 0.15) * k, a0, a0 + span); x.stroke();
  // labels along the arc
  if (D.texts.length) {
    const fs = Math.max(8, Math.min(w * 0.36, 2.4) * k);
    x.font = `bold ${Math.round(fs)}px Arial, Helvetica, sans-serif`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    for (const t of D.texts) textArc(x, t.s, (rA + w * 0.4) * k, t.a);
  }
  // accent arrow marks
  x.fillStyle = C.accent;
  const rm = (rA + w * 0.4) * k, hs = w * 0.18 * k;
  for (const a of D.marks || []) {
    x.save(); x.rotate(a); x.beginPath();
    x.moveTo(rm + hs, 0); x.lineTo(rm - hs, -hs * 0.9); x.lineTo(rm - hs, hs * 0.9); x.closePath(); x.fill();
    x.restore();
  }
  if (C.rarity) {
    x.strokeStyle = C.rarity;
    x.lineWidth = Math.max(1.5, 0.2 * k);
    x.beginPath(); x.arc(0, 0, (rA + 0.4) * k, a0, a0 + span); x.stroke();
  }
  x.restore();
  return full;
}

function decalMesh(deco, C, L, key) {
  if (!deco.length || typeof document === 'undefined') return null;
  const Re = L.R + 0.5, k = 256 / Re;
  const ck = [key, C.print.main, C.print.dark, C.accent, C.rarity, Re.toFixed(2), ...deco.map((D) => [D.rA, D.rB, D.a0 || 0, D.span || TAU].map((v) => v.toFixed(2)).join() + D.texts.map((t) => t.s).join())].join('|');
  let canvas = CANVASES.get(ck);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    const x = canvas.getContext('2d');
    x.translate(256, 256);
    for (const D of deco) drawRegion(x, D, C, k);
    if (CANVASES.size > 40) CANVASES.delete(CANVASES.keys().next().value);
    CANVASES.set(ck, canvas);
  }
  const geos = deco.map((D) => {
    const span = D.span || TAU;
    return flatRing(D.rA, D.rB, D.y + 0.06, Math.max(8, Math.round((L.n * span) / TAU)), Re, D.a0 || 0, span);
  });
  const mat = toonMaterial('#ffffff', { finish: 'matte', map: canvasTexture(canvas), rim: 0 });
  mat.alphaTest = 0.5;
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -1;
  mat.polygonOffsetUnits = -2;
  const m = new THREE.Mesh(geos.length > 1 ? mergeGeometries(geos, false) : geos[0], mat);
  m.userData.noInk = true;
  m.castShadow = false;
  return m;
}

// ------------------------------------------------------------ builder

export function buildDisc(part, ctx = {}) {
  if (CLASSIC_DISCS[part.id]) return buildClassicDisc(part, ctx);
  const d = DESIGNS[part.id] || autoDesign(part);
  const q = ctx.quality || 'high';
  const r0 = part.rIn ?? 6, T = part.thickness ?? 4;
  const R = Math.max(part.rOut ?? 19, r0 + 6);
  const L = {
    r0, R, T, S: R - r0, q,
    n: segs(q, 56, 40, 24), nh: segs(q, 32, 24, 16),
    micro: q !== 'low',
    hand: ctx.spin === 'L' ? -1 : 1,
    massTxt: `${Math.round(part.mass || 0)}G`,
  };
  const C = palette(part, ctx, d);
  const mats = {
    main: () => toonMaterial(C.main, { finish: metalFinish(part, 'metal'), ...rarityGlow(ctx.rarity) }),
    dark: () => toonMaterial(C.dark, { finish: 'metal', spec: 0.6 }),
    alt: () => toonMaterial(C.alt, { finish: 'chrome' }),
    accent: () => toonMaterial(C.accent, { finish: 'gloss' }),
    chrome: () => toonMaterial('#dce3ec', { finish: 'chrome' }),
  };
  const inkOpts = { main: {}, dark: {}, alt: {}, accent: { px: 1.5 }, chrome: { px: 1, maxMm: 0.2 } };

  // Blender model (tools/blender/discs.py) when one matches the part; its
  // print regions name the label and mass as $label / $mass
  const model = buildDiscModel(part, ctx, mats, inkOpts);
  if (model) {
    const name = (s) => (s === '$label' ? d.label : s === '$mass' ? L.massTxt : s);
    const deco = (model.meta.deco || []).map((D) => ({ ...D, texts: D.texts.map((t) => ({ a: t.a, s: name(t.s) })) }));
    const m = L.micro && decalMesh(deco, C, L, part.id + '|mesh|' + d.label);
    if (m) model.group.add(m);
    return { group: model.group, height: T * MM, glows: model.glows };
  }

  const K = { main: [], dark: [], alt: [], accent: [], chrome: [] };
  const deco = [];
  (KINDS[d.kind] || KINDS.ten)(K, L, d, deco);
  const g = partGroup('disc');
  const glows = [];
  for (const key of Object.keys(mats)) {
    if (!K[key].length) continue;
    const mat = mats[key]();
    if (key === 'main' && ctx.rarity?.rank >= 3) glows.push(mat);
    g.add(inked(mergeGeometries(K[key].map(prep), false), mat, inkOpts[key]));
  }
  if (L.micro) {
    const m = decalMesh(deco, C, L, part.id + d.kind + d.label);
    if (m) g.add(m);
  }
  return { group: g, height: T * MM, glows };
}
