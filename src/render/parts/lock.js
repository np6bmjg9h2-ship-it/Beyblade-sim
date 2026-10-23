// Lock assembly models: the burst lock that joins the tip to the disc.
//
// Every lock is built from separate pieces, the way the toy is moulded:
// a tip socket (metal-rimmed collar, or a flared bell for wide tips), a
// trim-coloured chassis, the main shell, a metal boss that passes up through
// the disc hole, the accent burst teeth (exactly part.notches of them), small
// metal hardware and printed decals. Pieces are merged per material, so a
// lock is at most 7 meshes. Profiles are hard-edged lathes (each chamfer has
// its own normals) and most shells are faceted, so the cel shading breaks
// into crisp bands instead of soft clay-like gradients.
//
// Envelope: y in [0, lockH]; body r <= radius (teeth up to radius + 1.2);
// above 0.75 lockH (where the disc sits) only the boss, r <= disc hole - 0.3.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MM, TAU, partGroup, toonMaterial, inked, tone, segs, canvasTexture, rarityGlow, extrudeShape } from './common.js';
import { ROLLER_LOCKS, rollerBodyRadius, addRollers } from './lockClassic.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// ------------------------------------------------------------ designs
//
// kind picks the construction; trim/sig are the chassis colour and the
// signature tooth colour used when the player accent doesn't contrast with
// the shell; print is the decal ink ('dark' on light shells). facets is the
// preferred shell facet count: the builder rounds it to whole facets per
// tooth sector, since the Extra Notch trait can change the tooth count.
const DESIGNS = {
  // standard: faceted 12-sided shell, three sawtooth click teeth
  lock_click3: { kind: 'click', facets: 12, trim: '#38435a', sig: '#ff3f74', label: 'CLICK-III', strip: 'label' },
  // heavy: gunmetal 10-sided shell, steel weight band, five C-clamp jaws
  // (soft spec: a flat gunmetal face must not flash white as a whole)
  lock_ironclasp: { kind: 'clamp', facets: 10, trim: '#232831', sig: '#ffb21e', mainFinish: 'metal', mainSpec: { spec: 0.45, specEdge: 0.975 }, shade: -0.2, label: 'IRON-V', strip: 'hazard', print: 'light' },
  // light: open skeleton hoop on spokes, two cantilever snap hooks
  lock_snap: { kind: 'snap', trim: '#22335c', sig: '#1ec8ff', label: 'SNAP', strip: 'label' },
  // windowed shell: each tooth rides a visible coil spring
  lock_spring: { kind: 'spring', trim: '#12604c', sig: '#ff7a24', label: 'SPRING', strip: 'label' },
  // saturn flange with a grooved band mount and chrome O-ring, claw posts
  lock_stabilizer: { kind: 'flange', trim: '#263f63', sig: '#8d5cff', label: 'STB', strip: 'label', print: 'light', printTop: 'dark' },
  // hex shell over a ribbed, chrome-rimmed flared bell socket
  lock_widesocket: { kind: 'bell', facets: 6, trim: '#5a3f2c', sig: '#ff4336', label: 'W-SOCK', strip: 'label' },
};

// Facet count near `base` with whole facets per tooth sector: the tooth's
// own facet plus at least one plain one.
const facetsFor = (n, base) => n * Math.max(2, Math.round(base / n));

// Design for an unknown lock, from its numbers alone.
function autoDesign(part) {
  const n = Math.max(1, Math.round(part.notches || 3));
  // construction from the numbers: socket/port first, then springy (fast
  // recovery), heavy (many notches or dense), light (few notches, light)
  const dense = (part.mass || 4) / Math.max(1, (part.radius || 10) * (part.height || 6)) > 0.085;
  const kind = part.tipSocket === 'wide' ? 'bell'
    : part.auxPort ? 'flange'
    : (part.recovery ?? 0) >= 0.8 && n <= 5 ? 'spring'
    : n >= 5 || dense ? 'clamp'
    : n <= 2 && (part.mass ?? 4) <= 3.5 ? 'snap'
    : 'click';
  const facets = kind === 'bell' ? 6 : kind === 'clamp' ? 10 : 12;
  const label = (part.name || 'LOCK').split(/\s+/).map((w) => w[0]).join('').toUpperCase() + '-' + n;
  const dark = hslOf(part.color || '#cfd5de').l < 0.45;
  return { kind, facets, label, strip: 'label', print: kind === 'flange' ? 'main' : dark ? 'light' : 'dark', printTop: dark ? 'light' : 'dark' };
}

// ------------------------------------------------------------ colours

const _a = new THREE.Color(), _b = new THREE.Color();
const hslOf = (hex) => _a.set(hex).getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace);
const hslHex = (h, s, l) => '#' + _a.setHSL(h, s, l, THREE.SRGBColorSpace).getHexString();

// Teeth follow the player accent unless it is grey or too close to the
// shell colour (then the design's signature colour); kept mid-bright so the
// teeth always pop against both light and dark shells.
function pickAccent(acc, main, sig) {
  const h = hslOf(acc);
  _a.set(acc); _b.set(main);
  const dist = Math.abs(_a.r - _b.r) + Math.abs(_a.g - _b.g) + Math.abs(_a.b - _b.b);
  if (h.s < 0.3 || dist < 0.45) return sig;
  return hslHex(h.h, Math.max(h.s, 0.6), clamp(h.l, 0.45, 0.66));
}

