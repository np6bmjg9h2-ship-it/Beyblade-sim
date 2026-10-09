// Performance tip model. BASELINE — replaced by the detailed builder.
import { MM, partGroup, latheMm, toonMaterial, inked, segs } from './common.js';

export function buildTip(part, ctx) {
  const g = partGroup('tip');
  const L = ctx.geo.tipLen, br = part.bodyRadius, ball = part.ballRadius, fr = part.flatRadius;
  const pts = [];
  if (fr > 0.2) {
    pts.push([0, 0], [fr, 0]);
    for (let i = 1; i <= 5; i++) { const a = (i / 5) * (Math.PI / 2); pts.push([fr + Math.sin(a) * ball, ball - Math.cos(a) * ball]); }
  } else {
    for (let i = 0; i <= 8; i++) { const a = (i / 8) * (Math.PI / 2); pts.push([Math.sin(a) * ball, ball - Math.cos(a) * ball]); }
  }
  const last = pts[pts.length - 1];
  pts.push([Math.max(last[0], br * 0.55), Math.max(last[1], L * 0.4)], [br, L * 0.72], [br, L], [0, L]);
  g.add(inked(latheMm(pts, segs(ctx.quality, 28)), toonMaterial(part.color || '#eeeeee', { finish: part.wear === 'rubber' ? 'rubber' : 'gloss' })));
  return { group: g, height: L * MM };
}
