// Part catalogue: every part fits at least one legal top, assembles into a
// sane spec, and makes a valid item; the build space stays above 10 million
// part, spin and launch-gear combinations (customisation target, 2026-10-24).

import test from 'node:test';
import assert from 'node:assert/strict';
import { PARTS, PART_INDEX, ARCHITECTURES } from '../src/data/parts.js';
import { LAUNCHERS, CABLES } from '../src/data/launchers.js';
import { validateBuild, assembleTop } from '../src/systems/assembly.js';
import { createItem } from '../src/systems/items.js';
import { validateItem } from '../src/systems/itemValidate.js';

const by = (s) => PARTS.filter((p) => p.slot === s);

// Same rules as validateBuild, counted without building objects.
function legalTops() {
  const tops = [];
  for (const core of by('core')) {
    const A = ARCHITECTURES[core.arch];
    for (const ring of by('ring')) {
      if (!ring.arch.includes(core.arch)) continue;
      for (const lock of by('lock')) {
        if (!lock.arch.includes(core.arch)) continue;
        for (const tip of by('tip')) {
          if (tip.socket !== lock.tipSocket) continue;
          for (const disc of by('disc')) {
            if (A.maxDiscThickness && disc.thickness > A.maxDiscThickness + 1e-9) continue;
            for (const aux of [null, ...by('aux')]) {
              if (aux && ((aux.mount === 'skirt' && !disc.auxPort) || (aux.mount === 'band' && !lock.auxPort) || (aux.mount === 'crown' && core.arch === 'apex'))) continue;
              if (core.mass + ring.mass + lock.mass + tip.mass + disc.mass + (aux?.mass || 0) > A.maxMass + 1e-9) continue;
              tops.push({ core, ring, lock, tip, disc, aux });
            }
          }
        }
      }
    }
  }
  return tops;
}

test('every part fits a legal top that assembles', () => {
  const tops = legalTops();
  for (const p of PARTS) {
    const t = tops.find((x) => x[p.slot] === p);
    assert.ok(t, `${p.id} fits no legal top`);
    const build = Object.fromEntries(Object.entries(t).filter(([, v]) => v));
    assert.equal(validateBuild(build).ok, true, `${p.id}: the counter and validateBuild disagree`);
    const { spec } = assembleTop(build);
    assert.ok(spec.mass > 0.03 && spec.mass < 0.08 && spec.I3 > 0, `${p.id}: odd spec`);
  }
});

test('every part makes a valid item at every rarity', () => {
  for (const p of PARTS) for (const rarity of ['common', 'rare', 'mythic']) {
    const v = validateItem(createItem({ base: p.id, rarity, seed: 3 }));
    assert.equal(v.ok, true, `${p.id} ${rarity}: ${v.errors.join('; ')}`);
  }
});

test('the build space is above 10 million combinations', () => {
  const tops = legalTops().length;
  const gear = LAUNCHERS.reduce((s, l) => s + (l.spinMech === 'dual' ? 2 : 1), 0) * CABLES.length;
  assert.ok(tops * gear > 10_000_000, `${tops} tops x ${gear} spin/gear = ${tops * gear}`);
  assert.ok(PART_INDEX.ring_zephyrsail && PART_INDEX.lock_apexclamp, 'expansion parts present');
});
