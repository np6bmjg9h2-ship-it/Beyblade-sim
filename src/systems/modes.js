// Challenge, Survival and League rules. All state is plain data on the
// profile so runs and seasons survive reloads.

import { CHALLENGES, CHALLENGE_INDEX } from '../data/challenges.js';
import { CHARACTERS } from '../data/characters.js';
import { ARCHETYPES, ARCHETYPE_INDEX } from '../data/opponents.js';
import { ARENAS } from '../data/arenas.js';
import { TOURNAMENT_INDEX } from '../data/tournaments.js';
import { setSources } from '../data/sets.js';
import { Rng, mixSeeds } from '../core/rng.js';
import { assembleTop } from './assembly.js';
import { loadoutItems } from './loadout.js';
import { rollLoot, addItem } from './loot.js';
import { addPlayerXp } from './profile.js';
import { rivalParticipant, rivalItems, buildRole, ROLE_NAMES } from './rivals.js';
import { createTournament, grantUnlock } from './tournament.js';

// ------------------------------------------------------------ opponents

export function opponentFrom(spec, { id = 'opp', name = null, tier = 1, seedKey = 'x' } = {}) {
  if (spec.rival) return rivalParticipant(null, spec.rival, spec.tier || tier, { difficulty: spec.difficulty ?? 1, pid: id });
  const arch = ARCHETYPE_INDEX[spec.archetype] || ARCHETYPE_INDEX.all;
  const build = { id: 'mode', parts: arch.parts, launcher: arch.launcher, cable: arch.cable };
  const items = rivalItems(`mode:${seedKey}`, build, spec.tier || tier);
  const sets = setSources([...Object.values(items.parts), items.launcher, items.cable]);
  return {
    id, name: name || arch.name, human: false, ai: spec.ai || arch.ai, difficulty: spec.difficulty ?? 1,
    build: items.parts, launcher: items.launcher, cable: items.cable,
    beast: arch.beast && arch.beast !== 'vexscor' ? { id: arch.beast, bondLevel: Math.min(8, 2 + (spec.tier || tier) * 2), awakened: false } : null,
    spin: arch.spin || 'R', technique: arch.technique || 'normal', color: arch.color,
    knownTechniques: ['normal', 'power', 'controlled', 'bank', 'spiral', 'phantom', 'lance'],
    modSources: sets.sources, launchMods: sets.launch,
  };
}

// ------------------------------------------------------------ challenges

export function challengeStatus(profile, c) {
  const done = profile.stats.challengesDone?.[c.id];
  if (c.req?.level && profile.player.level < c.req.level) return { locked: true, reason: `Reach player level ${c.req.level}.`, done };
  return { locked: false, done };
}

export function checkConstraint(profile, L, c) {
  const errors = [];
  const C = c.constraint || {};
  const { parts } = loadoutItems(profile, L);
  if (C.roles) { const role = buildRole(parts); if (!C.roles.includes(role)) errors.push(`Needs a ${C.roles.map((r) => ROLE_NAMES[r]).join('/')} build (yours plays as ${ROLE_NAMES[role]}).`); }
  if (C.maxMassG) {
    try { const m = assembleTop(parts, { spin: L.spin }).summary.massG; if (m > C.maxMassG) errors.push(`Top must weigh under ${C.maxMassG} g (yours: ${m.toFixed(1)} g).`); } catch { errors.push('Build does not assemble.'); }
  }
  if (C.spin && (L.spin || 'R') !== C.spin) errors.push(`Launch ${C.spin === 'L' ? 'left' : 'right'} spin (set it in the Workshop; needs a compatible launcher).`);
  return errors;
}

// Did the player (index 0) meet the challenge goal?
export function evaluateChallenge(c, result) {
  const st = result.fighters[0].stats;
  const won = result.winner === 0;
  const fails = [];
  if (!won) fails.push('You need to win the match.');
  const g = c.goal || {};
  const mine = result.rounds.filter((r) => r.winner === 0);
  if (g.finishAll && !(mine.length && mine.every((r) => g.finishAll.includes(r.how)))) fails.push(`Every round you win must end by ${g.finishAll.join(' or ')}.`);
  if (g.finishAny && !mine.some((r) => r.how === g.finishAny)) fails.push(`Win at least one round by ${g.finishAny}.`);
  if (g.maxRoundTime && !(mine.length && mine.every((r) => r.time <= g.maxRoundTime))) fails.push(`Every round you win must last under ${g.maxRoundTime} s.`);
  if (g.perfect && (st.perfectLaunches || 0) < g.perfect) fails.push(`Land ${g.perfect} Perfect launches (you landed ${st.perfectLaunches || 0}).`);
  if (g.noLockSlip && (st.lockClicksTaken || 0) > 0) fails.push(`No lock slips allowed (you took ${st.lockClicksTaken}).`);
  if (g.comeback && !(st.comebacks > 0)) fails.push('Win a round after dropping below 20% spin.');
  return { ok: fails.length === 0, fails };
}

export function grantChallengeReward(profile, c) {
  const S = profile.stats;
  S.challengesDone = S.challengesDone || {};
  const first = !S.challengesDone[c.id];
  const out = { first, credits: 0, xp: 0, items: [], unlocks: [] };
  if (first) {
    S.challengesDone[c.id] = Date.now();
    out.credits = c.reward.credits || 0;
    out.xp = c.reward.xp || 0;
    if (c.reward.loot) { const it = rollLoot(profile, { label: `Challenge: ${c.name}`, ...c.reward.loot }); addItem(profile, it); out.items.push(it); }
    if (c.reward.title && grantUnlock(profile, 'title:' + c.reward.title)) out.unlocks.push('title:' + c.reward.title);
  } else out.credits = Math.round((c.reward.credits || 0) * 0.1);
  profile.currency.credits += out.credits;
  if (out.xp) out.levelUps = addPlayerXp(profile, out.xp);
  return out;
}

