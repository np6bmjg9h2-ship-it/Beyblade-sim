// Rift Run (roguelite mode): map generation, rewards, charms, forge, trader,
// talents, ending a run, and the battle effects (statuses, fusions, sweet
// spots, Second Wind) in real headless battles.

import test from 'node:test';
import assert from 'node:assert/strict';
import { newProfile, normalizeProfile } from '../src/systems/profile.js';
import { validateBuild } from '../src/systems/assembly.js';
import { Battle } from '../src/game/battle.js';
import { RIFT_ACTS, FLOORS_PER_ACT, FORGE_BONUS, HEARTS_BASE, START_SHARDS } from '../src/data/rift.js';
import { CHARMS, CHARM_INDEX } from '../src/data/riftCharms.js';
import { BOONS } from '../src/data/riftBoons.js';
import {
  startRun, riftState, currentChoices, completeNode, recordBattle, pickReward, maxHearts, finishRun, buyTalent,
  keepableParts, lockerSize, equipFromBag, generateAct, sendHome, homeBound, lockerChoices,
} from '../src/systems/rift.js';
import { riftParticipant, nodeOpponent, nodeRules, forgeSources, runEffects } from '../src/systems/riftBattle.js';
import { rollSpoils, fitsBuild, rollRunPart, runRng } from '../src/systems/riftLoot.js';
import { buy, traderStock, forgeJob, takeShrine, shrineOffers, campTune, eventAction } from '../src/systems/riftNodes.js';
import { participantFromDef, ARCHETYPE_INDEX } from '../src/data/opponents.js';

const strip = (run) => JSON.stringify(run.map);

function freshRun(seed = 1234, talents = {}) {
  const p = newProfile(77);
  Object.assign(riftState(p).talents, talents);
  const run = startRun(p, { loadoutIndex: 0, depth: 0, seed });
  return { p, run };
}

test('a run is generated from its seed: same seed, same map', () => {
  const a = freshRun(4242).run, b = freshRun(4242).run, c = freshRun(4243).run;
  assert.equal(strip(a), strip(b));
  assert.notEqual(strip(a), strip(c));
});

test('every act has three floors of 2-3 distinct nodes, the guaranteed stops and a rival boss', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const { run } = freshRun(seed);
    for (let a = 0; a < RIFT_ACTS.length; a++) {
      const A = generateAct(run, a);
      assert.equal(A.floors.length, FLOORS_PER_ACT);
      for (const fl of A.floors) {
        assert.ok(fl.length >= 2 && fl.length <= 3);
        assert.equal(new Set(fl.map((n) => n.type)).size, fl.length, 'no duplicate node types on a floor');
        assert.ok(!fl.some((n) => n.type === 'vault'), 'vaults need the Vault Key talent');
      }
      assert.ok(A.floors[0].some((n) => n.type === 'battle'));
      assert.ok(A.floors[1].some((n) => n.type === 'trader'));
      assert.ok(A.floors[2].some((n) => n.type === 'forge' || n.type === 'camp'));
      assert.equal(A.boss.type, 'boss');
      assert.ok(RIFT_ACTS[a].bosses.includes(A.boss.rival));
    }
  }
  const withKey = freshRun(9, { vault: 1 }).run;
  const types = [0, 1, 2, 3].flatMap((a) => generateAct(withKey, a).floors.flat().map((n) => n.type));
  assert.ok(types.includes('vault'), 'Vault Key makes vault nodes appear');
});

test('every part the Rift offers fits the current build', () => {
  const { p, run } = freshRun(31);
  const rng = runRng(run, 'test');
  for (let i = 0; i < 40; i++) {
    const it = rollRunPart(p, run, rng);
    assert.ok(it, 'a part is found');
    assert.ok(fitsBuild(p, run, it), `${it.base} fits`);
    assert.ok(validateBuild({ ...run.equipped, [it.slot]: it }, { spin: run.spin }).ok);
    assert.equal(it.origin, 'found');
    if (it.element) assert.equal(it.slot, 'ring', 'only rings carry an element');
  }
});

