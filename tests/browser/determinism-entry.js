// Cross-engine determinism probe (bundled by tests/browser/determinism.js and
// run in Node, Chromium, Firefox and WebKit). Plays Daily battles with a
// scripted player, fingerprints the exact simulation state every 120 ticks
// (raw float64 bits, no tolerance) and the assembled specs before tick 0,
// then re-plays recordings made elsewhere.

import { Battle } from '../../src/game/battle.js';
import { emptyControls } from '../../src/game/ai.js';
import { Rng } from '../../src/core/rng.js';
import { dailyChallenge, dailySession } from '../../src/systems/daily.js';

const f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer);
function mix(h, x) {
  f64[0] = x;
  for (let i = 0; i < 2; i++) { h ^= u32[i]; h = Math.imul(h, 16777619) >>> 0; }
  return h;
}
function stateHash(b) {
  let h = 2166136261;
  for (const f of b.fighters) {
    const t = f.top;
    for (const v of [t.p, t.v, t.L, t.w]) { h = mix(h, v.x); h = mix(h, v.y); h = mix(h, v.z); }
    h = mix(h, t.q.x); h = mix(h, t.q.y); h = mix(h, t.q.z); h = mix(h, t.q.w);
  }
  return h.toString(16);
}
function specHash(spec) {
  let h = 2166136261;
  const walk = (o, depth) => {
    for (const k of Object.keys(o).sort()) {
      const v = o[k];
      if (typeof v === 'number') h = mix(h, v);
      else if (v && typeof v === 'object' && depth < 3) walk(v, depth + 1);
    }
  };
  walk(spec, 0);
  return h.toString(16);
}

// Battles: three from one day, two from another (fixed, so every engine
// plays the same ones).
const CASES = [['2026-01-01', 0], ['2026-01-01', 1], ['2026-01-01', 2], ['2026-06-15', 0], ['2026-06-15', 1]];

function session(key, i) {
  const ch = dailyChallenge(key);
  return dailySession(ch, { picks: [] }, i, { name: 'Probe' });
}

function drive(b, script) {
  const out = { specs: [], hashes: [], ticks: 0 };
  let lastRound = 0, guard = 0;
  while (b.phase !== 'matchOver' && guard++ < 200000) {
    if (script) script(b);
    b.update(1 / 60, script ? [script.ctl] : []);
    if (b.round !== lastRound && b.fighters[0].top) { lastRound = b.round; out.specs.push(b.fighters.map((f) => specHash(f.top.spec)).join('/')); }
    // every 60 frames of 1/60 s = every 120 ticks
    if ((b.phase === 'battle' || b.phase === 'finishing') && ++out.ticks % 60 === 0) out.hashes.push(stateHash(b));
    if (b.phase === 'roundOver') b.nextRound();
  }
  const r = b.result;
  out.summary = { winner: r.winner, rounds: r.rounds.map((x) => ({ winner: x.winner, how: x.how, time: +x.time.toFixed(3) })) };
  return out;
}

function scripted(seed) {
  const rng = new Rng(seed);
  const ctl = emptyControls();
  const fn = (b) => {
    if (b.phase === 'setup') { b.setAim(0, { x: -0.06 + rng.next() * 0.02, z: rng.next() * 0.02, lean: rng.next() * 0.2, dir: 0.1 }); b.confirmSetup(0); }
    if (b.phase === 'countdown') {
      const L = b.fighters[0].launch;
      if (!L.released) { b.setAim(0, { ...L.aim, x: L.aim.x + (rng.next() - 0.5) * 0.002 }); b.chargeInput(0, true, 1); if (L.meter.charge >= 0.9) b.release(0); }
    }
    const t = b.battleTime;
    ctl.steer.set(Math.round(Math.cos(t * 1.7 + seed) * 0.8 * 64) / 64, 0, Math.round(Math.sin(t * 1.3) * 0.8 * 64) / 64);
    ctl.dash = Math.floor(t * 2) % 7 === 3;
    ctl.brace = Math.floor(t) % 5 === 2;
  };
  fn.ctl = ctl;
  return fn;
}

export function record() {
  return CASES.map(([key, i], n) => {
    const s = session(key, i);
    const b = new Battle({ arenaId: s.arenaId, format: s.format, seed: s.seed, participants: s.participants, rules: s.rules, roundTime: s.roundTime, record: true });
    b.headless = true;
    const out = drive(b, scripted(101 + n));
    out.replay = JSON.parse(JSON.stringify(b.replayData()));
    return out;
  });
}

export function replay(replays) {
  return CASES.map(([key, i], n) => {
    const s = session(key, i);
    const b = new Battle({ arenaId: s.arenaId, format: s.format, seed: s.seed, participants: s.participants, rules: s.rules, roundTime: s.roundTime, replay: replays[n].rec });
    b.headless = true;
    return drive(b, null);
  });
}

if (typeof window !== 'undefined') window.__det = { record, replay };
