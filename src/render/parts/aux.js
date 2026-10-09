// Auxiliary module models. Five individually designed add-on parts, each
// built from separate pieces the way a real toy module is:
//   aux_freespin : ice-clear crown band with chrome bumper studs, riding on a
//                  ring of brass rollers in a gunmetal race (the band spins
//                  free: it is the model's spinner)
//   aux_wedge    : low raked skirt: navy tray under four gold wedge blades
//                  with chrome scoop lips, accent lift chevrons, hazard print
//   aux_gyro     : chrome flywheel on accent spokes from a hub collar, with
//                  tungsten clamp blocks and brass bolts, printed rim strip
//   aux_damper   : lavender rubber cushion pads on the ring top by each
//                  blade, dark rubber grip ribs and a cogged lip gasket
//   aux_ballast  : chunky gunmetal weight blocks clipped on a steel band at
//                  the lock base, hazard-striped face plates, hex bolts
// Unknown ids get a parametric model chosen by their mount and sized from
// their numbers alone.
//
// Envelopes (see auxMount() in parts/index.js):
//   layer : y in [0, layer.thickness], never outside profileOutline(layer)
//           (+0.3 mm), inner radius about layer.radius - 3 mm
//   band  : y in [-1.5, 1.5] around the band centre, nothing inside the
//           lock radius + 0.2 mm, outer radius ringRadius[1] (+0.2 mm)
//   insert: inside the ring's profile, y in [0, ring thickness + 1 mm]
//
// Geometry is built as triangle soups in millimetres, one soup per material
// (every repeated detail of a material lands in one mesh), then converted to
// metres with crease-angle normals: hard edges at chamfers, smooth along
// turned surfaces.

import * as THREE from 'three';
import { MM, TAU, partGroup, toonMaterial, inked, tone, segs, canvasTexture, rarityGlow } from './common.js';
import { mix } from '../toon.js';
import { sampleProfile } from '../../physics/profile.js';

const UV_R = 30; // mm: planar top-down UVs span [-UV_R, UV_R]
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const linspace = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
const ring = (n, phase = 0) => linspace(0, TAU, n).slice(0, n).map((a) => a + phase);

// ------------------------------------------------------------------ colours

function hsl(hex) { const o = { h: 0, s: 0, l: 0 }; new THREE.Color(hex).getHSL(o, THREE.SRGBColorSpace); return o; }
function fromHsl(h, s, l) { return '#' + new THREE.Color().setHSL(((h % 1) + 1) % 1, clamp(s, 0, 1), clamp(l, 0, 1), THREE.SRGBColorSpace).getHexString(); }
function rgbDist(a, b) { const x = new THREE.Color(a), y = new THREE.Color(b); return Math.hypot(x.r - y.r, x.g - y.g, x.b - y.b); }
// Paint for faces that look into the lights: saturated paints get their
// lightness capped (and a little more saturation) so they stay coloured
// instead of washing out; greys and whites keep their value.
function paint(hex, maxL = 0.55, ds = 0.08) {
  const { h, s, l } = hsl(hex);
  if (s < 0.15) return hex;
  return fromHsl(h, s + ds, Math.min(l, maxL));
}
const shade = (hex, dl, ds = 0) => { const { h, s, l } = hsl(hex); return fromHsl(h, s + ds, l + dl); };
// The player's accent, unless it would vanish against `against`.
const accentOr = (ctx, against, fallback) => (ctx.accent && rgbDist(ctx.accent, against) > 0.35 ? ctx.accent : fallback);

// ------------------------------------------------------------------ geometry kit

// Triangle soup in mm with a per-vertex colour (linear RGB) for pieces that
// share a material but not a paint.
class Soup {
  constructor() { this.p = []; this.c = []; this.rgb = [1, 1, 1]; this.tinted = false; }
  color(hex) { const c = new THREE.Color(hex); this.rgb = [c.r, c.g, c.b]; this.tinted = true; return this; }
  tri(a, b, c) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * nx + ny * ny + nz * nz < 1e-10) return; // degenerate (axis, collapsed chamfer)
    this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    const [r, g, bl] = this.rgb;
    this.c.push(r, g, bl, r, g, bl, r, g, bl);
  }
  // triangle wound to face along h
  triH(a, b, c, h) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const d = (uy * vz - uz * vy) * h[0] + (uz * vx - ux * vz) * h[1] + (ux * vy - uy * vx) * h[2];
    if (d < 0) this.tri(a, c, b); else this.tri(a, b, c);
  }
  // copy another soup rotated about +Y by `rotY` (psi convention: local +X
  // goes to the psi direction) then translated; takes this soup's colour
  place(src, x = 0, y = 0, z = 0, rotY = 0) {
    const c = Math.cos(rotY), s = Math.sin(rotY), p = src.p, [r, g, b] = this.rgb;
    for (let i = 0; i < p.length; i += 3) {
      this.p.push(x + p[i] * c + p[i + 2] * s, y + p[i + 1], z - p[i] * s + p[i + 2] * c);
      this.c.push(r, g, b);
    }
  }
  get empty() { return this.p.length === 0; }
}

