// Classic-series weight disc models: flat die-cast plates the way the first
// generation of tops made them. A plate is one extruded outline with its
// cut-outs: the dog-bone centre hole that keys it onto the core, paired
// bolt holes, windows between spokes. Zinc-grey metal, softly bevelled,
// inked. The magnet disc is black resin with its pole printed on the face
// that is up (N blue, S red) and the other pole underneath.
//
// Envelope (same as disc.js): r <= rOut, y in [0, thickness]; the bore
// r < rIn stays open for the lock boss.

import * as THREE from 'three';
import { MM, TAU, partGroup, toonMaterial, inked, tone, segs, canvasTexture, rarityGlow, extrudeShape, makeCanvas, planarUV } from './common.js';
import { buildDiscModel } from './discModel.js';

// kind, polygon sides (or lobes), and the outline numbers per part
export const CLASSIC_DISCS = {
  disc_hexheavy: { kind: 'plate', sides: 6, flat: 0.9, holes: 'pairs', label: 'HEAVY' },
  disc_octawide: { kind: 'spokes', sides: 8, flat: 0.95, rim: 3.2, spokes: 4, label: 'WIDE' },
  disc_starlobe: { kind: 'lobes', lobes: 5, inner: 15.2, label: 'STAR' },
  disc_magna: { kind: 'magnet', sides: 10, flat: 0.96 },
};

// ------------------------------------------------------------ outlines (mm, [x, y] shape space)

// Regular polygon (apothem = flat * R) with its corners rounded off by the
// circle R, sampled at n points.
function polyR(sides, R, flat, phase = 0) {
  const ap = R * flat;
  return (phi) => {
    const k = TAU / sides;
    let d = ((phi - phase) % k + k) % k - k / 2;
    return Math.min(R, ap / Math.cos(d));
  };
}
function lobesR(lobes, R, inner, phase = 0) {
  return (phi) => {
    const c = Math.abs(Math.cos((lobes * (phi - phase)) / 2));
    return inner + (R - inner) * Math.pow(c, 1.6);
  };
}
function sample(rf, n, rev = false) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU * (rev ? -1 : 1);
    const r = rf(a);
    pts.push(new THREE.Vector2(r * Math.cos(a), r * Math.sin(a)));
  }
  return pts;
}
// Dog-bone centre cut-out: the round bore with two lobes along x.
function dogbone(rIn, n) {
  const lobe = rIn + 3.0, w = 0.62; // half-width of a lobe (rad)
  return sample((a) => {
    const d = Math.min(Math.abs(Math.atan2(Math.sin(a), Math.cos(a))), Math.abs(Math.atan2(Math.sin(a - Math.PI), Math.cos(a - Math.PI))));
    const t = Math.max(0, 1 - Math.pow(d / w, 4));
    return rIn + (lobe - rIn) * t;
  }, n, true);
}
const circlePath = (x, y, r) => { const p = new THREE.Path(); p.absarc(x, y, r, 0, TAU, true); return p; };
const mmShape = (pts) => new THREE.Shape(pts.map((p) => p.clone()));
const toPath = (pts) => new THREE.Path(pts.map((p) => p.clone()));

// Shape in mm -> extruded geometry in metres, y from y0 to y1 mm.
function plate(shape, y0, y1, bevel = 0.3, curve = 12) {
  const s = shape; // scale mm -> m by transforming points
  const scaled = new THREE.Shape(s.getPoints(curve).map((p) => p.clone().multiplyScalar(MM)));
  for (const h of s.holes) scaled.holes.push(new THREE.Path(h.getPoints(curve).map((p) => p.clone().multiplyScalar(MM))));
  const g = extrudeShape(scaled, (y1 - y0) * MM, { bevel: Math.min(bevel, (y1 - y0) * 0.3) * MM, curveSegments: curve });
  g.translate(0, y0 * MM, 0);
  return g;
}

// ------------------------------------------------------------ kinds

// the extrude bevel grows the outline outward: start that much inside rOut
const BEV = 0.3;