// The catalogue colours are pale; under the key light they wash out, so the
// shell is pushed a little deeper and more saturated (design `shade`).
function palette(part, ctx, d) {
  const base = part.color || '#cfd5de';
  const m = hslOf(base);
  const main = hslHex(m.h, Math.min(1, m.s * 1.25 + 0.05), clamp(m.l + (d.shade ?? -0.06), 0.12, 0.9));
  // auto trim: deep shade of the shell hue, or a light one under a dark shell
  const trim = d.trim || hslHex(m.h, clamp(m.s + 0.2, 0.25, 0.6), m.l < 0.45 ? 0.74 : 0.2);
  const sig = d.sig || hslHex((m.h + 0.5) % 1, 0.85, 0.56);
  const accent = pickAccent(ctx.accent || sig, base, sig);
  const ink = (k) => (k === 'light' ? '#f3f5fa' : k === 'main' ? main : trim);
  return { main, trim, accent, print: ink(d.print), printTop: ink(d.printTop ?? d.print), steel: d.steel || '#6f7a8c', rarity: ctx.rarity?.color || null };
}

// ------------------------------------------------------------ geometry helpers

const V = (r, y, a) => new THREE.Vector3(r * Math.cos(a) * MM, y * MM, r * Math.sin(a) * MM);

// Append a triangle, flipped if needed so its face points along `ref`.
function tri(o, A, B, C, nA, nB, nC, tA, tB, tC, ref) {
  const c = new THREE.Vector3().subVectors(B, A).cross(new THREE.Vector3().subVectors(C, A));
  if (c.lengthSq() < 1e-26) return; // degenerate (point on the axis)
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

// Hard-edged lathe from [r, y] mm points, counter-clockwise in the (r, y)
// half-plane (bottom outward, outer wall up, top inward) so faces point out.
// Every profile segment gets its own normals (crisp chamfers). facets > 0
// gives a flat-sided polygon (vertices at a0 + k * span / facets). A partial
// sweep (span < 2pi) with caps closes the cut ends.
function lathe(pts, { n = 32, facets = 0, a0 = 0, span = TAU, caps = false } = {}) {
  const N = facets || n, step = span / N, k = facets ? Math.cos(step / 2) : 1;
  const o = { p: [], n: [], u: [] };
  const acc = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = acc[acc.length - 1] || 1;
  for (let i = 0; i < pts.length - 1; i++) {
    const [r0, y0] = pts[i], [r1, y1] = pts[i + 1];
    const dr = r1 - r0, dy = y1 - y0;
    if (Math.abs(dr) + Math.abs(dy) < 1e-7) continue;
    const l = Math.hypot(dy, dr * k), nr = dy / l, ny = (-dr * k) / l;
    const nAt = (a) => new THREE.Vector3(nr * Math.cos(a), ny, nr * Math.sin(a));
    const v0 = acc[i] / total, v1 = acc[i + 1] / total;
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
    const poly = pts.slice();
    const f = poly[0], z = poly[poly.length - 1];
    if (Math.abs(f[0] - z[0]) + Math.abs(f[1] - z[1]) < 1e-7) poly.pop();
    const faces = THREE.ShapeUtils.triangulateShape(poly.map(([r, y]) => new THREE.Vector2(r, y)), []);
    for (const [a, sgn] of [[a0, -1], [a0 + span, 1]]) {
      const nrm = new THREE.Vector3(-Math.sin(a) * sgn, 0, Math.cos(a) * sgn);
      for (const [i, j, q] of faces) tri(o, V(...poly[i], a), V(...poly[j], a), V(...poly[q], a), nrm, nrm, nrm, [0, 0], [0, 0], [0, 0], nrm);
    }
  }
  return toGeo(o);
}

// Vertical prism from a plan outline [[x, z], ...] mm (x radial, z along
// the direction of increasing angle) between y0 and y1 mm, bevelled. The
// bevel grows the outline by `bevel` on the side walls.
function prism(outline, y0, y1, bevel = 0.12) {
  const s = new THREE.Shape();
  outline.forEach(([x, z], i) => (i ? s.lineTo(x * MM, -z * MM) : s.moveTo(x * MM, -z * MM)));
  s.closePath();
  const g = extrudeShape(s, (y1 - y0) * MM, { bevel: bevel * MM, curveSegments: 4 });
  g.translate(0, y0 * MM, 0);
  return g;
}

// Radial section [[r, y], ...] mm extruded tangentially to `width` mm,
// centred on +X (the section grows by `bevel` in r and y).
function section(sec, width, bevel = 0.1) {
  const s = new THREE.Shape();
  sec.forEach(([r, y], i) => (i ? s.lineTo(r * MM, y * MM) : s.moveTo(r * MM, y * MM)));
  s.closePath();
  const depth = Math.max(0.05, width - 2 * bevel) * MM;
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel * MM, bevelSize: bevel * MM, bevelSegments: 1, curveSegments: 4 });
  g.translate(0, 0, -depth / 2);
  return g;
}

// Rotate a geometry built on +X to polar angle a (same convention as lathe).
const at = (geo, a) => geo.rotateY(-a);

