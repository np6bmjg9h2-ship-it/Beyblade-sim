// Cross-engine determinism check: the same battle, bit for bit, in every engine.
//   node tests/browser/determinism.js
// Plays the same scripted battles in Node (V8), Chromium, Firefox and
// WebKit (Safari's engine) and compares, with no tolerance:
//  - the assembled top specs before tick 0,
//  - a hash of every top's exact state every 120 ticks,
//  - the results;
// then every engine re-plays Chromium's recordings and must match them.
// Needs Playwright's firefox and webkit builds (npx playwright install
// firefox webkit); a missing engine is reported, not skipped silently.

import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';
import { build } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ENTRY = path.join(ROOT, 'tests/browser/determinism-entry.js');

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  try { return require('playwright'); } catch { /* not local */ }
  return require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
}

function firstDiff(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) return i;
  return -1;
}

function compare(label, ref, got) {
  const problems = [];
  ref.forEach((r, n) => {
    const g = got[n];
    if (r.specs.join() !== g.specs.join()) problems.push(`battle ${n + 1}: top specs differ before tick 0 (${r.specs[0]} vs ${g.specs[0]})`);
    const d = firstDiff(r.hashes, g.hashes);
    if (d >= 0) problems.push(`battle ${n + 1}: state differs from second ${d + 1} (tick ${(d + 1) * 120})`);
    if (JSON.stringify(r.summary) !== JSON.stringify(g.summary)) problems.push(`battle ${n + 1}: result ${JSON.stringify(g.summary)} vs ${JSON.stringify(r.summary)}`);
  });
  console.log(problems.length ? `✗ ${label}\n    ${problems.join('\n    ')}` : `✓ ${label}`);
  return problems.length === 0;
}

const bundle = (await build({ entryPoints: [ENTRY], bundle: true, format: 'iife', platform: 'browser', write: false, logLevel: 'silent' })).outputFiles[0].text;
const node = await import(pathToFileURL(ENTRY).href);
const ref = node.record();
console.log(`Node: ${ref.length} battles, ${ref.reduce((s, r) => s + r.hashes.length, 0)} state fingerprints`);
let ok = compare('Node replays its own recordings', ref, node.replay(ref.map((r) => r.replay)));

const pw = loadPlaywright();
const results = {};
for (const name of ['chromium', 'firefox', 'webkit']) {
  let browser;
  try { browser = await pw[name].launch(); } catch (e) { console.log(`✗ ${name}: could not start (${e.message.split('\n')[0]})`); ok = false; continue; }
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><title>determinism</title>');
    await page.addScriptTag({ content: bundle });
    const rec = await page.evaluate(() => window.__det.record());
    results[name] = { page, browser, rec };
    ok = compare(`${name} plays exactly like Node`, ref, rec) && ok;
  } catch (e) { console.log(`✗ ${name}: ${e.message.split('\n')[0]}`); ok = false; await browser.close(); }
}
// recordings made in Chromium must replay identically everywhere
if (results.chromium) {
  const reps = results.chromium.rec.map((r) => r.replay);
  ok = compare('Node replays Chromium recordings', results.chromium.rec, node.replay(reps)) && ok;
  for (const [name, { page }] of Object.entries(results)) {
    const got = await page.evaluate((r) => window.__det.replay(r), reps);
    ok = compare(`${name} replays Chromium recordings`, results.chromium.rec, got) && ok;
  }
}
for (const { browser } of Object.values(results)) await browser.close();
console.log(ok ? '\nDETERMINISM OK' : '\nDETERMINISM FAILED');
process.exit(ok ? 0 : 1);
