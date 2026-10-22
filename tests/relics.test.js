// Relics, targeted crafting (imprints and engraving), duplicates training
// mastery, and Journal milestones.

import test from 'node:test';
import assert from 'node:assert/strict';
import { RELICS, RELIC_INDEX, RECAST_COST } from '../src/data/relics.js';
import { TRAITS, TRAIT_INDEX } from '../src/data/traits.js';
import { PART_INDEX } from '../src/data/parts.js';
import { LAUNCHER_INDEX, CABLE_INDEX } from '../src/data/launchers.js';
import { RARITIES } from '../src/data/rarity.js';
import { CHARACTERS } from '../src/data/characters.js';
import { newProfile } from '../src/systems/profile.js';
import { createItem, eligibleTraits, MASTERY_CAP } from '../src/systems/items.js';
import { generateItem, BUDGET } from '../src/systems/itemGen.js';
import { rollRarity } from '../src/systems/loot.js';
import { validateItem } from '../src/systems/itemValidate.js';
import { checkRelics, createRelicItem, recastRelic, relicStatus } from '../src/systems/relics.js';
import * as WS from '../src/systems/workshop.js';
import { journalCounts, milestoneStatus, claimMilestone, partSources } from '../src/systems/journal.js';
import { Rng } from '../src/core/rng.js';

const baseDef = (id) => PART_INDEX[id] || LAUNCHER_INDEX[id] || CABLE_INDEX[id];
const rich = (p) => { p.currency.credits = 1e6; p.currency.research = 1e5; Object.assign(p.materials, { scrap: 1e4, polymer: 1e4, alloy: 1e4, coreShard: 1e4, spiritDust: 1e4, relicFragment: 1e4 }); return p; };

// A save that has done everything every relic asks for.
function veteran() {
  const p = newProfile(11);
  p.story.completed = ['ch1', 'ch2', 'ch3', 'ch4', 'ch5', 'ch6'];
  p.tournaments.records.zero_championship = { entries: 1, wins: 1, podiums: 1, best: 1 };
  p.rift.bestDepth = 4;
  Object.values(p.inventory)[0].xp = 5000;
  for (const t of TRAITS.filter((x) => !x.relic).slice(0, 60)) p.discovery.traits[t.id] = true;
  p.beasts.orrery.awakened = true;
  p.league.history = [{ season: 3, division: 1, place: 1, move: 'stay' }];
  p.rivals = Object.fromEntries(CHARACTERS.filter((c) => c.builds?.length).map((c) => [c.id, { playerWins: 1 }]));
  p.survival.best = 12;
  return p;
}

test('every relic is a valid, unique, in-budget item with a signature of its own', () => {
  const sigs = new Set();
  for (const d of RELICS) {
    const base = baseDef(d.base);
    assert.ok(base, `${d.id}: base ${d.base}`);
    assert.equal(base.slot, d.slot, `${d.id}: slot`);
    const sig = TRAIT_INDEX[d.signature];
    assert.ok(sig?.relic && sig.special && sig.slots.includes(d.slot), `${d.id}: signature ${d.signature}`);
    assert.ok(!sigs.has(d.signature), `${d.id}: signature shared`);
    sigs.add(d.signature);
    for (const [id, m] of d.traits) {
      const t = TRAIT_INDEX[id];
      assert.ok(t && !t.relic && !t.special && !t.curse && t.slots.includes(d.slot) && m > 0 && m <= 1, `${d.id}: trait ${id}`);
    }
    const it = createRelicItem(newProfile(3), d.id);
    const v = validateItem(it);
    assert.ok(v.ok, `${d.id}: ${v.errors.join('; ')}`);
    assert.deepEqual(v.warnings, [], d.id);
    const spent = [...it.traits, it.special].reduce((s, t) => s + TRAIT_INDEX[t.id].cost, 0);
    assert.ok(spent <= BUDGET.relic, `${d.id}: costs ${spent}`);
    assert.ok(d.earn.text && d.lore, d.id);
    const [have, need] = d.earn.progress(newProfile(3));
    assert.ok(have < need, `${d.id}: earned by a new save`);
  }
  assert.equal(new Set(RELICS.map((r) => r.id)).size, RELICS.length);
});