// Hex-head screw standing on a face at y (mm), radius r mm, angle a.
function screw(r, a, y, size = 0.42, h = 0.26) {
  const g = new THREE.CylinderGeometry(size * MM, size * 1.12 * MM, h * MM, 6);
  g.translate(r * MM, (y + h / 2) * MM, 0);
  return at(g, a + 0.3);
}

// Rivet on a radial face (outward along +X at radius r), angle a.
function rivet(r, a, y, size = 0.34, h = 0.2) {
  const g = new THREE.CylinderGeometry(size * 0.78 * MM, size * MM, h * MM, 8);
  g.rotateZ(-Math.PI / 2);
  g.translate((r + h / 2) * MM, y * MM, 0);
  return at(g, a);
}

// Radial coil spring along +X from x0 to x1 mm, coil radius rc, wire rw.
class Helix extends THREE.Curve {
  constructor(x0, x1, rc, turns) { super(); Object.assign(this, { x0, x1, rc, turns }); }
  getPoint(t, out = new THREE.Vector3()) {
    const a = t * this.turns * TAU;
    return out.set((this.x0 + (this.x1 - this.x0) * t) * MM, this.rc * Math.sin(a) * MM, this.rc * Math.cos(a) * MM);
  }
}
// `k` thins the tube sampling when there are many springs (triangle budget).
function spring(x0, x1, y, a, rc, rw, turns, q, k = 1) {
  const per = Math.max(5, Math.round(segs(q, 10, 7, 5) * k));
  const g = new THREE.TubeGeometry(new Helix(x0, x1, rc, turns), Math.round(turns * per), rw * MM, q === 'high' ? 5 : 4, false);
  g.translate(0, y * MM, 0);
  return at(g, a);
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

// ------------------------------------------------------------ decals
//
// One canvas atlas per look: a 512x64 side strip (one copy per tooth
// sector, wrapped round the shell wall) above a 512x512 top emblem mapped
// planar onto an annulus. Canvases are cached; textures are per build.

const AW = 512, AH = 576, VS = 512 / 576; // v below VS = emblem, above = strip
const CANVASES = new Map();

function atlas(key, draw) {
  if (typeof document === 'undefined') return null;
  let c = CANVASES.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = AW; c.height = AH;
    draw(c.getContext('2d'));
    if (CANVASES.size > 40) CANVASES.delete(CANVASES.keys().next().value);
    CANVASES.set(key, c);
  }
  return c;
}

// Side strip for one sector. aspect = band arc length / band height; glyphs
// are drawn compressed so they read square once wrapped.
function drawStrip(x, d, C, aspect) {
  const sx = Math.min(1, 8 / aspect), W = 512 / sx;
  x.save();
  x.setTransform(sx, 0, 0, 1, 0, 0);
  x.fillStyle = C.print;
  x.fillRect(0, 2, W, 6);
  x.fillStyle = C.rarity || C.print;
  x.fillRect(0, 56, W, 6);
  const slash = (x0, w, col) => { x.fillStyle = col; x.beginPath(); x.moveTo(x0 + 14, 13); x.lineTo(x0 + 14 + w, 13); x.lineTo(x0 + w, 51); x.lineTo(x0, 51); x.closePath(); x.fill(); };
  if (d.strip === 'hazard') {
    for (let i = 0; i * 26 < W * 0.3; i++) { slash(8 + i * 26, 12, i % 2 ? C.print : C.accent); slash(W - 34 - i * 26, 12, i % 2 ? C.print : C.accent); }
  } else {
    for (let i = 0; i < 3; i++) slash(10 + i * 24, 13, C.accent);
    x.fillStyle = C.print;
    for (let i = 0; i < 5; i++) x.fillRect(W - 22 - i * 15, i % 2 ? 22 : 16, 6, i % 2 ? 20 : 32);
  }
  x.font = 'bold 38px Arial, Helvetica, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillStyle = C.print;
  x.fillText(d.label, W / 2, 33, W * 0.52);
  x.restore();
}

// Top emblem on the annulus rIn..rOut (mm), polar: canvas angle = world
// angle. Ticks round the rim, an accent arrow at every tooth, arcs between.
function drawEmblem(x, C, L, rIn, rOut, Re, gaps) {
  const k = 256 / Re;
  x.save();
  x.translate(256, 64 + 256);
  x.scale(k, k);
  x.strokeStyle = C.printTop;
  x.lineWidth = 0.13;
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * TAU, r0 = rOut - (i % 4 ? 0.35 : 0.6);
    x.beginPath(); x.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); x.lineTo(Math.cos(a) * (rOut - 0.1), Math.sin(a) * (rOut - 0.1)); x.stroke();
  }
  const rm = (rIn + rOut) / 2 - 0.25, half = Math.min(0.5, TAU / L.n / 2 - 0.2);
  x.lineWidth = 0.32;
  for (const t of L.teeth) {
    x.beginPath(); x.arc(0, 0, rm, t + half, t + TAU / L.n - half); x.stroke();
    const w = 0.85 / rm;
    x.fillStyle = C.accent;
    x.beginPath(); x.moveTo(Math.cos(t) * (rOut - 0.75), Math.sin(t) * (rOut - 0.75));
    x.lineTo(Math.cos(t + w) * (rIn + 0.2), Math.sin(t + w) * (rIn + 0.2));
    x.lineTo(Math.cos(t - w) * (rIn + 0.2), Math.sin(t - w) * (rIn + 0.2));
    x.closePath(); x.fill();
  }
  if (C.rarity) { x.strokeStyle = C.rarity; x.lineWidth = 0.18; x.beginPath(); x.arc(0, 0, rIn + 0.12, 0, TAU); x.stroke(); }
  if (gaps) {
    x.globalCompositeOperation = 'destination-out';
    for (const [a, w] of gaps) { x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, Re, a - w / 2, a + w / 2); x.closePath(); x.fill(); }
  }
  x.restore();
}

