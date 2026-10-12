// Property-based Workshop checks (fast-check): any sequence of crafting
// operations (dismantle with or without an imprint, engrave, train with a
// copy, reroll, transfer, discard, undo) on a save with random loot and
// relics keeps every item valid, relics untouched, the imprint case within
// its size and no balance negative.

import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { newProfile } from '../src/systems/profile.js';
import { generateItem } from '../src/systems/itemGen.js';
import { validateItem } from '../src/systems/itemValidate.js';
import { createRelicItem } from '../src/systems/relics.js';
import { RELICS } from '../src/data/relics.js';
import { TRAIT_INDEX } from '../src/data/traits.js';
import * as WS from '../src/systems/workshop.js';
import { genOptsArb, runs } from './arbitraries.js';

const OPS = ['dismantle', 'dismantleImprint', 'engrave', 'engraveReplace', 'train', 'reroll', 'transfer', 'discard', 'undo'];
const opArb = fc.record({ op: fc.constantFrom(...OPS), a: fc.nat(), b: fc.nat(), c: fc.nat() });

test('any sequence of Workshop operations keeps every item valid and relics untouched', () => {
  fc.assert(fc.property(fc.nat(), fc.array(genOptsArb, { minLength: 4, maxLength: 14 }), fc.array(fc.nat({ max: RELICS.length - 1 }), { maxLength: 3 }), fc.array(opArb, { maxLength: 30 }), fc.boolean(),
    (seed, loot, relicIx, ops, poor) => {
      const p = newProfile(seed);
      p.loadouts = p.loadouts.slice(0, 1);
      if (!poor) { p.currency.credits = 1e6; p.currency.research = 1e5; for (const k of Object.keys(p.materials)) p.materials[k] = 1e4; }
      for (const g of loot) { const it = generateItem({ ...g, source: 'property test' }); p.inventory[it.uid] = it; }
      const relics = new Map();
      for (const i of new Set(relicIx)) {
        const it = createRelicItem(p, RELICS[i].id);
        p.inventory[it.uid] = it;
        relics.set(it.uid, JSON.stringify([it.traits, it.special]));
      }
      const uids = () => Object.keys(p.inventory);
      const pick = (n) => { const u = uids(); return u.length ? u[n % u.length] : null; };
      for (const { op, a, b, c } of ops) {
        const ua = pick(a), ub = pick(b), it = ua && p.inventory[ua];
        switch (op) {
          case 'dismantle': if (ua) WS.dismantle(p, ua); break;
          case 'dismantleImprint': if (it) WS.dismantle(p, ua, { imprint: it.traits.length ? c % it.traits.length : 0 }); break;
          case 'engrave': if (ua && p.imprints.length) WS.engrave(p, c % p.imprints.length, ua); break;
          case 'engraveReplace': if (it?.traits.length && p.imprints.length) WS.engrave(p, c % p.imprints.length, ua, b % it.traits.length); break;
          case 'train': if (ua && ub) WS.trainWithDuplicate(p, ua, ub); break;
          case 'reroll': if (it?.traits.length) WS.rerollTrait(p, ua, c % it.traits.length); break;
          case 'transfer': if (ua && ub && p.inventory[ub]?.traits.length) WS.transferTrait(p, ub, c % p.inventory[ub].traits.length, ua); break;
          case 'discard': if (p.imprints.length) WS.discardImprint(p, c % p.imprints.length); break;
          case 'undo': WS.undo(p); break;
        }
        for (const x of Object.values(p.inventory)) {
          const v = validateItem(x);
          assert.ok(v.ok, `${op}: ${v.errors.join('; ')}`);
          assert.deepEqual(v.warnings, [], `${op}: ${x.base}`);
        }
        assert.ok(p.imprints.length <= WS.IMPRINT_CAP, 'imprint case overflow');
        for (const imp of p.imprints) assert.ok(TRAIT_INDEX[imp.id] && !TRAIT_INDEX[imp.id].relic && imp.mag > 0 && imp.mag <= 1);
        assert.ok(p.currency.credits >= 0 && p.currency.research >= 0, 'negative currency');
        for (const [k, v] of Object.entries(p.materials)) assert.ok(v >= 0, `negative ${k}`);
        for (const [uid, snap] of relics) if (p.inventory[uid]) assert.equal(JSON.stringify([p.inventory[uid].traits, p.inventory[uid].special]), snap, 'a relic changed');
        for (const uid of relics.keys()) assert.ok(p.inventory[uid], 'a relic was destroyed');
      }
    }), { numRuns: runs(250) });
});
