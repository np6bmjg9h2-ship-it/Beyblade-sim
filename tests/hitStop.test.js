// Hit-stop: thresholds, phone cap, cooldown, the 2 s freeze budget, finish().

import test from 'node:test';
import assert from 'node:assert/strict';
import { HitStop, HIT_STOP, hitStopMs } from '../src/ui/hitStop.js';

const FRAME = 1 / 60;

test('hitStopMs follows the impulse thresholds', () => {
  assert.equal(hitStopMs(0), 0);
  assert.equal(hitStopMs(0.059), 0);
  assert.equal(hitStopMs(0.06), 35);
  assert.equal(hitStopMs(0.099), 35);
  assert.equal(hitStopMs(0.1), 35);
  assert.equal(hitStopMs(0.2), 80);
  assert.equal(hitStopMs(5), 80, 'capped at maxMs');
  assert.equal(hitStopMs(Infinity), 80);
  assert.equal(hitStopMs(0, true), 50, 'skill moments freeze whatever the impulse');
  assert.equal(hitStopMs(0.2, true), 50);
});

test('hitStopMs grows between heavy and the cap and never decreases', () => {
  let prev = 0;
  for (let J = 0; J <= 0.4; J += 0.005) {
    const ms = hitStopMs(J);
    assert.ok(ms >= prev, `monotonic at J=${J}`);
    assert.ok(ms <= HIT_STOP.maxMs);
    prev = ms;
  }
  assert.ok(Math.abs(hitStopMs(0.1 + 0.02) - 47) < 1e-9);
});

test('hitStopMs refuses NaN and negative impulses', () => {
  assert.equal(hitStopMs(NaN), 0);
  assert.equal(hitStopMs(-1), 0);
  assert.equal(hitStopMs(undefined), 0);
});

test('request grants the length in ms; light hits are refused', () => {
  const h = new HitStop();
  assert.equal(h.request(0.03), 0);
  assert.equal(h.active, false);
  assert.equal(h.request(0.2), 80);
  assert.equal(h.active, true);
});

test('phone caps a freeze at 60 ms, desktop does not', () => {
  assert.equal(new HitStop({ phone: true }).request(0.2), 60);
  assert.equal(new HitStop({ phone: true }).request(0.06), 35, 'short freezes are untouched');
  assert.equal(new HitStop({ phone: true }).request(0, { skill: true }), 50);
  assert.equal(new HitStop({ phone: false }).request(0.2), 80);
});

test('350 ms cooldown after a freeze starts', () => {
  const h = new HitStop();
  assert.equal(h.request(0.2), 80);
  for (let i = 0; i < 5; i++) h.step(FRAME); // 83 ms: the freeze is over
  assert.equal(h.active, false);
  assert.equal(h.request(0.2), 0, 'refused inside the cooldown');
  // advance to just under 350 ms since the start
  while (h.t + FRAME < 0.349) h.step(FRAME);
  h.step(0.349 - h.t);
  assert.equal(h.request(0.2), 0, 'still refused just before 350 ms');
  while (h.t < 0.351) h.step(0.001);
  assert.ok(h.request(0.2) > 0, 'granted after 350 ms');
});

test('a refused request does not restart the cooldown', () => {
  const h = new HitStop();
  h.request(0.2);
  h.step(0.2);
  assert.equal(h.request(0.2), 0);
  h.step(0.16); // t = 0.36 since the first freeze
  assert.ok(h.request(0.2) > 0, 'cooldown counts from the last granted freeze');
});

test('step returns 0.04 while frozen and 1 otherwise', () => {
  const h = new HitStop();
  assert.equal(h.step(FRAME), 1);
  h.request(0.2); // 80 ms = 4.8 frames: four frozen, the fifth 80% frozen
  const factors = [];
  for (let i = 0; i < 8; i++) factors.push(h.step(FRAME));
  assert.deepEqual(factors.slice(0, 4), [0.04, 0.04, 0.04, 0.04]);
  assert.ok(Math.abs(factors[4] - (1 - 0.8 * 0.96)) < 1e-9, `partial last frame ${factors[4]}`);
  assert.deepEqual(factors.slice(5), [1, 1, 1]);
  assert.equal(h.active, false);
});

