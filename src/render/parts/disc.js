// Weight disc model. BASELINE — replaced by the detailed builder.
import * as THREE from 'three';
import { MM, TAU, partGroup, extrudeShape, toonMaterial, inked, rarityGlow, segs } from './common.js';

export function buildDisc(part, ctx) {
  const g = partGroup('disc');
  const holes = part.mass < 16 ? 8 : part.massDist > 0.5 ? 5 : 6;
  const holeAt = (part.rIn + part.rOut) * 0.5 * MM * (part.massDist > 0.5 ? 0.8 : 1);
  const shape = new THREE.Shape();
  shape.absarc(0, 0, part.rOut * MM, 0, TAU, false);
  const h = new THREE.Path(); h.absarc(0, 0, part.rIn * MM, 0, TAU, true); shape.holes.push(h);
  for (let i = 0; i < holes; i++) {
    const a = (i / holes) * TAU, p = new THREE.Path();
    p.absarc(Math.cos(a) * holeAt, Math.sin(a) * holeAt, (part.rOut - part.rIn) * 0.16 * MM, 0, TAU, true);
    shape.holes.push(p);
  }
  g.add(inked(extrudeShape(shape, part.thickness * MM, { curveSegments: segs(ctx.quality, 32) }), toonMaterial(part.color || '#b8bec8', { finish: 'metal', ...rarityGlow(ctx.rarity) })));
  return { group: g, height: part.thickness * MM };
}
