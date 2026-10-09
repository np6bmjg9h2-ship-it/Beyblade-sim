// Core model with emblem cap. BASELINE — replaced by the detailed builder.
import * as THREE from 'three';
import { MM, partGroup, latheMm, toonMaterial, inked, rarityGlow, segs, canvasTexture } from './common.js';
import { emblemCanvas } from '../emblems.js';

export function buildCore(part, ctx) {
  const g = partGroup('core');
  const R = part.radius, H = part.height;
  g.add(inked(latheMm([[0, 0], [R, 0], [R, H * 0.8], [R * 0.9, H], [0, H]], segs(ctx.quality, 32)), toonMaterial(part.color || '#d9e2ec', { finish: 'gloss', ...rarityGlow(ctx.rarity) })));
  const emb = ctx.beast ? emblemCanvas(ctx.beast.emblem, ctx.beast.colors, 128, { background: false }) : emblemCanvas('blank', { primary: ctx.accent }, 128, { background: false });
  const tex = canvasTexture(emb);
  const cap = new THREE.Mesh(new THREE.CircleGeometry(R * 0.82 * MM, segs(ctx.quality, 32)), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  cap.rotation.x = -Math.PI / 2;
  cap.position.y = H * MM + 0.0001;
  cap.userData.noInk = true;
  g.add(cap);
  return { group: g, height: H * MM };
}
