// Playbook patterns: each D-pad pattern steers, ends on time, behaves as its
// design says (Orbit holds its circle, Slingshot loads uphill and dives with
// slope speed), the stick breaks it, and recordings replay bit-exactly.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle } from '../src/game/battle.js';
import { emptyControls } from '../src/game/ai.js';
import { ARCHETYPE_INDEX, participantFromDef } from '../src/data/opponents.js';
import { PATTERNS, PATTERN_IDS } from '../src/game/playbook.js';
import { Rng } from '../src/core/rng.js';

// A human on a stamina build against a passive dummy that never steers.
function setup(seed = 4, opts = {}) {
  const me = { ...participantFromDef(ARCHETYPE_INDEX.drifter, { id: 'p' }), human: true, name: 'P' };
  const opp = participantFromDef(ARCHETYPE_INDEX.wall, { id: 'd', ai: 'dummy' });
  const b = new Battle({ arenaId: 'standard', format: 'single', seed, roundTime: 60, rules: { slowmo: false }, participants: [me, opp], ...opts });
  b.headless = true;
  return b;
}

function toBattle(b, c) {
  for (let g = 0; b.phase !== 'battle' && g < 5000; g++) {
    if (b.phase === 'setup') b.confirmSetup(0);
    if (b.phase === 'countdown' && !b.fighters[0].launch.released) { b.chargeInput(0, true, 1); if (b.fighters[0].launch.meter.charge >= 0.9) b.release(0); }
    b.update(1 / 60, [c]);
  }
  for (let i = 0; i < 60; i++) b.update(1 / 60, [c]); // settle 1 s
}

// Trigger a pattern and sample the fighter every frame until it ends.
function runPattern(id, variant = 0, seed = 4, foeAt = null) {
  const b = setup(seed);
  const c = emptyControls();
  toBattle(b, c);
  // test staging: put the resting foe at a chosen spot (fraction of R along +x)
  if (foeAt != null) { const o = b.fighters[1].top; o.p.x = foeAt * b.arena.radius; o.p.z = 0; o.v.set(0, 0, 0); }
  const events = [];
  b.on('playbook', (e) => { if (e.fighter.index === 0) events.push(e); });
  c.pattern = `${id}:${variant}`;
  b.update(1 / 60, [c]);
  c.pattern = null;
  const samples = [];
  for (let i = 0; i < 60 * 5 && b.phase === 'battle'; i++) {
    const f = b.fighters[0];
    samples.push({ t: i / 60, r: Math.hypot(f.top.p.x, f.top.p.z) / b.arena.radius, v: Math.hypot(f.top.v.x, f.top.v.z), steer: Math.hypot(f.controls.steer.x, f.controls.steer.z), phase: f.controls.patternPhase, on: !!f.pattern });
    b.update(1 / 60, [c]);
  }
  return { b, events, samples };
}

test('every pattern starts, steers and ends within its duration', () => {
  for (const id of PATTERN_IDS) {
    const { events, samples } = runPattern(id);
    assert.equal(events[0]?.phase, 'start', `${id} starts`);
    const end = samples.findIndex((s) => !s.on);
    assert.ok(end > 0, `${id} ends`);
    assert.ok(end / 60 <= PATTERNS[id].dur + 0.05, `${id} ends by ${PATTERNS[id].dur} s (${(end / 60).toFixed(2)})`);
    if (id !== 'herd') assert.ok(samples.slice(0, end).some((s) => s.steer > 0.05), `${id} steers`);
  }
});

test('Herd needs a target near the rim; Orbit holds its circle; Slingshot loads uphill and dives', () => {
  // the dummy rests where it launched, out near the rim: Herd stages, then drives
  const herd = runPattern('herd');
  const phases = new Set(herd.samples.map((s) => s.phase));
  assert.ok(phases.has('stage') && phases.has('drive'), `herd phases ${[...phases].join(',')}`);
  assert.equal(herd.events.filter((e) => e.phase === 'start').length, 1, 'one press, one start');
  const orbit = runPattern('orbit');
  const late = orbit.samples.filter((s) => s.on && s.t > 1.5);
  assert.ok(late.length > 30, 'orbit still running after 1.5 s');
  for (const s of late) assert.ok(s.r > 0.3 && s.r < 0.7, `orbit radius ${s.r.toFixed(2)} R`);
  const sling = runPattern('slingshot', 0, 4, 0.12); // a foe below the load point
  const load = sling.samples.filter((s) => s.phase === 'load'), dive = sling.samples.filter((s) => s.phase === 'dive');
  assert.ok(load.length && dive.length, 'load then dive');
  const rMax = Math.max(...load.map((s) => s.r));
  assert.ok(rMax > 0.45, `climbs to ${rMax.toFixed(2)} R`);
  // measured 0.22 m/s on Standard from 0.63 R (tip friction takes part of the
  // drop; the design estimate without it was 0.45)
  assert.ok(Math.max(...dive.map((s) => s.v)) > 0.18, `dives with speed ${Math.max(...dive.map((s) => s.v)).toFixed(2)} m/s`);
  assert.ok(dive.every((s) => s.steer <= 0.61), 'the dive only bends the fall: a light stick');
});

