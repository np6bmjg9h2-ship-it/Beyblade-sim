// Controls and audio feedback without a browser: action resolution across
// keyboard and gamepads, menu auto-repeat, non-standard controller layouts,
// disconnects, and an audio engine that degrades to silence.

import test from 'node:test';
import assert from 'node:assert/strict';
import { InputManager } from '../src/input/inputManager.js';
import { decodeHat, normalizePad, layoutFor } from '../src/input/padLayouts.js';
import { AudioEngine } from '../src/audio/audio.js';
import { glanceOf } from '../src/game/battle.js';
import { TopBody } from '../src/physics/topBody.js';
import { Simulation } from '../src/physics/simulation.js';
import { Vec3 } from '../src/core/math.js';
import { flatArena, simpleSpec } from './helpers.js';

const button = (v) => ({ pressed: v > 0.5, touched: v > 0, value: v });
function pad({ id = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e)', mapping = 'standard', buttons = [], axes = [0, 0, 0, 0], n = 17 } = {}) {
  const b = Array.from({ length: n }, (_, i) => button(buttons[i] || 0));
  return { id, index: 0, connected: true, mapping, buttons: b, axes };
}
function rig(pads = []) {
  const state = { pads };
  const input = new InputManager({ getGamepads: () => state.pads });
  return { input, state };
}

test('a press from keyboard and gamepad together counts once', () => {
  const { input, state } = rig([pad()]);
  input.poll(1 / 60);
  state.pads = [pad({ buttons: { 0: 1 } })]; // A held
  input.onKeyDown({ code: 'Enter' }); // and Enter pressed in the same frame
  input.poll(1 / 60);
  assert.equal(input.pressed('confirm', 'menu'), true);
  input.poll(1 / 60); // both still held
  assert.equal(input.pressed('confirm', 'menu'), false, 'no repeat while held');
  input.onKeyUp({ code: 'Enter' });
  state.pads = [pad()];
  input.poll(1 / 60);
  assert.equal(input.released('confirm', 'menu'), true);
});

test('menu navigation fires once, then auto-repeats only after a delay', () => {
  const { input, state } = rig([pad()]);
  input.poll(1 / 60);
  state.pads = [pad({ buttons: { 13: 1 } })]; // d-pad down held
  let fired = 0;
  for (let i = 0; i < 18; i++) { input.poll(1 / 60); fired += input.nav('down'); } // 0.3 s
  assert.equal(fired, 1, 'one step before the repeat delay');
  for (let i = 0; i < 30; i++) { input.poll(1 / 60); fired += input.nav('down'); } // +0.5 s
  assert.ok(fired >= 3 && fired <= 6, `auto-repeat at a steady rate (${fired} steps in 0.8 s)`);
});

test('hat-switch d-pads decode all eight directions and rest', () => {
  const at = (k) => -1 + (2 * k) / 7;
  const dirs = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => decodeHat(at(k)));
  assert.deepEqual(dirs.map((d) => [d.up, d.right, d.down, d.left].map(Number).join('')), ['1000', '1100', '0100', '0110', '0010', '0011', '0001', '1001']);
  for (const rest of [1.2857, 3.28, 0, undefined, NaN]) {
    const d = decodeHat(rest);
    assert.ok(!d.up && !d.down && !d.left && !d.right, `rest value ${rest} is neutral`);
  }
});

test('a DirectInput PlayStation pad is presented in the standard layout', () => {
  const id = '054c-09cc-Wireless Controller';
  assert.equal(layoutFor(id), 'sony');
  const raw = (buttons, axes) => pad({ id, mapping: '', n: 14, buttons, axes });
  const restAxes = [0, 0, 0, 0, 0, 0, 0, 0, 0, 1.2857];
  const { input, state } = rig([raw({}, restAxes)]);
  const warned = [];
  input.on('padNonStandard', (e) => warned.push(e.id));
  input.poll(1 / 60);
  assert.equal(input.held('confirm', 'menu'), false, 'nothing held at rest (untouched triggers read 0)');
  assert.equal(input.value('charge', 'launch'), 0, 'trigger axis at exactly 0 is not half pressed');
  // Cross is raw button 1 -> standard A (confirm)
  state.pads = [raw({ 1: 1 }, restAxes)];
  input.poll(1 / 60);
  assert.equal(input.pressed('confirm', 'menu'), true, 'Cross confirms');
  // hat up -> menu up; L2 axis fully pulled -> charge
  const pulled = [...restAxes]; pulled[9] = -1; pulled[3] = 1;
  state.pads = [raw({}, pulled)];
  input.poll(1 / 60);
  assert.equal(input.nav('up'), 1, 'hat up navigates');
  assert.ok(input.value('charge', 'launch') > 0.95, 'L2 axis drives the charge trigger');
  assert.deepEqual(warned, [id], 'player warned once about the non-standard layout');
  const n = normalizePad(raw({}, pulled));
  assert.equal(n.mapping, 'standard');
  assert.equal(n.buttons.length, 17);
});

