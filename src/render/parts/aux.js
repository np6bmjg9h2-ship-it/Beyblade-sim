// Auxiliary module model. BASELINE — replaced by the detailed builder.
import * as THREE from 'three';
import { MM, partGroup, extrudeOutline, annulusMm, toonMaterial, inked, segs } from './common.js';
import { profileOutline } from '../../physics/profile.js';

export function buildAux(part, ctx) {
  const g = partGroup('aux');
  const m = ctx.mount;
  if (m.kind === 'layer') {
    const out = profileOutline(ctx.layer, segs(ctx.quality, 128));
    g.add(inked(extrudeOutline(out, ctx.layer.radius - 0.003, ctx.layer.thickness), toonMaterial(part.color || '#e9f6ff', { finish: ctx.layer.freeSpin ? 'clear' : 'gloss', opacity: ctx.layer.freeSpin ? 0.8 : 1 })));
    return { group: g, height: ctx.layer.thickness };
  }
  if (m.kind === 'band') {
    g.add(inked(annulusMm(part.ringRadius[0], part.ringRadius[1], -1.5, 1.5, segs(ctx.quality, 40)), toonMaterial(part.color || '#c0c6d0', { finish: 'metal' })));
    return { group: g, height: 3 * MM };
  }
  const ring = new THREE.TorusGeometry(16 * MM, 1.5 * MM, 6, segs(ctx.quality, 32)).rotateX(Math.PI / 2);
  const t = inked(ring, toonMaterial(part.color || '#b8a6ff', { finish: 'rubber' }));
  t.position.y = ctx.parts.ring.thickness * 0.5 * MM;
  g.add(t);
  return { group: g, height: 3 * MM };
}
