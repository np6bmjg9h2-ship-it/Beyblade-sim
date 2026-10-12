// Stadium visuals in the anime cel style, built from the same arena definition
// the physics uses (src/physics/arena.js):
// - the floor is the exact lathe of the height profile, painted with flat
//   colour zones, crisp guide lines, an original centre sigil, friction bands
//   (grip chevrons / slick speed lines) and hazard chevrons at the exits;
// - wall panels, rim caps, ribs, gate posts, exit lips, the deck and the
//   stadium body are separate closed solids (cel materials + ink hulls) at the
//   physics radius, angles, widths and heights;
// - surroundings (stands, light rigs, banners, theme props, ground, backdrop)
//   are flat cel props, merged per material to keep draw calls low.
// Azimuths follow the physics convention: angle = atan2(z, x).

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Arena } from '../physics/arena.js';
import { toonMaterial, addInk, tone, inkFor, mix, canvasTexture, segs, gradientRamp, renderStyle } from './toon.js';
import { crowdSpriteNow } from './environment.js';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const GROUND_Y = -0.08;

// ------------------------------------------------------------ small helpers

// Seeded PRNG so every build of an arena paints the same textures.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const rgba = (hex, a) => { const n = parseInt(hex.slice(1, 7), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
// perceived lightness (0..1) of an sRGB hex colour
const luma = (hex) => { const n = parseInt(hex.slice(1, 7), 16); return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; };
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// Scale a colour down so its brightest linear channel stays under `max`: the
// lit band of the cel ramp adds up to ~1.4x, and anything brighter clips
// through the tone mapper into a washed-out pastel.
const _tc = new THREE.Color();
function tame(hex, max = 0.7) {
  _tc.set(hex);
  const m = Math.max(_tc.r, _tc.g, _tc.b);
  if (m > max) _tc.multiplyScalar(max / m);
  return '#' + _tc.getHexString();
}
function makeCanvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function repeatTex(c, rx = 1, ry = 1) {
  const t = canvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  return t;
}

// ------------------------------------------------------------ geometry

