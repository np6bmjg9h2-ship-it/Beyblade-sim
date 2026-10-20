// Headless AI-vs-AI matches for tournaments. A "job" is plain data (arena,
// format, seed and two battle participants) so it can be posted to a Web
// Worker; the result summary is what the tournament records.

import { Battle } from './battle.js';
import { Simulation, TICK } from '../physics/simulation.js';
import { TopBody } from '../physics/topBody.js';
import { Arena } from '../physics/arena.js';
import { ARENA_INDEX, resolveArena } from '../data/arenas.js';
import { assembleTop } from '../systems/assembly.js';
import { ModifierStack, collectTraitSources } from '../systems/modifiers.js';
import { resolveLaunchGear, computeLaunch, PERFECT_CENTER } from './launch.js';
import { Rng } from '../core/rng.js';
import * as dm from '../core/dmath.js';

export function createJobBattle(job) {
  const b = new Battle({
    arenaId: job.arenaId, format: job.format, seed: job.seed, participants: job.participants,
    rules: { slowmo: false, durability: false, ...(job.rules || {}) }, mode: 'sim',
  });
  b.headless = true;
  return b;
}

// Advance a job battle by up to `updates` 1/60 s steps. Returns true when done.
export function stepJobBattle(b, updates = 60) {
  for (let i = 0; i < updates && b.phase !== 'matchOver'; i++) {
    b.update(1 / 60, []);
    if (b.phase === 'setup') for (const f of b.fighters) b.confirmSetup(f.index);
  }
  if (b.phase !== 'matchOver' && b.round > 12) b.finishMatch();
  return b.phase === 'matchOver';
}

export function summarizeResult(r) {
  const decisive = [...r.rounds].reverse().find((x) => x.winner === r.winner) || r.rounds[r.rounds.length - 1];
  return {
    winnerSide: r.winner,
    score: r.score.map((s) => s.rounds),
    points: r.score.map((s) => s.points),
    how: decisive?.how || null,
    rounds: r.rounds.map((x) => ({ winner: x.winner, how: x.how, time: +x.time.toFixed(1) })),
    impacts: r.fighters.map((f) => f.stats.impacts),
    heaviest: Math.max(0, ...r.fighters.map((f) => f.stats.impulseMax)),
    simulated: true,
  };
}

// Solo spin test: one top, launched with its own launcher and cord at
// perfect timing near the centre, left alone until it stops. Trait and set
// modifiers with always-true conditions apply (no opponent exists).
export function runSpinTest(job) {
  const p = job.participant;
  const arena = new Arena(resolveArena(job.arenaId) || ARENA_INDEX.standard);
  const asm = assembleTop(p.build, { spin: p.spin || 'R' });
  const top = new TopBody(asm.spec, { id: 'solo', side: 0 });
  const sim = new Simulation({ arena, tops: [top] });
  const mods = new ModifierStack();
  const items = Object.entries(p.build).filter(([, it]) => it).map(([slot, item]) => ({ slot, item }));
  for (const src of collectTraitSources(items, asm.parts)) mods.add(src);
  for (const src of p.modSources || []) mods.add(src);
  const gear = resolveLaunchGear(p.launcher, p.cable, { launchMods: p.launchMods });
  const res = computeLaunch({ gear, techId: job.technique || 'controlled', charge: PERFECT_CENTER, aim: { x: -0.03, z: 0, lean: 0, dir: 0 }, spinDir: p.spin || 'R', topSpec: asm.spec, rng: new Rng(job.seed || 1), arena, opponentAim: { x: 0.1, z: 0, lean: 0, dir: Math.PI }, skillMods: p.skillMods });
  top.launch({ tipPos: res.tipPos, axis: res.axis, spin: res.spin, velocity: res.velocity });
  top.maxSpinRate = Math.abs(res.spin);
  const samples = [];
  const maxT = job.maxTime || 300;
  let next = 0;
  while (top.active && sim.time < maxT) {
    if (sim.time >= next) {
      const ctx = { spinFrac: top.spinFraction(), oppSpinFrac: 0, speed: dm.hypot(top.v.x, top.v.z), rFrac: dm.hypot(top.p.x, top.p.z) / arena.radius, oppRFrac: 1, approaching: false, time: sim.time, sinceCollision: 99, surfaceTag: arena.surfaceTag, oppositeSpin: false, abilityActive: false };
      mods.evaluate(ctx, top.mods);
      samples.push([+sim.time.toFixed(2), Math.round((top.spinAbs * 60) / (2 * Math.PI)), +(top.tilt * 57.2958).toFixed(1)]);
      next += job.sampleDt || 0.5;
    }
    sim.tick();
  }
  return { kind: 'spin', time: sim.time, how: top.active ? 'timeout' : top.state, launchRpm: Math.round((Math.abs(res.spin) * 60) / (2 * Math.PI)), launchEnergy: res.energy, samples, critRpm: Math.round((asm.summary.critSpin * 60) / (2 * Math.PI)), massG: asm.summary.massG, ledger: { ...top.ledger } };
}

export function runMatchJob(job) {
  if (job.kind === 'spin') return runSpinTest(job);
  const b = createJobBattle(job);
  let guard = 0;
  while (!stepJobBattle(b, 600) && guard++ < 200);
  if (!b.result) b.finishMatch();
  return summarizeResult(b.result);
}
