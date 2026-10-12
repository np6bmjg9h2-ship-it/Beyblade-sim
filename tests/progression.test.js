// Equipment, loot, traits, sets, durability, XP, workshop and save tests,
// including the Milestone 4 acceptance flow:
// win -> loot a unique item -> equip -> level -> damage -> repair -> save -> reload -> identity intact.

import test from 'node:test';
import { regenerate } from '../src/systems/itemGen.js';
import assert from 'node:assert/strict';
import { newProfile, normalizeProfile } from '../src/systems/profile.js';
import { SaveManager, migrate, validate } from '../src/systems/save.js';
import { createItem } from '../src/systems/items.js';
import { rollLoot, addItem, rarityWeights } from '../src/systems/loot.js';
import { processMatch } from '../src/systems/progression.js';
import { buildParticipant, validateLoadout } from '../src/systems/loadout.js';
import * as WS from '../src/systems/workshop.js';
import { Battle } from '../src/game/battle.js';
import { ARCHETYPE_INDEX, participantFromDef } from '../src/data/opponents.js';
import { TRAITS, TRAIT_INDEX } from '../src/data/traits.js';
import { assembleTop, resolvePart } from '../src/systems/assembly.js';
import { PART_INDEX } from '../src/data/parts.js';
import { resolveLaunchGear } from '../src/game/launch.js';
import { ModifierStack, collectTraitSources } from '../src/systems/modifiers.js';
import { defaultMods } from '../src/physics/topBody.js';
import { setSources, activeSetBonuses } from '../src/data/sets.js';
import { rarityRank } from '../src/data/rarity.js';

function playerBattle(profile, seed, oppId = 'all') {
  const L = profile.loadouts[0];
  const me = buildParticipant(profile, L, { id: 'player' });
  me.human = false; me.ai = 'balanced'; // AI drives the player's equipment in headless tests
  const opp = participantFromDef(ARCHETYPE_INDEX[oppId], { difficulty: 0.6, id: 'cpu' });
  const battle = new Battle({ arenaId: 'standard', format: 'bo3', seed, participants: [me, opp] });
  const result = battle.runHeadless();
  result.fighters[0].human = true;
  return { battle, result };
}

test('Milestone 4 acceptance: loot, equip, level, damage, repair, save and reload keep item identity', async () => {
  const profile = newProfile(12345);
  // 1. win battles until a loot item drops (guaranteed loot session)
  let looted = null, battle, result;
  for (let i = 0; i < 6 && !looted; i++) {
    ({ battle, result } = playerBattle(profile, 900 + i));
    const rw = processMatch(profile, result, { mode: 'quick', title: 'Test', loot: { label: 'test', tier: 2, guaranteed: true, slots: ['ring'] } }, battle);
    assert.ok(rw.playerXp > 0 && rw.credits > 0, 'rewards granted');
    looted = rw.items[0] || null;
  }
  assert.ok(looted, 'a unique item dropped');
  assert.ok(profile.inventory[looted.uid], 'item stored by unique id');
  // 2. equip it (ring slot) and check the loadout is still valid
  const L = profile.loadouts[0];
  const prevRing = L.parts.ring;
  WS.equip(profile, 0, 'ring', looted.uid);
  let v = validateLoadout(profile, L);
  if (!v.ok) { WS.equip(profile, 0, 'ring', prevRing); WS.equip(profile, 0, 'core', Object.values(profile.inventory).find((x) => x.base === 'core_quad').uid); WS.equip(profile, 0, 'ring', looted.uid); v = validateLoadout(profile, L); }
  assert.ok(v.ok, 'loadout valid with new ring: ' + v.errors.join(' '));
  // 3. level it and damage it through real battles
  const xp0 = looted.xp, dur0 = looted.durability, battles0 = looted.history.battles;
  for (let i = 0; i < 2; i++) {
    ({ battle, result } = playerBattle(profile, 1000 + i, i ? 'striker' : 'wall'));
    processMatch(profile, result, { mode: 'quick', title: 'Test', loot: null }, battle);
  }
  const item = profile.inventory[looted.uid];
  assert.ok(item.xp > xp0, 'item gained XP');
  assert.ok(item.durability < dur0, 'item took wear');
  assert.equal(item.history.battles, battles0 + 2, 'item history tracked');
  // 4. repair it (fund the repair)
  profile.currency.credits += 5000; profile.materials.scrap += 50; profile.materials.polymer += 10; profile.materials.alloy += 10;
  const r = WS.repair(profile, item.uid);
  assert.ok(r.ok, 'repair succeeded: ' + r.reason);
  assert.equal(item.durability, item.maxDurability);
  // 5. save, reload, verify identity
  const saves = await SaveManager.create({ memory: true });
  await saves.save('slot1', profile);
  const loaded = await saves.load('slot1');
  assert.ok(loaded.ok);
  const again = loaded.data.inventory[item.uid];
  assert.ok(again, 'item present after reload');
  for (const k of ['uid', 'base', 'rarity', 'level', 'seed', 'xp', 'durability', 'maxDurability']) assert.deepEqual(again[k], item[k], k);
  assert.deepEqual(again.traits, item.traits);
  assert.deepEqual(again.history.battles, item.history.battles);
  assert.equal(loaded.data.loadouts[0].parts.ring, item.uid, 'still equipped');
});