// Normals averaged over coincident vertices whose faces are within `angle`.
function creaseNormals(p, angle) {
  const nV = p.length / 3, nF = nV / 3, cosA = Math.cos(angle);
  const fa = new Float32Array(nF * 3), fu = new Float32Array(nF * 3);
  for (let f = 0; f < nF; f++) {
    const o = f * 9;
    const ux = p[o + 3] - p[o], uy = p[o + 4] - p[o + 1], uz = p[o + 5] - p[o + 2];
    const vx = p[o + 6] - p[o], vy = p[o + 7] - p[o + 1], vz = p[o + 8] - p[o + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    fa.set([nx, ny, nz], f * 3);
    fu.set([nx / l, ny / l, nz / l], f * 3);
  }
  const map = new Map(), keys = new Array(nV);
  for (let v = 0; v < nV; v++) {
    const k = `${Math.round(p[v * 3] * 1000)},${Math.round(p[v * 3 + 1] * 1000)},${Math.round(p[v * 3 + 2] * 1000)}`;
    keys[v] = k;
    let l = map.get(k);
    if (!l) map.set(k, (l = []));
    l.push((v / 3) | 0);
  }
  const out = new Float32Array(nV * 3);
  for (let v = 0; v < nV; v++) {
    const f = (v / 3) | 0;
    let sx = 0, sy = 0, sz = 0;
    for (const g of map.get(keys[v])) {
      if (fu[f * 3] * fu[g * 3] + fu[f * 3 + 1] * fu[g * 3 + 1] + fu[f * 3 + 2] * fu[g * 3 + 2] < cosA) continue;
      sx += fa[g * 3]; sy += fa[g * 3 + 1]; sz += fa[g * 3 + 2];
    }
    const l = Math.hypot(sx, sy, sz) || 1;
    out[v * 3] = sx / l; out[v * 3 + 1] = sy / l; out[v * 3 + 2] = sz / l;
  }
  return out;
}

// Soup -> non-indexed BufferGeometry in metres (position, normal, uv, and
// color when the soup was tinted). uvFn(x, y, z) in mm overrides the planar
// top-down UVs.
function finish(soup, { crease = 0.62, uvFn = null } = {}) {
  const p = new Float32Array(soup.p), n = p.length / 3;
  const nor = creaseNormals(p, crease);
  const uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
    const [u, v] = uvFn ? uvFn(x, y, z) : [0.5 + x / (2 * UV_R), 0.5 - z / (2 * UV_R)];
    uv[i * 2] = u; uv[i * 2 + 1] = v;
  }
  for (let i = 0; i < p.length; i++) p[i] *= MM;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (soup.tinted) geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(soup.c), 3));
  geo.computeBoundingSphere();
  return geo;
}

// Sweep a cross-section around the spin axis. sect(psi) -> polygon [[r, y]]
// in mm, counter-clockwise in (r right, y up), fixed point count; psis
// ascending. closed = full turn, otherwise both ends are capped.
function sweep(soup, sect, psis, closed = false) {
  const S = psis.length, rings = [], secs = [];
  for (const psi of psis) {
    const s = sect(psi), c = Math.cos(psi), sn = Math.sin(psi);
    secs.push(s);
    rings.push(s.map(([r, y]) => [c * r, y, -sn * r]));
  }
  const P = rings[0].length;
  for (let i = 0; i < (closed ? S : S - 1); i++) {
    const A = rings[i], B = rings[(i + 1) % S];
    for (let j = 0; j < P; j++) {
      const j2 = (j + 1) % P;
      soup.tri(A[j], B[j2], A[j2]);
      soup.tri(A[j], B[j], B[j2]);
    }
  }
  if (!closed) {
    endCap(soup, secs[0], rings[0], psis[0], -1);
    endCap(soup, secs[S - 1], rings[S - 1], psis[S - 1], 1);
  }
}

function endCap(soup, sec, rng, psi, sgn) {
  const idx = [];
  const far = (i, j) => Math.abs(sec[i][0] - sec[j][0]) + Math.abs(sec[i][1] - sec[j][1]) > 1e-5;
  for (let i = 0; i < sec.length; i++) if (!idx.length || far(i, idx[idx.length - 1])) idx.push(i);
  while (idx.length > 2 && !far(idx[0], idx[idx.length - 1])) idx.pop();
  if (idx.length < 3) return;
  const tris = THREE.ShapeUtils.triangulateShape(idx.map((i) => new THREE.Vector2(sec[i][0], sec[i][1])), []);
  const h = [-Math.sin(psi) * sgn, 0, -Math.cos(psi) * sgn];
  for (const [a, b, c] of tris) soup.triH(rng[idx[a]], rng[idx[b]], rng[idx[c]], h);
}

// Chamfered block cross-section (CCW, 8 points): r in [ri, ro], y in
// [y0, y1], top chamfer ct, bottom chamfer cb, shrunk by e (end chamfers).
function box(ri, ro, y0, y1, ct = 0, cb = 0, e = 0) {
  ri += e; ro -= e; y1 -= e;
  if (cb) y0 += e;
  const t = Math.min(ct, (ro - ri) * 0.45, (y1 - y0) * 0.45), b = Math.min(cb, (ro - ri) * 0.45, (y1 - y0) * 0.45);
  return [[ri + b, y0], [ro - b, y0], [ro, y0 + b], [ro, y1 - t], [ro - t, y1], [ri + t, y1], [ri, y1 - t], [ri, y0 + b]];
}

// Sweep over psi in [a, b] with chamfered ends: sect(psi, e) gets the inset
// e (ce at the very ends, 0 once `ce` mm of arc in from them at radius rm).
function arcSweep(soup, a, b, rm, ce, n, sect) {
  const d = Math.min(ce / rm, (b - a) * 0.3);
  const ps = d > 0 ? [a, ...linspace(a + d, b - d, Math.max(1, n)), b] : linspace(a, b, Math.max(1, n));
  sweep(soup, (psi) => sect(psi, d > 0 ? ce * Math.max(0, 1 - Math.min(psi - a, b - psi) / d) : 0), ps, false);
}

