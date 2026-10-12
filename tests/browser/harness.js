// Browser test harness (Playwright + the pre-installed Chromium).
// Drives the real built game (dist/) through keyboard and a virtual gamepad.

import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  try { return require('playwright'); } catch { /* not local */ }
  const globalRoot = execSync('npm root -g').toString().trim();
  return require(path.join(globalRoot, 'playwright'));
}

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// WebGL backend: the machine's GPU by default (about 8x faster than software
// rendering on an integrated Intel GPU), SwiftShader with BROWSER_SOFTWARE=1.
// Without a usable GPU Chromium falls back to SwiftShader on its own.
const SOFTWARE = process.env.BROWSER_SOFTWARE === '1';
const GL_ARGS = SOFTWARE
  ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  : ['--use-angle=' + (process.platform === 'win32' ? 'd3d11' : 'default'), '--ignore-gpu-blocklist', '--enable-gpu', '--enable-unsafe-swiftshader'];
let reportedRenderer = false;

// phone: a touch phone held sideways (iPhone 13 size, coarse pointer); the
// h.touch* helpers send real touch events through the DevTools protocol.
export async function launch({ width = 1600, height = 900, outDir, phone = false } = {}) {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ args: [...GL_ARGS, '--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext(phone ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width, height } });
  const page = await context.newPage();
  const cdp = phone ? await context.newCDPSession(page) : null;
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.addInitScript(() => {
    // Virtual gamepad: tests set window.__pad = { buttons: [...17 floats], axes: [4 floats] }
    window.__pad = null;
    const real = navigator.getGamepads?.bind(navigator);
    navigator.getGamepads = () => {
      if (!window.__pad) return real ? real() : [];
      const p = window.__pad;
      return [{ id: p.id || 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e)', index: 0, connected: true, mapping: 'standard', timestamp: performance.now(),
        axes: p.axes, buttons: p.buttons.map((v) => ({ pressed: v > 0.5, touched: v > 0, value: v })), vibrationActuator: { playEffect: () => Promise.resolve('complete') } }];
    };
  });
  const dir = outDir || path.join(ROOT, 'test-results');
  fs.mkdirSync(dir, { recursive: true });
  const h = {
    browser, page, errors, dir,
    async open() {
      await page.goto(pathToFileURL(path.join(ROOT, 'index.html')).href);
      await h.waitFor(() => !!window.__app?.ui?.current, 20000, 'app ready');
      if (!reportedRenderer) {
        reportedRenderer = true;
        const r = await page.evaluate(() => { const gl = window.__app.renderer.renderer.getContext(); const x = gl.getExtension('WEBGL_debug_renderer_info'); return x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); });
        console.log(`(WebGL renderer: ${r})`);
      }
    },
    async waitFor(fn, timeout = 15000, label = 'condition', arg) {
      const t0 = Date.now();
      while (Date.now() - t0 < timeout) {
        let ok = false;
        try { ok = await page.evaluate(fn, arg); } catch { ok = false; }
        if (ok) return ok;
        await page.waitForTimeout(60);
      }
      await h.shot('timeout-' + label.replace(/\W+/g, '_'));
      throw new Error(`Timed out waiting for ${label}. Errors: ${errors.join(' | ')}`);
    },
    // wait for n rendered frames (the game polls input once per frame)
    frames(n = 2) { return page.evaluate((m) => new Promise((r) => { let k = 0; const f = () => { if (++k >= m) r(true); else requestAnimationFrame(f); }; requestAnimationFrame(f); }), n); },
    async key(k, hold = 60) { await page.keyboard.down(k); await page.waitForTimeout(hold); await page.keyboard.up(k); await h.frames(2); },
    async eval(fn, arg) { return page.evaluate(fn, arg); },
    screen() { return page.evaluate(() => window.__app.ui.current?.constructor?.screenName || window.__app.ui.current?.el?.className); },
    async focusId(id) { await page.evaluate((i) => window.__app.ui.focus(document.querySelector(`[data-id="${i}"]`)), id); await page.waitForTimeout(80); },
    async shot(name) { await page.screenshot({ path: path.join(dir, name + '.png') }); },
    // gamepad helpers
    padNeutral() { return page.evaluate(() => { window.__pad = { buttons: new Array(17).fill(0), axes: [0, 0, 0, 0] }; }); },
    async padButton(i) {
      await page.evaluate((b) => { window.__pad.buttons[b] = 1; }, i);
      await h.frames(2);
      await page.evaluate((b) => { window.__pad.buttons[b] = 0; }, i);
      await h.frames(2);
    },
    async padHold(i, v = 1) { await page.evaluate(([b, val]) => { window.__pad.buttons[b] = val; }, [i, v]); },
    async padAxes(a) { await page.evaluate((ax) => { window.__pad.axes = ax; }, a); },
    // touch helpers (phone contexts): points are [x, y] in CSS pixels
    touch(type, points) { return cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) }); },
    async centre(sel) { const b = await page.locator(sel).first().boundingBox(); if (!b) throw new Error('nothing to tap: ' + sel); return [b.x + b.width / 2, b.y + b.height / 2]; },
    async tap(sel) { const [x, y] = await h.centre(sel); await page.touchscreen.tap(x, y); await h.frames(2); },
    async drag(from, to, steps = 8, ms = 50) {
      await h.touch('touchStart', [from]);
      for (let i = 1; i <= steps; i++) { await h.touch('touchMove', [[from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps]]); await page.waitForTimeout(ms); }
    },
    async close() { await browser.close(); },
  };
  return h;
}