function platePiece(part, d, q) {
  const R = part.rOut - BEV - 0.05, r0 = part.rIn ?? 6, T = part.thickness, n = segs(q, 132, 96, 60);
  const out = polyR(d.sides, R, d.flat, Math.PI / d.sides);
  const shape = mmShape(sample(out, n));
  shape.holes.push(toPath(dogbone(r0, segs(q, 64, 48, 32))));
  if (d.holes === 'pairs') {
    const rh = r0 + 6.2;
    for (const s of [1, -1]) for (const o of [-0.26, 0.26]) shape.holes.push(circlePath(rh * Math.cos(s * Math.PI / 2 + o), rh * Math.sin(s * Math.PI / 2 + o), 1.05));
  }
  return { body: plate(shape, 0, T), extra: [] };
}

function spokesPiece(part, d, q) {
  const R = part.rOut - BEV - 0.05, r0 = part.rIn ?? 6, T = part.thickness, n = segs(q, 144, 104, 64);
  const out = polyR(d.sides, R, d.flat, Math.PI / d.sides);
  const shape = mmShape(sample(out, n));
  shape.holes.push(toPath(dogbone(r0, segs(q, 64, 48, 32))));
  // windows between the spokes: from the hub ring out to the rim
  const hub = r0 + 4.6, k = TAU / d.spokes, half = 0.2; // spoke half-width (rad, at the hub)
  for (let i = 0; i < d.spokes; i++) {
    const a0 = i * k + Math.PI / 4 + half, a1 = (i + 1) * k + Math.PI / 4 - half;
    const pts = [], m = segs(q, 18, 12, 8);
    for (let j = 0; j <= m; j++) { const a = a0 + ((a1 - a0) * j) / m; pts.push(new THREE.Vector2(hub * Math.cos(a), hub * Math.sin(a))); }
    // the rim side narrows the window a little more than the hub side (tapered spokes)
    const b0 = a0 + 0.06, b1 = a1 - 0.06;
    for (let j = m; j >= 0; j--) { const a = b0 + ((b1 - b0) * j) / m; const r = out(a) - d.rim; pts.push(new THREE.Vector2(r * Math.cos(a), r * Math.sin(a))); }
    shape.holes.push(toPath(pts.reverse()));
  }
  // a bolt hole at the root of each spoke
  for (let i = 0; i < d.spokes; i++) { const a = i * k + Math.PI / 4; shape.holes.push(circlePath((R - d.rim - 2.2) * Math.cos(a), (R - d.rim - 2.2) * Math.sin(a), 0.85)); }
  return { body: plate(shape, 0, T, 0.25), extra: [] };
}

function lobesPiece(part, d, q) {
  const R = part.rOut - BEV - 0.05, r0 = part.rIn ?? 6, T = part.thickness, n = segs(q, 160, 110, 70);
  const out = lobesR(d.lobes, R, d.inner, 0);
  const shape = mmShape(sample(out, n));
  shape.holes.push(toPath(dogbone(r0, segs(q, 64, 48, 32))));
  for (let i = 0; i < d.lobes; i++) { const a = (i * TAU) / d.lobes; shape.holes.push(circlePath((R - 2.6) * Math.cos(a), (R - 2.6) * Math.sin(a), 1.1)); }
  return { body: plate(shape, 0, T), extra: [] };
}

function magnetPiece(part, d, q) {
  const R = part.rOut - BEV - 0.05, r0 = part.rIn ?? 6, T = part.thickness, n = segs(q, 120, 90, 60);
  const out = polyR(d.sides, R, d.flat, Math.PI / d.sides);
  const shape = mmShape(sample(out, n));
  shape.holes.push(toPath(dogbone(r0, segs(q, 64, 48, 32))));
  // the printed pole bands sit on the faces, inside the envelope
  return { body: plate(shape, 0.08, T - 0.08, BEV) };
}