// Small turned detail from an [r, y] profile, axis at (x, y, z).
function turned(soup, prof, seg, x, y, z, rot = 0) {
  const t = new Soup();
  sweep(t, () => prof, ring(seg, rot), true);
  soup.place(t, x, y, z);
}
const studProf = (rad, h, c = Math.min(rad * 0.35, h * 0.5)) => [[0, 0], [rad, 0], [rad, h - c], [rad - c, h], [0, h]];
const domeProf = (rad, h) => [[0, 0], [rad, 0], [rad, h * 0.3], [rad * 0.75, h * 0.8], [rad * 0.3, h], [0, h]];
// hex bolt head with a turned washer, base at y
function hexBolt(soup, r, psi, y, rad, h, seg = 6) {
  const x = Math.cos(psi) * r, z = -Math.sin(psi) * r;
  turned(soup, [[0, 0], [rad * 1.25, 0], [rad * 1.25, h * 0.25], [0, h * 0.25]], 10, x, y, z);
  turned(soup, studProf(rad, h, Math.min(rad * 0.3, h * 0.35)), seg, x, y + h * 0.2, z, psi + Math.PI / 6);
}

// Inset a convex polygon [[x, z]] by d.
function inset(poly, d) {
  const n = poly.length;
  const cx = poly.reduce((s, p) => s + p[0], 0) / n, cz = poly.reduce((s, p) => s + p[1], 0) / n;
  const lines = poly.map((p, i) => {
    const q = poly[(i + 1) % n], ex = q[0] - p[0], ez = q[1] - p[1], l = Math.hypot(ex, ez) || 1;
    let nx = -ez / l, nz = ex / l;
    if (nx * (cx - p[0]) + nz * (cz - p[1]) < 0) { nx = -nx; nz = -nz; }
    return { px: p[0] + nx * d, pz: p[1] + nz * d, ex, ez };
  });
  return poly.map((p, i) => {
    const A = lines[(i + n - 1) % n], B = lines[i];
    const den = A.ex * B.ez - A.ez * B.ex;
    if (Math.abs(den) < 1e-9) return [B.px, B.pz];
    const t = ((B.px - A.px) * B.ez - (B.pz - A.pz) * B.ex) / den;
    return [A.px + A.ex * t, A.pz + A.ez * t];
  });
}

// Extruded convex footprint [[x, z]] (mm) from y0 to y1 with chamfered top
// (ct) and bottom (cb) edges.
function prism(soup, poly, y0, y1, ct = 0, cb = 0) {
  const L = [];
  if (cb > 0) L.push([inset(poly, cb), y0]);
  L.push([poly, y0 + cb], [poly, y1 - ct]);
  if (ct > 0) L.push([inset(poly, ct), y1]);
  const rings = L.map(([pl, y]) => pl.map(([x, z]) => [x, y, z]));
  const n = poly.length;
  const cx = poly.reduce((s, p) => s + p[0], 0) / n, cz = poly.reduce((s, p) => s + p[1], 0) / n;
  for (let i = 0; i < rings.length - 1; i++) {
    const A = rings[i], B = rings[i + 1];
    for (let j = 0; j < n; j++) {
      const j2 = (j + 1) % n;
      const h = [(A[j][0] + A[j2][0]) / 2 - cx, 0, (A[j][2] + A[j2][2]) / 2 - cz]; // outward
      soup.triH(A[j], A[j2], B[j2], h);
      soup.triH(A[j], B[j2], B[j], h);
    }
  }
  const top = rings[rings.length - 1], bot = rings[0];
  for (let j = 1; j < n - 1; j++) {
    soup.triH(top[0], top[j], top[j + 1], [0, 1, 0]);
    soup.triH(bot[0], bot[j], bot[j + 1], [0, -1, 0]);
  }
}

// Footprint helpers in the psi = 0 frame (x radial, z = -tangential); the
// result is rotated to psi by placing.
function placed(soup, psi, build) {
  const t = new Soup();
  build(t);
  soup.place(t, 0, 0, 0, psi);
}
// Trapezoid from radius x0 (half-width w0) to x1 (half-width w1).
const trap = (x0, x1, w0, w1) => [[x0, -w0], [x1, -w1], [x1, w1], [x0, w0]];

