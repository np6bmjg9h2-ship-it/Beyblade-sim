// Daily Store prototypes: every generated part is a valid, working part, the
// lineup is fixed for the day, and a bought prototype survives a save.

import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePart, GEN_SLOTS } from '../src/systems/partGen.js';
import { dailyStore, buyDailyStore } from '../src/systems/store.js';
import { newProfile, normalizeProfile } from '../src/systems/profile.js';
import { PART_INDEX } from '../src/data/parts.js';
import { CABLE_INDEX } from '../src/data/launchers.js';
import { assembleTop, validateBuild } from '../src/systems/assembly.js';
import { resolveLaunchGear } from '../src/game/launch.js';
import { createItem, baseOf, itemName } from '../src/systems/items.js';
import { Battle } from '../src/game/battle.js';
import { participantFromDef, ARCHETYPE_INDEX } from '../src/data/opponents.js';
import { BUILDS } from './helpers.js';

const buildFor = (def) => {
  const b = Object.fromEntries(Object.entries(BUILDS.balance).map(([s, id]) => [s, PART_INDEX[id]]));
  if (def.slot !== 'launcher') b[def.slot] = createItem({ base: def.id, def, rarity: 'rare', level: 5, seed: 1 });
  // a quad-only part goes on a quad frame (like Iron Clasp)
  if (def.arch && !def.arch.includes('helix')) b.core = PART_INDEX.core_quad;
  return b;
};

test('generated parts are valid in a standard top and inside catalogue ranges', () => {
  for (let s = 1; s <= 200; s++) {
    for (const slot of GEN_SLOTS) {
      const def = generatePart(s * 7919 + slot.length, slot, `t_${slot}_${s}`);
      assert.equal(def.slot, slot);
      assert.ok(def.generated && def.name && def.desc && /^#[0-9a-f]{6}$/.test(def.color), `${slot} ${s} labels`);
      if (slot === 'launcher') {
        const g = resolveLaunchGear(createItem({ base: def.id, def, rarity: 'rare', level: 5, seed: 2 }), CABLE_INDEX.cable_standard);
        assert.ok(g.energyMax > 2 && g.energyMax < 4.5 && g.window > 0.02 && g.chargeRate > 0.3, `launcher ${s}: ${JSON.stringify({ e: g.energyMax, w: g.window, c: g.chargeRate })}`);
        continue;
      }
      if (slot === 'ring') assert.ok(def.rOut <= 26.5 && def.rBase <= def.rOut && def.rIn >= 10, `ring ${s} radii`);
      const spin = def.spin === 'L' ? 'L' : 'R';
      const v = validateBuild(buildFor(def), { spin });
      assert.ok(v.ok, `${slot} ${s} (${def.name}): ${v.errors.join(' ')}`);
      const spec = assembleTop(buildFor(def), { spin }).spec;
      assert.ok(Number.isFinite(spec.I3) && spec.I3 > 0 && spec.mass > 0.03 && spec.mass < 0.08, `${slot} ${s} spec`);
    }
  }
});

test('a prototype top battles normally (definition travels inside the item)', () => {
  const a = participantFromDef(ARCHETYPE_INDEX.all, { difficulty: 1, id: 'A' });
  const b = participantFromDef(ARCHETYPE_INDEX.striker, { difficulty: 1, id: 'B' });
  for (const slot of ['ring', 'tip', 'disc']) {
    let def, s = 11;
    do { def = generatePart(s++, slot, `bt_${slot}_${s}`); } while (slot === 'ring' && def.spin === 'L');
    a.build[slot] = createItem({ base: def.id, def, rarity: 'epic', level: 10, seed: 3 });
  }
  // structured cloning (as for a Web Worker) keeps the definitions
  const battle = new Battle({ arenaId: 'standard', format: 'single', seed: 4, participants: structuredClone([a, b]), rules: { durability: false, slowmo: false }, roundTime: 40 });
  const r = battle.runHeadless();
  assert.ok(r.winner === 0 || r.winner === 1 || r.winner == null);
  assert.ok(r.rounds[0].time > 0.5);
});

test('daily store: six fixed prototypes a day, one of each, kept through a save', () => {
  const p = newProfile(21);
  p.currency.credits = 100000;
  const day = '2026-10-12';
  const a = dailyStore(p, day), b = dailyStore(p, day);
  assert.equal(a.length, 6);
  assert.deepEqual(a.map((e) => e.item.def.name), b.map((e) => e.item.def.name), 'same day, same designs');
  assert.notDeepEqual(dailyStore(p, '2026-10-13').map((e) => e.item.def.name), a.map((e) => e.item.def.name));
  assert.deepEqual(a.map((e) => e.item.slot), ['ring', 'ring', 'tip', 'disc', 'lock', 'launcher']);
  const r = buyDailyStore(p, 0, day);
  assert.ok(r.ok);
  assert.equal(buyDailyStore(p, 0, day).ok, false, 'one of a kind');
  assert.ok(dailyStore(p, day)[0].bought);
  // through JSON (a save) and back
  const loaded = JSON.parse(JSON.stringify(p));
  normalizeProfile(loaded);
  const it = loaded.inventory[r.items[0].uid];
  assert.equal(baseOf(it).name, a[0].item.def.name);
  assert.equal(itemName(it), a[0].item.def.name);
  const build = { ...buildFor(PART_INDEX.ring_cometarc), ring: it };
  assert.ok(validateBuild(build, { spin: it.def.spin === 'L' ? 'L' : 'R' }).ok);
});
