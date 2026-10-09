// Part model registry, build context and stack placement.

import { buildRing } from './ring.js';
import { buildCore } from './core.js';
import { buildDisc } from './disc.js';
import { buildLock } from './lock.js';
import { buildTip } from './tip.js';
import { buildAux } from './aux.js';
import { MM, rarityTrim } from './common.js';
import { BEAST_INDEX } from '../../data/beasts.js';

export const PART_BUILDERS = { ring: buildRing, core: buildCore, disc: buildDisc, lock: buildLock, tip: buildTip, aux: buildAux };
// bottom-to-top assembly order (exploded view, assembly animation)
export const STACK_ORDER = ['tip', 'lock', 'disc', 'aux', 'ring', 'core'];

// How the aux module mounts: a contact layer (crown band / skirt), a band
// around the lock, or inserts inside the attack ring.
export function auxMount(assembly) {
  const { parts: P, spec } = assembly;
  const a = P.aux;
  if (!a) return null;
  const g = spec.geometry;
  const layer = spec.layers.find((l) => l.id === 'aux') || null;
  if (a.layer && layer) return { kind: 'layer', mount: a.mount, layer };
  if (a.ringRadius) return { kind: 'band', mount: a.mount, rIn: a.ringRadius[0], rOut: a.ringRadius[1], lowMount: !!a.lowMount, zMm: a.lowMount ? g.zLock0 + g.lockH * 0.2 : g.zLock0 + g.lockH * 0.5 };
  return { kind: 'insert', mount: a.mount, zMm: g.zRing0 };
}

// Height (metres, in the top's COM-relative frame) of each part's origin.
export function partPlacement(assembly) {
  const { spec } = assembly;
  const g = spec.geometry;
  const zCom = -spec.tip.endZ;
  const y = (mm) => mm * MM - zCom;
  const out = { tip: y(0), lock: y(g.zLock0), disc: y(g.zDisc0), ring: y(g.zRing0), core: y(g.zCore0) };
  const m = auxMount(assembly);
  if (m) out.aux = m.kind === 'layer' ? m.layer.z - m.layer.thickness / 2 : y(m.zMm);
  return out;
}

export function partContext(slot, assembly, opts = {}) {
  const { parts: P, spec } = assembly;
  const beast = opts.beast ? (typeof opts.beast === 'string' ? BEAST_INDEX[opts.beast] : opts.beast) : null;
  const mount = slot === 'aux' ? auxMount(assembly) : null;
  return {
    slot,
    parts: P,
    spec,
    geo: spec.geometry,
    layer: slot === 'ring' ? spec.layers.find((l) => l.id === 'ring') : slot === 'disc' ? spec.layers.find((l) => l.id === 'disc') || null : mount?.layer || null,
    mount,
    accent: opts.color || P.ring.color || '#4fc3ff',
    beast,
    rarity: rarityTrim(P[slot]),
    quality: opts.quality || 'high',
    spin: P.ring.spin || 'dual',
  };
}

// Build every part model of an assembled top: { slot: { model, y } }.
export function buildPartModels(assembly, opts = {}) {
  const place = partPlacement(assembly);
  const out = {};
  for (const slot of STACK_ORDER) {
    const part = assembly.parts[slot];
    if (!part) continue;
    const model = PART_BUILDERS[slot](part, partContext(slot, assembly, opts));
    model.group.userData.slot = slot;
    out[slot] = { model, y: place[slot] };
  }
  return out;
}