test('loot is deterministic per seed and higher tiers yield rarer items', () => {
  const a = newProfile(777), b = newProfile(777);
  const ia = rollLoot(a, { label: 'x', tier: 2 }), ib = rollLoot(b, { label: 'x', tier: 2 });
  assert.deepEqual({ ...ia, uid: 0, history: 0 }, { ...ib, uid: 0, history: 0 });
  const rareShare = (tier) => {
    const w = rarityWeights(tier);
    const tot = w.reduce((s, x) => s + x.weight, 0);
    return w.filter((x) => rarityRank(x.id) >= 2).reduce((s, x) => s + x.weight, 0) / tot;
  };
  assert.ok(rareShare(4) > rareShare(2) && rareShare(2) > rareShare(0));
  // recreating from the recorded seed and generation version reproduces the item
  const re = regenerate(ia);
  assert.deepEqual({ ...re, history: 0 }, { ...ia, history: 0 });
});

test('rarity sets trait count; exclusive groups never co-occur', () => {
  for (let i = 0; i < 400; i++) {
    const rarity = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'relic'][i % 7];
    const base = ['ring_galefang', 'tip_needle', 'disc_ten', 'lock_click3', 'core_helix', 'launcher_spark', 'cable_standard'][i % 7];
    const it = createItem({ base, rarity, level: 10, seed: i * 31 });
    const groups = it.traits.map((t) => TRAIT_INDEX[t.id].group).filter(Boolean);
    assert.equal(new Set(groups).size, groups.length, 'no duplicate exclusive groups');
    assert.equal(new Set(it.traits.map((t) => t.id)).size, it.traits.length, 'no duplicate traits');
    for (const t of it.traits) assert.ok(TRAIT_INDEX[t.id].slots.includes(it.slot), 'trait fits slot');
  }
});