test('relic signatures and relic rarity never come from random loot or crafting', () => {
  for (const slot of ['ring', 'core', 'disc', 'lock', 'tip', 'aux', 'launcher', 'cable']) {
    for (const r of RARITIES) for (const special of [false, true]) assert.ok(!eligibleTraits(slot, r.id, { special }).some((t) => t.relic), `${slot} ${r.id}`);
  }
  const rng = new Rng(5);
  for (let i = 0; i < 20000; i++) assert.notEqual(rollRarity(rng, 4, 1), 'relic');
  for (let s = 0; s < 400; s++) {
    const it = generateItem({ base: PART_INDEX.ring_galefang, rarity: 'relic', level: 30, seed: s, source: 'test' });
    assert.ok(![...it.traits, ...(it.special ? [it.special] : [])].some((t) => TRAIT_INDEX[t.id].relic));
  }
  const p = rich(newProfile(4));
  const relic = createRelicItem(p, 'emberCrown');
  p.inventory[relic.uid] = relic;
  const other = createItem({ base: 'ring_galefang', rarity: 'epic', level: 10, seed: 2, traits: [{ id: 'honedEdge', mag: 0.5 }], special: null, set: null });
  p.inventory[other.uid] = other;
  assert.equal(WS.dismantle(p, relic.uid).ok, false);
  assert.equal(WS.rerollTrait(p, relic.uid, 0).ok, false);
  assert.equal(WS.transferTrait(p, other.uid, 0, relic.uid).ok, false);
  assert.equal(WS.transferTrait(p, relic.uid, 0, other.uid).ok, false);
  p.imprints = [{ id: 'deepHooks', mag: 0.6, from: 'test' }];
  assert.equal(WS.engrave(p, 0, relic.uid).ok, false);
});

test('relics are earned once, from what the save has already done', () => {
  const p = veteran();
  const got = checkRelics(p);
  assert.equal(got.length, RELICS.length, got.map((i) => i.relic).join(','));
  for (const it of got) {
    assert.ok(validateItem(it).ok);
    assert.equal(it.rarity, 'relic');
    assert.equal(it.special.id, RELIC_INDEX[it.relic].signature);
    assert.ok(p.inventory[it.uid] && p.relics.earned[it.relic]);
    assert.ok(p.discovery.parts[it.base]);
  }
  assert.equal(checkRelics(p).length, 0, 'never twice');
  const st = relicStatus(p);
  assert.ok(st.every((s) => s.earned && s.owned));
  // a fresh save earns nothing; finishing chapter 3 earns exactly the Ember Crown
  const q = newProfile(12);
  assert.equal(checkRelics(q).length, 0);
  q.story.completed.push('ch3');
  assert.deepEqual(checkRelics(q).map((i) => i.relic), ['emberCrown']);
});

test('an earned relic that went missing can be recast once, for its cost', () => {
  const p = rich(newProfile(13));
  p.story.completed.push('ch3');
  const [it] = checkRelics(p);
  assert.equal(recastRelic(p, 'emberCrown', WS).ok, false, 'still owned');
  assert.equal(recastRelic(p, 'zeroPointCore', WS).ok, false, 'not earned');
  delete p.inventory[it.uid];
  const cr = p.currency.credits, rf = p.materials.relicFragment;
  const r = recastRelic(p, 'emberCrown', WS);
  assert.ok(r.ok, r.reason);
  assert.equal(p.currency.credits, cr - RECAST_COST.credits);
  assert.equal(p.materials.relicFragment, rf - RECAST_COST.relicFragment);
  assert.ok(Object.values(p.inventory).some((x) => x.relic === 'emberCrown'));
  assert.equal(recastRelic(p, 'emberCrown', WS).ok, false);
});