test('a freeze lasts about its granted length in real time (within one frame)', () => {
  for (const [J, ms] of [[0.06, 35], [0.2, 80]]) {
    const h = new HitStop();
    assert.equal(h.request(J), ms);
    let frozen = 0;
    while (h.step(FRAME) < 1) frozen += FRAME;
    assert.ok(frozen >= ms / 1000 - 1e-9 && frozen <= ms / 1000 + FRAME + 1e-9, `${ms} ms froze ${frozen}`);
  }
});

test('finish() ends a freeze and blocks new ones until reset()', () => {
  const h = new HitStop();
  h.request(0.2);
  assert.equal(h.step(FRAME), 0.04);
  h.finish();
  assert.equal(h.active, false);
  assert.equal(h.step(FRAME), 1, 'ended at once');
  h.step(5); // well past any cooldown
  assert.equal(h.request(0.2), 0);
  assert.equal(h.request(0, { skill: true }), 0, 'skill freezes are blocked too');
  h.reset();
  assert.equal(h.active, false);
  assert.ok(h.request(0.2) > 0, 'allowed again after reset');
});

test('finish() on a fresh instance blocks the first freeze', () => {
  const h = new HitStop();
  h.finish();
  assert.equal(h.request(0.5), 0);
});

test('budget: an impact every 100 ms for 10 s freezes at most 200 ms per 2 s, each at most 80 ms', () => {
  for (const phone of [false, true]) {
    const h = new HitStop({ phone });
    const grants = []; // [time, seconds]
    const frozenFrames = []; // time of every frozen frame
    let frames = 0;
    for (let ms = 0; ms < 10000; ms += 100) {
      const g = h.request(0.5);
      if (g) grants.push([h.t, g / 1000]);
      // six frames of 1/60 s = 100 ms
      for (let i = 0; i < 6; i++) {
        const f = h.step(FRAME);
        frames++;
        if (f < 1) frozenFrames.push(h.t);
      }
    }
    assert.ok(grants.length > 10, 'freezes do happen');
    for (const [, s] of grants) assert.ok(s <= (phone ? 0.06 : 0.08) + 1e-9, `each freeze <= cap (${s})`);
    // granted budget in every 2 s window starting at a grant
    for (const [t0] of grants) {
      const sum = grants.filter(([t]) => t >= t0 && t < t0 + HIT_STOP.window).reduce((a, [, s]) => a + s, 0);
      assert.ok(sum <= HIT_STOP.budget + 0.0051, `granted ${sum} in window from ${t0}`);
    }
    // the real frozen time, with one frame of quantisation slack per freeze that overlaps
    for (const [t0] of grants) {
      const inWin = frozenFrames.filter((t) => t > t0 && t <= t0 + HIT_STOP.window).length * FRAME;
      const overlap = grants.filter(([t]) => t >= t0 && t < t0 + HIT_STOP.window).length;
      assert.ok(inWin <= HIT_STOP.budget + overlap * FRAME + 1e-9, `frozen ${inWin} s in window from ${t0}`);
    }
    assert.ok(frames > 0);
  }
});

test('budget: strict 200 ms is respected for the real frozen time too (spec)', () => {
  // Spec: at most 200 ms of freeze in any 2 s. Frame quantisation can add up to
  // one frame (16.7 ms) per freeze; this documents the worst observed window.
  const h = new HitStop();
  const frozen = [];
  for (let k = 0; k < 600; k++) {
    if (k % 6 === 0) h.request(0.5);
    const k2 = h.step(FRAME);
    // frozen part of this frame (the last frame of a freeze is partial)
    if (k2 < 1) frozen.push([h.t, ((1 - k2) / (1 - HIT_STOP.slow)) * FRAME]);
  }
  let worst = 0;
  for (const [t0] of frozen) {
    const n = frozen.filter(([t]) => t >= t0 && t < t0 + HIT_STOP.window).reduce((a, [, d]) => a + d, 0);
    worst = Math.max(worst, n);
  }
  assert.ok(worst <= HIT_STOP.budget + 1e-9, `worst 2 s window actually froze ${(worst * 1000).toFixed(1)} ms`);
});

test('budget frees up as old freezes leave the window', () => {
  const h = new HitStop();
  let granted = 0;
  for (let k = 0; k < 60 * 20; k++) {
    if (k % 30 === 0) granted += h.request(0.5) > 0 ? 1 : 0;
    h.step(FRAME);
  }
  assert.ok(granted >= 8, `freezes keep being granted over 20 s (${granted})`);
});
