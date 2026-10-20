// Rift keystone legendaries: Rust Prophet, Tideturner, Hollow Core, Last Stand.
// Data and loot filters, how each one builds into the participant, what it
// does in a headless battle, and that the same seed gives the same battle.

import test from 'node:test';
import assert from 'node:assert/strict';
import { newProfile } from '../src/systems/profile.js';
import { Battle } from '../src/game/battle.js';
import { Simulation } from '../src/physics/simulation.js';
import { CHARMS, CHARM_INDEX, KEYSTONES, KEYSTONE, isKeystone } from '../src/data/riftCharms.js';
import { CHANNEL_LIMITS, CONDITIONS } from '../src/data/channels.js';
import { startRun, riftState } from '../src/systems/rift.js';
import { combineFx, runEffects, riftParticipant } from '../src/systems/riftBattle.js';
import { rollCharm, rollCharms, runRng } from '../src/systems/riftLoot.js';
import { participantFromDef, ARCHETYPE_INDEX } from '../src/data/opponents.js';

const IDS = ['rustprophet', 'tideturner', 'hollowcore', 'laststand'];

function freshRun(seed = 1234) {
  const p = newProfile(77);
  riftState(p);
  const run = startRun(p, { loadoutIndex: 0, depth: 0, seed });
  return { p, run };
}

// The rift block exactly as riftParticipant builds it, for a list of charm ids.
function riftBlockOf(ids, hearts = 3) {
  const fx = combineFx(ids.map((id) => ({ src: 'charm:' + id, name: CHARM_INDEX[id].name, fx: CHARM_INDEX[id].fx(1, { hearts }) })));
  return { fx, rift: { status: fx.status, statusPower: fx.statusPower, statusTime: fx.statusTime, sweet: fx.sweet, sweetMul: fx.sweetMul, sweetSpirit: fx.sweetSpirit, secondWind: fx.secondWind, keystones: fx.keystones } };
}

function keystoneBattle(ids, seed, { hearts = 3, roundTime = 60, pair = ['striker', 'wall'], rift = {}, format = 'single' } = {}) {
  const a = participantFromDef(ARCHETYPE_INDEX[pair[0]], { difficulty: 1, id: 'A' });
  const b = participantFromDef(ARCHETYPE_INDEX[pair[1]], { difficulty: 1, id: 'B' });
  const { fx, rift: block } = riftBlockOf(ids, hearts);
  a.rift = { ...block, ...rift };
  a.modSources = [...(a.modSources || []), ...fx.mods];
  a.skillMods = { ...(a.skillMods || {}) };
  for (const [k, v] of Object.entries(fx.skill)) a.skillMods[k] = (a.skillMods[k] || 0) + v;
  const battle = new Battle({ arenaId: 'vortex', format, seed, participants: [a, b], rules: { durability: false, slowmo: false }, roundTime });
  const events = [];
  const samples = [];
  for (const t of ['keystone', 'riftStatus', 'sweetSpot', 'roundStart']) battle.on(t, (e) => {
    events.push({ type: t, e });
    if (t === 'keystone') samples.push({ id: e.id, time: battle.battleTime, frac: e.fighter.top.spinFraction(), mods: e.fighter.top.mods });
  });
  const result = battle.runHeadless();
  return { battle, result, events, samples, fx };
}

const sig = (r) => JSON.stringify({
  rounds: r.result.rounds.map((x) => [x.how, x.time]),
  ev: r.events.filter((x) => x.type !== 'roundStart').map((x) => [x.type, x.e.id || x.e.name || '', x.e.fighter?.index]),
});

const ks = (r, id) => r.events.filter((x) => x.type === 'keystone' && x.e.id === id);

// ---------------------------------------------------------------- data and loot

test('four keystone legendaries exist; the stat legendaries are unchanged', () => {
  assert.deepEqual(KEYSTONES.map((c) => c.id).sort(), IDS.slice().sort());
  for (const c of KEYSTONES) {
    assert.equal(c.rarity, 'legendary');
    assert.equal(isKeystone(c.id), true);
    assert.equal(typeof c.desc(1), 'string');
    assert.ok(c.desc(1).length > 20 && !/NaN|undefined/.test(c.desc(1)), c.desc(1));
  }
  const stat = CHARMS.filter((c) => c.rarity === 'legendary' && !c.keystone).map((c) => c.id);
  for (const id of ['phoenixcinder', 'stormheart', 'titanrivet', 'tidecaller', 'comettail', 'gamblersdie', 'spiritengine', 'crownofspoils']) assert.ok(stat.includes(id), id);
});