// Printed strip on a surface of revolution: rows [[r, y], ...] mm from
// v = 0 to v = 1, u around psi in [a, b] with `rep` texture repeats.
function stripGeo(rows, a, b, n, rep) {
  const pos = [], uv = [], idx = [], m = rows.length;
  for (let i = 0; i <= n; i++) {
    const psi = a + ((b - a) * i) / n, c = Math.cos(psi), s = Math.sin(psi);
    rows.forEach(([r, y], j) => { pos.push(c * r * MM, y * MM, -s * r * MM); uv.push((rep * i) / n, j / (m - 1)); });
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < m - 1; j++) {
    const A = i * m + j, B = (i + 1) * m + j;
    idx.push(A, B + 1, A + 1, A, B, B + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// ------------------------------------------------------------------ decals

// Canvases are cached per design + colours (textures are made per build).
const CANVAS = new Map();
function stripCanvas(key, w, h, draw) {
  if (CANVAS.has(key)) return CANVAS.get(key);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  CANVAS.set(key, c);
  return c;
}

function decalMesh(geo, canvas, { repeat = true, opacity = 1 } = {}) {
  const tex = canvasTexture(canvas);
  if (repeat) tex.wrapS = THREE.RepeatWrapping;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const m = new THREE.Mesh(geo, mat);
  m.userData.noInk = true;
  m.renderOrder = 2;
  return m;
}

// Repeating print: a text label between chevron ticks on a coloured band.
function printStrip(text, fg, bg, accent) {
  return stripCanvas(`print|${text}|${fg}|${bg}|${accent}`, 512, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    if (bg) { g.fillStyle = bg; g.fillRect(0, 6, w, h - 12); }
    g.fillStyle = accent;
    for (const x of [8, w - 60]) {
      for (let k = 0; k < 2; k++) {
        const x0 = x + k * 22;
        g.beginPath(); g.moveTo(x0, 12); g.lineTo(x0 + 14, 32); g.lineTo(x0, 52); g.lineTo(x0 + 9, 52); g.lineTo(x0 + 23, 32); g.lineTo(x0 + 9, 12); g.closePath(); g.fill();
      }
    }
    g.fillStyle = fg;
    g.font = 'italic bold 36px sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
  });
}

// Graduated ring (dial ticks) with accent marks.
function tickStrip(fg, accent) {
  return stripCanvas(`ticks|${fg}|${accent}`, 512, 32, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = fg;
    for (let i = 0; i < 32; i++) {
      const x = (i + 0.5) * (w / 32), big = i % 4 === 0;
      g.fillRect(x - (big ? 3 : 1.5), big ? 2 : 10, big ? 6 : 3, big ? h - 4 : h - 20);
    }
    g.fillStyle = accent;
    g.fillRect(0, h / 2 - 2, w, 4);
  });
}

// Diagonal hazard stripes.
function hazardStrip(a, b) {
  return stripCanvas(`hazard|${a}|${b}`, 128, 64, (g, w, h) => {
    g.fillStyle = a; g.fillRect(0, 0, w, h);
    g.fillStyle = b;
    for (let x = -h; x < w + h; x += 32) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 16, h); g.lineTo(x + 16 + h, 0); g.lineTo(x + h, 0); g.closePath(); g.fill(); }
  });
}

// ------------------------------------------------------------------ assembly

// Builds the meshes of one part from its soups. Each bin: { soup, mat, ink }.
function makeMeshes(parent, bins) {
  const out = {};
  for (const [name, b] of Object.entries(bins)) {
    if (!b.soup || b.soup.empty) continue;
    const geo = finish(b.soup, b.finish);
    const m = b.ink === false ? new THREE.Mesh(geo, b.mat) : inked(geo, b.mat, b.ink || {});
    m.name = name;
    m.castShadow = true;
    (b.parent || parent).add(m);
    out[name] = m;
  }
  return out;
}

// Material with per-vertex paint (white base colour).
function vcMat(finish, rim, ink, opts = {}) {
  const m = toonMaterial('#ffffff', { finish, rimColor: rim, ink, ...opts });
  m.vertexColors = true;
  return m;
}

function layerOf(part, ctx) {
  if (ctx.layer) return ctx.layer;
  const l = part.layer || {};
  return { radius: (l.radius || 24) * MM, baseRadius: ((l.blades ? (l.radius || 24) - 1.5 : l.radius) || 24) * MM, thickness: (l.thickness || 3) * MM, blades: l.blades || 0, bladeWidth: l.bladeWidth ?? 0.55, hand: 0, slope: ((l.slope || 0) * Math.PI) / 180, freeSpin: l.freeSpin || 0 };
}

// ------------------------------------------------------------------ designs

// Per-id design (colours, counts, print). Unknown ids derive one from their
// numbers: the builder follows the mount, sizes follow mass and radii.
function designFor(part, ctx) {
  const c = part.color;
  switch (part.id) {
    case 'aux_freespin':
      return { kind: 'freespin', band: c || '#e9f6ff', bumper: '#eef3fb', race: '#34405a', roller: '#ffc23d', tab: accentOr(ctx, '#34405a', '#ff4f7a'), nBump: 8, nRoll: 18, print: 'FREE·SPIN' };
    case 'aux_wedge':
      return { kind: 'skirt', blade: c || '#ffcf70', tray: '#1f2742', lip: '#eef3fb', chevron: accentOr(ctx, c || '#ffcf70', '#ff4a3d'), hazard: ['#ffcf70', '#1f2742'] };
    case 'aux_gyro':
      return { kind: 'gyro', rim: c || '#c0c6d0', block: '#3a4152', hub: '#232a3a', spoke: accentOr(ctx, c || '#c0c6d0', '#36c6ff'), bolt: '#ffc94a', nBlocks: 6, print: 'GYRO·STABLE' };
    case 'aux_damper':
      return { kind: 'damper', pad: c || '#b8a6ff', rib: shade(c || '#b8a6ff', -0.24, 0.05), pin: '#eef3fb' };
    case 'aux_ballast':
      return { kind: 'ballast', block: c || '#7c838d', band: '#262c37', plate: '#ffc531', stripe: '#1c1d26', bolt: '#eef3fb', n: 4 };
    default: {
      const m = ctx.mount?.kind;
      const mass = part.mass || 4;
      if (m === 'layer') {
        const L = layerOf(part, ctx);
        if (L.freeSpin) return { kind: 'freespin', band: c || '#e9f6ff', bumper: '#eef3fb', race: '#34405a', roller: '#ffc23d', tab: accentOr(ctx, '#34405a', '#ff4f7a'), nBump: clamp(Math.round(L.radius / MM / 3), 6, 10), nRoll: clamp(Math.round(L.radius / MM * 0.75), 10, 22), print: 'FREE·SPIN' };
        return { kind: 'skirt', blade: c || '#ffcf70', tray: '#1f2742', lip: '#eef3fb', chevron: accentOr(ctx, c || '#ffcf70', '#ff4a3d'), hazard: [c || '#ffcf70', '#1f2742'] };
      }
      if (m === 'band') {
        if (ctx.mount.lowMount) return { kind: 'ballast', block: c || '#7c838d', band: '#262c37', plate: '#ffc531', stripe: '#1c1d26', bolt: '#eef3fb', n: clamp(Math.round(mass / 1.5), 3, 6) };
        return { kind: 'gyro', rim: c || '#c0c6d0', block: '#3a4152', hub: '#232a3a', spoke: accentOr(ctx, c || '#c0c6d0', '#36c6ff'), bolt: '#ffc94a', nBlocks: clamp(Math.round(mass * 1.2), 3, 8), print: 'GYRO' };
      }
      return { kind: 'damper', pad: c || '#b8a6ff', rib: shade(c || '#b8a6ff', -0.24, 0.05), pin: '#eef3fb' };
    }
  }
}