// Printed pole band (canvas decal) on a flat annulus at height y mm.
function poleDecal(rIn, rOut, y, pole, q, flip = false) {
  const col = pole === 'S' ? '#e8313f' : '#2f6bff';
  const size = q === 'low' ? 256 : 512;
  const cv = makeCanvas(size, (g, s) => {
    const c = s / 2, k = s / (2 * rOut);
    g.clearRect(0, 0, s, s);
    g.fillStyle = col;
    g.beginPath(); g.arc(c, c, rOut * k, 0, TAU); g.arc(c, c, rIn * k, 0, TAU, true); g.fill();
    g.fillStyle = '#ffffff';
    g.font = `900 ${Math.round(2.6 * k)}px "Chakra Petch", system-ui, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i < 4; i++) {
      const a = (i * TAU) / 4 + Math.PI / 4, rr = (rIn + rOut) / 2;
      const x = c + rr * k * Math.cos(a), yy = c + rr * k * Math.sin(a);
      g.beginPath(); g.arc(x, yy, 1.7 * k, 0, TAU); g.fill();
      g.fillStyle = col; g.fillText(pole, x, yy + 0.1 * k); g.fillStyle = '#ffffff';
    }
  });
  const geo = new THREE.RingGeometry(rIn * MM, rOut * MM, segs(q, 64, 48, 32), 1);
  geo.rotateX(flip ? Math.PI / 2 : -Math.PI / 2);
  geo.translate(0, y * MM, 0);
  planarUV(geo, rOut * MM);
  if (flip) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i)); } // read the right way round from below
  const mat = toonMaterial('#ffffff', { finish: 'plastic', specEdge: 0.985, map: canvasTexture(cv) });
  mat.transparent = true; mat.alphaTest = 0.4;
  const m = new THREE.Mesh(geo, mat);
  m.userData.noInk = true;
  return m;
}

const BUILD = { plate: platePiece, spokes: spokesPiece, lobes: lobesPiece, magnet: magnetPiece };

export function buildClassicDisc(part, ctx = {}) {
  const d = CLASSIC_DISCS[part.model || part.id];
  const q = ctx.quality || 'high';
  const g = partGroup('disc');
  const glows = [];
  // Blender model (tools/blender/discs.py): zinc plate on a darker spacer, or
  // the resin magnet with its pole prints on the plate faces
  const magnet = d.kind === 'magnet';
  const face = magnet ? '#2a2d34' : tone(part.color || '#a7aeb8', -0.24, -0.04);
  const model = buildDiscModel(part, ctx, {
    main: () => toonMaterial(face, magnet
      ? { finish: 'plastic', specEdge: 0.985, rimColor: '#4a505e', ...rarityGlow(ctx.rarity) }
      : { finish: 'metal', spec: 0.9, specEdge: 0.985, rimColor: tone(face, 0.3), ...rarityGlow(ctx.rarity) }),
    dark: () => toonMaterial(magnet ? '#3a3f4a' : tone(face, -0.12), { finish: 'metal', spec: 0.6 }),
  });
  if (model) {
    const f = model.meta.faces;
    if (magnet && f && q !== 'low') {
      const pole = ctx.parts?.disc?._item?.pole === 'S' ? 'S' : 'N';
      const r1 = (part.rIn ?? 6) + 5.6, r2 = part.rOut * d.flat;
      model.group.add(poleDecal(r1, r2 - 0.9, f.top + 0.03, pole, q));
      model.group.add(poleDecal(r1, r2 - 0.9, f.bottom - 0.03, pole === 'S' ? 'N' : 'S', q, true));
    }
    return { group: model.group, height: (part.thickness ?? 4) * MM, glows: model.glows };
  }
  const piece = BUILD[d.kind](part, d, q);
  if (d.kind === 'magnet') {
    const body = toonMaterial('#2a2d34', { finish: 'plastic', specEdge: 0.985, rimColor: '#4a505e', ...rarityGlow(ctx.rarity) });
    g.add(inked(piece.body, body, {}));
    if (ctx.rarity?.rank >= 3) glows.push(body);
    if (q !== 'low') {
      const pole = ctx.parts?.disc?._item?.pole === 'S' ? 'S' : 'N';
      const T = part.thickness, r1 = (part.rIn ?? 6) + 5.6, r2 = part.rOut * d.flat;
      g.add(poleDecal(r1, r2 - 0.9, T - 0.04, pole, q));
      g.add(poleDecal(r1, r2 - 0.9, 0.04, pole === 'S' ? 'N' : 'S', q, true));
    }
  } else {
    // die-cast zinc: a cool grey with a hint of the part colour
    const zinc = tone(part.color || '#a7aeb8', -0.24, -0.04);
    const mat = toonMaterial(zinc, { finish: 'metal', spec: 0.9, specEdge: 0.985, rimColor: tone(zinc, 0.3), ...rarityGlow(ctx.rarity) });
    if (ctx.rarity?.rank >= 3) glows.push(mat);
    g.add(inked(piece.body, mat, {}));
  }
  return { group: g, height: (part.thickness ?? 4) * MM, glows };
}
