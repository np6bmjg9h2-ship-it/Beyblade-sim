// Attack ring model. BASELINE — replaced by the detailed builder.
// The outer silhouette is extruded from the physics contact profile.
import { MM, partGroup, extrudeOutline, toonMaterial, inked, rarityGlow, segs } from './common.js';
import { profileOutline } from '../../physics/profile.js';

export function buildRing(part, ctx) {
  const g = partGroup('ring');
  const outline = profileOutline(ctx.layer, segs(ctx.quality, 192));
  g.add(inked(extrudeOutline(outline, part.rIn * MM, part.thickness * MM), toonMaterial(ctx.accent, { finish: 'gloss', ...rarityGlow(ctx.rarity) })));
  return { group: g, height: part.thickness * MM };
}
