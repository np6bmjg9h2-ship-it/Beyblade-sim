// Display time is not simulation time: whatever dt pattern the screen feeds
// Battle.update (hit-stop freezes, jitter, zero-length frames), the fixed ticks
// are identical, so the state at an equal tick count is bit-identical.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle } from '../src/game/battle.js';
import { ARCHETYPE_INDEX, participantFromDef } from '../src/data/opponents.js';
import { Rng } from '../src/core/rng.js';
import { HitStop } from '../src/ui/hitStop.js';

const f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer);
function mix(h, x) {
  f64[0] = x;
  for (let i = 0; i < 2; i++) { h ^= u32[i]; h = Math.imul(h, 16777619) >>> 0; }
  return h;
}
function stateHash(b) {
  let h = 2166136261;
  for (const f of b.fighters) {
    const t = f.top;
    for (const v of [t.p, t.v, t.L, t.w]) { h = mix(h, v.x); h = mix(h, v.y); h = mix(h, v.z); }
    h = mix(h, t.q.x); h = mix(h, t.q.y); h = mix(h, t.q.z); h = mix(h, t.q.w);
  }
  return h.toString(16);
}

const CASES = [[11, 'standard', 'striker', 'all'], [23, 'vortex', 'drifter', 'wall'], [37, 'edgebreaker', 'breaker', 'counter']];
const TICKS = 1200; // 10 s of simulation at 120 Hz
const EVERY = 24;

function aiBattle([seed, arenaId, a, b]) {
  const bt = new Battle({ arenaId, format: 'single', seed, headless: true, roundTime: 60,
    participants: [participantFromDef(ARCHETYPE_INDEX[a], { difficulty: 1 }), participantFromDef(ARCHETYPE_INDEX[b], { difficulty: 1 })] });
  bt.headless = true;
  return bt;
}

// Play until `limit` ticks have run (or the match ends), fingerprinting the
// state on every EVERY-th tick, exactly as it happens inside update().
function run(c, dtAt, limit = TICKS) {
  const b = aiBattle(c);
  const hashes = new Map();
  const tick = b.tick.bind(b);
  let n = 0; // fixed ticks run (the simulation only exists once the tops spawn)
  b.tick = (...args) => {
    tick(...args);
    n++;
    if (n % EVERY === 0 && b.sim) hashes.set(n, stateHash(b));
  };
  let guard = 0, k = 0;
  while (b.phase !== 'matchOver' && n < limit && guard++ < 400000) {
    b.update(dtAt(k++), []);
    if (b.phase === 'roundOver') b.nextRound();
  }
  return { b, hashes, frames: k, n };
}

function hitStopLike() {
  // a freeze of 5 frames at 0.04x every 25 frames
  return (k) => (k % 25 < 5 ? (1 / 60) * 0.04 : 1 / 60);
}
function randomDt(seed) {
  const r = new Rng(seed);
  return () => 1 / 240 + r.next() * (1 / 20 - 1 / 240);
}
function randomWithZeros(seed) {
  const r = new Rng(seed);
  return () => (r.next() < 0.1 ? 0 : 1 / 240 + r.next() * (1 / 20 - 1 / 240));
}
function realHitStop() {
  // the real controller, hit by a heavy impact every 20 frames
  const h = new HitStop();
  return (k) => {
    if (k % 20 === 0) h.request(0.3);
    return (1 / 60) * h.step(1 / 60);
  };
}

const PATTERNS = {
  'hit-stop-like 0.04x for 5 frames': hitStopLike,
  'seeded random 1/240..1/20': () => randomDt(5),
  'random with occasional zero': () => randomWithZeros(9),
  'the real HitStop controller': realHitStop,
  '1/30 constant': () => () => 1 / 30,
  'a single long stall (0.1 s)': () => (k) => (k === 40 ? 0.1 : 1 / 60),
};

test('tick state is bit-identical at equal tick counts under very different dt patterns', () => {
  for (const c of CASES) {
    const ref = run(c, () => 1 / 60);
    // n counts every round's ticks (b.sim.tickCount restarts each round)
    assert.ok(ref.n >= EVERY * 5, `reference battle ran (${ref.n} ticks, seed ${c[0]})`);
    assert.ok(ref.hashes.size >= 5);
    for (const [name, make] of Object.entries(PATTERNS)) {
      const got = run(c, make());
      let compared = 0;
      for (const [n, h] of ref.hashes) {
        if (!got.hashes.has(n)) continue;
        compared++;
        assert.equal(got.hashes.get(n), h, `seed ${c[0]} / ${name}: state differs at tick ${n}`);
      }
      assert.ok(compared >= Math.min(ref.hashes.size, got.hashes.size) - 1, `${name}: shared checkpoints compared (${compared})`);
      assert.ok(compared >= 5, `${name}: enough checkpoints (${compared})`);
    }
  }
});