test('winning a battle pays shards and essence and opens the spoils', () => {
  const { p, run } = freshRun(5);
  const node = currentChoices(run).find((n) => n.type === 'battle');
  const res = recordBattle(p, run, node, { won: true, how: 'out' });
  assert.ok(res.shards > 0 && res.essence > 0);
  assert.equal(run.pending[0].kind, 'spoils');
  assert.equal(run.pending[0].options.length, 3);
  const s0 = run.shards;
  const skip = pickReward(p, run, null);
  assert.ok(skip.skipped && run.shards > s0, 'skipping the spoils pays a few shards');
});

test('losing costs a heart; a lost boss must be fought again; Second Wind saves one run', () => {
  const { p, run } = freshRun(6);
  const h0 = run.hearts;
  const node = currentChoices(run)[0];
  recordBattle(p, run, node, { won: false });
  assert.equal(run.hearts, h0 - 1);
  assert.equal(run.floor, 1, 'an ordinary lost node is passed without rewards');
  run.floor = FLOORS_PER_ACT;
  const boss = currentChoices(run)[0];
  recordBattle(p, run, boss, { won: false });
  assert.equal(run.floor, FLOORS_PER_ACT, 'still at the boss');
  run.hearts = 1;
  recordBattle(p, run, boss, { won: false });
  assert.equal(run.status, 'lost');

  const b = freshRun(7, { secondwind: 1 });
  b.run.hearts = 1;
  recordBattle(b.p, b.run, currentChoices(b.run)[0], { won: false });
  assert.equal(b.run.status, 'active');
  assert.equal(b.run.hearts, 1);
});

test('charms reach the battle participant: channels, statuses, enhancement and family resonance', () => {
  const { p, run } = freshRun(8);
  run.charms.push({ id: 'lockwax', enhanced: false }, { id: 'kindling', enhanced: false });
  let me = riftParticipant(p, run);
  const wax = me.modSources.find((s) => s.id.startsWith('rift:charm:lockwax'));
  assert.deepEqual(wax.deltas, [['burstThreshold', 0.1]]);
  assert.ok(Math.abs(me.rift.status.scorch - 0.12) < 1e-9);
  run.charms[0].enhanced = true;
  me = riftParticipant(p, run);
  assert.ok(Math.abs(me.modSources.find((s) => s.id.startsWith('rift:charm:lockwax')).deltas[0][1] - 0.16) < 1e-9, 'enhanced = x1.6');
  assert.ok(!me.modSources.some((s) => s.id.startsWith('rift:family:ember')));
  run.charms.push({ id: 'hotedge', enhanced: false }, { id: 'firebrand', enhanced: false });
  me = riftParticipant(p, run);
  assert.ok(Math.abs(me.rift.statusTime.scorch - (2 + 1)) < 1e-9, 'three ember charms: resonance adds 2 s on top of Firebrand');
  // every charm and boon produces a valid fx object
  for (const c of CHARMS) assert.equal(typeof c.desc(1), 'string');
  for (const b of BOONS) assert.equal(typeof b.desc(1, run.beast), 'string');
});

test('boons stack by level and the awakened boon unlocks the ultimate', () => {
  const { p, run } = freshRun(9);
  run.pending.push({ kind: 'boon', options: [{ type: 'boon', id: 'flow' }] });
  pickReward(p, run, 0);
  run.pending.push({ kind: 'boon', options: [{ type: 'boon', id: 'flow' }] });
  pickReward(p, run, 0);
  assert.equal(run.boons.flow, 2);
  assert.ok(Math.abs(riftParticipant(p, run).skillMods.spiritGain - 0.3) < 1e-9);
  assert.equal(riftParticipant(p, run).beast.awakened, false);
  run.boons.awakened = 1;
  assert.equal(riftParticipant(p, run).beast.awakened, true);
});

