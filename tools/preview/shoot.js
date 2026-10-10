// Renders part models or assembled tops to a PNG in headless Chromium.
//   node tools/preview/shoot.js slot ring [--out file.png] [--views 34,top,side]
//   node tools/preview/shoot.js slot core --ids core_helix,core_quad
//   node tools/preview/shoot.js tops [--explode 0.8] [--quality low] [--no-ink]
//   node tools/preview/shoot.js arena vortex [--views broadcast|close|overhead]
//        [--fx impact,shockwave,launch,burst,trail,knockout,wobble,...] [--fxTime 0.06]
//   node tools/preview/shoot.js spirits [--fxTime 0.5] (fraction of the manifestation)
// --audit prints a geometry envelope check per part (slot mode).
// Options: --size <px per cell> --cols <n> --yaw <deg> --color <hex> --beast <id>

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';
import { launch, ROOT } from '../../tests/browser/harness.js';

const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : def; };
const mode = argv[0] || 'tops';
const cfg = { mode };
if (mode === 'slot') cfg.slot = argv[1];
if (opt('ids')) cfg.ids = opt('ids').split(',');
if (opt('views')) cfg.views = opt('views').split(',');
if (opt('size')) cfg.size = +opt('size');
if (opt('cols')) cfg.cols = +opt('cols');
if (opt('yaw')) cfg.yaw = +opt('yaw');
if (opt('explode')) cfg.explode = +opt('explode');
if (opt('quality')) cfg.quality = opt('quality');
if (opt('color')) cfg.color = opt('color');
if (opt('beast')) cfg.beast = opt('beast');
if (opt('builds')) cfg.builds = JSON.parse(opt('builds'));
if (mode === 'arena') cfg.arena = argv[1] && !argv[1].startsWith('--') ? argv[1] : 'standard';
if (opt('fx')) cfg.fx = opt('fx').split(',');
if (opt('fxTime')) cfg.fxTime = +opt('fxTime');
if (opt('width')) cfg.width = +opt('width');
if (opt('height')) cfg.height = +opt('height');
if (argv.includes('--no-ink')) cfg.ink = false;
if (argv.includes('--no-beasts')) cfg.beasts = false;
const out = path.resolve(opt('out', path.join(ROOT, 'test-results', `preview-${mode}${cfg.slot ? '-' + cfg.slot : ''}${cfg.arena ? '-' + cfg.arena : ''}.png`)));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'preview-'));
await esbuild.build({ entryPoints: [path.join(ROOT, 'tools/preview/entry.js')], bundle: true, format: 'iife', outfile: path.join(dir, 'p.js'), logLevel: 'error', define: { __SIM_WORKER_SRC__: '""' } });
fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#111;position:relative}</style><body><script>window.PREVIEW=${JSON.stringify(cfg)}</script><script src="p.js"></script></body>`);
const h = await launch({ width: 400, height: 300, outDir: path.dirname(out) });
try {
  await h.page.goto(pathToFileURL(path.join(dir, 'index.html')).href);
  const done = await h.waitFor(() => window.__done, 60000, 'preview rendered');
  await h.page.setViewportSize({ width: done.W, height: done.H });
  await h.page.screenshot({ path: out, clip: { x: 0, y: 0, width: done.W, height: done.H } });
  console.log(`${out} (${done.count} items)`);
  if (argv.includes('--audit')) for (const a of await h.eval(() => window.__audit)) console.log('AUDIT ' + JSON.stringify(a));
  if (h.errors.length) { console.log('ERRORS:\n' + h.errors.join('\n')); process.exitCode = 1; }
} catch (e) {
  console.log('FAILED: ' + e.message + (h.errors.length ? '\n' + h.errors.join('\n') : ''));
  process.exitCode = 1;
} finally {
  await h.close();
  fs.rmSync(dir, { recursive: true, force: true });
}