test('imprints: dismantling keeps a trait at 90%, engraving follows the item rules and caps strength', () => {
  const p = rich(newProfile(14));
  p.loadouts = [];
  const mk = (base, rarity, traits) => { const it = createItem({ base, rarity, level: 10, seed: 7, traits, special: null, set: null }); p.inventory[it.uid] = it; return it; };
  const donor = mk('ring_galefang', 'mythic', [{ id: 'deepHooks', mag: 0.95 }, { id: 'honedEdge', mag: 0.8 }]);
  const r = WS.dismantle(p, donor.uid, { imprint: 0 });
  assert.ok(r.ok && r.imprint);
  assert.deepEqual(p.imprints.map((i) => [i.id, i.mag]), [['deepHooks', 0.855]]);
  // undo brings the part back and takes the imprint away
  assert.ok(WS.undo(p).ok);
  assert.ok(p.inventory[donor.uid]);
  assert.equal(p.imprints.length, 0);
  assert.ok(WS.dismantle(p, donor.uid, { imprint: 0 }).ok);
  // an engraved imprint can't be undone back into its part (no free copies)
  const probe = mk('ring_starlance', 'epic', [{ id: 'polished', mag: 0.5 }]);
  p.imprints.unshift({ id: 'springSteel', mag: 0.5, from: 'probe', src: 'none' });
  assert.ok(WS.dismantle(p, probe.uid, { imprint: 0 }).ok);
  const host = mk('ring_galefang', 'legendary', []);
  assert.ok(WS.engrave(p, p.imprints.findIndex((i) => i.src === probe.uid), host.uid).ok);
  assert.equal(WS.undo(p).ok, false, 'undo after engraving is refused');
  assert.ok(!p.inventory[probe.uid]);
  p.imprints = p.imprints.filter((i) => i.id === 'deepHooks');
  // wrong slot (deep hooks fit rings and aux parts), then a rare ring: capped at rare's max magnitude
  const tip = mk('tip_needle', 'mythic', []);
  assert.equal(WS.engrave(p, 0, tip.uid).ok, false);
  const ring = mk('ring_cometarc', 'rare', [{ id: 'polished', mag: 0.5 }]);
  const e = WS.engrave(p, 0, ring.uid);
  assert.ok(e.ok, e.reason);
  assert.equal(ring.traits[1].id, 'deepHooks');
  assert.equal(ring.traits[1].mag, 0.72); // rare caps at 0.72
  assert.equal(p.imprints.length, 0, 'used up');
  assert.ok(validateItem(ring).ok);
  // full item: needs a replacement; same trait twice or a group clash is refused
  p.imprints.push({ id: 'counterweight', mag: 0.6, from: 'x' }, { id: 'deepHooks', mag: 0.6, from: 'y' });
  assert.equal(WS.engrave(p, 0, ring.uid).ok, false, 'no free slot');
  assert.equal(WS.engrave(p, 1, ring.uid, 0).ok, false, 'already has deep hooks');
  const heavy = mk('ring_bastion', 'legendary', [{ id: 'featherweight', mag: 0.6 }]);
  assert.equal(WS.engrave(p, 0, heavy.uid).ok, false, 'mass group clash');
  assert.ok(WS.engrave(p, 0, heavy.uid, 0).ok, 'replacing the clashing trait works');
  assert.ok(validateItem(heavy).ok);
  // the case holds IMPRINT_CAP
  p.imprints = Array.from({ length: WS.IMPRINT_CAP }, () => ({ id: 'polished', mag: 0.5, from: 'z' }));
  const extra = mk('ring_galefang', 'epic', [{ id: 'honedEdge', mag: 0.5 }]);
  assert.equal(WS.dismantle(p, extra.uid, { imprint: 0 }).ok, false);
  assert.ok(WS.discardImprint(p, 0).ok);
  assert.ok(WS.dismantle(p, extra.uid, { imprint: 0 }).ok);
});

