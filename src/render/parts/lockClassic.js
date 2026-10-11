// Classic-series lock: Twin Roller. The lock body is an ordinary moulded
// lock (lock.js) drawn a little narrower, with two free-spinning rollers
// standing out on its sides at the full physics radius: when the top leans
// they meet the floor and roll (spec.hull friction), so they spin as
// spinners. Wheels turn about their radial axles.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MM, toonMaterial, inked } from './common.js';

export const ROLLER_LOCKS = { lock_roller: { wheels: 2, wheelR: 1.75, width: 1.6, inset: 1.9 } };

// body drawn this much narrower than the physics radius
export const rollerBodyRadius = (part) => part.radius - ROLLER_LOCKS[part.id].inset;

export function addRollers(model, part, ctx) {
  const d = ROLLER_LOCKS[part.id];
  const q = ctx.quality || 'high';
  const R = part.radius, y = Math.min(2.1, (ctx.geo?.lockH ?? part.height) * 0.35);
  const spinners = [];
  for (let i = 0; i < d.wheels; i++) {
    const a = (i / d.wheels) * Math.PI * 2;
    const tyre = new THREE.CylinderGeometry(d.wheelR * MM, d.wheelR * MM, d.width * MM, q === 'low' ? 10 : 20);
    const hub = new THREE.CylinderGeometry(0.7 * MM, 0.7 * MM, (d.width + 0.4) * MM, 10);
    const wheel = inked(tyre, toonMaterial('#ff7a1f', { finish: 'gloss' }), { px: 1.5, maxMm: 0.4 });
    const axle = inked(hub, toonMaterial('#d8dee8', { finish: 'chrome' }), { px: 1, maxMm: 0.2 });
    const spin = new THREE.Group();
    spin.add(wheel, axle);
    // axle along the radius: local Y of the holder points outward
    const holder = new THREE.Group();
    holder.rotation.z = -Math.PI / 2;
    holder.position.set((R - d.width / 2 - 0.05) * MM, y * MM, 0);
    holder.add(spin);
    const pivot = new THREE.Group();
    pivot.rotation.y = -a;
    pivot.add(holder);
    // a yoke arm from the body to the axle
    const arm = new THREE.BoxGeometry((d.inset + 0.6) * MM, 1.2 * MM, 1.6 * MM);
    arm.translate((R - d.inset - 0.2 + (d.inset + 0.6) / 2 - d.width) * MM, y * MM, 0);
    pivot.add(inked(arm, toonMaterial('#3d5426', { finish: 'plastic' }), { px: 1.5 }));
    model.group.add(pivot);
    spinners.push(spin);
  }
  model.spinners = [...(model.spinners || []), ...spinners];
  return model;
}
