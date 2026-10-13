// Deterministic maths (src/core/dmath.js): accurate against Math.* and free
// of the engine's own transcendental functions.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as dm from '../src/core/dmath.js';
import { Rng } from '../src/core/rng.js';

const ULP = (x) => Math.max(Number.MIN_VALUE, Math.abs(x) * 2.220446049250313e-16);

function check(name, f, ref, gen, maxUlp, n = 20000) {
  const rng = new Rng(name.length * 977);
  let worst = 0, at = null;
  for (let i = 0; i < n; i++) {
    const args = gen(rng);
    const a = f(...args), b = ref(...args);
    if (Number.isNaN(b)) { assert.ok(Number.isNaN(a), `${name}(${args}) should be NaN`); continue; }
    if (!Number.isFinite(b)) { assert.equal(a, b, `${name}(${args})`); continue; }
    const err = Math.abs(a - b) / ULP(b === 0 ? 1e-300 : b);
    if (err > worst) { worst = err; at = args; }
  }
  assert.ok(worst <= maxUlp, `${name}: worst ${worst.toFixed(2)} ulp at ${at}`);
}

const U = (lo, hi) => (rng) => [lo + rng.next() * (hi - lo)];

test('sin, cos and tan match Math to about one ulp', () => {
  check('sin', dm.sin, Math.sin, U(-50, 50), 2);
  check('cos', dm.cos, Math.cos, U(-50, 50), 2);
  check('sin big', dm.sin, Math.sin, U(-1e5, 1e5), 4);
  check('tan', dm.tan, Math.tan, U(-1.5, 1.5), 3);
  assert.equal(dm.sin(0), 0);
  assert.equal(dm.cos(0), 1);
  assert.ok(Number.isNaN(dm.sin(Infinity)) && Number.isNaN(dm.cos(NaN)));
});

test('atan, atan2, asin and acos match Math', () => {
  check('atan', dm.atan, Math.atan, U(-30, 30), 2);
  check('atan2', dm.atan2, Math.atan2, (r) => [(r.next() - 0.5) * 10, (r.next() - 0.5) * 10], 2);
  check('asin', dm.asin, Math.asin, U(-1, 1), 4);
  check('acos', dm.acos, Math.acos, U(-1, 1), 4);
  for (const [y, x] of [[0, 1], [0, -1], [-0, -1], [1, 0], [-1, 0], [0, 0], [Infinity, 1], [1, -Infinity], [Infinity, Infinity]]) {
    assert.equal(dm.atan2(y, x), Math.atan2(y, x), `atan2(${y}, ${x})`);
  }
});

test('exp, log and pow match Math', () => {
  check('exp', dm.exp, Math.exp, U(-700, 700), 2);
  check('exp small', dm.exp, Math.exp, U(-1, 1), 2);
  check('log', dm.log, Math.log, (r) => [Math.exp((r.next() - 0.5) * 1400)], 2);
  check('pow', dm.pow, Math.pow, (r) => [r.next() * 10, (r.next() - 0.5) * 20], 64);
  check('pow int', dm.pow, Math.pow, (r) => [(r.next() - 0.5) * 4, Math.floor((r.next() - 0.5) * 12)], 8);
  assert.equal(dm.pow(3, 2), 9);
  assert.equal(dm.pow(2, -3), 0.125);
  assert.ok(Number.isNaN(dm.pow(-2, 0.5)));
  assert.equal(dm.exp(0), 1);
  assert.equal(dm.log(1), 0);
});

test('hypot is the square root of the sum of squares', () => {
  assert.equal(dm.hypot(3, 4), 5);
  assert.equal(dm.hypot(1, 2, 2), 3);
});

test('the module itself only uses exact operations', () => {
  const src = readFileSync('src/core/dmath.js', 'utf8').replace(/\/\/.*$/gm, '');
  const used = [...src.matchAll(/Math\.(\w+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(used)].sort(), ['max', 'round', 'sqrt', 'trunc']);
});