// ------------------------------------------------------------ builder

const BUDGET = 4000; // triangles at quality 'high', decals included
const trisOf = (geos) => geos.reduce((s, g) => s + (g.index ? g.index.count : g.attributes.position.count) / 3, 0);

export function buildLock(part, ctx) {
  if (ROLLER_LOCKS[part.id] && !part._rollerBody) return addRollers(buildLock({ ...part, _rollerBody: true, radius: rollerBodyRadius(part) }, ctx), part, ctx);
  const d = DESIGNS[part.model || part.id] || autoDesign(part);
  const C = palette(part, ctx, d);
  const R = part.radius || 10, H = ctx.geo?.lockH ?? part.height ?? 6, n = Math.max(1, Math.round(part.notches || 3));
  const top = 0.75 * H; // disc underside
  const q = ctx.quality || 'high';
  const L = {
    H, R, n, q, top,
    yT: top - 0.3, // shell top: hardware up to `top` stays clear of the boss zone
    tipR: ctx.parts?.tip?.bodyRadius ?? 6.5,
    bossR: Math.min((ctx.parts?.disc?.rIn ?? 6) - 0.38, R * 0.6),
    yc: clamp(H * 0.17, 0.75, 1.15), // socket collar height
    hand: ctx.spin === 'L' ? -1 : 1, // +1: leading side = increasing angle (R spin)
    seg: segs(q, 40, 28, 16),
    micro: q !== 'low', // keys, ribs, fins, decals
    hw: q !== 'low', // repeated hardware: screws, rivets, lugs
    aux: !!part.auxPort && d.kind !== 'flange',
    teeth: [],
  };
  L.rc = clamp(L.tipR + 0.7, 4.5, R - 1.1);
  for (let j = 0; j < n; j++) L.teeth.push((j / n) * TAU);
  // Build; if a many-toothed (unknown) lock overruns the budget, rebuild
  // with fewer lathe segments, then without the repeated hardware.
  let K, deco;
  for (let pass = 0; ; pass++) {
    K = { main: [], trim: [], steel: [], metal: [], detail: [], accent: [], clear: [] };
    deco = { bands: [], emblem: null };
    (KINDS[d.kind] || KINDS.click)(K, L, d, deco);
    if (L.aux) auxBand(K, L, deco);
    boss(K, L, d);
    if (q !== 'high' || pass >= 3) break;
    const decalTris = L.micro ? deco.bands.reduce((s, b) => s + 2 * (b.facets || 12), 0) + (deco.emblem ? 2 * L.seg : 0) : 0;
    if (trisOf(Object.values(K).flat()) + decalTris <= BUDGET) break;
    if (pass === 0) L.seg = 28;
    else if (pass === 1) L.hw = false;
    else L.seg = 20;
  }

  const g = partGroup('lock');
  const mats = {
    main: () => toonMaterial(C.main, { finish: d.mainFinish || 'plastic', ...d.mainSpec, ...rarityGlow(ctx.rarity) }),
    trim: () => toonMaterial(C.trim, { finish: 'plastic' }),
    steel: () => toonMaterial(C.steel, { finish: 'metal' }),
    metal: () => toonMaterial('#c4ccd8', { finish: 'chrome' }),
    detail: () => toonMaterial('#e3e8ef', { finish: 'chrome' }),
    accent: () => toonMaterial(C.accent, { finish: 'gloss' }),
    clear: () => toonMaterial(tone(C.accent, 0.28, -0.15), { finish: 'clear' }),
  };
  const inkOpts = { main: {}, trim: {}, accent: {}, steel: { px: 1.5 }, metal: { px: 1.5 }, clear: { px: 1.5 }, detail: { px: 1, maxMm: 0.2 } };
  const glows = [];
  for (const k of Object.keys(mats)) {
    if (!K[k].length) continue;
    const geo = mergeGeometries(K[k].map(prep), false);
    const mat = mats[k]();
    if (k === 'main' && ctx.rarity?.rank >= 3) glows.push(mat);
    g.add(inked(geo, mat, inkOpts[k]));
  }
  if (L.micro) decals(g, K, L, d, C, deco);
  return { group: g, height: H * MM, glows };
}