// ------------------------------------------------------------ survival

export const SURVIVAL_MILESTONES = { 3: { tier: 1, minRarity: 'uncommon' }, 6: { tier: 2, minRarity: 'rare' }, 10: { tier: 3, minRarity: 'epic' }, 15: { tier: 4, minRarity: 'legendary' }, 20: { tier: 4, minRarity: 'mythic' } };

export function startSurvival(profile, loadoutId, seed = Date.now() >>> 0) {
  profile.survival = profile.survival || { best: 0, runs: 0 };
  profile.survival.active = { seed, stage: 0, wins: 0, bank: 0, items: [], loadoutId, started: Date.now(), repairs: 0, log: [] };
  profile.survival.runs = (profile.survival.runs || 0) + 1;
  return profile.survival.active;
}

// Stage n opponent: difficulty climbs; every 5th stage is a rival "boss".
export function survivalStage(profile, run) {
  const n = run.stage;
  const rng = new Rng(mixSeeds(run.seed, n, 'stage'));
  const arenas = ARENAS.filter((a) => profile.arenasUnlocked.includes(a.id));
  const arena = rng.pick(arenas).id;
  const difficulty = Math.min(1.3, 0.55 + n * 0.055);
  const tier = Math.min(5, 1 + Math.floor(n / 4));
  const boss = n > 0 && (n + 1) % 5 === 0;
  if (boss) {
    const pool = CHARACTERS.filter((c) => c.builds.some((b) => b.tier <= tier));
    const c = pool[Math.min(pool.length - 1, Math.floor(rng.next() * pool.length))];
    return { stage: n, arena, boss: true, difficulty, tier, spec: { rival: c.id, tier, difficulty }, name: c.name };
  }
  const a = rng.pick(ARCHETYPES);
  return { stage: n, arena, boss: false, difficulty, tier, spec: { archetype: a.id, difficulty, tier: Math.max(1, tier - 1) }, name: `${a.name} #${n + 1}` };
}

export function survivalWin(profile, run) {
  run.wins++;
  run.stage++;
  const pay = 40 + run.stage * 18;
  run.bank += pay;
  const out = { pay, items: [] };
  const m = SURVIVAL_MILESTONES[run.wins];
  if (m) { const it = rollLoot(profile, { label: `Survival stage ${run.wins}`, ...m }); addItem(profile, it); run.items.push(it.uid); out.items.push(it); }
  if (run.wins % 3 === 0) { run.repairs++; out.repair = true; }
  return out;
}

// Field repair: +30% condition to each part of the run's loadout.
export function survivalRepair(profile, run) {
  if (!(run.repairs > 0)) return false;
  const L = profile.loadouts.find((l) => l.id === run.loadoutId);
  if (!L) return false;
  for (const uid of [...Object.values(L.parts), L.launcher, L.cable]) {
    const it = uid && profile.inventory[uid];
    if (!it) continue;
    it.durability = Math.min(it.maxDurability, it.durability + it.maxDurability * 0.3);
    if (it.parts) for (const k of Object.keys(it.parts)) it.parts[k] = Math.min(100, it.parts[k] + 30);
  }
  run.repairs--;
  return true;
}

export function endSurvival(profile, { cashOut = false } = {}) {
  const S = profile.survival;
  const run = S?.active;
  if (!run) return null;
  const credits = cashOut ? run.bank : Math.round(run.bank * 0.75);
  profile.currency.credits += credits;
  const xp = run.wins * 40;
  const levelUps = addPlayerXp(profile, xp);
  const newBest = run.wins > (S.best || 0);
  S.best = Math.max(S.best || 0, run.wins);
  profile.stats.survivalBest = Math.max(profile.stats.survivalBest || 0, run.wins);
  S.active = null;
  return { wins: run.wins, credits, xp, levelUps, newBest, cashOut, items: run.items.map((u) => profile.inventory[u]).filter(Boolean) };
}

// ------------------------------------------------------------ league

export const DIVISIONS = [
  { n: 1, name: 'Elite Division', def: 'league_d1' },
  { n: 2, name: 'Master Division', def: 'league_d2' },
  { n: 3, name: 'Pro Division', def: 'league_d3' },
  { n: 4, name: 'Amateur Division', def: 'league_d4' },
  { n: 5, name: 'Rookie Division', def: 'league_d5' },
];

export function leagueState(profile) {
  profile.league = profile.league || { division: 5, season: 1, active: null, history: [] };
  return profile.league;
}

export function startSeason(profile, loadoutIndex, seed = Date.now() >>> 0) {
  const LG = leagueState(profile);
  const div = DIVISIONS.find((d) => d.n === LG.division);
  const t = createTournament(TOURNAMENT_INDEX[div.def], profile, { seed, loadoutIndex });
  t.league = { division: LG.division, season: LG.season };
  t.name = `${div.name} · Season ${LG.season}`;
  LG.active = t;
  return t;
}

// Promotion for the top two, relegation for the bottom two.
export function applyLeagueResult(profile, t, place) {
  const LG = leagueState(profile);
  const size = t.entrants.length;
  let move = 'stay';
  if (place != null && place <= 2 && LG.division > 1) { LG.division--; move = 'promoted'; }
  else if ((place == null || place >= size - 1) && LG.division < 5) { LG.division++; move = 'relegated'; }
  LG.history.unshift({ season: t.league.season, division: t.league.division, place, move, date: Date.now() });
  LG.history.length = Math.min(30, LG.history.length);
  LG.season++;
  LG.best = Math.min(LG.best ?? 5, LG.division);
  return move;
}

export { CHALLENGES, CHALLENGE_INDEX };
