// Headless AI-vs-AI matches for tournaments. A "job" is plain data (arena,
// format, seed and two battle participants) so it can be posted to a Web
// Worker; the result summary is what the tournament records.

import { Battle } from './battle.js';

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

export function runMatchJob(job) {
  const b = createJobBattle(job);
  let guard = 0;
  while (!stepJobBattle(b, 600) && guard++ < 200);
  if (!b.result) b.finishMatch();
  return summarizeResult(b.result);
}