test('a held stick breaks a pattern; a light stick only nudges it', () => {
  const b = setup();
  const c = emptyControls();
  toBattle(b, c);
  c.pattern = 'orbit:0'; b.update(1 / 60, [c]); c.pattern = null;
  c.steer.set(0.3, 0, 0);
  for (let i = 0; i < 30; i++) b.update(1 / 60, [c]);
  assert.ok(b.fighters[0].pattern, 'a nudge keeps the pattern');
  c.steer.set(0.9, 0, 0);
  for (let i = 0; i < 12; i++) b.update(1 / 60, [c]);
  assert.equal(b.fighters[0].pattern, null, 'a full stick held 0.12 s takes over');
});

test('a match played with patterns replays to the identical result', () => {
  const play = () => {
    const b = setup(17, { record: true, format: 'bo3', roundTime: 30 });
    const rng = new Rng(5);
    const c = emptyControls();
    for (let g = 0; b.phase !== 'matchOver' && g < 200000; g++) {
      if (b.phase === 'setup') b.confirmSetup(0);
      if (b.phase === 'countdown' && !b.fighters[0].launch.released) { b.chargeInput(0, true, 1); if (b.fighters[0].launch.meter.charge >= 0.9) b.release(0); }
      c.pattern = b.phase === 'battle' && g % 150 === 0 ? `${PATTERN_IDS[(g / 150) % PATTERN_IDS.length]}:${(g / 150) % 2}` : null;
      c.steer.set(g % 400 > 360 ? 0.8 : 0, 0, 0);
      b.update(0.008 + rng.next() * 0.02, [c]);
      if (b.phase === 'roundOver') b.nextRound();
    }
    return b;
  };
  const live = play();
  const data = live.replayData();
  assert.ok(data.rec.controls.some((r) => r[6]), 'pattern triggers are recorded');
  const parts = live.fighters.map((f) => f.p);
  const re = new Battle({ arenaId: data.arenaId, format: data.format, seed: data.seed, participants: parts, rules: data.rules, roundTime: data.roundTime, replay: data.rec });
  re.headless = true;
  for (let g = 0; re.phase !== 'matchOver' && g < 200000; g++) { re.update(1 / 45, []); if (re.phase === 'roundOver') re.nextRound(); }
  assert.deepEqual(re.result.rounds.map((r) => [r.winner, r.how, +r.time.toFixed(4)]), live.result.rounds.map((r) => [r.winner, r.how, +r.time.toFixed(4)]));
});

// The AI reads a Feint by name (HUD) and does not swing at it; a top that
// cannot read it still counters into the bait. Its own plans show as patterns.
test('the AI reads a Feint (no counter press) and telegraphs its plans as patterns', () => {
  const run = (readSkill) => {
    const me = { ...participantFromDef(ARCHETYPE_INDEX.striker, { id: 'p' }), human: true, name: 'P' };
    const ai = participantFromDef(ARCHETYPE_INDEX.counter, { id: 'ai', difficulty: 1.3 });
    let presses = 0, told = 0;
    for (const seed of [3, 9, 27]) {
      const b = new Battle({ arenaId: 'standard', format: 'single', seed, roundTime: 40, rules: { slowmo: false }, participants: [me, ai] });
      b.headless = true;
      b.fighters[1].controller.profile.readSkill = readSkill;
      b.on('playbook', (e) => { if (e.ai) told++; });
      const c = emptyControls();
      toBattle(b, c);
      for (let g = 0; g < 60 * 30 && b.phase === 'battle'; g++) {
        c.pattern = g % 150 === 0 ? 'feint:0' : null;
        b.update(1 / 60, [c]);
        if (b.fighters[1].controls?.counter) presses++;
      }
    }
    return { presses, told };
  };
  const blind = run(0), sharp = run(1);
  assert.ok(sharp.presses < blind.presses, `counter presses into feints: reader ${sharp.presses} vs blind ${blind.presses}`);
  assert.ok(sharp.told > 0, 'the AI plan is telegraphed as a pattern');
});
