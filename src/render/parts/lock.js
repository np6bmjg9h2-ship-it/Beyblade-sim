// Lock assembly model. BASELINE — replaced by the detailed builder.
import * as THREE from 'three';
import { MM, partGroup, annulusMm, toonMaterial, inked, radialArray, rarityGlow, segs } from './common.js';

export function buildLock(part, ctx) {
  const g = partGroup('lock');
  const H = ctx.geo.lockH, R = part.radius;
  const boss = Math.min(ctx.parts.disc.rIn - 0.4, R * 0.55);
  g.add(inked(annulusMm(2, R, 0, H * 0.75, segs(ctx.quality, 32), { chamferTop: 0.8, chamferBottom: 0.8 }), toonMaterial(part.color || '#d0d5dd', { ...rarityGlow(ctx.rarity) })));
  g.add(inked(annulusMm(1.5, boss, H * 0.7, H, segs(ctx.quality, 24), { chamferTop: 0.4 }), toonMaterial(part.color || '#d0d5dd')));
  const toothMat = toonMaterial(ctx.accent, { finish: 'gloss' });
  g.add(radialArray(part.notches, () => { const m = inked(new THREE.BoxGeometry(1.6 * MM, H * 0.45 * MM, 2.2 * MM), toothMat, { px: 1 }); m.position.set(R * MM, H * 0.42 * MM, 0); return m; }));
  return { group: g, height: H * MM };
}
