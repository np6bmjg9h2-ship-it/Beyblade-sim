// Strike attribution and counters as a read: every hit knows who struck,
// and a counter only fires when the opponent struck you.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle, strikeOf, CLASH_BAND } from '../src/game/battle.js';
import { emptyControls } from '../src/game/ai.js';
import { ARCHETYPE_INDEX, participantFromDef } from '../src/data/opponents.js';

test('the faster closer along the contact normal is the striker; near-equal is a clash', () => {
  const n = [1, 0, 0]; // from A to B
  const f = (vx, vz = 0) => ({ preVx: vx, preVz: vz });
  assert.equal(strikeOf(f(0.6), f(0), n).striker?.preVx, 0.6);
  const b = f(-0.5);
  assert.equal(strikeOf(f(0), b, n).striker, b);
  assert.equal(strikeOf(f(0.3), f(-0.3 + CLASH_BAND / 2), n).striker, null);
  assert.ok(Math.abs(strikeOf(f(0.4), f(-0.1), n).closing - 0.4) < 1e-12);
});

// A human who holds counter stance as often as it can against an aggressive AI.
function counterMasher(seed) {
  const b = new Battle({
    arenaId: 'standard', format: 'single', seed, roundTime: 30, rules: { slowmo: false },
    participants: [{ ...participantFromDef(ARCHETYPE_INDEX.wall, { id: 'p' }), human: true, name: 'P' }, participantFromDef(ARCHETYPE_INDEX.striker, { id: 'ai', difficulty: 1.2 })],
  });
  b.headless = true;
  const impacts = [], counters = [];
  // a counter is emitted just before the impact event it belongs to
  let pending = null;
  b.on('counter', (e) => { pending = { f: e.fighter, t: b.battleTime, impact: null }; counters.push(pending); });
  b.on('impact', (e) => { impacts.push(e); if (pending) { pending.impact = e; pending = null; } });
  const c = emptyControls();
  let guard = 0;
  while (b.phase !== 'matchOver' && guard++ < 20000) {
    if (b.phase === 'setup') b.confirmSetup(0);
    if (b.phase === 'countdown' && !b.fighters[0].launch.released) { b.chargeInput(0, true, 1); if (b.fighters[0].launch.meter.charge >= 0.92) b.release(0); }
    c.counter = guard % 30 === 0; // press about every 0.5 s
    b.update(1 / 60, [c]);
    if (b.phase === 'roundOver') b.nextRound();
  }
  return { b, impacts, counters };
}

test('counters fire only on hits the opponent struck', () => {
  let total = 0, attributed = 0;
  for (const seed of [5, 8, 13, 21]) {
    const { b, impacts, counters } = counterMasher(seed);
    for (const k of counters) {
      total++;
      assert.ok(k.impact, 'a counter follows an impact');
      assert.notEqual(k.impact.striker, k.f, 'never on a hit the countering top made');
      assert.ok(k.impact.striker, 'never on a clash');
    }
    attributed += impacts.filter((e) => e.striker).length;
    for (const e of impacts) if (e.striker) assert.equal(e.struck, e.striker === e.A ? e.B : e.A);
    assert.ok(b.fighters.every((f) => (f.stats.strikes || 0) >= 0));
  }
  assert.ok(attributed > 0, 'some impacts have a striker');
});

test('mashing counter rarely pays; AI counters land on real strikes', () => {
  let landed = 0;
  for (const seed of [5, 8, 13, 21]) {
    const { b, counters } = counterMasher(seed);
    landed += counters.filter((k) => k.f.index === 0).length;
  }
  assert.ok(landed <= 2, `a masher landed ${landed} counters`);
  // AI against AI: counters happen, always on the opponent's strike
  let ai = 0;
  for (let seed = 1; seed <= 12 && ai < 3; seed++) {
    const b = new Battle({ arenaId: 'standard', format: 'bo3', seed, roundTime: 40, rules: { slowmo: false },
      participants: [participantFromDef(ARCHETYPE_INDEX.counter, { id: 'a', difficulty: 1.3 }), participantFromDef(ARCHETYPE_INDEX.striker, { id: 'b', difficulty: 1.3 })] });
    b.headless = true;
    let pending = null;
    b.on('counter', (e) => { ai++; pending = e.fighter; });
    b.on('impact', (e) => { if (pending) { assert.ok(e.striker && e.striker !== pending, 'AI counter on an opponent strike'); pending = null; } });
    b.runHeadless();
  }
  assert.ok(ai > 0, 'AI counters still happen');
});