test('the freeze patterns really do change the frame/tick relationship', () => {
  const c = CASES[0];
  const plain = run(c, () => 1 / 60);
  const frozen = run(c, hitStopLike());
  assert.ok(frozen.frames > plain.frames, `more frames for the same ticks (${frozen.frames} vs ${plain.frames})`);
  const stall = run(c, (k) => (k === 40 ? 0.1 : 1 / 60));
  assert.ok(stall.hashes.size > 0);
});

test('battle time depends on ticks run, not on frames or dt', () => {
  const c = CASES[1];
  const a = run(c, () => 1 / 60, 600);
  const b = run(c, randomDt(77), 600);
  // both stopped at or just past 600 ticks; compare battleTime per tick
  const per = (x) => x.b.battleTime / Math.max(1, x.b.sim.tickCount);
  assert.ok(Math.abs(per(a) - per(b)) < 1e-6, `${per(a)} vs ${per(b)}`);
});

test('the final result of a full AI match does not depend on the dt pattern', () => {
  for (const c of CASES) {
    const out = (dtAt) => {
      const { b } = run(c, dtAt, Infinity);
      const r = b.result.rounds[0];
      return { how: r.how, winner: r.winner, time: +r.time.toFixed(3), ticks: b.sim.tickCount };
    };
    const ref = out(() => 1 / 60);
    for (const [name, make] of Object.entries(PATTERNS)) {
      assert.deepEqual(out(make()), ref, `seed ${c[0]} / ${name}`);
    }
  }
});

// -- replays ---------------------------------------------------------------

function recordedMatch(seed) {
  const me = { ...participantFromDef(ARCHETYPE_INDEX.all, { id: 'player' }), human: true, name: 'Tester' };
  const opp = participantFromDef(ARCHETYPE_INDEX.striker, { id: 'cpu', difficulty: 1 });
  const parts = () => [structuredClone(me), structuredClone(opp)];
  const rng = new Rng(seed);
  const b = new Battle({ arenaId: 'standard', format: 'bo3', seed, participants: parts(), rules: {}, record: true, roundTime: 30 });
  b.headless = true;
  const ctl = { steer: { set() {} } };
  void ctl;
  let guard = 0;
  while (b.phase !== 'matchOver' && guard++ < 200000) {
    if (b.phase === 'setup') b.confirmSetup(0);
    if (b.phase === 'countdown') {
      const L = b.fighters[0].launch;
      if (!L.released) { b.chargeInput(0, true, 1); if (L.meter.charge >= 0.85 + rng.next() * 0.1) b.release(0); }
    }
    b.update(1 / 60, []);
    if (b.phase === 'roundOver') b.nextRound();
  }
  return { data: JSON.parse(JSON.stringify(b.replayData())), parts };
}

test('a v2 replay plays back to the same result with a hit-stop-like dt pattern', () => {
  for (const seed of [5, 17]) {
    const { data, parts } = recordedMatch(seed);
    assert.equal(data.rec.v, 2);
    for (const make of [hitStopLike, realHitStop, () => randomDt(seed), () => randomWithZeros(seed)]) {
      const dtAt = make();
      const rp = new Battle({ arenaId: data.arenaId, format: data.format, seed: data.seed, participants: parts(), rules: data.rules, roundTime: data.roundTime, replay: data.rec });
      rp.headless = true;
      let guard = 0, k = 0;
      while (rp.phase !== 'matchOver' && guard++ < 400000) {
        rp.update(dtAt(k++), []);
        if (rp.phase === 'roundOver') rp.nextRound();
      }
      assert.equal(rp.phase, 'matchOver');
      const got = { winner: rp.result.winner, rounds: rp.result.rounds.map((r) => ({ winner: r.winner, how: r.how, time: +r.time.toFixed(3) })) };
      assert.deepEqual(got, data.summary, `seed ${seed}`);
    }
  }
});
