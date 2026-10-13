// "Why it won" tags: every rule, the wording rules, and real battles.

import test from 'node:test';
import assert from 'node:assert/strict';
import { whyTag, makeTagTracker, HEAVY_HIT } from '../src/game/whyTag.js';
import { Battle } from '../src/game/battle.js';
import { ARCHETYPE_INDEX, participantFromDef } from '../src/data/opponents.js';

const top = (frac = 0.8, ledger = {}) => ({ spinFraction: () => frac, ledger });
const fighter = (name, t = top()) => ({ name, top: t });

function battleWith(hits, now = 10) {
  return { battleTime: now, roundNotable: hits };
}
const hit = (A, B, impulse, time, glance = 0) => ({ A, B, impulse, time, glance });

const FORBIDDEN = /beyblade|\bbey\b|bit-beast|let it rip|blader/i;
function wellFormed(r) {
  assert.ok(r && r.tag, 'a tag');
  const words = r.tag.split(/\s+/).length;
  assert.ok(words >= 2 && words <= 5, `2-5 words: "${r.tag}"`);
  assert.match(r.tag, /^[A-Z]/);
  assert.doesNotMatch(r.tag + ' ' + (r.advice || ''), FORBIDDEN);
}

test('ring-out rules', () => {
  const w = fighter('W'), l = fighter('L');
  const cases = [
    [[], 'Drifted out'],
    [[hit(w, l, 0.02, 1)], 'Drifted out'], // last hit long ago
    [[hit(w, l, HEAVY_HIT + 0.01, 9.5)], 'Heavy hit'],
    [[hit(w, l, 0.03, 9.5, 0.8)], 'Glancing flick'],
    [[hit(w, l, 0.03, 9.5, 0.1)], 'Edge push'],
  ];
  for (const [hits, tag] of cases) {
    const r = whyTag(battleWith(hits), { winner: w, loser: l, how: 'out' });
    wellFormed(r);
    assert.equal(r.tag, tag);
  }
  const worn = fighter('L', top(0.2));
  assert.equal(whyTag(battleWith([hit(w, worn, 0.03, 9.5)]), { winner: w, loser: worn, how: 'out' }).tag, 'Worn down first');
});

test('a counter by the winner is credited, and the tracker resets each round', () => {
  const w = fighter('W'), l = fighter('L');
  const tr = makeTagTracker();
  tr.onEvent('counter', { fighter: w }, 9.2);
  const b = battleWith([hit(w, l, 0.2, 9.5)]);
  assert.equal(whyTag(b, { winner: w, loser: l, how: 'out' }, tr).tag, 'Counter timing');
  assert.equal(whyTag(b, { winner: w, loser: l, how: 'burst' }, tr).tag, 'Counter broke the lock');
  tr.onEvent('roundStart', {}, 0);
  assert.equal(whyTag(b, { winner: w, loser: l, how: 'out' }, tr).tag, 'Heavy hit');
  // the loser's own counter earns the winner nothing
  tr.onEvent('counter', { fighter: l }, 9.4);
  assert.equal(whyTag(b, { winner: w, loser: l, how: 'out' }, tr).tag, 'Heavy hit');
});

test('shatter, spin finish and decision rules', () => {
  const w = fighter('W');
  const l = fighter('L');
  assert.equal(whyTag(battleWith([hit(w, l, 0.15, 9.8)]), { winner: w, loser: l, how: 'burst' }).tag, 'Heavy hit shattered it');
  assert.equal(whyTag(battleWith([hit(w, l, 0.03, 9.8)]), { winner: w, loser: l, how: 'burst' }).tag, 'Lock worn down');
  const spin = (ledger) => whyTag(battleWith([]), { winner: w, loser: fighter('L', top(0.1, ledger)), how: 'spin' });
  assert.equal(spin({ collision: -0.5, tipFriction: -0.2 }).tag, 'Drained by clashes');
  assert.equal(spin({ collision: -0.1, tipFriction: -0.4 }).tag, 'Outlasted on stamina');
  assert.equal(spin({ control: -0.4 }).tag, 'More stamina');
  assert.equal(whyTag(battleWith([]), { winner: w, loser: l, how: 'decision' }).tag, 'Steadier at the bell');
  for (const how of ['out', 'burst', 'spin', 'decision']) wellFormed(whyTag(battleWith([hit(w, l, 0.07, 9.9)]), { winner: w, loser: l, how }));
  assert.equal(whyTag(battleWith([]), { winner: null, loser: null, how: 'draw' }), null);
});

test('real battles: every decided round gets a well-formed tag', () => {
  for (const seed of [3, 17, 29]) {
    const b = new Battle({
      arenaId: 'standard', format: 'bo3', seed, roundTime: 40, rules: { slowmo: true },
      participants: [participantFromDef(ARCHETYPE_INDEX.striker, { id: 'a', difficulty: 1 }), participantFromDef(ARCHETYPE_INDEX.wall, { id: 'b', difficulty: 1 })],
    });
    b.headless = true;
    const tr = makeTagTracker();
    const tags = [];
    b.on('*', (type, e) => {
      tr.onEvent(type, e, b.battleTime);
      if (type === 'roundEnd' && e.winner != null) tags.push(whyTag(b, { winner: b.fighters[e.winner], loser: b.fighters[1 - e.winner], how: e.how }, tr));
    });
    let guard = 0;
    while (b.phase !== 'matchOver' && guard++ < 100000) {
      b.update(1 / 60, []);
      if (b.phase === 'roundOver') b.nextRound();
    }
    assert.ok(tags.length >= 1, `seed ${seed}: decided rounds`);
    for (const r of tags) wellFormed(r);
  }
});