test('keystone fx use known channels and conditions inside their limits', () => {
  for (const c of KEYSTONES) {
    const fx = c.fx(1, { hearts: 1 });
    for (const m of fx.mods || []) {
      if (m.cond) assert.ok(CONDITIONS[m.cond.type], m.cond.type);
      for (const [ch, v] of m.deltas) {
        const L = CHANNEL_LIMITS[ch];
        assert.ok(L, ch);
        assert.ok(Number.isFinite(v));
        const val = L.type === 'mul' ? 1 + v : v;
        assert.ok(val >= L.min - 1e-9 && val <= L.max + 1e-9, `${c.id} ${ch} ${val}`);
      }
    }
    assert.ok(fx.keystone?.[c.id], `${c.id} carries its keystone payload`);
  }
});

test('ordinary charm rolls never offer keystones; the keystone option does', () => {
  const { run } = freshRun(5);
  for (let i = 0; i < 200; i++) {
    const rng = runRng(run, 'kt', i);
    assert.equal(isKeystone(rollCharm(run, rng, { rarities: ['legendary'] }).id), false);
    assert.equal(isKeystone(rollCharm(run, rng).id), false);
    assert.equal(isKeystone(rollCharm(run, rng, { keystone: true }).id), true);
  }
  const all = rollCharms(run, runRng(run, 'kt4'), 4, { keystone: true }).map((c) => c.id).sort();
  assert.deepEqual(all, IDS.slice().sort(), 'four distinct keystones');
  run.charms.push({ id: 'tideturner' });
  assert.equal(rollCharms(run, runRng(run, 'kt5'), 4, { keystone: true }).length, 3, 'a held keystone is not offered again');
  const any = new Set();
  for (let i = 0; i < 400; i++) any.add(rollCharm(run, runRng(run, 'any', i), { rarities: ['legendary'], keystone: 'any' }).id);
  assert.ok([...any].some(isKeystone) && [...any].some((id) => !isKeystone(id)));
  // same seed, same keystone offer
  const a = freshRun(9).run, b = freshRun(9).run;
  assert.deepEqual(rollCharms(a, runRng(a, 'boss'), 2, { keystone: true }), rollCharms(b, runRng(b, 'boss'), 2, { keystone: true }));
});

// ---------------------------------------------------------------- Last Stand

test('Last Stand reads the hearts when the participant is built', () => {
  const { p, run } = freshRun(11);
  run.charms = [{ id: 'laststand' }];
  run.hearts = 2;
  assert.equal(runEffects(p, run).keystones.laststand, undefined);
  assert.equal(riftParticipant(p, run).modSources.some((m) => m.id.startsWith('rift:charm:laststand')), false);
  run.hearts = 1;
  const me = riftParticipant(p, run);
  assert.equal(me.rift.keystones.laststand.name, 'Last Stand');
  const src = me.modSources.find((m) => m.id.startsWith('rift:charm:laststand'));
  assert.deepEqual(src.deltas, [['burstStressDealt', KEYSTONE.laststand.bonus], ['abilityPower', KEYSTONE.laststand.bonus], ['steerForce', KEYSTONE.laststand.bonus]]);
});

test('Last Stand: a notice every round, same seed same battle', () => {
  const r1 = keystoneBattle(['laststand'], 41, { hearts: 1, format: 'bo3', roundTime: 30 });
  const rounds = r1.events.filter((x) => x.type === 'roundStart').length;
  assert.equal(ks(r1, 'laststand').length, rounds, 'one notice per round');
  assert.ok(r1.samples.every((s) => s.mods.burstStressDealt > 1.2 && s.mods.steerForce > 1.2));
  const r2 = keystoneBattle(['laststand'], 41, { hearts: 1, format: 'bo3', roundTime: 30 });
  assert.equal(sig(r2), sig(r1));
  assert.equal(ks(keystoneBattle(['laststand'], 41, { hearts: 2, roundTime: 30 }), 'laststand').length, 0, 'no notice above one heart');
});

// ---------------------------------------------------------------- Rust Prophet

test('Rust Prophet stacks Rust to 3 and drops the lock 40%, deterministically', () => {
  let full = null;
  for (const seed of [21, 22, 23, 24, 25]) {
    const r = keystoneBattle(['rustprophet'], seed, { rift: { status: { rust: 1 } } });
    const names = r.events.filter((x) => x.type === 'riftStatus').map((x) => x.e.name);
    assert.ok(names.every((n) => /^Rust( ×[23])?$/.test(n)), names.join());
    if (ks(r, 'rustprophet').length) { full = { seed, r }; break; }
  }
  assert.ok(full, 'Rust reached three stacks');
  const def = full.r.battle.fighters[1];
  // the defender carried the full-stack Rust: lock at the channel floor
  assert.ok(full.r.events.some((x) => x.type === 'riftStatus' && x.e.name === 'Rust ×3' && x.e.fighter === def));
  const again = keystoneBattle(['rustprophet'], full.seed, { rift: { status: { rust: 1 } } });
  assert.equal(sig(again), sig(full.r));
});