test('forge: upgrades cost shards, cap at +5 and become modifier channels; rings take elements', () => {
  const { p, run } = freshRun(10);
  const node = { id: 'forge-test', type: 'forge' };
  run.shards = 1000;
  const ring = run.equipped.ring;
  const r1 = forgeJob(p, run, node, 'upgrade', ring.uid);
  assert.ok(r1.ok && ring.forge === 1 && run.shards === 1000 - r1.cost);
  const src = forgeSources(run).find((s) => s.id === 'rift:forge:ring');
  assert.deepEqual(src.deltas, FORGE_BONUS.ring.deltas(1));
  const r2 = forgeJob(p, run, node, 'infuse', run.equipped.tip.uid, { element: 'scorch' });
  assert.equal(r2.ok, false, 'only rings take an element');
  forgeJob(p, run, node, 'infuse', ring.uid, { element: 'static' });
  assert.equal(ring.element, 'static');
  assert.ok(riftParticipant(p, run).rift.status.static >= 0.3);
  assert.equal(forgeJob(p, run, node, 'upgrade', ring.uid).ok, false, 'two jobs per forge');
  ring.forge = 5;
  assert.equal(forgeJob(p, run, { id: 'f2' }, 'upgrade', ring.uid).ok, false, 'max +5');
});

test('trader: buying spends shards, sells once and respects full hearts', () => {
  const { p, run } = freshRun(11);
  const node = { id: 'trader-test', type: 'trader' };
  run.shards = 2000;
  const stock = traderStock(p, run, node);
  assert.ok(stock.length >= 3);
  const iPart = stock.findIndex((o) => o.type === 'part');
  const before = run.shards;
  assert.ok(buy(p, run, node, iPart).ok);
  assert.equal(run.shards, before - stock[iPart].price);
  assert.equal(buy(p, run, node, iPart).ok, false, 'sold out');
  const iHeart = stock.findIndex((o) => o.type === 'heart');
  assert.equal(run.hearts, maxHearts(p, run));
  assert.equal(buy(p, run, node, iHeart).ok, false, 'hearts already full');
});

test('shrine, camp and events change the run as described', () => {
  const { p, run } = freshRun(12);
  run.shards = 500;
  const shrine = { id: 'shrine-test', type: 'shrine' };
  const offers = shrineOffers(p, run, shrine);
  assert.ok(offers.length >= 2);
  const curse = offers.find((o) => o.id === 'curse');
  if (curse) {
    const s0 = run.shards;
    assert.ok(takeShrine(p, run, shrine, 'curse').ok);
    assert.equal(run.shards, s0 + 120);
    assert.equal(CHARM_INDEX[run.charms.at(-1).id].rarity, 'cursed');
  }
  const camp = { id: 'camp-test', type: 'camp' };
  assert.ok(campTune(p, run, camp, run.equipped.tip.uid).ok);
  assert.equal(run.equipped.tip.forge, 1);
  assert.equal(campTune(p, run, camp, run.equipped.tip.uid).ok, false, 'one rest per camp');
  run.hearts = 1;
  assert.ok(eventAction(p, run, { id: 'ev', type: 'event', event: 'spring' }, 'drink').healed === 1);
});

test('a finished run banks essence, unlocks the next depth, pays the career and keeps only found parts', () => {
  const { p, run } = freshRun(13);
  const found = rollRunPart(p, run, runRng(run, 't'));
  run.bag.push(found);
  run.essence = 50;
  run.stats.wins = 10; run.stats.bosses = 4;
  run.status = 'won';
  const cr0 = p.currency.credits, inv0 = Object.keys(p.inventory).length;
  assert.equal(lockerSize(p), 1);
  assert.equal(keepableParts(run).length, 1, 'starter copies cannot be kept');
  const out = finishRun(p, run, { keep: [found.uid, run.equipped.ring.uid] });
  const R = riftState(p);
  assert.ok(out.essence > 50 && R.essence === out.essence, 'clear bonus added');
  assert.equal(R.depthUnlocked, 1);
  assert.equal(R.clears, 1);
  assert.ok(p.currency.credits > cr0);
  assert.equal(Object.keys(p.inventory).length, inv0 + 1);
  const kept = out.kept[0];
  assert.equal(kept.base, found.base);
  assert.ok(!('forge' in kept) && !('element' in kept) && !('origin' in kept));
  assert.equal(R.active, null);
});