test('every trait has a measurable mechanical effect (no traits that do nothing)', () => {
  const slotBase = { ring: 'ring_galefang', core: 'core_helix', disc: 'disc_wide', lock: 'lock_click3', tip: 'tip_flatstrike', aux: 'aux_wedge', launcher: 'launcher_spark', cable: 'cable_standard' };
  const ctxAll = { spinFrac: 0.5, oppSpinFrac: 0.6, speed: 0.3, rFrac: 0.5, oppRFrac: 0.5, approaching: false, time: 20, sinceCollision: 5, surfaceTag: 'standard', oppositeSpin: false, abilityActive: false };
  const condCtx = (c) => {
    const x = { ...ctxAll };
    switch (c.type) {
      case 'opponentApproaching': x.approaching = true; break;
      case 'spinAbove': x.spinFrac = c.value + 0.1; break;
      case 'spinBelow': x.spinFrac = c.value - 0.05; break;
      case 'nearEdge': x.rFrac = 0.9; break;
      case 'opponentNearEdge': x.oppRFrac = 0.9; break;
      case 'center': x.rFrac = 0.1; break;
      case 'slowMoving': x.speed = 0.05; break;
      case 'fastMoving': x.speed = 0.9; break;
      case 'surface': x.surfaceTag = c.value[0]; break;
      case 'afterCollision': x.sinceCollision = 0.2; break;
      case 'oppositeSpin': x.oppositeSpin = true; break;
      default:
    }
    return x;
  };
  for (const t of TRAITS) {
    const slot = t.slots[0];
    const base = slotBase[slot];
    const plain = createItem({ base, rarity: 'relic', level: 10, seed: 1, traits: [], special: null, set: null, perfect: true });
    const withT = createItem({ base, rarity: 'relic', level: 10, seed: 1, traits: t.special ? [] : [{ id: t.id, mag: 0.8 }], special: t.special ? { id: t.id, mag: 1 } : null, set: null, perfect: true });
    let changed = false;
    if (t.kind === 'physical') {
      changed = JSON.stringify(resolvePart(plain)) !== JSON.stringify(resolvePart(withT));
    } else if (t.kind === 'conditional') {
      // traits that need a matching part get one (systems/effectSpec.js requirementsMet)
      const parts = t.requires ? Object.fromEntries(t.requires.map((q) => [q.slot, { wear: q.wear?.[0], role: q.role?.[0], id: q.base }])) : null;
      const mk = (it) => { const m = new ModifierStack(); for (const s of collectTraitSources([{ slot, item: it }], parts)) m.add(s); return m; };
      if (t.cond?.type === 'critical') withT.durability = 1;
      const a = mk(plain).evaluate(condCtx(t.cond || { type: 'always' }), defaultMods());
      const b = mk(withT).evaluate(condCtx(t.cond || { type: 'always' }), defaultMods());
      changed = JSON.stringify(a) !== JSON.stringify(b);
    } else if (t.kind === 'launch') {
      const gearA = slot === 'launcher' ? resolveLaunchGear(plain, null) : resolveLaunchGear(null, plain);
      const gearB = slot === 'launcher' ? resolveLaunchGear(withT, null) : resolveLaunchGear(null, withT);
      changed = JSON.stringify(gearA.mods) !== JSON.stringify(gearB.mods);
    } else if (t.kind === 'item') {
      changed = plain.maxDurability !== withT.maxDurability || JSON.stringify(t.item(0.8)).length > 2;
    } else if (t.kind === 'reactive') {
      // fired in battle by game/itemEffects.js (tests/itemEffects.test.js)
      const e = t.react(0.8).effect;
      changed = !!(e.deltas?.some(([, v]) => v !== 0) || e.spirit || e.stress || e.spin);
    } else if (t.kind === 'status') {
      changed = Object.values(t.status(0.8)).some((v) => v > 0);
    }
    assert.ok(changed, `trait ${t.id} (${t.kind}) changes something`);
  }
});

test('set bonuses activate at 2/3/5 pieces and feed modifier sources', () => {
  const items = ['ring_galefang', 'core_helix', 'disc_ten', 'tip_flatstrike', 'launcher_spark'].map((b, i) => createItem({ base: b, rarity: 'rare', seed: i, set: 'tempest' }));
  assert.equal(activeSetBonuses(items.slice(0, 1)).active.length, 0);
  assert.equal(activeSetBonuses(items.slice(0, 2)).active.length, 1);
  assert.equal(activeSetBonuses(items.slice(0, 3)).active.length, 2);
  assert.equal(activeSetBonuses(items).active.length, 3);
  const src = setSources(items);
  assert.ok(src.sources.length >= 3);
});