export function buildAux(part, ctx) {
  const D = designFor(part, ctx);
  const g = partGroup('aux');
  const build = { freespin: buildFreeSpin, skirt: buildSkirt, gyro: buildGyro, ballast: buildBallast, damper: buildDamper }[D.kind];
  const { height, spinners, glows } = build(part, ctx, D, g);
  return { group: g, height, spinners, glows };
}

// ------------------------------------------------------------------ free-spin crown band

// Gunmetal inner race fixed to the top (accent lock tabs over the ring top),
// a ring of brass rollers standing on the race floor, and the spinning outer
// band: clear plastic with chrome bumper studs on the contact face and a
// printed strip.
function buildFreeSpin(part, ctx, D, g) {
  const L = layerOf(part, ctx), q = ctx.quality, low = q === 'low';
  const T = L.thickness / MM;
  const tmp = { radius: 0, face: 0 };
  const Rp = (psi) => { sampleProfile(L, psi, 1, tmp); return tmp.radius / MM; };
  const Rb = (L.blades > 0 ? L.baseRadius : L.radius) / MM; // round band at the smallest outline radius
  const rO = Rb - 0.3, rBi = Rb - 1.55, rRol = Rb - 1.95, rr = 0.34, rRo = Rb - 2.35, rRi = Rb - 3.0;
  const nL = segs(q, 64, 48, 36);

  // static: race + tabs (vertex paint), rollers
  const race = new Soup().color(D.race);
  sweep(race, () => [[rRi, 0], [rRo + 0.72, 0], [rRo + 0.72, 0.42], [rRo, 0.42], [rRo, T - 0.32], [rRo - 0.32, T], [rRi + 0.25, T], [rRi, T - 0.25]], ring(nL), true);
  race.color(paint(D.tab, 0.5));
  for (let k = 0; k < 3; k++) {
    placed(race, (k / 3) * TAU + Math.PI / 6, (t) => prism(t, trap(rRi - 0.9, rRo - 0.1, 0.75, 1.05), T - 1.25, T - 0.02, 0.28));
  }
  const rollers = new Soup();
  const nR = segs(q, D.nRoll, Math.round(D.nRoll * 0.75), Math.round(D.nRoll * 0.5));
  for (let k = 0; k < nR; k++) {
    const a = (k / nR) * TAU;
    turned(rollers, [[0, 0], [rr, 0], [rr, T - 0.95], [rr - 0.14, T - 0.8], [0, T - 0.8]], 6, Math.cos(a) * rRol, 0.42, -Math.sin(a) * rRol);
  }

  // spinning band
  const spin = new THREE.Group();
  spin.name = 'freespin-band';
  g.add(spin);
  const band = new Soup();
  sweep(band, () => [[rBi, 0.05], [rO - 0.35, 0.05], [rO, 0.4], [rO, T - 0.55], [rO - 0.45, T - 0.1], [rBi + 0.3, T - 0.1], [rBi, T - 0.4]], ring(nL), true);
  const bump = new Soup();
  const nB = D.nBump;
  for (let k = 0; k < nB; k++) {
    const c = ((k + 0.5) / nB) * TAU, half = 1.5 / Rb;
    arcSweep(bump, c - half, c + half, Rb, 0.32, 2, (psi, e) => box(rO - 0.35, Rp(psi) - 0.02, 0.62, T - 0.72, 0.22, 0.22, e));
  }

  const glow = rarityGlow(ctx.rarity);
  const bandMat = toonMaterial(D.band, { finish: 'clear', opacity: 0.84, rimColor: '#ffffff', ...glow });
  const meshes = makeMeshes(g, {
    race: { soup: race, mat: vcMat('metal', '#9fb2d6', '#0c1120') },
    rollers: { soup: rollers, mat: toonMaterial(D.roller, { finish: 'metal' }), ink: { px: 1 } },
    band: { soup: band, mat: bandMat, parent: spin, ink: { color: shade(D.band, -0.62, 0.2) } },
    bump: { soup: bump, mat: toonMaterial(D.bumper, { finish: 'chrome' }), parent: spin, ink: { px: 1.5 } },
  });
  // printed strip on the band's contact face, between the studs
  if (!low) spin.add(decalMesh(stripGeo([[rO + 0.05, 0.75], [rO + 0.05, T - 0.85]], 0, TAU, nL, nB), printStrip(D.print, '#ffffff', null, D.tab), { opacity: 0.95 }));
  return { height: T * MM, spinners: [spin], glows: glow.emissive ? [bandMat] : undefined, meshes };
}

// ------------------------------------------------------------------ wedge skirt