test('loot is the grind: a beaten boss secures finds, secured parts come home on a loss, a clear brings everything', () => {
  const { p, run } = freshRun(21);
  const a = rollRunPart(p, run, runRng(run, 'a')), b = rollRunPart(p, run, runRng(run, 'b'));
  run.bag.push(a, b);
  // walk to the end of the first Rift: the boss is beaten, finds are secured
  run.floor = FLOORS_PER_ACT; run.current = run.map[0].boss.id;
  completeNode(p, run);
  assert.equal(run.act, 1);
  assert.equal(run.lastSecured, 2);
  assert.ok(a.secured && b.secured);
  assert.equal(sendHome(run, a.uid).ok, true, 'secured parts can be sent home');
  assert.equal(run.bag.length, 1, 'which frees the bag slot');
  const c = rollRunPart(p, run, runRng(run, 'c'));
  run.bag.push(c);
  assert.equal(sendHome(run, c.uid).ok, false, 'unsecured parts cannot');
  assert.deepEqual(lockerChoices(run).map((x) => x.uid), [c.uid]);
  assert.deepEqual(homeBound(run).map((x) => x.uid).sort(), [a.uid, b.uid].sort());
  // the run is lost: secured + stashed parts come home, plus one Locker pick
  run.status = 'lost';
  const inv0 = Object.keys(p.inventory).length;
  const out = finishRun(p, run, { keep: [c.uid] });
  assert.equal(out.kept.length, 3);
  assert.equal(Object.keys(p.inventory).length, inv0 + 3);
  assert.ok(out.kept.every((x) => !('secured' in x)));
  // a cleared run brings every find home, Locker or not
  const fresh = freshRun(22);
  const d = rollRunPart(fresh.p, fresh.run, runRng(fresh.run, 'd')), e = rollRunPart(fresh.p, fresh.run, runRng(fresh.run, 'e'));
  fresh.run.bag.push(d, e);
  fresh.run.status = 'won';
  assert.equal(finishRun(fresh.p, fresh.run, { keep: [] }).kept.length, 2);
});

test('talents cost essence and shape the next run', () => {
  const p = newProfile(3);
  const R = riftState(p);
  assert.equal(buyTalent(p, 'grit').ok, false);
  R.essence = 500;
  assert.ok(buyTalent(p, 'grit').ok);
  assert.ok(buyTalent(p, 'pockets').ok);
  const run = startRun(p, { loadoutIndex: 0, seed: 5 });
  assert.equal(run.hearts, HEARTS_BASE + 1);
  assert.equal(run.shards, START_SHARDS + 25);
  assert.ok(R.essence < 500);
});

test('old saves get the Rift defaults', () => {
  const p = newProfile(1);
  delete p.rift;
  normalizeProfile(p);
  assert.equal(p.rift.essence, 0);
  assert.equal(p.rift.active, null);
});

test('swapping a found part in keeps the build valid', () => {
  const { p, run } = freshRun(14);
  const it = rollRunPart(p, run, runRng(run, 'swap'));
  run.bag.push(it);
  const old = run.equipped[it.slot];
  const r = equipFromBag(run, it.uid, (b) => validateBuild(b, { spin: run.spin }));
  assert.ok(r.ok);
  assert.equal(run.equipped[it.slot].uid, it.uid);
  if (old) assert.ok(run.bag.some((x) => x.uid === old.uid));
});

// ---------------------------------------------------------------- battle effects

function effectBattle(rift, seed = 3, extra = {}, [ia, ib] = ['striker', 'wall']) {
  const a = participantFromDef(ARCHETYPE_INDEX[ia], { difficulty: 1, id: 'A' });
  const b = participantFromDef(ARCHETYPE_INDEX[ib], { difficulty: 1, id: 'B' });
  a.rift = rift;
  const battle = new Battle({ arenaId: 'vortex', format: 'single', seed, participants: [a, b], rules: { durability: false, slowmo: false }, roundTime: 60, ...extra });
  const events = [];
  for (const t of ['riftStatus', 'riftFusion', 'sweetSpot', 'meltdownHit', 'secondWind', 'impact']) battle.on(t, (e) => events.push({ type: t, e }));
  const result = battle.runHeadless();
  return { battle, result, events };
}