test('durability degrades physical properties; condition bands drive real changes', () => {
  const ring = createItem({ base: 'ring_galefang', rarity: 'common', seed: 5, perfect: true, traits: [] });
  const fresh = resolvePart(ring);
  ring.durability = ring.maxDurability * 0.1;
  const worn = resolvePart(ring);
  assert.ok(worn.faceAngle < fresh.faceAngle && worn.restitution < fresh.restitution && (worn.ecc || 0) > (fresh.ecc || 0));
  const lock = createItem({ base: 'lock_click3', rarity: 'common', seed: 6, perfect: true, traits: [] });
  const t0 = resolvePart(lock).threshold;
  lock.durability = 10;
  assert.ok(resolvePart(lock).threshold < t0, 'worn lock slips sooner');
  const tip = createItem({ base: 'tip_needle', rarity: 'common', seed: 7, perfect: true, traits: [] });
  const r0 = resolvePart(tip).ballRadius;
  tip.durability = 20;
  assert.ok(resolvePart(tip).ballRadius > r0, 'worn sharp tip blunts');
});

test('item XP has a mastery cap and repeated opponents give diminishing rewards', () => {
  const p = newProfile(42);
  const L = p.loadouts[0];
  const ring = p.inventory[L.parts.ring];
  ring.xp = 4990;
  const { battle, result } = playerBattle(p, 50);
  const rw1 = processMatch(p, result, { mode: 'quick', title: 'T', loot: null, opponentKey: 'same' }, battle);
  assert.equal(ring.xp, 5000, 'XP capped at Masterwork');
  assert.ok(rw1.research > 0, 'overflow converted to research');
  const r2 = playerBattle(p, 51);
  const rw2 = processMatch(p, r2.result, { mode: 'quick', title: 'T', loot: null, opponentKey: 'same' }, r2.battle);
  const r3 = playerBattle(p, 52);
  // the same result against a fresh opponent, for comparison (independent of who won)
  const fresh = processMatch(structuredClone(p), r3.result, { mode: 'quick', title: 'T', loot: null, opponentKey: 'fresh' }, r3.battle);
  const rw3 = processMatch(p, r3.result, { mode: 'quick', title: 'T', loot: null, opponentKey: 'same' }, r3.battle);
  assert.ok(rw2.notes.some((n) => n.includes('Repeated opponent')) && rw3.notes.some((n) => n.includes('Repeated opponent')), 'repetition penalty applied');
  assert.ok(rw3.playerXp < fresh.playerXp * 0.8, `farming the same opponent pays less (${rw3.playerXp} vs ${fresh.playerXp} XP)`);
});

test('workshop: repair, basic service, dismantle+undo, upgrades, reroll, transfer, crafting', () => {
  const p = newProfile(9);
  p.currency.credits = 100000; p.currency.research = 1000;
  Object.assign(p.materials, { scrap: 500, polymer: 200, alloy: 200, coreShard: 100, relicFragment: 10 });
  const it = createItem({ base: 'ring_galefang', rarity: 'epic', seed: 11 });
  addItem(p, it);
  it.durability = 10;
  assert.ok(WS.basicService(p, it.uid).ok);
  assert.equal(it.durability, it.maxDurability * 0.5);
  assert.ok(!WS.basicService(p, it.uid).ok, 'basic service only below 50%');
  assert.ok(WS.repair(p, it.uid).ok);
  assert.ok(it.maxDurability < it.baseMax || it.fatigue > 0, 'full repairs cause small fatigue');
  assert.ok(WS.restore(p, it.uid).ok && it.fatigue === 0);
  // upgrades with capacity
  assert.ok(WS.applyUpgrade(p, it.uid, 'ring_hone').ok);
  assert.ok(WS.applyUpgrade(p, it.uid, 'ring_balance').ok);
  assert.ok(!WS.applyUpgrade(p, it.uid, 'ring_reinforce').ok, 'capacity enforced');
  assert.ok(resolvePart(it).faceAngle > PART_INDEX.ring_galefang.faceAngle - 1.5, 'hone applied');
  // reroll keeps other traits
  const others = it.traits.slice(1).map((t) => t.id);
  const rr = WS.rerollTrait(p, it.uid, 0);
  assert.ok(rr.ok, rr.reason);
  assert.deepEqual(it.traits.slice(1).map((t) => t.id), others);
  // transfer consumes donor and reduces magnitude
  const donor = createItem({ base: 'ring_cyclonesaw', rarity: 'rare', seed: 12, traits: [{ id: 'streamlined', mag: 0.8 }] });
  const target = createItem({ base: 'ring_galefang', rarity: 'rare', seed: 13, traits: [] });
  addItem(p, donor); addItem(p, target);
  const tr = WS.transferTrait(p, donor.uid, 0, target.uid);
  assert.ok(tr.ok, tr.reason);
  assert.ok(!p.inventory[donor.uid] && target.traits[0].id === 'streamlined' && target.traits[0].mag < 0.8);
  // dismantle + undo
  const junk = createItem({ base: 'tip_needle', rarity: 'common', seed: 14 });
  addItem(p, junk);
  const scrap0 = p.materials.scrap;
  assert.ok(WS.dismantle(p, junk.uid).ok);
  assert.ok(p.materials.scrap > scrap0 && !p.inventory[junk.uid]);
  assert.ok(WS.undo(p).ok);
  assert.ok(p.inventory[junk.uid] && p.materials.scrap === scrap0, 'undo restores item and materials');
  // equipped items cannot be dismantled
  assert.ok(!WS.dismantle(p, p.loadouts[0].parts.ring).ok);
  // crafting requires discovery
  assert.ok(!WS.craftBlueprint(p, 'ring_starlance').ok);
  p.discovery.parts.ring_starlance = true;
  assert.ok(WS.craftBlueprint(p, 'ring_starlance').ok);
});