// Navy tray ring clipped under the disc rim, four gold wedge blades raked
// upward on it (larger radius at the bottom), each on a chrome scoop lip,
// with accent lift chevrons and bolts on top; hazard print on the tray face.
function buildSkirt(part, ctx, D, g) {
  const L = layerOf(part, ctx), q = ctx.quality, low = q === 'low';
  const T = L.thickness / MM, R = L.radius / MM, Rb = L.baseRadius / MM;
  const tmp = { radius: 0, face: 0 };
  const Rp = (psi) => { sampleProfile(L, psi, 1, tmp); return tmp.radius / MM; };
  const N = R > Rb + 1e-6 ? L.blades | 0 : 0, w = L.bladeWidth ?? 0.55, P = TAU / Math.max(1, N);
  const tk = Math.tan(Math.abs(L.slope || 0));
  const d = (y) => (L.slope >= 0 ? y : T - y) * tk; // inward rake at height y
  const rIn = R - 3;
  const nL = segs(q, 72, 56, 40);
  const yTray = Math.min(2.0, T * 0.66), yL = Math.min(0.75, T * 0.25), yT = T - 0.3;

  // tray (full turn, at the base radius, a hair inside the wedges)
  const tray = new Soup();
  const O = Rb - 0.12;
  sweep(tray, () => [[rIn, 0], [O - 0.3, 0], [O - d(0.3), 0.3], [O - d(yTray - 0.35), yTray - 0.35], [O - d(yTray - 0.35) - 0.35, yTray], [rIn + 0.25, yTray], [rIn, yTray - 0.25]], ring(nL), true);

  const blades = new Soup();
  const chrome = new Soup();
  const acc = new Soup();
  const rf = (o, y) => o - d(y);
  for (let k = 0; k < N; k++) {
    const a = k * P, b = a + w * P;
    const ramp = 0.12 * P;
    const ps = [...linspace(a, a + ramp, low ? 2 : 4), ...linspace(a + ramp, b - ramp, low ? 3 : 8).slice(1), ...linspace(b - ramp, b, low ? 2 : 4).slice(1)];
    // chrome scoop lip at the bottom edge
    sweep(chrome, (psi) => { const o = Rp(psi); return [[rIn + 0.6, 0], [o - 0.3, 0], [rf(o, 0.25), 0.25], [rf(o, yL), yL], [rIn + 0.6, yL]]; }, ps, false);
    // gold blade body, set back from the lip so a chrome ledge shows
    sweep(blades, (psi) => {
      const o = Rp(psi) - 0.42;
      return [[rIn + 0.3, yL], [rf(o, yL), yL], [rf(o, yT - 0.45), yT - 0.45], [rf(o, yT - 0.45) - 0.42, yT], [rIn + 0.62, yT], [rIn + 0.3, yT - 0.32]];
    }, ps, false);
    const c = (a + b) / 2, rm = (rIn + R - 1.3) / 2;
    // lift chevron (two raised bars meeting at an outward point)
    if (!low) {
      placed(acc, c, (t) => {
        const x0 = rm - 0.55, x1 = rm + 0.75, hw = 0.32;
        prism(t, [[x0, -1.55], [x0 + 0.62, -1.55], [x1 + 0.3, -hw * 0.2], [x1 - 0.3, -hw * 0.2]], yT - 0.02, yT + 0.16, 0.06);
        prism(t, [[x0, 1.55], [x1 - 0.3, hw * 0.2], [x1 + 0.3, hw * 0.2], [x0 + 0.62, 1.55]], yT - 0.02, yT + 0.16, 0.06);
      });
      for (const s of [-1, 1]) hexBolt(chrome, rIn + 1.05, c + s * (w * P * 0.34), yT - 0.02, 0.38, 0.24, 6);
    }
  }
  // tray rivets between the wedges
  if (!low) {
    const gaps = N ? Array.from({ length: N }, (_, k) => k * P + w * P + ((1 - w) * P) / 2) : ring(4);
    for (const c of gaps) for (const s of [-1, 1]) {
      const a = c + s * Math.min(0.12, ((1 - w) * P) * 0.22), r = rIn + 0.62;
      turned(chrome, domeProf(0.26, 0.2), 6, Math.cos(a) * r, yTray, -Math.sin(a) * r);
    }
  }

  const glow = rarityGlow(ctx.rarity);
  const bladeMat = toonMaterial(paint(D.blade, 0.6), { finish: 'gloss', rimColor: '#fff4d6', ...glow });
  const meshes = makeMeshes(g, {
    tray: { soup: tray, mat: toonMaterial(D.tray, { finish: 'plastic', rimColor: '#6f83c4' }) },
    blades: { soup: blades, mat: bladeMat },
    chrome: { soup: chrome, mat: toonMaterial(D.lip, { finish: 'chrome' }), ink: { px: 1.5 } },
    acc: { soup: acc, mat: toonMaterial(paint(D.chevron, 0.55), { finish: 'gloss' }), ink: { px: 1 } },
  });
  // hazard print on the tray's raked face between the wedges
  if (!low && N) {
    const o = O + 0.05, y0 = 0.45, y1 = yTray - 0.5, rows = [[o - d(y0), y0], [o - d(y1), y1]];
    const strips = Array.from({ length: N }, (_, k) => {
      const a = (k + w) * P + 0.03, b = (k + 1) * P - 0.03;
      return stripGeo(rows, a, b, 10, Math.max(1, Math.round(((b - a) * Rb) / 3)));
    });
    g.add(decalMesh(mergeStrips(strips), hazardStrip(D.hazard[0], D.hazard[1])));
  }
  return { height: T * MM, glows: glow.emissive ? [bladeMat] : undefined, meshes };
}