// Solid of revolution. `prof` is a closed loop of [r, y] points, counter-
// clockwise with r to the right and y up (edge normals point out of the
// solid), swept over azimuth a0..a1. Each profile edge gets its own vertex
// rows so creases stay crisp under cel shading; partial sweeps get flat end
// caps so the solid is closed and takes a clean ink hull.
// opts: step (max radians per segment), uScale (metres of arc per texture
// repeat, measured at uRadius or each vertex's radius; default 0..1 over the
// sweep), edgeV ([v0, v1] per edge; default fraction of the perimeter).
function revolve(prof, a0, a1, opts = {}) {
  const span = a1 - a0;
  const full = span >= TAU - 1e-6;
  const n = Math.max(1, Math.ceil(span / (opts.step || 4 * DEG)));
  const m = prof.length;
  const pos = [], nor = [], uv = [], idx = [];
  let per = 0;
  const cum = [0];
  for (let i = 0; i < m; i++) { const p = prof[i], q = prof[(i + 1) % m]; per += Math.hypot(q[0] - p[0], q[1] - p[1]); cum.push(per); }
  const uOf = (a, r) => (opts.uScale ? ((a - a0) * (opts.uRadius ?? r)) / opts.uScale : (a - a0) / span);
  for (let i = 0; i < m; i++) {
    const p = prof[i], q = prof[(i + 1) % m];
    const dr = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dr, dy);
    if (L < 1e-9) continue;
    const nr = dy / L, ny = -dr / L;
    const [v0, v1] = opts.edgeV?.[i] || [cum[i] / per, cum[i + 1] / per];
    const base = pos.length / 3;
    for (let j = 0; j <= n; j++) {
      const a = a0 + (span * j) / n, c = Math.cos(a), s = Math.sin(a);
      pos.push(p[0] * c, p[1], p[0] * s, q[0] * c, q[1], q[0] * s);
      nor.push(nr * c, ny, nr * s, nr * c, ny, nr * s);
      uv.push(uOf(a, p[0]), v0, uOf(a, q[0]), v1);
    }
    for (let j = 0; j < n; j++) { const k = base + j * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  if (!full) {
    const tris = THREE.ShapeUtils.triangulateShape(prof.map(([r, y]) => new THREE.Vector2(r, y)), []);
    let rMin = Infinity, rMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    for (const [r, y] of prof) { rMin = Math.min(rMin, r); rMax = Math.max(rMax, r); yMin = Math.min(yMin, y); yMax = Math.max(yMax, y); }
    for (const [a, sign] of [[a0, -1], [a1, 1]]) {
      const c = Math.cos(a), s = Math.sin(a), nx = -s * sign, nz = c * sign;
      const base = pos.length / 3;
      for (const [r, y] of prof) {
        pos.push(r * c, y, r * s);
        nor.push(nx, 0, nz);
        uv.push((r - rMin) / (rMax - rMin || 1), (y - yMin) / (yMax - yMin || 1));
      }
      for (const [i0, i1, i2] of tris) {
        // wind each cap triangle so it faces along the cap normal
        const P = (i) => prof[i];
        const e1r = P(i1)[0] - P(i0)[0], e1y = P(i1)[1] - P(i0)[1];
        const e2r = P(i2)[0] - P(i0)[0], e2y = P(i2)[1] - P(i0)[1];
        // the 3D cross product of the two edges is cr * (+tangent)
        const cr = e1r * e2y - e1y * e2r;
        if ((cr > 0) === (sign > 0)) idx.push(base + i0, base + i1, base + i2);
        else idx.push(base + i0, base + i2, base + i1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
const box = (r0, r1, y0, y1) => [[r0, y0], [r1, y0], [r1, y1], [r0, y1]];
// v = height fraction on the inner/outer faces of a box profile
const BOX_V = [[0, 0], [0, 1], [1, 1], [1, 0]];

function merged(list) {
  const geos = list.filter(Boolean);
  if (!geos.length) return null;
  const g = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
  if (geos.length > 1) for (const x of geos) x.dispose();
  return g;
}

function addMesh(group, geo, mat, name, ink) {
  if (!geo) return null;
  const m = new THREE.Mesh(geo, mat);
  m.name = name;
  m.castShadow = false;
  m.receiveShadow = false;
  if (ink) addInk(m, ink);
  group.add(m);
  return m;
}

const _dummy = new THREE.Object3D();
// Bake a transform into a geometry: position, then face the arena axis
// (local +z toward the centre at the same height), then extra local rotation.
function place(geo, x, y, z, { face = true, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  _dummy.position.set(x, y, z);
  _dummy.rotation.set(0, 0, 0);
  _dummy.scale.set(sx, sy, sz);
  if (face) _dummy.lookAt(0, y, 0);
  _dummy.rotateY(ry); _dummy.rotateX(rx); _dummy.rotateZ(rz);
  _dummy.updateMatrix();
  geo.applyMatrix4(_dummy.matrix);
  return geo;
}

// ------------------------------------------------------------ looks

// Per-stadium art direction. Colours come from the arena theme; this picks
// the floor motif, centre sigil and surroundings.
const LOOKS = {
  standard: { motif: 'pinwheel', sigil: 'star', props: 'hall', deck: '#22314f', body: '#141c30' },
  vortex: { motif: 'spiral', sigil: 'swirl', props: 'hall', deck: '#2c2060', body: '#171034', rField: 0.8 },
  edgebreaker: { motif: 'plates', sigil: 'shards', props: 'yard', deck: '#4b2412', body: '#251109', rField: 0.75 },
  crystal: { motif: 'facets', sigil: 'snow', props: 'ice', deck: '#1d5a76', body: '#0f2f40', rField: 0.9, floorFinish: 'gloss' },
  magma: { motif: 'lava', sigil: 'flame', props: 'volcano', deck: '#3a1a10', body: '#1c0a05', rField: 0.84, glow: true },
  skyfall: { motif: 'sunburst', sigil: 'wings', props: 'sky', deck: '#eef3ff', body: '#7d5c47', rField: 0.8 },
  zero: { motif: 'runes', sigil: 'zero', props: 'ruins', deck: '#1a1a3a', body: '#0b0b1d', rField: 0.756, glow: true },
};

function lookFor(def) {
  const th = def.theme;
  const tag = def.surface?.tag;
  const fallback = { motif: tag === 'ice' ? 'facets' : tag === 'rough' ? 'lava' : 'pinwheel', sigil: 'star', props: 'hall', deck: tone(th.wall, -0.3, -0.2), body: tone(th.floorEdge, -0.05) };
  const L = { rField: 0.8, sigilR: 0.17, floorTint: '#d6d6d6', floorFinish: tag === 'ice' ? 'gloss' : 'matte', glow: false, ...(LOOKS[def.id] || fallback) };
  L.pal = {
    field: th.floor,
    fieldHi: mix(th.floor, th.accent, 0.1),
    fieldLo: mix(th.floor, '#000000', 0.2),
    core: mix(th.floor, '#ffffff', 0.12),
    edge: th.floorEdge,
    dots: luma(th.floorEdge) < 0.22 ? mix(th.floorEdge, th.accent, 0.3) : mix(th.floorEdge, '#000000', 0.4),
    ink: inkFor(th.floor, 0.92),
    accent: th.accent, ring: th.ring, wall: th.wall,
    rim: tame(tone(th.wall, 0.02, 0.12)),
    post: mix(tame(th.wall), '#000000', 0.45),
    deck: L.deck, body: L.body,
    hazard: '#ffc81e', hazardInk: '#1c1222', gate: '#ff3d5a',
    pit: '#07040c',
    sky: th.sky, fog: th.fog,
  };
  return L;
}

// ------------------------------------------------------------ floor paint

// Canvas painter in arena polar coordinates (metres, physics azimuth). The
// floor UVs are planar (u = x, v = z), so canvas (x, y) = world (x, z).
function polarPainter(size, R, bg) {
  const c = makeCanvas(size), g = c.getContext('2d');
  const C = size / 2, k = C / R, U = size / 2048;
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, size, size); }
  const X = (r, a) => C + Math.cos(a) * r * k, Y = (r, a) => C + Math.sin(a) * r * k;
  const P = {
    c, g, k, U, R, X, Y, C,
    disk(r, fill) { g.beginPath(); g.arc(C, C, Math.max(0, r) * k, 0, TAU); g.fillStyle = fill; g.fill(); return P; },
    annulus(r0, r1, fill) { g.beginPath(); g.arc(C, C, r1 * k, 0, TAU); g.arc(C, C, Math.max(0, r0) * k, 0, TAU, true); g.fillStyle = fill; g.fill(); return P; },
    circle(r, stroke, w, dash) {
      g.beginPath(); g.setLineDash(dash ? dash.map((d) => d * U) : []);
      g.arc(C, C, r * k, 0, TAU); g.strokeStyle = stroke; g.lineWidth = w * U; g.stroke(); g.setLineDash([]);
      return P;
    },
    sector(r0, r1, a0, a1) { g.beginPath(); g.arc(C, C, r1 * k, a0, a1); g.arc(C, C, Math.max(0, r0) * k, a1, a0, true); g.closePath(); return P; },
    poly(pts) { g.beginPath(); pts.forEach(([r, a], i) => (i ? g.lineTo(X(r, a), Y(r, a)) : g.moveTo(X(r, a), Y(r, a)))); g.closePath(); return P; },
    // Cartesian polygon in metres around the centre (y = world z)
    xyPoly(pts) { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(C + x * k, C + y * k) : g.moveTo(C + x * k, C + y * k))); g.closePath(); return P; },
    fill(color) { g.fillStyle = color; g.fill(); return P; },
    stroke(color, w) { g.strokeStyle = color; g.lineWidth = w * U; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(); return P; },
    line(r0, a0, r1, a1, color, w) { g.beginPath(); g.moveTo(X(r0, a0), Y(r0, a0)); g.lineTo(X(r1, a1), Y(r1, a1)); return P.stroke(color, w); },
    arcLine(r, a0, a1, color, w) { g.beginPath(); g.arc(C, C, r * k, a0, a1); return P.stroke(color, w); },
    dot(r, a, rad, fill) { g.beginPath(); g.arc(X(r, a), Y(r, a), rad * k, 0, TAU); g.fillStyle = fill; g.fill(); return P; },
  };
  return P;
}

// Screen-tone: concentric rows of dots growing toward r1 (or shrinking).
function halftone(P, r0, r1, color, dense, grow = true) {
  if (r1 <= r0) return;
  const g = P.g, step = 0.0036 / Math.sqrt(dense);
  g.fillStyle = color;
  let row = 0;
  for (let r = r0 + step / 2; r < r1; r += step, row++) {
    const t = (r - r0) / (r1 - r0);
    const rad = step * 0.44 * (grow ? 0.2 + 0.8 * t : 1 - 0.8 * t);
    const n = Math.floor((TAU * r) / step);
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const a = ((i + (row % 2) * 0.5) * TAU) / n, x = P.X(r, a), y = P.Y(r, a);
      g.moveTo(x + rad * P.k, y);
      g.arc(x, y, rad * P.k, 0, TAU);
    }
    g.fill();
  }
}

// Anime glass glare: parallel bright bars across the dish (fractions of R).
function glare(P, R, ang, bars) {
  const g = P.g, k = P.k;
  g.save();
  g.beginPath(); g.arc(P.C, P.C, R * k, 0, TAU); g.clip();
  g.translate(P.C, P.C); g.rotate(ang);
  for (const [off, w, a] of bars) { g.fillStyle = rgba('#ffffff', a); g.fillRect(off * R * k, -R * k, w * R * k, 2 * R * k); }
  g.restore();
}

// Triangulated facet rings (crystal shards / volcanic rock plates).
function facetRings(radii, rand, cell) {
  const rings = radii.map((r, i) => {
    const n = Math.max(5, Math.round((TAU * r) / cell));
    const off = rand() * TAU;
    const pts = [];
    for (let j = 0; j < n; j++) {
      const jr = i === radii.length - 1 ? 0 : (rand() - 0.5) * cell * 0.45;
      pts.push([r + jr, off + ((j + (rand() - 0.5) * 0.5) * TAU) / n]);
    }
    return pts;
  });
  const tris = [];
  const centre = [0, 0];
  rings[0].forEach((p, j) => tris.push([centre, p, rings[0][(j + 1) % rings[0].length]]));
  for (let i = 0; i < rings.length - 1; i++) {
    const A = rings[i], B = rings[i + 1];
    const angB0 = B[0][1];
    // walk both rings by unwrapped angle, emitting a strip of triangles
    const ua = A.map((p) => p[1]), ub = B.map((p) => p[1]);
    const unwrap = (arr, from) => arr.map((a) => from + ((((a - from) % TAU) + TAU) % TAU));
    const UA = unwrap(ua, angB0 - 1e-6).map((a, j) => [a, j]).sort((x, y) => x[0] - y[0]);
    const UB = ub.map((a, j) => [angB0 + ((((a - angB0) % TAU) + TAU) % TAU), j]).sort((x, y) => x[0] - y[0]);
    let p = 0, q = 0;
    const nA = UA.length, nB = UB.length;
    while (p < nA || q < nB) {
      const a0 = A[UA[p % nA][1]], b0 = B[UB[q % nB][1]];
      const nextA = p < nA ? UA[(p + 1) % nA][0] + (p + 1 >= nA ? TAU : 0) : Infinity;
      const nextB = q < nB ? UB[(q + 1) % nB][0] + (q + 1 >= nB ? TAU : 0) : Infinity;
      if (nextA <= nextB) { tris.push([a0, b0, A[UA[(p + 1) % nA][1]]]); p++; } else { tris.push([a0, b0, B[UB[(q + 1) % nB][1]]]); q++; }
    }
  }
  return tris;
}

// ---- floor motifs (field zone, under bands/lines/sigil)

const MOTIFS = {
  // classic tournament dish: alternating wedge tones around a lighter core
  pinwheel(P, G, L, R) {
    const pal = L.pal, r0 = 0.36 * R, r1 = L.rField * R, n = 16;
    for (let i = 0; i < n; i += 2) P.sector(r0, r1, (i * TAU) / n, ((i + 1) * TAU) / n).fill(pal.fieldHi);
    P.disk(r0, pal.core);
    P.circle(r0, pal.ink, 6);
    P.circle((r0 + r1) / 2 + 0.01, rgba(pal.accent, 0.8), 4, [26, 18]);
  },
  // swirl arms that read as motion toward the rail
  spiral(P, G, L, R, rand) {
    const pal = L.pal, r0 = 0.12 * R, r1 = L.rField * R, arms = 10, twist = 2.3, steps = 28;
    for (let i = 0; i < arms; i += 2) {
      const th = (i * TAU) / arms, pts = [];
      for (let s = 0; s <= steps; s++) { const t = s / steps; pts.push([r0 + (r1 - r0) * t, th + twist * t]); }
      for (let s = steps; s >= 0; s--) { const t = s / steps; pts.push([r0 + (r1 - r0) * t, th + TAU / arms + twist * t]); }
      P.poly(pts).fill(pal.fieldHi);
    }
    // curved speed streaks
    for (let i = 0; i < 26; i++) {
      const r = r0 + (r1 - r0) * (0.15 + 0.8 * rand()), a = rand() * TAU;
      P.arcLine(r, a, a + 0.25 + rand() * 0.5, rgba('#ffffff', 0.22), 3 + rand() * 3);
    }
    P.disk(r0, pal.core);
    P.circle(r0, pal.ink, 6);
  },
  // riveted steel plates in a brick pattern
  plates(P, G, L, R) {
    const pal = L.pal, rF = L.rField * R;
    const rings = [[0.15 * R, 0.37 * R, 6], [0.37 * R, 0.57 * R, 10], [0.57 * R, rF, 14]];
    P.disk(rF, pal.fieldLo);
    P.disk(0.15 * R, pal.core);
    const gap = 0.0012;
    rings.forEach(([ri, ro, n], ringIdx) => {
      for (let i = 0; i < n; i++) {
        const a0 = ((i + ringIdx * 0.5) * TAU) / n, a1 = a0 + TAU / n;
        const ga = gap / ro;
        P.sector(ri + gap, ro - gap, a0 + ga, a1 - ga).fill(i % 2 ? pal.field : mix(pal.field, '#ffffff', 0.06));
        P.arcLine(ro - gap - 0.0012, a0 + ga * 2, a1 - ga * 2, rgba('#ffffff', 0.22), 4);
        for (const a of [a0 + 0.012 / ro + ga, a1 - 0.012 / ro - ga]) {
          P.dot(ro - 0.006, a, 0.0018, pal.ink).dot(ro - 0.006, a, 0.0012, mix(pal.field, '#ffffff', 0.35));
        }
      }
    });
    P.circle(0.15 * R, pal.ink, 6);
  },
  // crystal shards with glass glare streaks
  facets(P, G, L, R, rand) {
    const pal = L.pal, rF = L.rField * R;
    const tones = [pal.field, pal.fieldHi, mix(pal.field, '#ffffff', 0.12), mix(pal.field, '#000000', 0.08)];
    const radii = [0.13, 0.27, 0.41, 0.55, 0.69, 0.83, L.rField].map((f) => f * R);
    for (const t of facetRings(radii, rand, 0.032)) {
      P.poly(t).fill(tones[Math.floor(rand() * tones.length)]).stroke(rgba('#ffffff', 0.28), 2.5);
    }
    glare(P, R, -0.6, [[-0.32, 0.2, 0.12], [-0.02, 0.05, 0.2], [0.3, 0.14, 0.09]]);
    P.circle(rF, rgba('#ffffff', 0.5), 4);
  },
  // dark rock plates split by glowing lava seams around a trench
  lava(P, G, L, R, rand) {
    const pal = L.pal, rF = L.rField * R;
    const tones = [pal.field, mix(pal.field, '#000000', 0.18), mix(pal.field, '#ff6a2a', 0.08)];
    const radii = [0.16, 0.3, 0.46, 0.6, 0.72, L.rField].map((f) => f * R);
    const tris = facetRings(radii, rand, 0.04);
    for (const t of tris) P.poly(t).fill(tones[Math.floor(rand() * tones.length)]).stroke(rgba('#000000', 0.35), 3);
    // trench (lowest ring of the profile) and dome
    P.annulus(0.5 * R, 0.64 * R, rgba('#000000', 0.32));
    for (const t of tris) {
      if (rand() > 0.24) continue;
      const [a, b] = rand() < 0.5 ? [t[0], t[1]] : [t[1], t[2]];
      for (const [Q, w, col] of [[P, 6, '#ff5a14'], [P, 2.4, '#ffd36b'], [G, 6, '#ff5a14'], [G, 2.4, '#ffd36b']]) {
        if (Q) Q.line(a[0], a[1], b[0], b[1], col, w);
      }
    }
    for (const Q of [P, G]) Q?.circle(0.57 * R, '#ff7a1a', 4, [10, 14]);
    P.disk(0.3 * R, mix(pal.field, '#ff8c3a', 0.12));
    for (const f of [0.22, 0.27]) P.circle(f * R, rgba(pal.accent, 0.55), 3);
    P.circle(0.3 * R, pal.ink, 6);
  },
  // sun rays fanning out from the centre, clouds drifting over the rim zone
  sunburst(P, G, L, R, rand) {
    const pal = L.pal, rF = L.rField * R, n = 28;
    for (let i = 0; i < n; i += 2) P.sector(0, rF, (i * TAU) / n, ((i + 1) * TAU) / n).fill(pal.fieldHi);
    P.disk(0.3 * R, pal.core);
    P.circle(0.3 * R, pal.ink, 6);
    // compass lines toward the exits
    for (const o of L.openings) P.line(0.32 * R, o.ac, rF - 0.004, o.ac, rgba('#ffffff', 0.85), 5);
    // cel clouds between the exits (union outline: stroke all, then fill all)
    const puffs = [];
    for (let i = 0; i < 4; i++) {
      const a = (i * TAU) / 4 + (L.openings.length ? 0 : TAU / 8);
      for (let j = 0; j < 5; j++) puffs.push([rF + (rand() - 0.6) * 0.016, a + (j - 2) * 0.075 + (rand() - 0.5) * 0.03, 0.007 + rand() * 0.006]);
    }
    for (const [r, a, s] of puffs) { P.g.beginPath(); P.g.arc(P.X(r, a), P.Y(r, a), s * P.k, 0, TAU); P.stroke(pal.ink, 7); }
    for (const [r, a, s] of puffs) P.dot(r, a, s, '#ffffff');
    for (const [r, a, s] of puffs) P.dot(r - s * 0.35, a, s * 0.55, mix('#ffffff', pal.accent, 0.35));
  },
  // engraved rings with glowing glyph bands around a deep well
  runes(P, G, L, R, rand) {
    const pal = L.pal;
    P.disk(0.2 * R, mix(pal.field, '#000000', 0.35));
    for (const f of [0.2, 0.31, 0.56, 0.67]) { P.circle(f * R, pal.ink, 6); P.circle(f * R + 0.0016, rgba(pal.accent, 0.35), 2); }
    for (const [r0, r1] of [[0.21 * R, 0.3 * R], [0.57 * R, 0.66 * R]]) {
      P.annulus(r0, r1, mix(pal.field, '#000000', 0.25));
      const rm = (r0 + r1) / 2, h = (r1 - r0) * 0.32, cell = h * 2.1;
      const n = Math.floor((TAU * rm) / cell);
      for (let i = 0; i < n; i++) {
        const a = (i * TAU) / n, da = h / rm;
        // abstract glyph: 2-3 strokes from a small vocabulary
        const strokes = [];
        const kinds = 2 + Math.floor(rand() * 2);
        for (let s = 0; s < kinds; s++) {
          const kind = Math.floor(rand() * 5);
          if (kind === 0) strokes.push([[rm - h, a], [rm + h, a]]);
          if (kind === 1) strokes.push([[rm + h * 0.6, a - da * 0.7], [rm + h * 0.6, a + da * 0.7]]);
          if (kind === 2) strokes.push([[rm - h, a - da * 0.6], [rm + h, a + da * 0.6]]);
          if (kind === 3) strokes.push([[rm - h * 0.6, a - da * 0.7], [rm - h * 0.6, a + da * 0.7]]);
          if (kind === 4) strokes.push([[rm, a - da * 0.8], [rm + h, a]]);
        }
        for (const Q of [P, G]) {
          if (!Q) continue;
          for (const [[ra, aa], [rb, ab]] of strokes) Q.line(ra, aa, rb, ab, pal.accent, 4);
        }
      }
    }
  },
};

// ---- friction bands

function railBand(P, G, b, pal, glow) {
  const rm = (b.r0 + b.r1) / 2, w = b.r1 - b.r0;
  P.annulus(b.r0, b.r1, mix(pal.ring, pal.field, 0.55));
  const n = Math.round((TAU * rm) / (w * 1.25));
  const da = TAU / n, th = da * 0.3, tip = da * 0.42, ri = b.r0 + w * 0.2, ro = b.r1 - w * 0.2;
  for (let i = 0; i < n; i++) {
    const a = i * da;
    const pts = [[ro, a], [rm, a + tip], [ri, a], [ri, a + th], [rm, a + tip + th], [ro, a + th]];
    P.poly(pts).fill(pal.ring);
    if (glow && G) G.poly(pts).fill(pal.ring);
  }
  P.circle(b.r0, pal.ink, 7).circle(b.r1, pal.ink, 7);
  P.circle(b.r0 + 0.0015, rgba('#ffffff', 0.45), 2.5).circle(b.r1 - 0.0015, rgba('#ffffff', 0.45), 2.5);
}

function slickBand(P, b, pal, rand, dense) {
  const w = b.r1 - b.r0;
  P.annulus(b.r0, b.r1, mix(mix(pal.field, '#000000', 0.15), '#9fdcff', 0.28));
  const n = Math.round(((90 * w) / 0.03) * (b.r0 + b.r1) * 2.4 * dense);
  for (let i = 0; i < n; i++) {
    const r = b.r0 + w * (0.08 + 0.84 * rand()), a = rand() * TAU, len = (0.006 + rand() * 0.022) / r;
    P.arcLine(r, a, a + len, rgba('#ffffff', 0.3 + rand() * 0.35), 1.5 + rand() * 3);
  }
  P.circle(b.r0, pal.ink, 5).circle(b.r1, pal.ink, 5);
  P.circle(b.r0 + 0.0014, rgba('#ffffff', 0.6), 2, [10, 10]);
}

// ---- exits: hazard chevrons pointing out of the stadium

function paintExit(P, o, R, pal) {
  const { a0, a1, ac } = o;
  const depth = Math.min(0.034, R * 0.16), rs = R - depth, h = depth / 3.2, tip = h * 0.95;
  const g = P.g;
  P.sector(rs, R, a0, a1).fill(pal.hazard);
  g.save();
  P.sector(rs, R, a0, a1);
  g.clip();
  const pad = 0.05;
  for (let rb = rs - 2 * h; rb < R + h; rb += h) {
    P.poly([[rb, a0 - pad], [rb + tip, ac], [rb, a1 + pad], [rb + h * 0.5, a1 + pad], [rb + tip + h * 0.5, ac], [rb + h * 0.5, a0 - pad]]).fill(pal.hazardInk);
  }
  g.restore();
  P.sector(rs, R, a0, a1).stroke(pal.hazardInk, 7);
}

// ---- centre sigils (original geometric designs)

const SIGILS = {
  // eight-point compass star, two-tone points
  star(P, G, s, pal) {
    P.disk(s, mix(pal.field, '#000000', 0.25)).circle(s, pal.ink, 7);
    P.annulus(s * 0.84, s * 0.93, pal.accent);
    for (let i = 0; i < 8; i++) {
      const a = (i * TAU) / 8 - Math.PI / 2, len = i % 2 ? s * 0.55 : s * 0.98, wa = TAU / 16;
      P.poly([[0, 0], [len, a], [s * 0.2, a - wa]]).fill(i % 2 ? pal.accent : '#ffffff');
      P.poly([[0, 0], [len, a], [s * 0.2, a + wa]]).fill(i % 2 ? mix(pal.accent, '#000000', 0.35) : pal.accent);
      P.poly([[s * 0.2, a - wa], [len, a], [s * 0.2, a + wa], [0, 0]]).stroke(pal.ink, 4);
    }
    P.disk(s * 0.12, '#ffffff').circle(s * 0.12, pal.ink, 4);
  },
  // three curling blades
  swirl(P, G, s, pal) {
    P.disk(s, mix(pal.field, '#000000', 0.3)).circle(s, pal.ink, 7);
    for (let i = 0; i < 3; i++) {
      const th = (i * TAU) / 3, pts = [];
      for (let t = 0; t <= 1.0001; t += 0.08) pts.push([s * (0.18 + 0.74 * t), th + 2.0 * t]);
      for (let t = 1; t >= -0.0001; t -= 0.08) pts.push([s * (0.18 + 0.62 * t), th + 2.0 * t + 0.9 * (1 - t) + 0.12]);
      P.poly(pts).fill(pal.ring).stroke(pal.ink, 5);
    }
    P.disk(s * 0.2, pal.accent).circle(s * 0.2, pal.ink, 5);
  },
  // broken triangle inside a saw ring
  shards(P, G, s, pal) {
    const teeth = [];
    for (let i = 0; i < 48; i++) teeth.push([i % 2 ? s * 0.9 : s, (i * TAU) / 48]);
    P.poly(teeth).fill(mix(pal.field, '#000000', 0.35)).stroke(pal.ink, 5);
    const V = [0, 1, 2].map((i) => [s * 0.78, -Math.PI / 2 + (i * TAU) / 3]);
    const cart = ([r, a]) => [r * Math.cos(a), r * Math.sin(a)];
    const fills = [pal.ring, pal.accent, '#ffffff'];
    for (let i = 0; i < 3; i++) {
      const A = cart(V[i]), B = cart(V[(i + 1) % 3]), Cc = cart(V[(i + 2) % 3]);
      const mAB = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], mAC = [(A[0] + Cc[0]) / 2, (A[1] + Cc[1]) / 2];
      const quad = [A, mAB, [0, 0], mAC];
      const cx = quad.reduce((t, p) => t + p[0], 0) / 4, cy = quad.reduce((t, p) => t + p[1], 0) / 4;
      P.xyPoly(quad.map(([x, y]) => [cx + (x - cx) * 0.84, cy + (y - cy) * 0.84])).fill(fills[i]).stroke(pal.ink, 5);
    }
  },
  // six-petal ice star in a hexagon
  snow(P, G, s, pal) {
    const hex = [];
    for (let i = 0; i < 6; i++) hex.push([s, (i * TAU) / 6 - Math.PI / 2]);
    P.poly(hex).fill(mix(pal.field, '#000000', 0.2)).stroke(pal.ink, 6);
    for (let i = 0; i < 6; i++) {
      const a = (i * TAU) / 6 - Math.PI / 2;
      P.poly([[0, 0], [s * 0.42, a - 0.24], [s * 0.88, a]]).fill('#ffffff');
      P.poly([[0, 0], [s * 0.42, a + 0.24], [s * 0.88, a]]).fill(pal.accent);
      P.poly([[0, 0], [s * 0.42, a - 0.24], [s * 0.88, a], [s * 0.42, a + 0.24]]).stroke(pal.ink, 4);
      const b = a + TAU / 12;
      P.poly([[s * 0.5, b], [s * 0.6, b - 0.1], [s * 0.7, b], [s * 0.6, b + 0.1]]).fill('#ffffff').stroke(pal.ink, 3);
    }
  },
  // ring of flame tongues around a molten core
  flame(P, G, s, pal) {
    P.disk(s * 0.98, '#2a0c05').circle(s * 0.98, pal.ink, 7);
    for (let i = 0; i < 7; i++) {
      const a = (i * TAU) / 7 - Math.PI / 2, pts = [];
      for (let t = 0; t <= 1.0001; t += 0.1) pts.push([s * (0.32 + 0.62 * t), a - 0.42 * (1 - t) + 0.3 * t * t]);
      for (let t = 1; t >= -0.0001; t -= 0.1) pts.push([s * (0.32 + 0.62 * t), a + 0.42 * (1 - t) + 0.3 * t * t]);
      for (const Q of [P, G]) Q?.poly(pts).fill(pal.ring);
      P.poly(pts).stroke(pal.ink, 4);
      const inner = pts.map(([r, b]) => [s * 0.32 + (r - s * 0.32) * 0.6, a + (b - a) * 0.5]);
      for (const Q of [P, G]) Q?.poly(inner).fill('#fff0a0');
    }
    for (const Q of [P, G]) Q?.disk(s * 0.3, pal.accent);
    P.circle(s * 0.3, pal.ink, 5).disk(s * 0.12, '#fff6c8');
  },
  // winged disc
  wings(P, G, s, pal) {
    const g = P.g, k = P.k, C = P.C;
    for (const side of [-1, 1]) {
      for (let f = 2; f >= 0; f--) {
        const rx = side * s * 0.3, ry = -s * 0.04 + f * s * 0.17;
        const tx = side * s * (1.08 - f * 0.18), ty = -s * (0.42 - f * 0.22);
        g.beginPath();
        g.moveTo(C + rx * k, C + ry * k);
        g.quadraticCurveTo(C + (rx + tx) * 0.5 * k, C + (ty - s * 0.32) * k, C + tx * k, C + ty * k);
        g.quadraticCurveTo(C + (rx + tx) * 0.55 * k, C + (ty + s * 0.12) * k, C + rx * k, C + (ry + s * 0.12) * k);
        g.closePath();
        P.fill(f === 0 ? '#ffffff' : f === 1 ? mix('#ffffff', pal.accent, 0.35) : mix('#ffffff', pal.accent, 0.65)).stroke(pal.ink, 5);
      }
    }
    P.disk(s * 0.4, '#ffffff').circle(s * 0.4, pal.ink, 6);
    P.annulus(s * 0.24, s * 0.31, pal.accent).disk(s * 0.1, pal.ring);
    P.disk(s * 0.1, '#ffcf4a').circle(s * 0.1, pal.ink, 3);
  },
  // the Zero ring: three gates cut into a ring, one per exit
  zero(P, G, s, pal, L) {
    P.disk(s, '#0a0a1a').circle(s, pal.ink, 7);
    const gates = L.openings.length ? L.openings.map((o) => o.ac) : [0, TAU / 3, (2 * TAU) / 3];
    const sorted = gates.slice().sort((a, b) => a - b);
    for (let i = 0; i < sorted.length; i++) {
      const a0 = sorted[i] + 0.2, a1 = sorted[(i + 1) % sorted.length] - 0.2 + (i === sorted.length - 1 ? TAU : 0);
      for (const Q of [P, G]) Q?.sector(s * 0.6, s * 0.84, a0, a1).fill(pal.accent);
      P.sector(s * 0.6, s * 0.84, a0, a1).stroke(pal.ink, 4);
    }
    for (const a of sorted) {
      for (const Q of [P, G]) Q?.poly([[s * 0.88, a - 0.12], [s * 0.98, a], [s * 0.88, a + 0.12]]).fill(pal.accent);
    }
    for (const Q of [P, G]) Q?.disk(s * 0.2, pal.accent);
    P.disk(s * 0.09, '#ffffff');
  },
};

function paintFloor(def, L, size, dense) {
  const R = def.radius, pal = L.pal;
  const P = polarPainter(size, R, pal.edge);
  const G = L.glow ? polarPainter(size, R, '#000000') : null;
  const rand = rng(hash(def.id));
  const rF = L.rField * R;
  // flat zones: field inside, steeper outer slope outside, screen-tone on the slope
  P.disk(rF, pal.field);
  (MOTIFS[L.motif] || MOTIFS.pinwheel)(P, G, L, R, rand, dense);
  halftone(P, rF + 0.003, R - 0.012, pal.dots, dense);
  for (const b of def.bands || []) {
    if (b.friction > 1) railBand(P, G, b, pal, L.glow);
    else slickBand(P, b, pal, rand, dense);
  }
  P.circle(rF, pal.ink, 7);
  // rim gauge ticks (skipped at the exits)
  const inExit = (a) => L.openings.some((o) => Math.abs(wrapA(a - o.ac)) <= (o.a1 - o.a0) / 2 + 0.02);
  for (let d = 0; d < 360; d += 5) {
    const a = d * DEG;
    if (inExit(a)) continue;
    const long = d % 30 === 0;
    P.line(R - (long ? 0.012 : 0.0075), a, R - 0.0028, a, long ? pal.accent : rgba('#ffffff', 0.55), long ? 6 : 3.5);
  }
  for (const o of L.openings) paintExit(P, o, R, pal);
  (SIGILS[L.sigil] || SIGILS.star)(P, G, L.sigilR * R, pal, L);
  P.circle(R, pal.ink, 20); // floor / wall junction
  return { map: P.c, glow: G?.c || null };
}

// ------------------------------------------------------------ small textures

function panelTexture(pal) {
  const W = 256, H = 256, c = makeCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = rgba(pal.wall, 0.2); g.fillRect(0, 0, W, H);
  g.fillStyle = rgba(pal.wall, 0.5); g.fillRect(0, 0, W, H * 0.16);
  g.fillStyle = rgba('#ffffff', 0.7); g.fillRect(0, H * 0.16, W, 4);
  g.fillStyle = rgba(pal.ink, 0.6); g.fillRect(0, H * 0.9, W, H * 0.1);
  // anime glass glare: one broad and one thin diagonal streak per tile
  g.fillStyle = rgba('#ffffff', 0.32);
  g.beginPath(); g.moveTo(W * 0.1, H); g.lineTo(W * 0.3, H); g.lineTo(W * 0.56, 0); g.lineTo(W * 0.36, 0); g.fill();
  g.fillStyle = rgba('#ffffff', 0.5);
  g.beginPath(); g.moveTo(W * 0.36, H); g.lineTo(W * 0.41, H); g.lineTo(W * 0.67, 0); g.lineTo(W * 0.62, 0); g.fill();
  return c;
}

function hazardTexture(pal) {
  const W = 64, H = 64, c = makeCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = pal.hazard; g.fillRect(0, 0, W, H);
  g.fillStyle = pal.hazardInk;
  for (let x = -W; x < W * 2; x += W / 2) { g.beginPath(); g.moveTo(x, H); g.lineTo(x + W / 4, H); g.lineTo(x + W / 4 + H, 0); g.lineTo(x + H, 0); g.fill(); }
  return c;
}

// Stand tier tile (u around, v up one tier): the tread (seen from above) on
// top, the riser below. The crowd is painted on the risers, facing the
// stadium, so it reads from the low battle cameras; the riser behind a tread
// makes those spectators look seated on it.
function crowdTexture(pal, kind, f, size, rand) {
  const W = size, H = size / 4, c = makeCanvas(W, H), g = c.getContext('2d');
  const yEdge = H * (1 - f); // tread front edge / riser top
  const band = H - yEdge;
  const stone = kind === 'ruins';
  const seat = stone ? mix(pal.deck, '#8080a0', 0.25) : kind === 'volcano' ? '#3a2018' : mix(pal.sky, pal.wall, 0.3);
  const riser = stone ? mix(pal.deck, '#000000', 0.25) : mix(seat, '#000000', 0.5);
  g.fillStyle = seat; g.fillRect(0, 0, W, yEdge);
  g.fillStyle = mix(seat, '#000000', 0.18); g.fillRect(0, 0, W, yEdge * 0.25);
  g.fillStyle = riser; g.fillRect(0, yEdge, W, band);
  const lw = Math.max(1.5, W / 512);
  if (stone) {
    // carved blocks with a glyph line on the risers
    g.strokeStyle = rgba(pal.ink, 0.9); g.lineWidth = lw * 1.5;
    for (let x = 0; x < W; x += W / 8) {
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, yEdge); g.stroke();
      g.beginPath(); g.moveTo(x + W / 16, yEdge); g.lineTo(x + W / 16, H); g.stroke();
    }
    g.fillStyle = pal.accent;
    for (let x = 0; x < W; x += W / 16) g.fillRect(x + W / 64, yEdge + band * 0.45, W / 32, lw * 1.5);
  } else if (renderStyle() === 'realistic' && crowdSpriteNow()) {
    // realistic style: a row of spectators rendered in Blender (17 seats, it
    // wraps), dimmed toward the riser colour so it stays a backdrop
    const img = crowdSpriteNow();
    const h = (W * img.height) / img.width;
    g.drawImage(img, 0, yEdge + band - h * 0.98, W, h);
    g.fillStyle = rgba(riser, 0.28); g.fillRect(0, yEdge, W, band);
  } else {
    // muted, so the crowd reads as a backdrop and never competes with the tops
    const shirts = [pal.accent, pal.ring, pal.wall, '#ffffff', '#ff5a7a', '#ffd23f', '#5ad1ff', '#7dff9a', '#ff9a3c'].map((x) => mix(x, riser, 0.55));
    const skin = mix('#f2d2b8', riser, 0.35);
    const hair = ['#1b1428', '#3a2418', '#5a3a20', '#d8c08a', '#2a2a3a', '#7a2a2a'];
    const n = 17, step = W / n;
    for (let i = 0; i < n; i++) {
      if (rand() < 0.1) continue; // empty seat
      const x = (i + 0.5) * step + (rand() - 0.5) * step * 0.2;
      const hy = yEdge + band * (0.36 + rand() * 0.08), hr = step * 0.22;
      const shirt = shirts[Math.floor(rand() * shirts.length)];
      g.strokeStyle = pal.ink; g.lineWidth = lw;
      if (rand() < 0.25) { // cheering: raised arm
        g.lineWidth = lw * 3.2; g.strokeStyle = shirt;
        g.beginPath(); g.moveTo(x + step * 0.3, hy + band * 0.42); g.lineTo(x + step * 0.42, yEdge + band * 0.02); g.stroke();
        g.strokeStyle = pal.ink; g.lineWidth = lw;
      }
      g.fillStyle = shirt;
      g.beginPath(); g.ellipse(x, H + band * 0.05, step * 0.44, H - hy + band * 0.05 - hr * 0.5, 0, Math.PI, TAU); g.fill(); g.stroke();
      g.fillStyle = skin;
      g.beginPath(); g.arc(x, hy, hr, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = hair[Math.floor(rand() * hair.length)];
      g.beginPath(); g.arc(x, hy - hr * 0.15, hr * 1.02, Math.PI * 1.05, Math.PI * 1.95); g.fill();
    }
  }
  g.fillStyle = pal.accent; g.fillRect(0, yEdge - lw * 2, W, lw * 2);
  g.fillStyle = pal.ink; g.fillRect(0, yEdge, W, lw * 1.5);
  return c;
}

function bannerTexture(pal, kind) {
  const cw = 128, H = 256, c = makeCanvas(cw * 4, H), g = c.getContext('2d');
  const cols = kind === 'yard' ? [pal.hazard, pal.accent, '#2a2430', pal.ring] : [pal.accent, pal.wall, pal.ring, mix(pal.sky, '#ffffff', 0.15)];
  for (let i = 0; i < 4; i++) {
    const x0 = i * cw;
    g.save(); g.beginPath(); g.rect(x0, 0, cw, H); g.clip();
    g.fillStyle = cols[i]; g.fillRect(x0, 0, cw, H);
    const ink = inkFor(cols[i], 0.9), light = mix(cols[i], '#ffffff', 0.55);
    g.fillStyle = ink;
    if (i === 0) { // downward chevrons
      for (let y = 60; y < H; y += 46) { g.beginPath(); g.moveTo(x0 + 16, y); g.lineTo(x0 + cw / 2, y + 26); g.lineTo(x0 + cw - 16, y); g.lineTo(x0 + cw - 16, y + 14); g.lineTo(x0 + cw / 2, y + 40); g.lineTo(x0 + 16, y + 14); g.fill(); }
    } else if (i === 1) { // split field with a star
      g.fillStyle = light; g.fillRect(x0, 0, cw / 2, H);
      g.fillStyle = ink; g.beginPath();
      for (let p = 0; p < 10; p++) { const a = -Math.PI / 2 + (p * TAU) / 10, r = p % 2 ? 16 : 40; g.lineTo(x0 + cw / 2 + Math.cos(a) * r, 110 + Math.sin(a) * r); }
      g.fill();
    } else if (i === 2) { // speed lines with a ring
      g.strokeStyle = light; g.lineWidth = 6;
      for (let y = -40; y < H + 40; y += 24) { g.beginPath(); g.moveTo(x0, y + 40); g.lineTo(x0 + cw, y); g.stroke(); }
      g.lineWidth = 12; g.strokeStyle = ink; g.beginPath(); g.arc(x0 + cw / 2, 120, 34, 0, TAU); g.stroke();
    } else { // zigzag bolt
      g.beginPath(); g.moveTo(x0 + 74, 30); g.lineTo(x0 + 36, 130); g.lineTo(x0 + 66, 130); g.lineTo(x0 + 48, 226); g.lineTo(x0 + 96, 106); g.lineTo(x0 + 66, 106); g.closePath(); g.fill();
    }
    // hem and fringe
    g.fillStyle = ink; g.fillRect(x0, 0, cw, 14); g.fillRect(x0, H - 22, cw, 22);
    g.fillStyle = light; for (let x = x0 + 4; x < x0 + cw; x += 12) g.fillRect(x, H - 18, 6, 18);
    g.strokeStyle = ink; g.lineWidth = 6; g.strokeRect(x0 + 3, 3, cw - 6, H - 6);
    g.restore();
  }
  return c;
}

// Ground around the stadium in polar UVs (u = angle, v = sqrt radial).
function groundTexture(pal, kind, W, rand) {
  const H = W / 4, c = makeCanvas(W, H), g = c.getContext('2d');
  const glow = kind === 'volcano' || kind === 'ruins' ? makeCanvas(W, H) : null;
  const gg = glow?.getContext('2d');
  if (gg) { gg.fillStyle = '#000'; gg.fillRect(0, 0, W, H); }
  const yOf = (v) => H * (1 - v); // v in 0..1 (inner .. outer)
  const band = (v0, v1, col, ctx = g) => { ctx.fillStyle = col; ctx.fillRect(0, yOf(v1), W, yOf(v0) - yOf(v1)); };
  const base = kind === 'sky' ? '#f4f8ff' : kind === 'ice' ? mix(pal.sky, pal.accent, 0.22) : mix(pal.sky, pal.deck, 0.5);
  band(0, 1, base);
  if (kind === 'sky') {
    // cloud sea: bands of puffs with blue shade underneath
    for (let row = 0; row < 7; row++) {
      const v = 0.08 + row * 0.13, col = mix('#ffffff', pal.accent, 0.12 + (row % 2) * 0.1);
      for (let x = -40; x < W + 40; x += 34 + rand() * 30) {
        const r = 14 + rand() * 18;
        g.fillStyle = mix(col, pal.accent, 0.3); g.beginPath(); g.arc(x, yOf(v) + 6, r, 0, TAU); g.fill();
        g.fillStyle = col; g.beginPath(); g.arc(x, yOf(v), r, 0, TAU); g.fill();
      }
    }
    return { map: c, glow: null };
  }
  // flat floor with a few crisp rings and panel seams, kept dark and quiet so
  // the stadium stays the brightest thing on screen
  band(0, 0.07, mix(base, '#000000', 0.3));
  band(0.07, 0.078, rgba(pal.accent, 0.85));
  band(0.2, 0.205, rgba(pal.accent, 0.4));
  band(0.33, 0.336, rgba(pal.accent, 0.3));
  g.fillStyle = rgba('#000000', 0.25);
  for (let i = 0; i < 48; i++) g.fillRect((i / 48) * W, yOf(0.33), 3, yOf(0.078) - yOf(0.33));
  // faint speed lines streaking out from the stadium
  g.fillStyle = rgba(kind === 'ice' ? '#ffffff' : pal.accent, 0.07);
  for (let i = 0; i < 60; i++) { const x = rand() * W, v0 = 0.09 + rand() * 0.1; g.fillRect(x, yOf(v0 + 0.08 + rand() * 0.2), 2 + rand() * 3, yOf(v0) - yOf(v0 + 0.28)); }
  if (kind === 'volcano') {
    // lava rivers flowing outward
    for (let i = 0; i < 9; i++) {
      let x = rand() * W;
      const pts = [];
      for (let v = 0.12; v <= 1; v += 0.06) { x += (rand() - 0.5) * 40; pts.push([x, yOf(v)]); }
      for (const [ctx, w, col] of [[g, 9, '#ff5a14'], [g, 3, '#ffd36b'], [gg, 9, '#ff5a14'], [gg, 3, '#ffd36b']]) {
        ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineJoin = 'round';
        ctx.beginPath(); pts.forEach(([px, py], j) => (j ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.stroke();
      }
    }
  }
  if (kind === 'ruins') {
    for (const v of [0.09, 0.19, 0.3]) { for (const ctx of [g, gg]) { ctx.fillStyle = pal.accent; ctx.fillRect(0, yOf(v) - 2, W, 4); } }
    for (let x = 0; x < W; x += W / 48) for (const ctx of [g, gg]) { ctx.fillStyle = pal.accent; ctx.fillRect(x, yOf(0.26), 4, 14); }
  }
  if (kind === 'ice') {
    g.strokeStyle = rgba('#ffffff', 0.55); g.lineWidth = 3;
    for (let i = 0; i < 40; i++) { let x = rand() * W, y = yOf(rand() * 0.5); g.beginPath(); g.moveTo(x, y); for (let s = 0; s < 4; s++) { x += (rand() - 0.5) * 60; y += (rand() - 0.5) * 30; g.lineTo(x, y); } g.stroke(); }
  }
  return { map: c, glow };
}

// Backdrop strip wrapped on the inside of a cylinder (u around, v up).
function backdropTexture(pal, kind, W, rand) {
  const H = W / 4, c = makeCanvas(W, H), g = c.getContext('2d');
  const yOf = (v) => H * (1 - v);
  const bands = (cols, stops) => cols.forEach((col, i) => { g.fillStyle = col; g.fillRect(0, yOf(stops[i + 1]), W, yOf(stops[i]) - yOf(stops[i + 1]) + 1); });
  const horizon = 0.2;
  // flat posterised sky bands from the fog colour up into the theme sky
  const top = kind === 'sky' ? mix(pal.sky, '#3d6fd8', 0.55) : mix(pal.sky, '#000000', 0.3);
  const cols = [pal.fog, mix(pal.fog, top, 0.25), mix(pal.fog, top, 0.5), mix(pal.fog, top, 0.75), top];
  if (kind === 'volcano') cols.splice(1, 2, mix(pal.fog, '#ff4a14', 0.35), mix(pal.fog, '#ff4a14', 0.18));
  if (kind === 'yard') cols.splice(1, 2, mix(pal.fog, '#ff7a3d', 0.45), mix(pal.fog, '#7a2a6a', 0.35));
  bands(cols, [0, horizon, horizon + 0.12, horizon + 0.26, horizon + 0.44, 1]);
  const sil = mix(pal.fog, '#000000', 0.35);
  const silhouette = (pts, col = sil) => { g.fillStyle = col; g.beginPath(); g.moveTo(0, H); pts.forEach(([x, v]) => g.lineTo(x, yOf(v))); g.lineTo(W, H); g.fill(); };
  if (kind === 'hall' || kind === 'ice' || kind === 'yard') {
    // light beams from the roof rig
    for (let i = 0; i < 10; i++) {
      const x = (i + 0.5) * (W / 10) + (rand() - 0.5) * 40, w0 = 10 + rand() * 10, w1 = 60 + rand() * 60, sway = (rand() - 0.5) * 120;
      g.fillStyle = rgba(i % 2 ? pal.accent : '#ffffff', 0.08 + rand() * 0.06);
      g.beginPath(); g.moveTo(x - w0, 0); g.lineTo(x + w0, 0); g.lineTo(x + sway + w1, yOf(horizon)); g.lineTo(x + sway - w1, yOf(horizon)); g.fill();
    }
  }
  if (kind === 'hall') {
    // upper tiers of a packed hall: band with crowd lights (screen-tone)
    silhouette([[0, horizon + 0.2], [W, horizon + 0.2]], mix(pal.fog, '#000000', 0.2));
    g.fillStyle = rgba(pal.accent, 0.35);
    for (let y = yOf(horizon + 0.19); y < yOf(0.02); y += 9) for (let x = ((y / 9) % 2) * 4.5; x < W; x += 9) if (rand() < 0.6) { g.beginPath(); g.arc(x, y, 1.6 + rand() * 1.6, 0, TAU); g.fill(); }
    g.fillStyle = mix(pal.fog, '#000000', 0.5); g.fillRect(0, yOf(horizon + 0.215), W, 6);
    // roof truss
    g.strokeStyle = mix(pal.fog, '#000000', 0.55); g.lineWidth = 5;
    g.beginPath(); g.moveTo(0, yOf(0.88)); g.lineTo(W, yOf(0.88)); g.moveTo(0, yOf(0.8)); g.lineTo(W, yOf(0.8)); g.stroke();
    for (let x = 0; x < W; x += 40) { g.beginPath(); g.moveTo(x, yOf(0.88)); g.lineTo(x + 20, yOf(0.8)); g.lineTo(x + 40, yOf(0.88)); g.stroke(); }
  }
  if (kind === 'yard') {
    // industrial skyline: blocks, stacks, cranes
    const pts = [];
    for (let x = 0; x <= W; x += 30 + rand() * 50) { const v = horizon + 0.03 + rand() * 0.14; pts.push([x, v], [x + 30, v]); }
    silhouette(pts);
    g.fillStyle = sil;
    for (let i = 0; i < 6; i++) { const x = rand() * W; g.fillRect(x, yOf(horizon + 0.35 + rand() * 0.1), 10, yOf(horizon) - yOf(horizon + 0.4)); }
    g.strokeStyle = sil; g.lineWidth = 6;
    for (let i = 0; i < 3; i++) { const x = rand() * W; g.beginPath(); g.moveTo(x, yOf(horizon)); g.lineTo(x, yOf(0.62)); g.lineTo(x + 140, yOf(0.6)); g.stroke(); }
    g.fillStyle = rgba(pal.hazard, 0.7);
    for (let i = 0; i < 40; i++) g.fillRect(rand() * W, yOf(horizon + rand() * 0.12), 4, 4);
  }
  if (kind === 'ice' || kind === 'volcano') {
    const pts = [];
    let v = horizon;
    for (let x = 0; x <= W; x += 40 + rand() * 60) { v = horizon + 0.04 + rand() * (kind === 'volcano' ? 0.08 : 0.22); pts.push([x, v]); }
    silhouette(pts);
  }
  if (kind === 'ice') {
    // aurora ribbons
    for (let r = 0; r < 3; r++) {
      const v0 = 0.55 + r * 0.1, amp = 0.05;
      g.fillStyle = rgba(r % 2 ? pal.accent : '#9affd8', 0.22);
      g.beginPath();
      for (let x = 0; x <= W; x += 16) g.lineTo(x, yOf(v0 + Math.sin((x / W) * TAU * 3 + r) * amp));
      for (let x = W; x >= 0; x -= 16) g.lineTo(x, yOf(v0 + 0.06 + Math.sin((x / W) * TAU * 3 + r + 0.4) * amp));
      g.fill();
    }
  }
  if (kind === 'volcano') {
    for (const cx of [W * 0.25, W * 0.75]) {
      g.fillStyle = mix(pal.fog, '#000000', 0.5);
      g.beginPath(); g.moveTo(cx - W * 0.2, yOf(horizon)); g.lineTo(cx - W * 0.04, yOf(0.62)); g.lineTo(cx + W * 0.04, yOf(0.62)); g.lineTo(cx + W * 0.2, yOf(horizon)); g.fill();
      g.strokeStyle = '#ff7a1a'; g.lineWidth = 5;
      for (let i = 0; i < 4; i++) { g.beginPath(); let x = cx + (rand() - 0.5) * W * 0.06; g.moveTo(x, yOf(0.61)); for (let v = 0.58; v > horizon; v -= 0.06) { x += (rand() - 0.5) * 30; g.lineTo(x, yOf(v)); } g.stroke(); }
      g.fillStyle = '#ffb347'; g.beginPath(); g.ellipse(cx, yOf(0.63), W * 0.04, 8, 0, 0, TAU); g.fill();
    }
    g.fillStyle = '#ffb347';
    for (let i = 0; i < 160; i++) { g.globalAlpha = 0.3 + rand() * 0.6; g.fillRect(rand() * W, yOf(horizon + rand() * 0.7), 3, 3); }
    g.globalAlpha = 1;
  }
  if (kind === 'sky') {
    // big cel clouds: stroke every puff in ink, then fill white, then shade
    for (let i = 0; i < 7; i++) {
      const cx = rand() * W, cy = yOf(0.25 + rand() * 0.5), puffs = [];
      for (let j = 0; j < 6; j++) puffs.push([cx + (j - 2.5) * 34 + (rand() - 0.5) * 20, cy + (rand() - 0.5) * 20 - Math.sin((j / 5) * Math.PI) * 26, 26 + rand() * 22]);
      g.strokeStyle = mix(pal.accent, '#1a2a5a', 0.5); g.lineWidth = 8;
      for (const [x, y, r] of puffs) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke(); }
      g.fillStyle = '#ffffff';
      for (const [x, y, r] of puffs) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
      g.fillStyle = mix('#ffffff', pal.accent, 0.4);
      for (const [x, y, r] of puffs) { g.beginPath(); g.ellipse(x, y + r * 0.45, r * 0.85, r * 0.42, 0, 0, Math.PI); g.fill(); }
    }
    // sun flare
    g.fillStyle = '#fffbe0'; g.beginPath(); g.arc(W * 0.62, yOf(0.8), 38, 0, TAU); g.fill();
    g.strokeStyle = rgba('#fffbe0', 0.6); g.lineWidth = 6;
    for (let i = 0; i < 12; i++) { const a = (i * TAU) / 12; g.beginPath(); g.moveTo(W * 0.62 + Math.cos(a) * 50, yOf(0.8) + Math.sin(a) * 50); g.lineTo(W * 0.62 + Math.cos(a) * 80, yOf(0.8) + Math.sin(a) * 80); g.stroke(); }
  }
  if (kind === 'ruins') {
    // starfield with twinkles and great faint rings
    for (let i = 0; i < 380; i++) {
      const x = rand() * W, y = rand() * yOf(horizon + 0.05), s = rand();
      g.fillStyle = rgba(s > 0.8 ? pal.accent : '#ffffff', 0.4 + s * 0.6);
      if (s > 0.93) { g.fillRect(x - 6, y - 1, 12, 2); g.fillRect(x - 1, y - 6, 2, 12); } else g.fillRect(x, y, 2, 2);
    }
    g.strokeStyle = rgba(pal.accent, 0.18); g.lineWidth = 3;
    for (const r of [180, 260, 340]) { g.beginPath(); g.ellipse(W * 0.3, yOf(0.75), r * 1.6, r * 0.35, 0, 0, TAU); g.stroke(); }
    const pts = [];
    for (let x = 0; x <= W; x += 50 + rand() * 60) { const v = horizon + 0.02 + rand() * 0.06; pts.push([x, v], [x + 14, v + 0.12 * rand()], [x + 28, v]); }
    silhouette(pts, mix(pal.fog, '#000000', 0.2));
  }
  return c;
}

// ------------------------------------------------------------ stadium build

function buildFloor(def, arena, L, quality) {
  const R = def.radius;
  const N = quality === 'low' ? 56 : 80;
  // profile runs from the rim inward so the lathe faces up (outward-running
  // profiles give downward normals and the dish gets back-face culled)
  const pts = [];
  for (let i = N; i >= 0; i--) {
    const r = (i / N) * R;
    pts.push(new THREE.Vector2(Math.max(r, 0.0001), arena.heightAtR(r)));
  }
  const geo = new THREE.LatheGeometry(pts, segs(quality, 128, 96, 64));
  // planar UVs so the top-down paint maps directly (canvas x = x, canvas y = z)
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, 0.5 + pos.getX(i) / (2 * R), 0.5 - pos.getZ(i) / (2 * R));
  const size = quality === 'high' ? 2048 : quality === 'medium' ? 1536 : 1024;
  const paint = paintFloor(def, L, size, quality === 'low' ? 0.5 : quality === 'medium' ? 0.75 : 1);
  const map = canvasTexture(paint.map);
  map.anisotropy = 8;
  const mat = toonMaterial(L.floorTint, {
    finish: L.floorFinish, map, rim: 0,
    emissive: paint.glow ? '#ffffff' : undefined, emissiveMap: paint.glow ? canvasTexture(paint.glow) : null, emissiveIntensity: paint.glow ? 0.9 : 0,
  });
  // two close bands: the dish reads as flat paint, shadows still land crisply
  mat.gradientMap = gradientRamp([206, 255]);
  const floor = new THREE.Mesh(geo, globalThis.DBG_BASIC ? new THREE.MeshBasicMaterial({ map }) : mat);
  floor.receiveShadow = !globalThis.DBG_NOSHADOW;
  floor.name = 'floor';
  return floor;
}

function buildRim(group, def, arena, L, quality) {
  const R = def.radius, pal = L.pal;
  const edgeY = arena.edgeHeight, H = def.wall.height, rimTop = edgeY + H;
  const step = (quality === 'low' ? 6 : quality === 'medium' ? 4 : 2.5) * DEG;
  const capH = Math.min(0.006, H * 0.3);
  const deckY = edgeY - 0.03, deckR = R + 0.036, bodyR = R + 0.03;
  const gateW = 2.4 * DEG;
  const bold = { px: 3, maxMm: 3 }, mid = { px: 2.5, maxMm: 2.5 }, fine = { px: 2, maxMm: 2 };
  const openings = L.openings;
  // wall spans between exits (whole circle if none)
  const spans = [];
  if (!openings.length) spans.push([0, TAU]);
  for (let i = 0; i < openings.length; i++) {
    const cur = openings[i], next = openings[(i + 1) % openings.length];
    let s1 = next.a0;
    if (s1 <= cur.a1) s1 += TAU;
    spans.push([cur.a1, s1]);
  }
  const g = openings.length ? gateW : 0;

  // translucent panels (glass glare painted in), under the rim cap
  const panelTex = repeatTex(panelTexture(pal));
  const panelMat = toonMaterial('#ffffff', { finish: 'clear', map: panelTex, opacity: 0.999, rimColor: pal.accent, rim: 0.45, spec: 0.45, specEdge: 0.975 });
  const panels = addMesh(group, merged(spans.map(([a0, a1]) => revolve(box(R + 0.0006, R + 0.0024, edgeY, rimTop - capH), a0, a1, { step, uScale: 0.075, uRadius: R, edgeV: BOX_V }))), panelMat, 'wall');
  panels.renderOrder = 2;

  // rim caps: bold, glossy, inked
  const caps = spans.map(([a0, a1]) => revolve(box(R, R + 0.0078, rimTop - capH, rimTop), a0 + g, a1 - g, { step }));
  addMesh(group, merged(caps), toonMaterial(pal.rim, { finish: 'plastic', spec: 0.35, specEdge: 0.985 }), 'rim', bold);

  // ribs behind the panels
  const ribs = [];
  for (const [a0, a1] of spans) {
    const n = Math.max(1, Math.round((a1 - a0) / (26 * DEG)));
    for (let i = 1; i < n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      ribs.push(revolve(box(R + 0.0024, R + 0.0078, edgeY, rimTop - capH), a - 1.3 * DEG, a + 1.3 * DEG, { step }));
    }
  }
  addMesh(group, merged(ribs), toonMaterial(pal.post, { finish: 'plastic' }), 'ribs', mid);

  // deck around the wall foot (its ends are the side walls of the exit pockets)
  const decks = spans.map(([a0, a1]) => revolve(box(R + 0.0024, deckR, deckY, edgeY), a0 + (g ? 0.004 : 0), a1 - (g ? 0.004 : 0), { step }));
  addMesh(group, merged(decks), toonMaterial(pal.deck, { finish: 'matte', rim: 0.2 }), 'deck', bold);

  if (openings.length) {
    // gate posts flank every exit at full wall height, in hazard stripes
    const lipTex = repeatTex(hazardTexture(pal));
    const gateTex = repeatTex(hazardTexture(pal));
    const gates = [];
    const gv = { step, uScale: 0.02, uRadius: R + 0.01, edgeV: [[0, 0], [0, (rimTop - deckY) / 0.02], [(rimTop - deckY) / 0.02, (rimTop - deckY) / 0.02], [(rimTop - deckY) / 0.02, 0]] };
    for (const o of openings) {
      gates.push(revolve(box(R, R + 0.02, deckY, rimTop), o.a0 - gateW, o.a0, gv));
      gates.push(revolve(box(R, R + 0.02, deckY, rimTop), o.a1, o.a1 + gateW, gv));
    }
    addMesh(group, merged(gates), toonMaterial('#ffffff', { finish: 'plastic', map: gateTex, spec: 0.3 }), 'gates', { ...bold, color: pal.hazardInk });
    // lips: hazard-striped sills at the physics lip height; their outer face
    // is the front wall of the pocket
    const lips = openings.map((o) => revolve(box(R, R + 0.004, deckY, edgeY + Math.max(0.0005, o.lip)), o.a0, o.a1, { step: step * 0.5, uScale: 0.014, uRadius: R, edgeV: BOX_V }));
    addMesh(group, merged(lips), toonMaterial('#ffffff', { finish: 'plastic', map: lipTex }), 'lips', { ...fine, color: pal.hazardInk });
    // exit pockets: dark floor below the drop
    const pits = openings.map((o) => revolve(box(R + 0.004, bodyR + 0.001, deckY - 0.004, deckY), o.a0 - gateW, o.a1 + gateW, { step }));
    addMesh(group, merged(pits), new THREE.MeshBasicMaterial({ color: pal.pit }), 'pits');
  }

  // stadium body: sloped skirt from the deck down to the ground (or a
  // floating rock for the sky stadium); its inner face is the pocket back wall
  let body;
  if (L.props === 'sky') {
    body = [[0.02, -0.34], [R + 0.075, edgeY - 0.04], [R + 0.062, edgeY - 0.008], [bodyR, edgeY - 0.008], [bodyR, edgeY - 0.035], [0.02, edgeY - 0.035]];
  } else {
    body = [[bodyR, GROUND_Y], [R + 0.088, GROUND_Y], [R + 0.058, edgeY - 0.008], [bodyR, edgeY - 0.008]];
  }
  const bodyGeo = revolve(body, 0, TAU, { step: step * 1.2 });
  addMesh(group, bodyGeo, toonMaterial(pal.body, { finish: 'matte', rim: 0.25, rimColor: pal.accent }), 'body', bold);
}

function buildSurroundings(group, def, L, quality) {
  const pal = L.pal, kind = L.props, R = def.radius;
  const low = quality === 'low', high = quality === 'high';
  const ink = low ? null : { px: 2, maxMm: 8 };
  const rand = rng(hash(def.id + ':props'));
  const sky = kind === 'sky';
  const groundY = sky ? -0.36 : GROUND_Y;

  // ground ring in polar UVs
  const gIn = sky ? 0.05 : R + 0.06, gOut = 2.7;
  const groundGeo = new THREE.RingGeometry(gIn, gOut, segs(quality, 96, 72, 48), 12);
  const gp = groundGeo.attributes.position, guv = groundGeo.attributes.uv;
  for (let i = 0; i < gp.count; i++) {
    const x = gp.getX(i), y = gp.getY(i), r = Math.hypot(x, y);
    let a = Math.atan2(y, x) / TAU; if (a < 0) a += 1;
    // seam vertices sit at angle 0 on both ends of the ring: give the end its u = 1
    const j = i % (segs(quality, 96, 72, 48) + 1);
    if (j === segs(quality, 96, 72, 48)) a = 1;
    guv.setXY(i, a * 3, Math.sqrt((r - gIn) / (gOut - gIn)));
  }
  groundGeo.rotateX(-Math.PI / 2);
  groundGeo.translate(0, groundY, 0);
  const gt = groundTexture(pal, kind, low ? 1024 : 2048, rand);
  const gMap = repeatTex(gt.map);
  const groundMat = toonMaterial('#ffffff', { finish: 'matte', map: gMap, rim: 0, emissive: gt.glow ? '#ffffff' : undefined, emissiveMap: gt.glow ? repeatTex(gt.glow) : null, emissiveIntensity: gt.glow ? 0.8 : 0 });
  groundMat.gradientMap = gradientRamp([206, 255]);
  if (gt.glow) groundMat.emissiveMap.repeat.copy(gMap.repeat);
  addMesh(group, groundGeo, groundMat, 'ground').receiveShadow = true;

  // painted backdrop (unlit, unfogged)
  const back = new THREE.CylinderGeometry(2.65, 2.65, 2.8, segs(quality, 48, 36, 24), 1, true);
  back.translate(0, 0.9, 0);
  const bMap = repeatTex(backdropTexture(pal, kind, low ? 1024 : 2048, rand), 2, 1);
  bMap.wrapT = THREE.ClampToEdgeWrapping;
  addMesh(group, back, new THREE.MeshBasicMaterial({ map: bMap, side: THREE.BackSide, fog: false }), 'backdrop');

  // stands (not in the sky stadium): tiered bowl with a painted crowd
  if (!sky) {
    const tiers = quality === 'low' ? 4 : quality === 'medium' ? 5 : 6;
    const r0 = 0.62, td = 0.07, rh = 0.055, rB = r0 + tiers * td, yTop = GROUND_Y + tiers * rh;
    const f = rh / (rh + td);
    const prof = [[r0, GROUND_Y], [rB + 0.02, GROUND_Y], [rB + 0.02, yTop + 0.035], [rB, yTop + 0.035], [rB, yTop]];
    const edgeV = [[0.02, 0.02], [0.02, 0.02], [0.02, 0.02], [0.02, 0.02]];
    for (let k = tiers - 1; k >= 0; k--) {
      prof.push([r0 + k * td, GROUND_Y + (k + 1) * rh]);
      edgeV.push([k + 1, k + f]);
      if (k > 0) prof.push([r0 + k * td, GROUND_Y + k * rh]);
      edgeV.push([k + f, k]);
    }
    const standGeo = revolve(prof, 0, TAU, { step: (low ? 7.5 : 3.75) * DEG, uScale: 0.5, edgeV });
    const crowd = repeatTex(crowdTexture(pal, kind, f, low ? 512 : 1024, rand));
    addMesh(group, standGeo, toonMaterial('#a8a8a8', { finish: 'matte', map: crowd, rim: 0 }), 'stands', ink && { ...ink, color: pal.ink });
  }

  // light rigs: poles + lamp heads facing the stadium + glowing lamp panels
  if (kind === 'hall' || kind === 'yard' || kind === 'ice' || kind === 'volcano') {
    const poles = [], heads = [], lamps = [];
    const n = 4;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + Math.PI / 4 + 0.12, rr = 1.24;
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      poles.push(place(new THREE.BoxGeometry(0.035, 1.12, 0.035), x, GROUND_Y + 0.56, z));
      poles.push(place(new THREE.BoxGeometry(0.24, 0.02, 0.02), x, 0.98, z));
      const head = new THREE.BoxGeometry(0.26, 0.11, 0.05);
      heads.push(place(head, x * 0.985, 1.06, z * 0.985, { rx: 0.5 }));
      for (let c = 0; c < 3; c++) {
        const lamp = new THREE.BoxGeometry(0.07, 0.08, 0.012);
        lamp.translate((c - 1) * 0.082, 0, 0.028);
        lamps.push(place(lamp, x * 0.985, 1.06, z * 0.985, { rx: 0.5 }));
      }
    }
    // banner rail ring above the stands
    if (!low) poles.push(new THREE.TorusGeometry(1.13, 0.008, 4, 64).rotateX(Math.PI / 2).translate(0, 0.52, 0));
    const metal = kind === 'yard' ? '#3a3440' : mix(pal.deck, '#2a3044', 0.5);
    addMesh(group, merged(poles), toonMaterial(metal, { finish: 'metal' }), 'rigs', ink);
    addMesh(group, merged(heads), toonMaterial(mix(metal, '#000000', 0.3), { finish: 'plastic' }), 'lampHeads', ink);
    addMesh(group, merged(lamps), new THREE.MeshBasicMaterial({ color: '#fff6d8', fog: false }), 'lamps');
  }

  // banners hanging from the rail
  if (!low && (kind === 'hall' || kind === 'yard' || kind === 'ice' || kind === 'volcano')) {
    const list = [];
    const n = high ? 12 : 8;
    for (let i = 0; i < n; i++) {
      const a = ((i + 0.5) / n) * TAU, rr = 1.12;
      const b = new THREE.BoxGeometry(0.11, 0.27, 0.006);
      const uv = b.attributes.uv, cell = i % 4;
      for (let j = 0; j < uv.count; j++) uv.setX(j, (cell + uv.getX(j)) / 4);
      list.push(place(b, Math.cos(a) * rr, 0.38, Math.sin(a) * rr));
    }
    addMesh(group, merged(list), toonMaterial('#ffffff', { finish: 'matte', map: canvasTexture(bannerTexture(pal, kind)), rim: 0 }), 'banners', ink && { ...ink, color: pal.ink });
  }

  // theme props
  const nProps = low ? 6 : quality === 'medium' ? 10 : 14;
  if (kind === 'ice') {
    const shards = [];
    for (let i = 0; i < nProps; i++) {
      const a = ((i + rand() * 0.6) / nProps) * TAU, rr = 0.4 + rand() * 0.12;
      for (let j = 0; j < 3; j++) {
        const h = 0.07 + rand() * 0.09;
        const cone = new THREE.ConeGeometry(0.018 + rand() * 0.01, h, 5);
        cone.translate(0, h / 2, 0);
        shards.push(place(cone, Math.cos(a + (j - 1) * 0.04) * (rr + j * 0.01), GROUND_Y, Math.sin(a + (j - 1) * 0.04) * (rr + j * 0.01), { rx: (rand() - 0.5) * 0.7, rz: (rand() - 0.5) * 0.7 }));
      }
    }
    const mat = toonMaterial(mix(pal.accent, '#ffffff', 0.2), { finish: 'gem', flatShading: true, emissive: pal.accent, emissiveIntensity: 0.15 });
    addMesh(group, merged(shards), mat, 'crystals', ink && { ...ink, color: inkFor(pal.wall, 0.85) });
  }
  if (kind === 'volcano') {
    const rocks = [];
    for (let i = 0; i < nProps; i++) {
      const a = ((i + rand() * 0.6) / nProps) * TAU, rr = 0.4 + rand() * 0.14, s = 0.04 + rand() * 0.05;
      rocks.push(place(new THREE.DodecahedronGeometry(1, 0), Math.cos(a) * rr, GROUND_Y + s * 0.4, Math.sin(a) * rr, { sx: s * 1.3, sy: s, sz: s, ry: rand() * TAU }));
    }
    addMesh(group, merged(rocks), toonMaterial('#3b2420', { finish: 'matte', flatShading: true, rimColor: '#ff7a1a', rim: 0.5 }), 'rocks', ink);
  }
  if (kind === 'ruins') {
    const stones = [], glyphs = [];
    const n = low ? 6 : 9;
    for (let i = 0; i < n; i++) {
      const a = ((i + 0.5) / n) * TAU, rr = 0.46, h = 0.2 + rand() * 0.12;
      const st = new THREE.BoxGeometry(0.07, h, 0.04);
      st.translate(0, h / 2, 0);
      stones.push(place(st, Math.cos(a) * rr, GROUND_Y, Math.sin(a) * rr, { rz: (rand() - 0.5) * 0.12 }));
      for (let k = 0; k < 3; k++) {
        const gl = new THREE.BoxGeometry(k === 1 ? 0.03 : 0.012, k === 1 ? 0.008 : 0.03, 0.004);
        gl.translate(0, h * (0.45 + k * 0.14), 0.021);
        glyphs.push(place(gl, Math.cos(a) * rr, GROUND_Y, Math.sin(a) * rr));
      }
    }
    addMesh(group, merged(stones), toonMaterial('#2a2a48', { finish: 'matte', rimColor: pal.accent, rim: 0.4 }), 'monoliths', ink);
    addMesh(group, merged(glyphs), new THREE.MeshBasicMaterial({ color: pal.accent }), 'glyphs');
  }
  if (sky) {
    const puffs = [];
    const n = low ? 8 : quality === 'medium' ? 12 : 16;
    for (let i = 0; i < n; i++) {
      const a = ((i + rand() * 0.7) / n) * TAU, rr = 0.42 + rand() * 0.9, y = -0.26 + rand() * 0.14, s = 0.05 + rand() * 0.05;
      const parts = low ? 2 : 4;
      for (let j = 0; j < parts; j++) {
        const sp = new THREE.IcosahedronGeometry(1, low ? 0 : 1);
        puffs.push(place(sp, Math.cos(a) * rr + (j - parts / 2) * s * 0.9 * Math.sin(a), y + (j % 2) * s * 0.3, Math.sin(a) * rr - (j - parts / 2) * s * 0.9 * Math.cos(a), { face: false, sx: s * (1 - Math.abs(j - 1.5) * 0.15), sy: s * 0.7, sz: s }));
      }
    }
    addMesh(group, merged(puffs), toonMaterial('#ffffff', { finish: 'matte', rimColor: '#ffffff', rim: 0.3 }), 'clouds', ink && { ...ink, color: mix(pal.accent, '#1a2a5a', 0.55) });
    // pennant poles on the plateau rim
    if (!low) {
      const poles = [], flags = [];
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU, rr = R + 0.07, x = Math.cos(a) * rr, z = Math.sin(a) * rr;
        poles.push(place(new THREE.CylinderGeometry(0.003, 0.004, 0.075, 6).translate(0, 0.0375, 0), x, -0.002, z));
        const fl = new THREE.BoxGeometry(0.004, 0.022, 0.036).translate(0, 0.06, 0.018);
        flags.push(place(fl, x, -0.002, z, { ry: Math.PI / 2 }));
      }
      addMesh(group, merged(poles), toonMaterial('#e8eef8', { finish: 'metal' }), 'poles', ink);
      addMesh(group, merged(flags), toonMaterial(pal.ring === '#ffffff' ? '#ff5a7a' : pal.ring, { finish: 'plastic' }), 'flags', ink);
    }
  }
}

export function buildArena(def, quality = 'high') {
  const arena = new Arena(def);
  const group = new THREE.Group();
  group.name = 'arena';
  const L = lookFor(def);
  L.openings = (def.wall.openings || [])
    .map((o) => ({ a0: (o.angle - o.width / 2) * DEG, a1: (o.angle + o.width / 2) * DEG, ac: o.angle * DEG, lip: o.lipHeight || 0 }))
    .sort((a, b) => a.a0 - b.a0);
  const floor = buildFloor(def, arena, L, quality);
  group.add(floor);
  buildRim(group, def, arena, L, quality);
  buildSurroundings(group, def, L, quality);
  return { group, arena, floor };
}