test('save schema: migration from v1, validation, backup recovery', async () => {
  const p = newProfile(3);
  const v1 = structuredClone(p);
  v1.version = 1;
  v1.settings = { volume: 0.5, quality: 'low' };
  delete v1.discovery;
  for (const L of v1.loadouts) delete L.technique;
  const { data, applied } = migrate(v1);
  assert.deepEqual(applied, [1, 2, 3]);
  assert.equal(validate(data).length, 0);
  const norm = normalizeProfile(data);
  assert.ok(norm.discovery && norm.loadouts.every((L) => L.technique));
  // v4: loot engine records
  assert.deepEqual(norm.discovery.synergies, {});
  assert.deepEqual(norm.seeds.pity, { epic: 0, legendary: 0 });
  assert.deepEqual(norm.quarantine, {});
  // an impossible item is quarantined (kept, unequipped), never silently deleted
  const bad = structuredClone(p);
  const ringUid = bad.loadouts[0].parts.ring;
  bad.inventory[ringUid].traits.push({ id: 'noSuchTrait', mag: 0.5 });
  const fixed = normalizeProfile(bad);
  assert.ok(!fixed.inventory[ringUid] && fixed.quarantine[ringUid]?.errors.some((e) => /noSuchTrait/.test(e)));
  assert.equal(fixed.loadouts[0].parts.ring, null);
  // corrupt main save -> backup restores
  const saves = await SaveManager.create({ memory: true });
  await saves.save('slot2', p);
  await saves.save('slot2', p); // creates backup
  await saves.store.set('slot2', { garbage: true });
  const r = await saves.load('slot2');
  assert.ok(r.ok && r.recovered, 'recovered from backup');
  // export/import round trip
  const text = saves.exportString(p);
  const imp = saves.importString(text);
  assert.equal(Object.keys(imp.inventory).length, Object.keys(p.inventory).length);
  assert.ok(!imp.importedFromNewer);
  // a save from a newer version loads, and says so (audit #9)
  const future = structuredClone(p);
  future.version = 99;
  assert.equal(migrate(structuredClone(future)).newer, 99);
  assert.equal(saves.importString(JSON.stringify(future)).importedFromNewer, 99);
  await saves.store.set('slot3', future);
  const rf = await saves.load('slot3');
  assert.ok(rf.ok && rf.newer === 99, 'newer save flagged on load');
});

test('starter loadouts are valid and assemble', () => {
  const p = newProfile(1);
  for (const L of p.loadouts) {
    const v = validateLoadout(p, L);
    assert.ok(v.ok, `${L.name}: ${v.errors.join(' ')}`);
    assert.ok(assembleTop(v.parts).spec.mass > 0.03);
  }
});
