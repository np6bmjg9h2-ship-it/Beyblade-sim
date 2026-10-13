// Which Math functions give different bits in different JS engines?
//   node tests/browser/mathprobe.js
// Evaluates each function on the same pseudo-random inputs in Node,
// Chromium, Firefox and WebKit and reports how many results differ from Node.

import path from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  try { return require('playwright'); } catch { /* not local */ }
  return require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
}

function probe() {
  const f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer);
  let s = 12345;
  const rnd = () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 4294967296; };
  const N = 4000;
  const inputs = [];
  for (let i = 0; i < N; i++) inputs.push([(rnd() - 0.5) * 20, (rnd() - 0.5) * 20, rnd() * 4, rnd()]);
  const fns = {
    sin: (a) => Math.sin(a[0]), cos: (a) => Math.cos(a[0]), tan: (a) => Math.tan(a[0]),
    atan2: (a) => Math.atan2(a[0], a[1]), acos: (a) => Math.acos(a[3] * 2 - 1), asin: (a) => Math.asin(a[3] * 2 - 1),
    exp: (a) => Math.exp(a[0] * 0.5), log: (a) => Math.log(a[2] + 1e-3), pow: (a) => Math.pow(a[2], a[3] * 5),
    powInt: (a) => Math.pow(a[0], 5), hypot: (a) => Math.hypot(a[0], a[1]), hypot3: (a) => Math.hypot(a[0], a[1], a[2]),
    sqrt: (a) => Math.sqrt(a[2]), cbrt: (a) => Math.cbrt(a[0]), atan: (a) => Math.atan(a[0]), tanh: (a) => Math.tanh(a[0]),
  };
  const out = {};
  for (const [k, f] of Object.entries(fns)) out[k] = inputs.map((a) => { f64[0] = f(a); return u32[0] + ':' + u32[1]; });
  return out;
}

const ref = probe();
const pw = loadPlaywright();
for (const name of ['chromium', 'firefox', 'webkit']) {
  const b = await pw[name].launch();
  const page = await b.newPage();
  const got = await page.evaluate(`(${probe.toString()})()`);
  const diffs = Object.keys(ref).map((k) => [k, ref[k].filter((v, i) => v !== got[k][i]).length]).filter(([, n]) => n);
  console.log(`${name}: ${diffs.length ? diffs.map(([k, n]) => `${k} ${n}/4000`).join(', ') : 'all identical to Node'}`);
  await b.close();
}