test('unplugging a controller mid-hold leaves no stuck input', () => {
  const { input, state } = rig([pad({ buttons: { 7: 1 }, axes: [0.9, 0, 0, 0] })]);
  input.context = 'battle';
  input.poll(1 / 60);
  assert.ok(input.held('ability1', 'battle') && input.value('steer_x', 'battle') > 0.5);
  state.pads = [];
  input.poll(1 / 60);
  assert.equal(input.held('ability1', 'battle'), false);
  assert.equal(input.value('steer_x', 'battle'), 0);
  assert.equal(input.released('ability1', 'battle'), true, 'the release is still reported');
});

const CUES = (a) => [
  () => a.unlock(), () => a.ui('confirm'), () => a.countdown(2), () => a.ignite(), () => a.launch('Perfect'),
  () => a.impact(0.08, 1), () => a.wall(0.05), () => a.grind(0.5), () => a.lockClick(), () => a.warning(),
  () => a.burst(), () => a.ringOut(), () => a.ability('storm', 'ultimate'), () => a.shockwave(), () => a.dash(),
  () => a.counter(), () => a.heal(), () => a.victory(), () => a.defeat(), () => a.cheer(1),
  () => a.setHum('a', 600, 0.4, true), () => a.stopHums(), () => a.crowdAmbience(true), () => a.playMusic('battle'),
  () => a.stopMusic(), () => a.setSettings({ master: 0.5 }),
];

test('audio degrades to silence without Web Audio or when the context is refused', () => {
  const quiet = new AudioEngine();
  for (const cue of CUES(quiet)) assert.doesNotThrow(cue);
  assert.equal(quiet.ok, false);
  const had = 'window' in globalThis;
  const prev = globalThis.window;
  globalThis.window = { AudioContext: class { constructor() { throw new Error('blocked by browser policy'); } } };
  const warn = console.warn; console.warn = () => {};
  try {
    const refused = new AudioEngine();
    for (const cue of CUES(refused)) assert.doesNotThrow(cue);
    assert.equal(refused.failed, true);
    assert.equal(refused.ensure(), null, 'no retry storm after a refusal');
  } finally {
    console.warn = warn;
    if (had) globalThis.window = prev; else delete globalThis.window;
  }
});

test('impact feedback tells head-on hits from grazes (from real simulated contacts)', () => {
  const firstImpact = (offsetZ, vz = 0) => {
    const tip = { endZ: -0.016, ballRadius: 0.0005, flatRadius: 0, mu: 0, patchRadius: 0, compliance: 0.12, restitution: 1 };
    const A = new TopBody(simpleSpec({ tip, linDrag: 0, aero: 0 }), { id: 'A' });
    const B = new TopBody(simpleSpec({ tip, linDrag: 0, aero: 0 }), { id: 'B' });
    const sim = new Simulation({ arena: flatArena(), tops: [A, B] });
    A.launch({ tipPos: new Vec3(-0.06, 0, -vz * 0.05), axis: new Vec3(0, 1, 0), spin: -600, velocity: new Vec3(1, 0, vz) });
    B.launch({ tipPos: new Vec3(0, 0, offsetZ), axis: new Vec3(0, 1, 0), spin: -600, velocity: new Vec3() });
    for (let i = 0; i < 60; i++) {
      sim.tick();
      const e = sim.events.find((x) => x.type === 'impact');
      if (e) return glanceOf(e.normal, A.v, B.v, e.approach);
    }
    return null;
  };
  const head = firstImpact(0);
  const graze = firstImpact(0.046);
  assert.ok(head && graze, 'both setups collide');
  assert.ok(head.glance < 0.3, `head-on reads as head-on (${head.glance.toFixed(2)})`);
  assert.ok(graze.glance > 0.55, `edge-on contact reads as a graze (${graze.glance.toFixed(2)})`);
  assert.ok(Math.abs(Math.hypot(...graze.tangent) - 1) < 1e-9, 'graze carries a unit sliding direction');
});

test('a browser that refuses gamepad access leaves keyboard input working', () => {
  const input = new InputManager({ getGamepads: () => { throw new DOMException('gamepad is not allowed', 'SecurityError'); } });
  input.onKeyDown({ code: 'Enter' });
  assert.doesNotThrow(() => input.poll(1 / 60));
  assert.equal(input.pressed('confirm', 'menu'), true);
  assert.deepEqual(input.pads, []);
});