test('Rust Prophet full stack sets lock strength to -40% on the target', () => {
  const r = keystoneBattle(['rustprophet'], 21, { rift: { status: { rust: 1 } }, roundTime: 60 });
  const fx = r.battle.riftFx;
  const def = r.battle.fighters[1];
  // drive the stacks directly on the live state: three Rusts inside the 5 s window
  def.mods.removeTimed('rift:rust');
  delete fx.state[1].until.rust;
  for (let i = 0; i < 3; i++) fx.inflict(r.battle.fighters[0], def, 'rust');
  const t = def.mods.timed.find((x) => x.id === 'rift:rust');
  assert.equal(t.name, 'Rust ×3');
  assert.deepEqual(t.deltas.find(([ch]) => ch === 'burstThreshold'), ['burstThreshold', -KEYSTONE.rustprophet.lock]);
  fx.inflict(r.battle.fighters[0], def, 'rust');
  assert.equal(fx.state[1].rust, 3, 'capped at three');
});

// ---------------------------------------------------------------- Tideturner

test('Tideturner flips the drag below 35% spin, deterministically', () => {
  let hit = null;
  for (let seed = 31; seed < 61 && !hit; seed++) {
    const r = keystoneBattle(['tideturner'], seed, { roundTime: 120, pair: ['all', 'drifter'] });
    if (ks(r, 'tideturner').length) hit = { seed, r };
  }
  assert.ok(hit, 'spin dropped below 35% in some battle');
  assert.equal(ks(hit.r, 'tideturner').length, 1, 'once per round');
  const s = hit.r.samples.find((x) => x.id === 'tideturner');
  assert.ok(s.frac < KEYSTONE.tideturner.below);
  const again = keystoneBattle(['tideturner'], hit.seed, { roundTime: 120, pair: ['all', 'drifter'] });
  assert.equal(sig(again), sig(hit.r));
});

test('Tideturner drag: a price above 35% spin, the flip below', () => {
  const r = keystoneBattle(['tideturner'], 33, { roundTime: 1 });
  const me = r.battle.fighters[0];
  const ctx = (spinFrac) => ({ ...r.battle.conditionContext(me, r.battle.fighters[1]), spinFrac });
  const out = {};
  me.mods.evaluate(ctx(0.9), out);
  const hiTip = out.tipSpinDrag, hiAir = out.aeroDrag;
  me.mods.evaluate(ctx(0.2), out);
  assert.ok(out.tipSpinDrag < hiTip - 0.35 && out.aeroDrag < hiAir - 0.2, `${hiTip} -> ${out.tipSpinDrag}`);
  for (const v of [hiTip, hiAir, out.tipSpinDrag, out.aeroDrag]) assert.ok(Number.isFinite(v));
});

// ---------------------------------------------------------------- Hollow Core

test('Hollow Core: weaker launch, spin back on sweet spots, bounded and booked', () => {
  // spy on the simulation: every restore must book exactly its energy to the 'ability' ledger
  const orig = Simulation.prototype.restoreSpin;
  const booked = [];
  Simulation.prototype.restoreSpin = function (t, energy) {
    const before = t.ledger.ability;
    const e = orig.call(this, t, energy);
    booked.push({ e, d: t.ledger.ability - before });
    return e;
  };
  try { hollowCase(booked); } finally { Simulation.prototype.restoreSpin = orig; }
});

function hollowCase(booked) {
  const base = keystoneBattle([], 31, { rift: { sweet: 0.9 } });
  const r = keystoneBattle(['hollowcore'], 31, { rift: { sweet: 0.9 } });
  const launch = (x) => x.battle.fighters[0].top.maxSpinRate;
  assert.ok(launch(r) < launch(base), 'launches weaker');
  let total = 0;
  for (const seed of [31, 32, 33]) {
    const x = seed === 31 ? r : keystoneBattle(['hollowcore'], seed, { rift: { sweet: 0.9 } });
    const k = ks(x, 'hollowcore');
    assert.ok(k.length <= KEYSTONE.hollowcore.max);
    for (const e of k) assert.ok(e.e.energy > 0 && Number.isFinite(e.e.energy));
    for (const s of x.samples) assert.ok(s.frac <= 1 + 1e-9, 'never above launch spin');
    total += k.length;
  }
  assert.ok(total > 0, 'spin came back on a sweet spot');
  assert.ok(booked.length >= total);
  for (const b of booked) assert.ok(Math.abs(b.e - b.d) < 1e-12, 'ledger matches the restored energy');
  assert.equal(sig(keystoneBattle(['hollowcore'], 31, { rift: { sweet: 0.9 } })), sig(r));
}