// Printed decals: side strips on the shell bands and the top emblem.
function decals(g, K, L, d, C, deco) {
  if (!deco.bands.length && !deco.emblem) return;
  const b0 = deco.bands[0];
  const aspect = b0 ? (b0.r * b0.span) / (b0.y1 - b0.y0) : 8;
  const e = deco.emblem, Re = L.R + 1.2;
  const key = [d.label, d.strip, C.accent, C.print, C.printTop, C.rarity, aspect.toFixed(1), e && [e.rIn, e.rOut].map((v) => v.toFixed(2)).join(), L.n, e?.gaps?.length].join('|');
  const canvas = atlas(key, (x) => {
    drawStrip(x, d, C, aspect);
    if (e) drawEmblem(x, C, L, e.rIn, e.rOut, Re, e.gaps);
  });
  if (!canvas) return;
  const geos = [];
  for (const b of deco.bands) {
    const geo = lathe([[b.r, b.y0], [b.r, b.y1]], { a0: b.a0, span: b.span, facets: b.facets, n: b.facets ? 0 : 12 });
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, 1 - uv.getX(i), VS + uv.getY(i) * (1 - VS)); // viewed from outside, angle runs right-to-left
    geos.push(geo);
  }
  if (e) {
    const geo = lathe([[e.rOut, e.y], [e.rIn, e.y]], { n: L.seg });
    const p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 + p.getX(i) / MM / (2 * Re), (0.5 - p.getZ(i) / MM / (2 * Re)) * VS);
    geos.push(geo);
  }
  const mat = toonMaterial('#ffffff', { finish: 'matte', map: canvasTexture(canvas), rim: 0 });
  mat.alphaTest = 0.5;
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -1;
  mat.polygonOffsetUnits = -2;
  const m = new THREE.Mesh(mergeGeometries(geos, false), mat);
  m.userData.noInk = true;
  m.castShadow = false;
  g.add(m);
}

// Side band record for the decal strip: one per tooth sector, covering the
// wall between teeth. Faceted walls: whole facets only (rv = vertex radius).
function sectorBands(deco, L, { r, y0, y1, facets = 0, gap = 0.5 }) {
  if (y1 - y0 < 0.35) return; // too short for a readable strip (squat locks)
  for (const t of L.teeth) {
    if (facets) {
      const st = TAU / facets, per = Math.round(facets / L.n);
      if (per < 2) continue;
      deco.bands.push({ r: r + 0.06 / Math.cos(st / 2), y0, y1, a0: t + st / 2, span: st * (per - 1), facets: per - 1 });
    } else {
      deco.bands.push({ r: r + 0.06, y0, y1, a0: t + gap, span: TAU / L.n - 2 * gap, facets: 0 });
    }
  }
}

// ------------------------------------------------------------ shared pieces

// Standard tip socket: a chrome socket ring at the bottom (where the tip's
// flange seats) under a trim collar, with a V panel line between them.
// The ring's underside has a shallow chamfered bore the tip's top keys into,
// with a bayonet key per notch.
function socketCollar(K, L) {
  const r = L.rc, y = L.yc, g0 = y * 0.42;
  const rs = clamp(L.tipR - 0.6, 2.5, r - 1.2), ds = Math.min(0.32, g0 - 0.08);
  K.metal.push(lathe([[0, ds], [rs, ds], [rs, 0.12], [rs + 0.12, 0], [r - 0.22, 0], [r + 0.05, 0.22], [r + 0.05, g0], [0, g0]], { n: L.seg }));
  K.trim.push(lathe([[0, g0 - 0.05], [r - 0.3, g0 - 0.05], [r, g0 + 0.25], [r, y], [0, y]], { n: L.seg }));
  bayonetKeys(K, L, rs, 0.02, ds + 0.01);
}

// Bayonet keys on a socket bore wall (radius rs), one per notch.
function bayonetKeys(K, L, rs, y0, y1) {
  if (!L.micro) return;
  for (const t of L.teeth) K.steel.push(at(prism([[rs - 0.55, -0.4], [rs + 0.05, -0.45], [rs + 0.05, 0.45], [rs - 0.55, 0.4]], y0, y1, 0.04), t + Math.PI / L.n));
}

// Metal boss through the disc hole: faceted key with a centre recess, on a
// chrome hub washer that sits just under the disc.
function boss(K, L, d) {
  const b = L.bossR, H = L.H, f = d.bossFacets || Math.max(6, L.n * 2);
  const y0 = L.yT - 0.35;
  const yg = (L.top + H) / 2 - 0.15;
  K.steel.push(lathe([[0, y0], [b, y0], [b, yg - 0.13], [b - 0.2, yg], [b, yg + 0.13], [b, H - 0.42], [b - 0.38, H], [b * 0.5, H], [b * 0.5 - 0.22, H - 0.3], [0, H - 0.3]], { facets: f, a0: -Math.PI / f }));
  const w = b + 0.75;
  K.metal.push(lathe([[0, L.yT - 0.1], [w, L.yT - 0.1], [w, L.top - 0.2], [w - 0.18, L.top - 0.02], [0, L.top - 0.02]], { n: L.seg }));
}

// Top-face hardware: hex screws between the teeth.
function topScrews(K, L, r, y, perSector = 1) {
  if (!L.micro) return;
  for (const t of L.teeth) for (let i = 0; i < perSector; i++) K.detail.push(screw(r, t + ((i + 1) / (perSector + 1)) * (TAU / L.n), y));
}

// Faceted shell: hard chamfered polygon body from y0 to y1, vertex radius rv.
function facetShell(rv, y0, y1, facets, ch = 0.4, chTop = ch) {
  return lathe([[0, y0], [rv - ch, y0], [rv, y0 + ch], [rv, y1 - chTop], [rv - chTop, y1], [0, y1]], { facets, a0: -Math.PI / facets });
}