test('hits inflict statuses as timed modifier channels, deterministically', () => {
  const r1 = effectBattle({ status: { scorch: 1 } }, 11);
  const impacts = r1.events.filter((x) => x.type === 'impact' && x.e.impulse >= 0.008).length;
  const st = r1.events.filter((x) => x.type === 'riftStatus');
  assert.ok(impacts > 0, 'the tops collided');
  assert.ok(st.length > 0, 'Scorch was inflicted');
  assert.ok(st.every((x) => x.e.status === 'scorch' && x.e.fighter.index === 1));
  const r2 = effectBattle({ status: { scorch: 1 } }, 11);
  assert.equal(r2.result.rounds[0].time, r1.result.rounds[0].time, 'same seed, same battle');
  assert.equal(r2.events.filter((x) => x.type === 'riftStatus').length, st.length);
});

test('two different statuses fuse', () => {
  let fused = 0;
  for (const seed of [21, 22, 23]) fused += effectBattle({ status: { scorch: 1, rust: 1 } }, seed).events.filter((x) => x.type === 'riftFusion').length;
  assert.ok(fused > 0, 'Scorch + Rust fuse into Meltdown');
});

test('sweet spots land and shatter locks faster', () => {
  let sweet = 0, bursts = 0;
  for (const seed of [31, 32, 33]) {
    const r = effectBattle({ sweet: 0.9 }, seed);
    sweet += r.events.filter((x) => x.type === 'sweetSpot').length;
    bursts += r.result.rounds.filter((x) => x.how === 'burst').length;
  }
  assert.ok(sweet > 0, 'sweet spots landed');
  assert.ok(bursts > 0, 'double lock stress shatters the wall');
});

test('Second Wind restores spin once per round when the top runs low', () => {
  let wind = 0;
  for (const seed of [31, 34, 35]) {
    const w = effectBattle({ secondWind: 0.3 }, seed, { roundTime: 120 }, ['all', 'drifter']).events.filter((x) => x.type === 'secondWind');
    assert.ok(w.length <= 1);
    if (w.length) assert.ok(w[0].e.energy > 0);
    wind += w.length;
  }
  assert.ok(wind > 0, 'Second Wind fired');
});

test('a Rift run plays through two acts headless', () => {
  const { p, run } = freshRun(2025);
  let guard = 0;
  while (run.status === 'active' && run.act < 2 && guard++ < 40) {
    while (run.pending.length) {
      const step = run.pending[0];
      const i = step.options.findIndex((o) => o.type !== 'part') >= 0 ? step.options.findIndex((o) => o.type !== 'part') : 0;
      const r = pickReward(p, run, i);
      if (!r.ok) pickReward(p, run, null);
    }
    const choices = currentChoices(run);
    const node = choices.find((n) => ['battle', 'elite', 'boss'].includes(n.type)) || choices[0];
    run.current = node.id;
    if (['battle', 'elite', 'vault', 'boss'].includes(node.type)) {
      const me = riftParticipant(p, run);
      me.human = false; me.ai = 'balanced'; me.difficulty = 1;
      const opp = nodeOpponent(p, run, node);
      const battle = new Battle({ arenaId: node.arena, format: node.type === 'boss' ? 'bo3' : 'single', seed: node.seed, participants: [me, opp], rules: nodeRules(node), roundTime: 25 });
      const res = battle.runHeadless();
      recordBattle(p, run, node, { won: res.winner === 0, how: res.rounds.at(-1)?.how });
      if (node.type !== 'boss' || res.winner === 0) { if (run.current) completeNode(p, run); }
    } else completeNode(p, run);
  }
  assert.ok(guard < 40, 'the run kept moving');
  assert.ok(run.stats.battles >= 4, 'battles were fought');
  assert.ok(run.status !== 'active' || run.act >= 2);
  assert.ok(runEffects(p, run));
});