test('spare copies of a part train its mastery', () => {
  const p = newProfile(15);
  p.loadouts = [];
  p.inventory = {};
  const mk = (base, rarity, xp = 0) => { const it = createItem({ base, rarity, level: 5, seed: 3, noTraits: true, set: null, special: null }); it.xp = xp; p.inventory[it.uid] = it; return it; };
  const a = mk('tip_needle', 'common');
  const b = mk('tip_needle', 'epic', 800);
  const c = mk('tip_flatstrike', 'common');
  assert.deepEqual(WS.duplicatesOf(p, a).map((x) => x.uid), [b.uid]);
  assert.equal(WS.trainWithDuplicate(p, a.uid, c.uid).ok, false, 'different part');
  const gain = WS.trainGain(b);
  assert.equal(gain, 200 + 150 * 3 + 400);
  const r = WS.trainWithDuplicate(p, a.uid, b.uid);
  assert.ok(r.ok && r.xp === gain && a.xp === gain && !p.inventory[b.uid]);
  assert.ok(r.rankUp, 'Unfamiliar to Acquainted');
  assert.ok(WS.undo(p).ok);
  assert.ok(p.inventory[b.uid] && a.xp === 0);
  a.xp = MASTERY_CAP - 10;
  assert.ok(WS.trainWithDuplicate(p, a.uid, b.uid).ok);
  assert.equal(a.xp, MASTERY_CAP, 'capped at Masterwork');
});

test('journal: counts leave relic signatures out, milestones pay once, every part says where to look', () => {
  const p = veteran();
  checkRelics(p);
  const c = journalCounts(p);
  assert.equal(c.traits.of, TRAITS.filter((t) => !t.relic).length);
  assert.equal(c.relics.have, RELICS.length);
  const ready = milestoneStatus(p).filter((s) => s.done);
  assert.ok(ready.some((s) => s.def.id === 'relicAll') && ready.some((s) => s.def.id === 'traits60'));
  const cr = p.currency.credits;
  assert.ok(claimMilestone(p, 'relicAll').ok);
  assert.equal(p.currency.credits, cr + 6000);
  assert.equal(claimMilestone(p, 'relicAll').ok, false, 'only once');
  assert.equal(claimMilestone(newProfile(1), 'relic1').ok, false, 'not reached');
  for (const b of [...Object.values(PART_INDEX), ...Object.values(LAUNCHER_INDEX), ...Object.values(CABLE_INDEX)]) assert.ok(partSources(b.id).length >= 1, b.id);
});

test('relic forge: a relic resolves past its base part and keeps its model geometry', async () => {
  const { resolvePart } = await import('../src/systems/assembly.js');
  const { resolveLaunchGear } = await import('../src/game/launch.js');
  const { RELIC_FORGE } = await import('../src/data/relics.js');
  const p = newProfile(3);
  const GEO = ['rIn', 'rOut', 'rBase', 'blades', 'bladeWidth', 'thickness', 'slope', 'radius', 'height', 'length', 'bodyRadius', 'ballRadius', 'mount', 'layer', 'ringRadius'];
  for (const def of RELICS) {
    const forge = RELIC_FORGE[def.id];
    if (!forge) continue;
    if (def.slot !== 'launcher' && def.slot !== 'cable') for (const k of GEO) assert.ok(!(k in forge), `${def.id} forge must not change geometry (${k})`);
    const it = createRelicItem(p, def.id);
    if (def.slot === 'launcher' || def.slot === 'cable') {
      const g = resolveLaunchGear(def.slot === 'launcher' ? it : null, def.slot === 'cable' ? it : null);
      const got = def.slot === 'launcher' ? g.launcher : g.cable;
      for (const [k, v] of Object.entries(forge)) assert.deepEqual(got[k], v, `${def.id}.${k}`);
    } else {
      const r = resolvePart(it);
      assert.equal(r.id, def.base);
      for (const k of Object.keys(forge)) if (typeof forge[k] === 'number') assert.notEqual(r[k], baseDef(def.base)[k], `${def.id}.${k} forged`);
    }
  }
  // the Ember Crown is forged past every rare-grade attack ring's base stats where it matters
  const ember = resolvePart(createRelicItem(p, 'emberCrown'));
  assert.ok(ember.mass >= 18 && ember.catch >= 0.75);
});