// Sawtooth click tooth at angle a: steep leading face, ramp trailing into
// the wall. ra = wall radius at the tooth, out = protrusion (before bevel).
function sawTooth(ra, a, y0, y1, w, out, hand) {
  const h = hand, z = (v) => v * h;
  const pts = [[ra - 0.6, z(-w / 2)], [ra - 0.1, z(-w / 2)], [ra + out, z(w / 2 - 0.75)], [ra + out, z(w / 2)], [ra - 0.6, z(w / 2)]];
  return at(prism(pts, y0, y1, 0.12), a);
}

// ------------------------------------------------------------ kinds

const KINDS = {
  // Click Lock: faceted shell over a ribbed chassis, sawtooth click teeth.
  click(K, L, d, deco) {
    const { R, H, yc, yT, top } = L, F = d.facets || facetsFor(L.n, 12);
    socketCollar(K, L);
    const y1 = 0.4 * H, rch = R - 0.85;
    K.trim.push(lathe([[0, yc - 0.1], [rch - 0.3, yc - 0.1], [rch, yc + 0.2], [rch, y1 + 0.1], [0, y1 + 0.1]], { facets: F, a0: -Math.PI / F }));
    if (L.micro) for (let i = 0; i < F; i++) K.trim.push(at(prism([[rch - 0.3, -0.24], [rch + 0.3, -0.18], [rch + 0.3, 0.18], [rch - 0.3, 0.24]], yc + 0.3, y1, 0.06), (i + 0.5) * (TAU / F)));
    const rv = R + 0.12, ra = rv * Math.cos(Math.PI / F);
    K.main.push(facetShell(rv, y1, yT, F, 0.38, 0.42));
    const out = R + 0.95 - 0.12 - ra;
    for (const t of L.teeth) K.accent.push(sawTooth(ra, t, y1 + 0.3, top - 0.03, 3.2, out, L.hand));
    topScrews(K, L, (L.bossR + 0.75 + ra) / 2 + 0.2, yT);
    sectorBands(deco, L, { r: rv, y0: y1 + 0.5, y1: yT - 0.52, facets: F });
    deco.emblem = { rIn: L.bossR + 0.95, rOut: ra - 0.5, y: yT + 0.05 };
  },

  // Iron Clasp: gunmetal shell on a chrome weight band, gripped by deep
  // C-clamp jaws (one per notch) with rivets; bolts between the jaws.
  clamp(K, L, d, deco) {
    const { R, H, yc, top } = L, F = d.facets || facetsFor(L.n, 10);
    socketCollar(K, L);
    const y1 = 0.38 * H, yS = top - 0.75;
    K.trim.push(lathe([[0, yc - 0.1], [R - 1.0, yc - 0.1], [R - 0.7, yc + 0.2], [R - 0.7, y1 + 0.1], [0, y1 + 0.1]], { facets: F, a0: -Math.PI / F }));
    // steel weight band
    K.steel.push(lathe([[R - 1.4, yc + 0.28], [R - 0.5, yc + 0.28], [R - 0.3, yc + 0.48], [R - 0.3, y1 - 0.28], [R - 0.5, y1 - 0.1], [R - 1.4, y1 - 0.1], [R - 1.4, yc + 0.28]], { facets: F, a0: -Math.PI / F }));
    const rv = R + 0.1, ra = rv * Math.cos(Math.PI / F);
    K.main.push(facetShell(rv, y1, yS, F, 0.35, 0.35));
    // jaw face; its rivets stand 0.3 proud, inside the R + 1.2 tooth limit
    const ro = Math.min(ra + 1.1, R + 0.85), yb = yc + 0.2;
    const sec = [[ra - 2.4, top - 0.07], [ro, top - 0.07], [ro, yb], [ra - 1.1, yb], [ra - 1.1, yb + 0.5], [ra + 0.15, yb + 0.5], [ra + 0.15, yS], [ra - 2.4, yS]];
    for (const t of L.teeth) {
      K.accent.push(at(section(sec, 3.0, 0.1), t));
      if (L.micro) for (const y of [yb + 0.75, top - 0.85]) K.detail.push(rivet(ro + 0.1, t, y));
    }
    if (L.micro) for (const t of L.teeth) K.detail.push(screw(ra - 1.15, t + Math.PI / L.n, yS, 0.45));
    sectorBands(deco, L, { r: rv, y0: y1 + 0.42, y1: yS - 0.4, facets: F });
    deco.emblem = { rIn: L.bossR + 0.95, rOut: ra - 0.45, y: yS + 0.05 };
  },

  // Snap Lock: skeleton. A slim hub on the socket, an open hoop held by four
  // spokes, and a cantilever snap hook bridging each gap in the hoop.
  snap(K, L, d, deco) {
    const { R, yc, yT, top } = L;
    socketCollar(K, L);
    const rh = Math.max(L.bossR + 0.75, 6.2);
    K.trim.push(lathe([[0, yc - 0.1], [rh - 0.3, yc - 0.1], [rh, yc + 0.2], [rh, yT - 0.3], [rh - 0.3, yT], [0, yT]], { facets: 12, a0: -Math.PI / 12 }));
    const ri = R - 1.15, y0 = Math.max(yc + 0.9, yT - 1.65);
    const gapW = 2.6 + 0.24 + 0.9, gap = 2 * Math.asin(gapW / 2 / R);
    for (const t of L.teeth) {
      K.main.push(lathe([[ri, y0], [R - 0.3, y0], [R, y0 + 0.3], [R, yT - 0.3], [R - 0.3, yT], [ri, yT], [ri, y0]], { n: Math.max(6, Math.round(L.seg / L.n)), a0: t + gap / 2, span: TAU / L.n - gap, caps: true }));
    }
    const spokes = Math.max(4, L.n * 2);
    for (let i = 0; i < spokes; i++) {
      const a = (i + 0.5) * (TAU / spokes);
      K.main.push(at(prism([[rh - 0.3, -0.6], [ri + 0.35, -0.55], [ri + 0.35, 0.55], [rh - 0.3, 0.6]], y0 + 0.2, yT - 0.08, 0.1), a));
      if (L.micro) K.detail.push(screw((rh + ri) / 2, a - 0.3, yT - 0.08, 0.3, 0.2));
    }
    // snap hooks: thin arm from the hub, barbed head through the hoop gap
    const z = (v) => v * L.hand;
    const hook = [[rh - 0.3, z(-0.42)], [ri - 0.15, z(-0.42)], [ri - 0.15, z(-1.25)], [R + 0.3, z(-1.25)], [R + 0.85, z(-0.35)], [R + 0.85, z(1.25)], [ri - 0.15, z(1.25)], [ri - 0.15, z(0.42)], [rh - 0.3, z(0.42)]];
    for (const t of L.teeth) K.accent.push(at(prism(hook, y0 + 0.05, top - 0.03, 0.12), t));
    sectorBands(deco, L, { r: R, y0: y0 + 0.38, y1: yT - 0.38, gap: gap / 2 + 0.03 });
    deco.emblem = { rIn: ri + 0.12, rOut: R - 0.32, y: yT + 0.05, gaps: L.teeth.map((t) => [t, gap + 0.06]) };
  },

  // Spring Lock: the shell has an open notch at every tooth; each tooth
  // block rides a chrome coil spring seated against the trim core, visible
  // from the side and from above.
  spring(K, L, d, deco) {
    const { R, H, yc, yT } = L;
    socketCollar(K, L);
    const w0 = Math.max(yc + 0.4, 0.24 * H), rw = Math.max(L.bossR + 0.65, 6.2);
    // trim core: notch floor and back wall
    K.trim.push(lathe([[0, yc - 0.1], [R - 0.75, yc - 0.1], [R - 0.45, yc + 0.2], [R - 0.45, w0 + 0.05], [rw, w0 + 0.05], [rw, yT - 0.2], [0, yT - 0.2]], { n: L.seg }));
    const gap = 2 * Math.asin(3.5 / R);
    for (const t of L.teeth) {
      K.main.push(lathe([[rw - 0.1, w0], [R - 0.3, w0], [R, w0 + 0.3], [R, yT - 0.38], [R - 0.38, yT], [rw - 0.1, yT], [rw - 0.1, w0]], { n: Math.max(6, Math.round(L.seg / L.n)), a0: t + gap / 2, span: TAU / L.n - gap, caps: true }));
    }
    const ym = (w0 + 0.05 + yT) / 2 - 0.1, rc = Math.min(0.85, (yT - w0) / 2 - 0.2), th = rc * 1.25;
    for (const t of L.teeth) {
      K.accent.push(at(prism([[R - 1.25, -1.15], [R + 0.82, -0.9], [R + 0.82, 0.9], [R - 1.25, 1.15]], ym - th / 2, ym + th / 2, 0.12), t));
      K.detail.push(spring(rw - 0.05, R - 1.32, ym, t, rc, 0.16, 4, L.q, Math.min(1, 3 / L.n)));
    }
    topScrews(K, L, R - 1.4, yT);
    sectorBands(deco, L, { r: R, y0: w0 + 0.5, y1: yT - 0.62, gap: gap / 2 + 0.05 });
    deco.emblem = { rIn: L.bossR + 0.95, rOut: R - 0.55, y: yT + 0.05, gaps: L.teeth.map((t) => [t, gap + 0.04]) };
  },

  // Stabilizer: narrow drum with a wide band-mount flange at mid height. The
  // flange is two plates around a dark groove core holding a chrome O-ring
  // (the aux band seat); the teeth are claw posts standing on the flange.
  flange(K, L, d, deco) {
    const { R, H, yc, yT, top } = L;
    socketCollar(K, L);
    // fy = the aux band's mount height (assembly: zLock0 + lockH / 2)
    const fy = 0.5 * H, gh = 0.32, f0 = fy - 0.8, f1 = Math.min(fy + 0.7, yT - 0.4), rd = R - 2.3, F = facetsFor(L.n, 12);
    K.trim.push(lathe([[0, yc - 0.1], [rd - 0.3, yc - 0.1], [rd, yc + 0.2], [rd, fy + 0.3], [0, fy + 0.3]], { facets: F, a0: -Math.PI / F }));
    // deep groove core (dark trim) between the two flange plates
    const rg = R - 0.85;
    K.trim.push(lathe([[rd - 0.2, fy - gh - 0.02], [rg, fy - gh - 0.02], [rg, fy + gh + 0.02], [rd - 0.2, fy + gh + 0.02], [rd - 0.2, fy - gh - 0.02]], { n: L.seg }));
    K.main.push(lathe([[rd - 0.4, f0], [R - 0.3, f0], [R, f0 + 0.3], [R, fy - gh - 0.08], [R - 0.08, fy - gh], [rd - 0.4, fy - gh], [rd - 0.4, f0]], { n: L.seg }));
    K.main.push(lathe([[rd - 0.4, fy + gh], [R - 0.08, fy + gh], [R, fy + gh + 0.08], [R, f1 - 0.25], [R - 0.25, f1], [rd - 0.4, f1], [rd - 0.4, fy + gh]], { n: L.seg }));
    const ru = R - 2.1;
    K.trim.push(lathe([[0, f1 - 0.05], [ru, f1 - 0.05], [ru, yT - 0.35], [ru - 0.35, yT], [0, yT]], { facets: F, a0: -Math.PI / F }));
    // chrome O-ring in the groove: thinner than the groove, so dark channel
    // shows above and below it
    const ring = new THREE.TorusGeometry((R - 0.32) * MM, 0.2 * MM, L.q === 'low' ? 4 : 6, segs(L.q, 48, 36, 24));
    ring.rotateX(Math.PI / 2);
    ring.translate(0, fy * MM, 0);
    K.metal.push(ring);
    // band-mount lugs: steel keys bridging the groove between the teeth
    if (L.micro) {
      const lug = [[rg - 0.1, -0.42], [R + 0.05, -0.36], [R + 0.05, 0.36], [rg - 0.1, 0.42]];
      for (const t of L.teeth) for (const s of [-1, 1]) K.steel.push(at(prism(lug, fy - gh - 0.01, fy + gh + 0.01, 0.06), t + s * (TAU / L.n) * 0.25));
    }
    // claw posts with a ramped outer top
    const claw = [[ru - 0.5, f1 - 0.05], [R - 0.3, f1 - 0.05], [R - 0.3, f1 + 0.3], [R - 1.3, top - 0.05], [ru - 0.5, top - 0.05]];
    for (const t of L.teeth) K.accent.push(at(section(claw, 2.3, 0.1), t));
    if (L.micro) for (const t of L.teeth) for (const s of [-1, 1]) K.detail.push(screw(R - 1.1, t + s * (TAU / L.n) * 0.3, f1, 0.36, 0.24));
    sectorBands(deco, L, { r: rd, y0: yc + 0.35, y1: f0 - 0.2, facets: F });
    deco.emblem = { rIn: ru + 0.15, rOut: R - 0.4, y: f1 + 0.05 };
  },

  // Wide socket: a ribbed, flared bell (chrome rim) that seats wide tips,
  // under a faceted shell with chunky wedge teeth.
  bell(K, L, d, deco) {
    const { R, H, yT, top } = L, F = d.facets || facetsFor(L.n, 6);
    const rb = R + 0.2, ri = clamp(L.tipR + 0.3, 4.5, rb - 1.6), yb = 0.36 * H, rt = R - 1.75;
    K.trim.push(lathe([[ri, 0.05], [rb - 0.2, 0.05], [rb, 0.5], [rb - 0.45, 0.95], [rb - 1.05, 1.35], [rt + 0.15, yb - 0.3], [rt, yb], [0, yb], [0, 0.9], [ri, 0.9], [ri, 0.05]], { n: L.seg }));
    K.metal.push(lathe([[ri + 0.1, 0], [rb + 0.12, 0], [rb + 0.32, 0.2], [rb + 0.32, 0.46], [ri + 0.1, 0.46], [ri + 0.1, 0]], { n: L.seg }));
    bayonetKeys(K, L, ri, 0.06, 0.92);
    if (L.micro) {
      const fin = [[rb - 0.5, 0.55], [rb + 0.12, 0.55], [rb - 0.1, 0.95], [rb - 0.7, 1.35], [rt + 0.5, yb - 0.3], [rt + 0.3, yb - 0.12], [rt - 0.2, yb - 0.12], [rb - 1.5, 1.35], [rb - 0.9, 0.95]];
      const nf = L.n * clamp(Math.round(16 / L.n), 1, 4); // whole fins per tooth sector, ~16 total
      for (let i = 0; i < nf; i++) K.trim.push(at(section(fin, 0.5, 0.06), (i + 0.5) * (TAU / nf)));
    }
    const rv = R - 0.1, ra = rv * Math.cos(Math.PI / F);
    K.main.push(facetShell(rv, yb - 0.05, yT, F, 0.35, 0.45));
    const out = Math.min(1.0, R + 1.04 - 0.12 - ra);
    const wedge = [[ra - 0.6, -1.55], [ra + out, -0.95], [ra + out, 0.95], [ra - 0.6, 1.55]];
    for (const t of L.teeth) K.accent.push(at(prism(wedge, yb + 0.3, top - 0.03, 0.12), t));
    topScrews(K, L, (L.bossR + 0.75 + ra) / 2 + 0.2, yT);
    sectorBands(deco, L, { r: rv, y0: yb + 0.42, y1: yT - 0.55, facets: F });
    deco.emblem = { rIn: L.bossR + 0.95, rOut: ra - 0.5, y: yT + 0.05 };
  },
};