// Concatenate indexed strip geometries (same attributes).
function mergeStrips(list) {
  const pos = [], uv = [], idx = [];
  let base = 0;
  for (const gm of list) {
    pos.push(...gm.attributes.position.array);
    uv.push(...gm.attributes.uv.array);
    for (const i of gm.index.array) idx.push(i + base);
    base += gm.attributes.position.count;
    gm.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// ------------------------------------------------------------------ gyro ring

// Hub collar hugging the lock's band seat, accent spokes out to a chrome
// flywheel (thin web, heavy rim) with tungsten clamp blocks round the rim,
// brass bolts on the blocks and a printed strip on the rim face.
function buildGyro(part, ctx, D, g) {
  const q = ctx.quality, low = q === 'low';
  const RL = ctx.parts?.lock?.radius ?? 10;
  const [r0, r1] = part.ringRadius || [16, 21];
  const rMin = RL + 0.25, rR = Math.max(r0 + 1.2, r1 - 1.9);
  const nL = segs(q, 64, 48, 36);
  const spokes = clamp(ctx.parts?.lock?.notches || 3, 3, 5);

  const hub = new Soup().color(D.hub);
  sweep(hub, () => [[rMin, -1.05], [rMin + 1.35, -1.05], [rMin + 1.7, -0.7], [rMin + 1.7, 0.7], [rMin + 1.35, 1.05], [rMin, 1.05]], ring(segs(q, 48, 36, 28)), true);
  hub.color(paint(D.spoke, 0.52));
  for (let k = 0; k < spokes; k++) {
    placed(hub, (k / spokes) * TAU, (t) => {
      prism(t, trap(rMin + 1.2, r0 + 0.9, 1.35, 0.95), -0.5, 0.6, 0.28, 0.2);
      if (!low) prism(t, trap(rMin + 1.6, r0 + 0.2, 0.42, 0.34), 0.5, 0.9, 0.14);
    });
  }

  const wheel = new Soup();
  sweep(wheel, () => [[r0, -0.42], [rR, -0.42], [rR, -1.1], [r1 - 0.42, -1.1], [r1, -0.68], [r1, 0.68], [r1 - 0.42, 1.1], [rR, 1.1], [rR, 0.42], [r0, 0.42]], ring(nL), true);

  const blocks = new Soup();
  const bolts = new Soup();
  const nW = D.nBlocks, span = Math.min(3.4, ((TAU * rR) / nW) * 0.4);
  for (let k = 0; k < nW; k++) {
    const c = ((k + 0.5) / nW) * TAU, half = span / 2 / rR;
    arcSweep(blocks, c - half, c + half, rR, 0.32, low ? 2 : 3, (psi, e) => box(rR - 1.15, r1 + 0.12, -1.3, 1.3, 0.34, 0.34, e));
    if (!low) hexBolt(bolts, rR - 0.15, c, 1.3, 0.42, 0.16, 6);
  }

  const glow = rarityGlow(ctx.rarity);
  const hubMat = vcMat('plastic', '#a8c4ff', '#06080f', glow);
  const meshes = makeMeshes(g, {
    hub: { soup: hub, mat: hubMat },
    wheel: { soup: wheel, mat: toonMaterial(D.rim, { finish: 'chrome' }) },
    blocks: { soup: blocks, mat: toonMaterial(D.block, { finish: 'metal' }) },
    bolts: { soup: bolts, mat: toonMaterial(D.bolt, { finish: 'metal' }), ink: { px: 1 } },
  });
  if (!low) g.add(decalMesh(stripGeo([[r1 + 0.04, -0.55], [r1 + 0.04, 0.55]], 0, TAU, nL, nW), printStrip(D.print, '#1b2236', null, paint(D.spoke, 0.5))));
  return { height: 3 * MM, glows: glow.emissive ? [hubMat] : undefined, meshes };
}

// ------------------------------------------------------------------ ballast weights

// Dark steel clip band round the lock base carrying chunky low-slung weight
// blocks (raked outer faces, bigger at the bottom), each with a hazard
// striped face plate and two hex bolts.
function buildBallast(part, ctx, D, g) {
  const q = ctx.quality, low = q === 'low';
  const RL = ctx.parts?.lock?.radius ?? 10;
  const rr = part.ringRadius || [9, 12];
  const rMin = RL + 0.25, ro = Math.max(rr[1] + 1.3, rMin + 2.6);
  const n = D.n;

  const band = new Soup();
  sweep(band, () => [[rMin, -1.4], [rMin + 0.8, -1.4], [rMin + 0.8, 0.85], [rMin + 0.55, 1.1], [rMin, 1.1]], ring(segs(q, 48, 36, 28)), true);

  const blocks = new Soup();
  const plates = new Soup();
  const bolts = new Soup();
  const span = (TAU / n) * 0.62, ri = rMin + 0.45;
  // outer face undercut towards the bottom: the blocks tuck in under the
  // disc, clear of the tilt cone from the tip to the disc rim
  const face = (y) => ro - 0.36 * (1.25 - y);
  for (let k = 0; k < n; k++) {
    const c = ((k + 0.5) / n) * TAU, a = c - span / 2, b = c + span / 2;
    arcSweep(blocks, a, b, (ri + ro) / 2, 0.45, low ? 4 : 8, (psi, e) => {
      const yT = 1.25 - e;
      return [[ri + e, -1.5], [face(-1.5) - 0.4 - e, -1.5], [face(-1.1) - e, -1.1], [face(yT - 0.4) - e, yT - 0.4], [face(yT - 0.4) - 0.4 - e, yT], [ri + 0.3 + e, yT], [ri + e, yT - 0.3]];
    });
    // face plate, proud of the raked face
    const pa = a + 0.95 / ro, pb = b - 0.95 / ro;
    arcSweep(plates, pa, pb, ro, 0.15, low ? 4 : 8, (psi, e) => [[face(-0.85) - 0.6, -0.85 + e], [face(-0.85) + 0.12 - e, -0.85 + e], [face(0.45) + 0.12 - e, 0.45 - e], [face(0.45) - 0.6, 0.45 - e]]);
    if (!low) for (const s of [-1, 1]) hexBolt(bolts, (ri + ro) / 2 - 0.35, c + s * span * 0.27, 1.25, 0.42, 0.2, 6);
  }

  const glow = rarityGlow(ctx.rarity);
  const blockMat = toonMaterial(D.block, { finish: 'metal', ...glow });
  const plateMat = toonMaterial('#ffffff', { finish: 'gloss', map: canvasTexture(hazardStrip(D.plate, D.stripe)), rimColor: '#fff2b0', ink: '#1a1405' });
  plateMat.map.wrapS = THREE.RepeatWrapping;
  plateMat.map.wrapT = THREE.RepeatWrapping;
  const rep = Math.round((TAU * ro) / 3.2);
  const meshes = makeMeshes(g, {
    band: { soup: band, mat: toonMaterial(D.band, { finish: 'metal' }) },
    blocks: { soup: blocks, mat: blockMat },
    plates: { soup: plates, mat: plateMat, ink: { px: 1.5 }, finish: { uvFn: (x, y, z) => [(Math.atan2(-z, x) / TAU) * rep, (y + 0.85) / 2.6] } },
    bolts: { soup: bolts, mat: toonMaterial(D.bolt, { finish: 'chrome' }), ink: { px: 1 } },
  });
  return { height: 3 * MM, glows: glow.emissive ? [blockMat] : undefined, meshes };
}

// ------------------------------------------------------------------ impact damper

// Rubber cushion pads on the ring top over each blade (near its striking
// face), with dark grip ribs and chrome retaining pins, plus a cogged rubber
// gasket seated in the ring's inner lip.
function buildDamper(part, ctx, D, g) {
  const q = ctx.quality, low = q === 'low';
  const RP = ctx.parts?.ring || { thickness: 6, rIn: 11, rOut: 24, rBase: 22, blades: 0 };
  const L = ctx.spec?.layers?.find((l) => l.id === 'ring') || ctx.spec?.layers?.[0] || { radius: RP.rOut * MM, baseRadius: (RP.blades > 0 ? RP.rBase : RP.rOut) * MM, blades: RP.blades || 0, bladeWidth: RP.bladeWidth ?? 0.55, hand: RP.spin === 'R' ? -1 : RP.spin === 'L' ? 1 : 0 };
  const T = RP.thickness, R = L.radius / MM, Rb = L.baseRadius / MM;
  const N = R > Rb + 1e-6 ? L.blades | 0 : 0, w = L.bladeWidth ?? 0.55, hand = N ? L.hand || 0 : 0, P = TAU / Math.max(1, N);
  const coreR = ctx.parts?.core?.radius ?? 0;
  const hole = Math.max(RP.rIn, coreR + 0.35);

  // pad centres: over each blade, shifted towards its striking face
  let centres;
  if (N) centres = Array.from({ length: N }, (_, k) => (hand > 0 ? (k + w * 0.62) * P : hand < 0 ? (k + 1 - w * 0.62) * P : (k + w / 2) * P));
  else centres = ring(6, Math.PI / 6);
  const nP = centres.length;
  const rP1 = Rb - 1.35, rP0 = Math.max(hole + 4.0, rP1 - 5.2);
  const rm = (rP0 + rP1) / 2;
  const arc = Math.min(5.2, ((TAU * rm) / nP) * 0.5); // pad length along the arc (mm)
  const y0 = T - 0.25, yT = T + 0.82;

  const pads = new Soup();
  const dark = new Soup();
  const pins = new Soup();
  for (const c of centres) {
    const half = arc / 2 / rm;
    arcSweep(pads, c - half, c + half, rm, 0.42, low ? 3 : 6, (psi, e) => box(rP0, rP1, y0, yT, 0.38, 0, e));
    if (!low) {
      // two grip ribs across the pad and a pin at each end
      for (const s of [-0.22, 0.22]) {
        placed(dark, c + (s * arc) / rm, (t) => prism(t, trap(rP0 + 0.7, rP1 - 0.7, 0.24, 0.24), yT - 0.1, yT + 0.14, 0.08));
      }
      for (const s of [-1, 1]) {
        const a = c + (s * (arc / 2 - 0.85)) / rm;
        turned(pins, domeProf(0.32, 0.22), 8, Math.cos(a) * rm, yT - 0.04, -Math.sin(a) * rm);
      }
    }
  }
  // cogged gasket in the inner lip recess
  const gi = hole + 0.25, go = hole + 1.75;
  sweep(dark, () => [[gi, T - 0.7], [go - 0.2, T - 0.7], [go, T - 0.5], [go, T + 0.05], [go - 0.25, T + 0.3], [gi + 0.25, T + 0.3], [gi, T + 0.05]], ring(segs(q, 56, 44, 32)), true);
  if (!low) {
    const nc = 8;
    for (let k = 0; k < nc; k++) placed(dark, ((k + 0.5) / nc) * TAU, (t) => prism(t, trap(go - 0.3, go + 0.45, 0.42, 0.32), T - 0.5, T + 0.18, 0.12));
  }

  const glow = rarityGlow(ctx.rarity);
  const padMat = toonMaterial(paint(D.pad, 0.62, 0.04), { finish: 'rubber', rimColor: '#f2ecff', ...glow });
  const meshes = makeMeshes(g, {
    pads: { soup: pads, mat: padMat },
    dark: { soup: dark, mat: toonMaterial(D.rib, { finish: 'rubber', rimColor: '#c9bdf7' }), ink: { px: 1.5 } },
    pins: { soup: pins, mat: toonMaterial(D.pin, { finish: 'chrome' }), ink: { px: 1 } },
  });
  return { height: (T + 1) * MM, glows: glow.emissive ? [padMat] : undefined, meshes };
}
