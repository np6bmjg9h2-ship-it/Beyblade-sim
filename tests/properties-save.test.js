// Property-based save checks (fast-check): a played profile survives a save
// and load unchanged, normalising is idempotent, and a damaged save never
// crashes loading: it loads repaired (damaged items set aside, never
// silently lost), falls back to the backup, or is salvaged; only data that
// isn't a save at all is reported as corrupt.

import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { newProfile, normalizeProfile } from '../src/systems/profile.js';
import { SaveManager, validate } from '../src/systems/save.js';
import { addItem } from '../src/systems/loot.js';
import { generateItem } from '../src/systems/itemGen.js';
import { loadoutSummary } from '../src/systems/loadout.js';
import { genOptsArb, runs } from './arbitraries.js';

// A profile after some play: new loot, loadouts re-pointed at owned items,
// changed balances.
const playedArb = fc.record({
  seed: fc.nat(),
  loot: fc.array(genOptsArb, { maxLength: 12 }),
  equip: fc.array(fc.record({ loadout: fc.nat({ max: 2 }), pick: fc.nat() }), { maxLength: 8 }),
  credits: fc.integer({ min: 0, max: 1e7 }),
  level: fc.integer({ min: 1, max: 60 }),
});

function played(o) {
  const p = newProfile(o.seed);
  for (const g of o.loot) addItem(p, generateItem({ ...g, source: 'property test' }));
  const items = Object.values(p.inventory);
  for (const e of o.equip) {
    const it = items[e.pick % items.length];
    const L = p.loadouts[e.loadout];
    if (it.slot === 'launcher') L.launcher = it.uid;
    else if (it.slot === 'cable') L.cable = it.uid;
    else L.parts[it.slot] = it.uid;
  }
  p.currency.credits = o.credits;
  p.player.level = o.level;
  return p;
}

test('a played profile saves and loads back unchanged; normalising twice changes nothing', async () => {
  await fc.assert(fc.asyncProperty(playedArb, async (o) => {
    const p = played(o);
    const sm = await SaveManager.create({ memory: true });
    await sm.save('slot1', p);
    const r = await sm.load('slot1');
    assert.ok(r.ok, r.reason);
    const expect = structuredClone(p); expect.undo = [];
    assert.deepEqual(r.data, expect);
    const once = normalizeProfile(structuredClone(r.data));
    assert.deepEqual(normalizeProfile(structuredClone(once)), once);
  }), { numRuns: runs(150) });
});

// ------------------------------------------------------------ damage

// Every path into the save (objects and arrays, a few levels deep).
function paths(o, pre = [], out = [], depth = 0) {
  if (!o || typeof o !== 'object' || depth > 5) return out;
  for (const k of Object.keys(o)) {
    out.push([...pre, k]);
    paths(o[k], [...pre, k], out, depth + 1);
  }
  return out;
}
const DAMAGE = ['delete', null, NaN, -1, 1e308, '', 'garbage', [], {}, true, 0];
const damageArb = fc.array(fc.record({ at: fc.nat(), kind: fc.nat({ max: DAMAGE.length - 1 }) }), { minLength: 1, maxLength: 4 });

function damage(raw, hits) {
  for (const h of hits) {
    const all = paths(raw);
    if (!all.length) break;
    const path = all[h.at % all.length];
    let o = raw;
    for (const k of path.slice(0, -1)) o = o[k];
    const k = path[path.length - 1];
    const d = DAMAGE[h.kind];
    if (d === 'delete') delete o[k];
    else o[k] = Array.isArray(d) ? [] : d && typeof d === 'object' ? {} : d;
  }
  return raw;
}

test('a damaged save never crashes loading and never loses an item silently', async () => {
  await fc.assert(fc.asyncProperty(playedArb, damageArb, fc.boolean(), async (o, hits, withBackup) => {
    const sm = await SaveManager.create({ memory: true });
    const p = played(o);
    if (withBackup) await sm.save('slot1', p); // becomes the backup on the next save
    await sm.save('slot1', p);
    const raw = await sm.store.get('slot1');
    damage(raw, hits);
    await sm.store.set('slot1', raw);
    const uids = raw.inventory && typeof raw.inventory === 'object' && !Array.isArray(raw.inventory) ? Object.keys(raw.inventory) : [];
    const r = await sm.load('slot1'); // must not throw
    assert.ok(r.ok, `loading failed: ${r.reason}`); // a save with damage is always recoverable
    assert.deepEqual(validate(r.data), [], 'the loaded profile is structurally valid');
    if (!r.recovered) {
      for (const uid of uids) assert.ok(r.data.inventory[uid] || r.data.quarantine[uid], `item ${uid} vanished`);
    }
    for (const L of r.data.loadouts) {
      for (const uid of Object.values(L.parts || {})) assert.ok(uid == null || r.data.inventory[uid], 'loadout points at a missing item');
      loadoutSummary(r.data, L); // the Workshop can show it
    }
  }), { numRuns: runs(400) });
});
