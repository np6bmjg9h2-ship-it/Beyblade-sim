// Tournament engine. Pure, serializable state (stored in the save while a
// tournament is active) and the rules for every format:
//   single     single elimination, standard seeding, byes for top seeds
//   double     double elimination with a losers' bracket and a grand final
//              (bracket reset when the losers' finalist wins the first final)
//   roundrobin everyone meets once, played matchday by matchday
//   league     round robin season (3/1/0 points) + top-N elimination playoffs
//   swiss      fixed rounds, pairing equal records without rematches
// The player is always entrant 0. Matches between AI entrants are resolved by
// real headless battles (see matchSim.js) — this module only records results.

import { TOURNAMENT_INDEX, TIER_DIFFICULTY, FORMAT_NAMES } from '../data/tournaments.js';
import { CHARACTER_INDEX } from '../data/characters.js';
import { ARCHETYPE_INDEX } from '../data/opponents.js';
import { setSources } from '../data/sets.js';
import { rarityRank } from '../data/rarity.js';
import { Rng, mixSeeds } from '../core/rng.js';
import { rivalPlan, rivalParticipant, rivalItems, fillerName, buildRole, ROLE_NAMES } from './rivals.js';
import { rollLoot, addItem } from './loot.js';
import { addPlayerXp } from './profile.js';
import { itemName } from './items.js';
import { applyLeagueResult } from './modes.js';
import * as dm from '../core/dmath.js';

export const PLAYER = 0;
const FILLER_BEASTS = ['zephyrax', 'ferrowulf', 'kerauno', 'geodrome', 'caelumanta', 'magmarion', 'pyrrhex', 'abyssion', 'noctivane'];
const nextPow2 = (n) => { let p = 1; while (p < n) p *= 2; return p; };

// ------------------------------------------------------------ entry

export function bestPlace(profile, id) {
  return profile.tournaments.records?.[id]?.best ?? null;
}

export function canEnter(profile, def) {
  const reasons = [];
  const r = def.req || {};
  if (profile.tournaments.active) reasons.push('Finish or withdraw from your current tournament first.');
  if (r.level && profile.player.level < r.level) reasons.push(`Requires player level ${r.level}.`);
  if (r.ranking && (profile.tournaments.ranking.points || 0) < r.ranking) reasons.push(`Requires ${r.ranking} circuit points.`);
  for (const [id, pl] of r.placed || []) {
    const b = bestPlace(profile, id);
    if (b == null || b > pl) reasons.push(`Requires a top-${pl} finish in the ${TOURNAMENT_INDEX[id]?.name || id}.`);
  }
  if (r.wonAny && !r.wonAny.some((id) => bestPlace(profile, id) === 1)) reasons.push(`Requires winning: ${r.wonAny.map((id) => TOURNAMENT_INDEX[id]?.name || id).join(' or ')}.`);
  if (r.story && !profile.story.flags[r.story]) reasons.push('Requires further story progress.');
  if ((def.fee || 0) > profile.currency.credits) reasons.push(`Entry fee ${def.fee} credits.`);
  return { ok: reasons.length === 0, reasons };
}

// Rule checks for the loadout the player registers / uses.
export function checkLoadoutRules(profile, L, def, t = null) {
  const errors = [];
  const rules = def.rules || {};
  const parts = Object.fromEntries(Object.entries(L.parts).map(([s, uid]) => [s, uid ? profile.inventory[uid] : null]));
  const R = rules.restrict || {};
  if (R.roles) {
    const role = buildRole(parts);
    if (!R.roles.includes(role)) errors.push(`${def.name} allows only ${R.roles.map((x) => ROLE_NAMES[x]).join(', ')} builds (this build plays as ${ROLE_NAMES[role]}).`);
  }
  if (R.maxRarity) {
    for (const it of Object.values(parts)) if (it && rarityRank(it.rarity) > rarityRank(R.maxRarity)) errors.push(`${itemName(it)} exceeds the ${R.maxRarity} rarity limit.`);
  }
  if (R.beasts === false && L.beast) errors.push('Spirit Chips are not allowed in this tournament.');
  if (t?.loadout?.locked) {
    const lk = t.loadout.locked;
    const same = Object.entries(lk.parts).every(([s, uid]) => L.parts[s] === uid) && L.launcher === lk.launcher && L.cable === lk.cable;
    if (!same || L.id !== t.loadout.id) errors.push('Loadout lock: you must battle with the parts you registered.');
  }
  return errors;
}

// What the active tournament forbids outside battle (used by the Workshop).
export function activeLocks(profile) {
  const t = profile.tournaments.active;
  if (!t || t.status !== 'active') return { repairs: true, registered: new Set(), items: new Set(), lockedLoadout: null, name: null };
  const def = TOURNAMENT_INDEX[t.defId];
  const reg = new Set();
  const items = new Set();
  const L = profile.loadouts.find((l) => l.id === t.loadout?.id);
  if (L) for (const uid of [...Object.values(L.parts), L.launcher, L.cable]) if (uid) items.add(uid);
  if (t.loadout?.locked) {
    for (const uid of Object.values(t.loadout.locked.parts)) if (uid) reg.add(uid);
    if (t.loadout.locked.launcher) reg.add(t.loadout.locked.launcher);
    if (t.loadout.locked.cable) reg.add(t.loadout.locked.cable);
  }
  const out = playerEliminated(t);
  return { repairs: def.rules?.repairs !== false || out, registered: out ? new Set() : reg, items, lockedLoadout: t.loadout?.locked && !out ? t.loadout.id : null, name: def.name };
}

function buildEntrants(def, profile, rng) {
  const base = TIER_DIFFICULTY[def.tier];
  const E = [{ kind: 'player', name: profile.player.name, color: profile.player.color, rating: base * 1100 + Math.min(160, (profile.tournaments.ranking.points || 0) * 0.25) + profile.player.level * 2 }];
  for (const id of def.rivals || []) {
    if (E.length >= def.size) break;
    const ch = CHARACTER_INDEX[id];
    const bonus = id === 'aurelia' ? 0.1 : id === 'valen' ? 0.06 : 0.05;
    const difficulty = Math.min(1.35, base + bonus);
    E.push({ kind: 'rival', rivalId: id, name: ch.name, color: ch.color, beast: ch.beast, difficulty, rating: difficulty * 1100 + 40 + rng.range(0, 25) });
  }
  const used = new Set(E.map((e) => e.name));
  const fillers = def.fillers?.length ? def.fillers : ['all'];
  let i = 0;
  while (E.length < def.size) {
    const arch = ARCHETYPE_INDEX[fillers[i++ % fillers.length]] || ARCHETYPE_INDEX.all;
    const difficulty = Math.max(0.45, Math.min(1.3, base + rng.range(-0.1, 0.03)));
    let beast = arch.beast;
    if (beast === 'vexscor' || beast === 'orrery') beast = rng.pick(FILLER_BEASTS);
    E.push({ kind: 'filler', archetype: arch.id, name: fillerName(rng, used), color: arch.color, beast, difficulty, rating: difficulty * 1100 + rng.range(0, 30), seed: rng.nextU32() });
  }
  E.forEach((e, idx) => { e.idx = idx; e.rating = Math.round(e.rating); });
  return E;
}

export function createTournament(def, profile, { seed = Date.now() >>> 0, loadoutIndex = profile.activeLoadout } = {}) {
  const rng = new Rng(mixSeeds(seed, def.id, 'entrants'));
  const L = profile.loadouts[loadoutIndex];
  const t = {
    v: 1, id: `${def.id}-${seed >>> 0}`, defId: def.id, name: def.name, tier: def.tier, format: def.format, seed: seed >>> 0,
    created: Date.now(), status: 'active', entrants: buildEntrants(def, profile, rng), stages: [], stage: 0,
    loadout: { index: loadoutIndex, id: L?.id, locked: def.rules?.lockLoadout && L ? { parts: { ...L.parts }, launcher: L.launcher, cable: L.cable } : null },
    log: [], rewarded: false, withdrawn: false,
  };
  const order = seedOrder(t);
  switch (def.format) {
    case 'single': t.stages.push(genSingle(t, 0, order, 'Bracket')); break;
    case 'double': t.stages.push(genDouble(t, 0, order)); break;
    case 'roundrobin': t.stages.push(genRoundRobin(t, 0, order, 'Round Robin')); break;
    case 'league': t.stages.push(genRoundRobin(t, 0, order, 'Season')); break;
    case 'swiss': t.stages.push(genSwiss(t, 0, order, def.rounds || 4)); break;
    default: throw new Error('Unknown format ' + def.format);
  }
  resolve(t);
  return t;
}

export function seedOrder(t, idxs = null) {
  const list = (idxs || t.entrants.map((e) => e.idx)).slice();
  return list.sort((a, b) => t.entrants[b].rating - t.entrants[a].rating || a - b);
}

// ------------------------------------------------------------ generation

function newMatch(t, si, id, round, k, extra = {}) {
  return {
    id, stage: si, round, k, a: null, b: null, aKnown: false, bKnown: false, srcA: null, srcB: null,
    status: 'pending', winner: null, loser: null, score: [0, 0], points: [0, 0], how: null, bye: false, ...extra,
  };
}

export function seedPositions(size) {
  let pos = [1];
  while (pos.length < size) { const n = pos.length * 2; pos = pos.flatMap((p) => [p, n + 1 - p]); }
  return pos;
}

function roundName(R, r, prefix = '') {
  const left = R - r;
  if (left === 1) return prefix + 'Final';
  if (left === 2) return prefix + 'Semi-finals';
  if (left === 3) return prefix + 'Quarter-finals';
  return `${prefix}Round of ${2 ** left}`;
}

function genSingle(t, si, order, name, { playoff = false } = {}) {
  const n = order.length, size = nextPow2(Math.max(2, n)), R = dm.log2(size);
  const pos = seedPositions(size);
  const M = [];
  for (let r = 0; r < R; r++) {
    const count = size >> (r + 1);
    for (let k = 0; k < count; k++) {
      const m = newMatch(t, si, `s${si}w${r}m${k}`, r, k, { bracket: 'W', roundName: roundName(R, r, playoff ? 'Playoff ' : ''), isFinal: r === R - 1, playoff });
      if (r === 0) {
        const sa = pos[2 * k], sb = pos[2 * k + 1];
        m.a = sa <= n ? order[sa - 1] : null; m.b = sb <= n ? order[sb - 1] : null;
        m.aKnown = m.bKnown = true;
        m.seedA = sa; m.seedB = sb;
      } else {
        m.srcA = { m: `s${si}w${r - 1}m${2 * k}`, take: 'winner' };
        m.srcB = { m: `s${si}w${r - 1}m${2 * k + 1}`, take: 'winner' };
      }
      M.push(m);
    }
  }
  return { type: 'single', name, entrants: order.slice(), rounds: R, size, matches: M, playoff };
}

function genDouble(t, si, order) {
  const n = order.length, size = Math.max(4, nextPow2(n)), R = dm.log2(size);
  const st = genSingle(t, si, order, 'Upper Bracket');
  st.type = 'double';
  st.name = 'Double Elimination';
  for (const m of st.matches) m.roundName = roundName(R, m.round, 'Upper ');
  const M = st.matches;
  const id = (r, k) => `s${si}l${r}m${k}`;
  let lr = 0;
  let count = size / 4;
  for (let k = 0; k < count; k++) {
    M.push(newMatch(t, si, id(lr, k), lr, k, { bracket: 'L', srcA: { m: `s${si}w0m${2 * k}`, take: 'loser' }, srcB: { m: `s${si}w0m${2 * k + 1}`, take: 'loser' } }));
  }
  let prev = lr;
  for (let wr = 1; wr < R; wr++) {
    lr++;
    for (let k = 0; k < count; k++) {
      // dropping losers cross over (reverse order) to delay rematches
      M.push(newMatch(t, si, id(lr, k), lr, k, { bracket: 'L', srcA: { m: id(prev, k), take: 'winner' }, srcB: { m: `s${si}w${wr}m${count - 1 - k}`, take: 'loser' } }));
    }
    prev = lr;
    if (count > 1) {
      lr++;
      for (let k = 0; k < count / 2; k++) {
        M.push(newMatch(t, si, id(lr, k), lr, k, { bracket: 'L', srcA: { m: id(prev, 2 * k), take: 'winner' }, srcB: { m: id(prev, 2 * k + 1), take: 'winner' } }));
      }
      count /= 2;
      prev = lr;
    }
  }
  const LR = lr + 1;
  for (const m of M) if (m.bracket === 'L') m.roundName = m.round === LR - 1 ? 'Lower Final' : `Lower Round ${m.round + 1}`;
  for (const m of M) if (m.bracket === 'W' && m.round === R - 1) m.isFinal = false;
  M.push(newMatch(t, si, `s${si}gf0`, 0, 0, { bracket: 'GF', roundName: 'Grand Final', isFinal: true, srcA: { m: `s${si}w${R - 1}m0`, take: 'winner' }, srcB: { m: id(LR - 1, 0), take: 'winner' } }));
  M.push(newMatch(t, si, `s${si}gf1`, 1, 0, { bracket: 'GF', roundName: 'Grand Final (Reset)', isFinal: true, reset: true }));
  st.lowerRounds = LR;
  return st;
}

function genRoundRobin(t, si, order, name) {
  const ids = order.slice();
  if (ids.length % 2) ids.push(null);
  const n = ids.length;
  const M = [];
  let arr = ids.slice();
  for (let r = 0; r < n - 1; r++) {
    let k = 0;
    for (let i = 0; i < n / 2; i++) {
      let a = arr[i], b = arr[n - 1 - i];
      if (a == null || b == null) continue;
      if (r % 2 === 1 && i === 0) [a, b] = [b, a];
      M.push(newMatch(t, si, `s${si}r${r}m${k}`, r, k, { bracket: 'RR', a, b, aKnown: true, bKnown: true, roundName: `Matchday ${r + 1}` }));
      k++;
    }
    arr = [arr[0], arr[n - 1], ...arr.slice(1, n - 1)];
  }
  return { type: 'roundrobin', name, entrants: order.slice(), rounds: n - 1, matches: M, gated: true };
}

function genSwiss(t, si, order, rounds) {
  const st = { type: 'swiss', name: 'Swiss', entrants: order.slice(), rounds, matches: [], gated: true, paired: 0 };
  pairSwiss(t, st, si);
  return st;
}

function pairSwiss(t, st, si) {
  const r = st.paired;
  const played = new Set(st.matches.filter((m) => m.a != null && m.b != null).map((m) => key(m.a, m.b)));
  let list;
  if (r === 0) {
    const half = Math.ceil(st.entrants.length / 2);
    list = [];
    for (let i = 0; i < half; i++) { list.push(st.entrants[i]); if (st.entrants[i + half] != null) list.push(st.entrants[i + half]); }
  } else list = standings(t, st).map((row) => row.idx);
  let k = 0;
  if (list.length % 2) {
    // bye to the lowest-ranked entrant without one
    const hadBye = new Set(st.matches.filter((m) => m.bye).map((m) => m.a));
    const pick = [...list].reverse().find((x) => !hadBye.has(x)) ?? list[list.length - 1];
    list.splice(list.indexOf(pick), 1);
    st.matches.push(newMatch(t, si, `s${si}r${r}m${k++}`, r, k, { bracket: 'S', a: pick, b: null, aKnown: true, bKnown: true, roundName: `Round ${r + 1}` }));
  }
  while (list.length) {
    const a = list.shift();
    let j = list.findIndex((b) => !played.has(key(a, b)));
    if (j < 0) j = 0;
    const b = list.splice(j, 1)[0];
    st.matches.push(newMatch(t, si, `s${si}r${r}m${k++}`, r, k, { bracket: 'S', a, b, aKnown: true, bKnown: true, roundName: `Round ${r + 1}` }));
  }
  st.paired++;
}

const key = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);

// ------------------------------------------------------------ resolution

export function matchById(t, id) {
  for (const st of t.stages) { const m = st.matches.find((x) => x.id === id); if (m) return m; }
  return null;
}

function resolveStage(t, st) {
  const byId = Object.fromEntries(st.matches.map((m) => [m.id, m]));
  let changed = true;
  while (changed) {
    changed = false;
    for (const m of st.matches) {
      if (m.status === 'done') continue;
      for (const side of ['a', 'b']) {
        const src = m[side === 'a' ? 'srcA' : 'srcB'];
        const kn = side + 'Known';
        if (!m[kn] && src) {
          const s = byId[src.m];
          if (s?.status === 'done') { m[side] = src.take === 'winner' ? s.winner : s.loser; m[kn] = true; changed = true; }
        }
      }
      if (m.aKnown && m.bKnown && (m.a == null || m.b == null)) {
        m.status = 'done'; m.bye = m.a != null || m.b != null; m.winner = m.a ?? m.b; m.loser = null; changed = true;
      }
    }
  }
  // readiness (round-gated formats release one matchday at a time)
  const open = st.matches.filter((m) => m.status !== 'done');
  const minRound = open.length ? Math.min(...open.map((m) => m.round)) : Infinity;
  for (const m of open) {
    const ok = m.aKnown && m.bKnown && m.a != null && m.b != null && (!st.gated || m.round <= minRound);
    m.status = ok ? 'ready' : 'pending';
  }
}

export function stageComplete(st) {
  if (st.type === 'swiss' && st.paired < st.rounds) return false;
  return st.matches.every((m) => m.status === 'done');
}

function resolve(t) {
  for (;;) {
    const st = t.stages[t.stage];
    resolveStage(t, st);
    if (st.type === 'swiss' && st.matches.every((m) => m.status === 'done') && st.paired < st.rounds) {
      pairSwiss(t, st, t.stage);
      continue;
    }
    if (!stageComplete(st)) return;
    const def = TOURNAMENT_INDEX[t.defId];
    if (def.format === 'league' && t.stage === 0) {
      const top = standings(t, st).slice(0, def.playoffs || 4).map((r) => r.idx);
      t.stages.push(genSingle(t, 1, top, 'Playoffs', { playoff: true }));
      t.stage = 1;
      t.log.push({ t: Date.now(), text: `Season complete. Playoffs: ${top.map((i) => t.entrants[i].name).join(', ')}.` });
      continue;
    }
    t.status = 'complete';
    return;
  }
}

// Record a match result. side-relative: winnerSide 0 = m.a, 1 = m.b, null = draw.
export function applyResult(t, matchId, res) {
  const m = matchById(t, matchId);
  if (!m || m.status === 'done') return null;
  const st = t.stages[m.stage];
  let ws = res.winnerSide;
  const elim = st.type === 'single' || st.type === 'double';
  if (ws == null && elim) {
    // elimination needs a winner: finish points, then the higher seed
    const [pa, pb] = res.points || [0, 0];
    ws = pa !== pb ? (pa > pb ? 0 : 1) : t.entrants[m.a].rating >= t.entrants[m.b].rating ? 0 : 1;
    m.tiebreak = true;
  }
  m.score = res.score || [0, 0];
  m.points = res.points || [0, 0];
  m.how = res.how || null;
  m.rounds = res.rounds || [];
  m.status = 'done';
  m.winner = ws == null ? null : ws === 0 ? m.a : m.b;
  m.loser = ws == null ? null : ws === 0 ? m.b : m.a;
  m.draw = ws == null;
  m.simulated = !!res.simulated;
  m.forfeit = !!res.forfeit;
  if (m.bracket === 'GF' && !m.reset) {
    const gf2 = st.matches.find((x) => x.reset);
    if (m.winner === m.a) { gf2.status = 'done'; gf2.skipped = true; gf2.winner = m.winner; gf2.loser = m.loser; gf2.aKnown = gf2.bKnown = true; gf2.a = m.a; gf2.b = m.b; }
    else { gf2.a = m.a; gf2.b = m.b; gf2.aKnown = gf2.bKnown = true; }
  }
  const name = (i) => (i == null ? '—' : t.entrants[i].name);
  t.log.push({ t: Date.now(), text: m.draw ? `${m.roundName}: ${name(m.a)} and ${name(m.b)} drew ${m.score.join('-')}` : `${m.roundName}: ${name(m.winner)} def. ${name(m.loser)} ${ws === 0 ? m.score.join('-') : [...m.score].reverse().join('-')}${m.tiebreak ? ' (tiebreak)' : ''}${m.forfeit ? ' (forfeit)' : ''}` });
  if (t.log.length > 80) t.log.shift();
  resolve(t);
  return m;
}

export function readyMatches(t) {
  if (t.status !== 'active') return [];
  return t.stages[t.stage].matches.filter((m) => m.status === 'ready');
}

export function playerMatch(t) {
  return readyMatches(t).find((m) => m.a === PLAYER || m.b === PLAYER) || null;
}

export function aiMatches(t) {
  return readyMatches(t).filter((m) => m.a !== PLAYER && m.b !== PLAYER);
}

// True when the player can no longer play any match in this tournament.
export function playerEliminated(t) {
  if (t.withdrawn) return true;
  if (t.status === 'complete') return true;
  const def = TOURNAMENT_INDEX[t.defId];
  const st = t.stages[t.stage];
  if (def.format === 'league' && t.stage === 1) return !st.entrants.includes(PLAYER) || lostElimination(st);
  if (st.type === 'single' || st.type === 'double') return lostElimination(st);
  return false;
}

// The match that knocked entrant `idx` out of an elimination stage, if any.
export function eliminatedIn(st, idx) {
  for (const m of st.matches) {
    if (m.status !== 'done' || m.loser !== idx || m.skipped || m.loser == null) continue;
    const feeds = st.matches.some((x) => (x.srcA?.m === m.id && x.srcA.take === 'loser') || (x.srcB?.m === m.id && x.srcB.take === 'loser'));
    // losing the first grand final as the upper-bracket finalist forces a reset match
    const toReset = m.bracket === 'GF' && !m.reset && m.loser === m.a;
    if (!feeds && !toReset) return m;
  }
  return null;
}

function lostElimination(st) { return !!eliminatedIn(st, PLAYER); }

// ------------------------------------------------------------ standings & places

export function standings(t, st) {
  const rows = new Map(st.entrants.map((i) => [i, { idx: i, played: 0, w: 0, d: 0, l: 0, pts: 0, rw: 0, rl: 0, fp: 0, buch: 0, byes: 0 }]));
  const swiss = st.type === 'swiss';
  for (const m of st.matches) {
    if (m.status !== 'done') continue;
    if (m.bye) { const r = rows.get(m.winner); if (r && swiss) { r.w++; r.byes++; r.pts += 1; } continue; }
    const A = rows.get(m.a), B = rows.get(m.b);
    if (!A || !B) continue;
    A.played++; B.played++;
    A.rw += m.score[0]; A.rl += m.score[1]; B.rw += m.score[1]; B.rl += m.score[0];
    A.fp += m.points[0]; B.fp += m.points[1];
    if (m.draw) { A.d++; B.d++; A.pts += swiss ? 0.5 : 1; B.pts += swiss ? 0.5 : 1; }
    else {
      const W = m.winner === m.a ? A : B, Lr = W === A ? B : A;
      W.w++; Lr.l++; W.pts += swiss ? 1 : 3;
    }
  }
  if (swiss) {
    for (const r of rows.values()) {
      let b = 0;
      for (const m of st.matches) {
        if (m.status !== 'done' || m.bye) continue;
        if (m.a === r.idx) b += rows.get(m.b).w; else if (m.b === r.idx) b += rows.get(m.a).w;
      }
      r.buch = b;
    }
  }
  return [...rows.values()].sort((x, y) => y.pts - x.pts || (swiss ? y.buch - x.buch : 0) || (y.rw - y.rl) - (x.rw - x.rl) || y.fp - x.fp || t.entrants[y.idx].rating - t.entrants[x.idx].rating);
}

// Places for an elimination stage (ties share the best place of the group).
function eliminationPlaces(t, st) {
  const places = new Map();
  const real = st.matches.filter((m) => m.status === 'done' && !m.bye && !m.skipped);
  const final = st.type === 'double' ? (st.matches.find((m) => m.reset && !m.skipped) || st.matches.find((m) => m.bracket === 'GF' && !m.reset)) : st.matches.find((m) => m.isFinal);
  if (final?.status === 'done') { places.set(final.winner, 1); places.set(final.loser, 2); }
  // remaining eliminations, latest first
  const elimRound = (m) => (st.type === 'double' ? (m.bracket === 'L' ? m.round : -1) : m.round);
  const losers = real.filter((m) => m !== final && m.bracket !== 'GF' && (st.type !== 'double' || m.bracket === 'L')).sort((a, b) => elimRound(b) - elimRound(a));
  let next = places.size + 1;
  let i = 0;
  while (i < losers.length) {
    const r = elimRound(losers[i]);
    const group = [];
    while (i < losers.length && elimRound(losers[i]) === r) group.push(losers[i++]);
    for (const m of group) if (m.loser != null && !places.has(m.loser)) places.set(m.loser, next);
    next += group.length;
  }
  return places;
}

export function finalPlacements(t) {
  const def = TOURNAMENT_INDEX[t.defId];
  const out = new Map();
  if (def.format === 'single' || def.format === 'double') return eliminationPlaces(t, t.stages[0]);
  if (def.format === 'league') {
    const table = standings(t, t.stages[0]);
    if (t.stages[1]) for (const [i, p] of eliminationPlaces(t, t.stages[1])) out.set(i, p);
    table.forEach((r, k) => { if (!out.has(r.idx)) out.set(r.idx, k + 1); });
    return out;
  }
  standings(t, t.stages[t.stages.length - 1]).forEach((r, k) => out.set(r.idx, k + 1));
  return out;
}

// The player's place if it is already decided (eliminated or complete).
export function playerPlace(t) {
  if (t.withdrawn) return null;
  const def = TOURNAMENT_INDEX[t.defId];
  if (t.status === 'complete') return finalPlacements(t).get(PLAYER) ?? null;
  if (!playerEliminated(t)) return null;
  if (def.format === 'league' && t.stage === 1 && !t.stages[1].entrants.includes(PLAYER)) {
    return standings(t, t.stages[0]).findIndex((r) => r.idx === PLAYER) + 1;
  }
  const st = def.format === 'league' ? t.stages[1] : t.stages[0];
  // place = 1 + number of entrants still alive or eliminated later than the player
  const lostIn = eliminatedIn(st, PLAYER);
  if (!lostIn) return null;
  if (lostIn.isFinal) return 2;
  const size = st.type === 'double' ? Math.max(4, nextPow2(st.entrants.length)) : nextPow2(st.entrants.length);
  if (st.type === 'single') return (size >> (lostIn.round + 1)) + 1;
  // double: finalists + one entrant eliminated per later lower-bracket match
  const later = st.matches.filter((m) => m.bracket === 'L' && m.round > lostIn.round).length;
  return later + 2 + 1;
}

export function playerRecord(t) {
  let w = 0, l = 0, d = 0;
  const opponents = [];
  for (const st of t.stages) {
    for (const m of st.matches) {
      if (m.status !== 'done' || m.bye || m.skipped) continue;
      if (m.a !== PLAYER && m.b !== PLAYER) continue;
      const side = m.a === PLAYER ? 0 : 1;
      const opp = side === 0 ? m.b : m.a;
      const won = m.winner === PLAYER;
      if (m.draw) d++; else if (won) w++; else l++;
      opponents.push({ name: t.entrants[opp].name, rivalId: t.entrants[opp].rivalId || null, won, draw: m.draw, score: side === 0 ? m.score.join('-') : [...m.score].reverse().join('-'), round: m.roundName });
    }
  }
  return { w, l, d, opponents };
}

// ------------------------------------------------------------ match setup

export function matchFormat(t, m) {
  const def = TOURNAMENT_INDEX[t.defId];
  const F = def.matchFormat || {};
  if (m.isFinal && F.final) return F.final;
  if (m.playoff && F.playoff) return F.playoff;
  if (m.bracket === 'L' && F.lower) return F.lower;
  return F.default || 'bo3';
}

export function matchArena(t, m) {
  const def = TOURNAMENT_INDEX[t.defId];
  if (m.isFinal && def.finalArena) return def.finalArena;
  const A = def.arenas || ['standard'];
  const ri = m.bracket === 'L' ? m.round + 1 : m.bracket === 'GF' ? A.length - 1 : m.round + (m.playoff ? 1 : 0);
  return A[ri % A.length];
}

export function entrantDifficulty(t, e) { return e.difficulty ?? TIER_DIFFICULTY[t.tier]; }

// A filler entrant's participant: archetype parts as tier-appropriate items.
export function fillerParticipant(t, e) {
  const arch = ARCHETYPE_INDEX[e.archetype] || ARCHETYPE_INDEX.all;
  const build = { id: 'filler', parts: arch.parts, launcher: arch.launcher, cable: arch.cable };
  const items = rivalItems(`filler:${e.name}:${e.seed}`, build, Math.max(1, t.tier - 1));
  const sets = setSources([...Object.values(items.parts), items.launcher, items.cable]);
  return {
    id: 'entrant-' + e.idx, name: e.name, human: false, ai: arch.ai, difficulty: e.difficulty,
    build: items.parts, launcher: items.launcher, cable: items.cable,
    beast: e.beast ? { id: e.beast, bondLevel: Math.min(8, 1 + t.tier * 2), awakened: t.tier >= 5 } : null,
    spin: arch.spin || 'R', technique: arch.technique || 'normal', color: e.color,
    knownTechniques: ['normal', 'power', 'controlled', 'bank', 'spiral', 'phantom', 'lance'],
    modSources: sets.sources, launchMods: sets.launch, archetype: arch.id,
  };
}

// The rival plan stored on a player match, so scouting and the battle agree.
export function ensurePlan(t, m, profile) {
  const oppIdx = m.a === PLAYER ? m.b : m.a;
  const e = t.entrants[oppIdx];
  if (e.kind !== 'rival') return null;
  if (!m.plan) {
    const P = rivalPlan(profile, e.rivalId, t.tier, { seed: mixSeeds(t.seed, m.id) });
    m.plan = { buildId: P.build.id, spin: P.spin, technique: P.technique, tweaks: P.tweaks, notes: P.notes, target: P.target, adapted: P.adapted };
  }
  return m.plan;
}

function planFromStored(e, stored) {
  const ch = CHARACTER_INDEX[e.rivalId];
  const build = ch.builds.find((b) => b.id === stored.buildId) || ch.builds[0];
  return { character: ch, build, spin: stored.spin, technique: stored.technique || build.technique, tweaks: stored.tweaks || {}, notes: stored.notes || [], target: stored.target, adapted: stored.adapted };
}

// Participant for any entrant. Rivals facing the player use the stored plan
// (adapted to the player's habits); against other AIs they bring their
// signature build.
export function entrantParticipant(t, idx, profile, m = null) {
  const e = t.entrants[idx];
  if (e.kind === 'filler') return fillerParticipant(t, e);
  if (e.kind === 'rival') {
    const vsPlayer = m && (m.a === PLAYER || m.b === PLAYER);
    const plan = vsPlayer && m.plan ? planFromStored(e, m.plan) : rivalPlan({ habits: null, rivals: {} }, e.rivalId, t.tier, { seed: mixSeeds(t.seed, m?.id || 'x') });
    const p = rivalParticipant(profile, e.rivalId, t.tier, { difficulty: e.difficulty, plan, pid: 'entrant-' + e.idx });
    return p;
  }
  return null;
}

// Plain data describing an AI-vs-AI match (sent to the simulation worker).
export function aiMatchJob(t, m, profile) {
  return {
    tournamentId: t.id, matchId: m.id, seed: mixSeeds(t.seed, m.id, 'sim'),
    arenaId: matchArena(t, m), format: matchFormat(t, m),
    participants: [entrantParticipant(t, m.a, profile, m), entrantParticipant(t, m.b, profile, m)],
  };
}

// ------------------------------------------------------------ rewards & career

export function prizeFor(def, place) {
  if (place == null) return null;
  const keys = Object.keys(def.prizes).map(Number).sort((a, b) => a - b);
  const k = keys.find((x) => place <= x) ?? keys[keys.length - 1];
  return def.prizes[k];
}

export function finishTournament(profile, t) {
  if (t.rewarded) return t.summary;
  const def = TOURNAMENT_INDEX[t.defId];
  const place = t.withdrawn ? null : playerPlace(t);
  const rec = playerRecord(t);
  const records = profile.tournaments.records = profile.tournaments.records || {};
  const R = records[def.id] = records[def.id] || { entries: 0, wins: 0, podiums: 0, best: null };
  const firstWin = place === 1 && !(R.wins > 0);
  const repeatWin = place === 1 && R.wins > 0;
  const prize = place != null ? prizeFor(def, place) : null;
  const summary = { name: def.name, place, size: t.entrants.length, record: rec, credits: 0, xp: 0, ranking: 0, materials: {}, items: [], unlocks: [], notes: [], withdrawn: t.withdrawn };
  if (prize) {
    const mul = repeatWin ? 0.6 : firstWin ? 1.25 : 1;
    summary.credits = Math.round(prize.credits * mul);
    summary.xp = Math.round(prize.xp * (repeatWin ? 0.7 : 1));
    summary.ranking = Math.round(prize.ranking * (repeatWin ? 0.5 : 1));
    profile.currency.credits += summary.credits;
    summary.levelUps = addPlayerXp(profile, summary.xp);
    profile.tournaments.ranking.points = (profile.tournaments.ranking.points || 0) + summary.ranking;
    for (const [k, v] of Object.entries(prize.materials || {})) { const n = Math.round(v * (repeatWin ? 0.6 : 1)); profile.materials[k] = (profile.materials[k] || 0) + n; summary.materials[k] = n; }
    for (const src of prize.loot || []) {
      const item = rollLoot(profile, { label: `${def.name} prize`, tier: src.tier ?? def.tier - 1, minRarity: src.minRarity, favourSets: src.favourSets || [], slots: src.slots || null, favour: rivalFavour(t) });
      const first = addItem(profile, item);
      summary.items.push(item);
      if (first) summary.notes.push(`New discovery: ${itemName(item)}.`);
    }
    if (repeatWin) summary.notes.push('Repeat win: prize money and points reduced. New tournaments pay in full.');
    if (firstWin) summary.notes.push('First victory bonus: +25% prize money.');
  }
  if (firstWin && def.firstWin) {
    for (const u of def.firstWin.unlocks || []) if (grantUnlock(profile, u)) summary.unlocks.push(u);
    if (def.firstWin.note) summary.notes.unshift(def.firstWin.note);
  }
  // career
  R.entries++;
  if (place === 1) R.wins++;
  if (place != null && place <= 3) R.podiums++;
  if (place != null && (R.best == null || place < R.best)) R.best = place;
  const S = profile.stats;
  if (place === 1) S.tournamentsWon = (S.tournamentsWon || 0) + 1;
  if (place != null && place <= 2 && (def.format === 'single' || def.format === 'double' || def.format === 'league')) S.finals = (S.finals || 0) + 1;
  const hist = profile.tournaments.history;
  hist.unshift({ id: t.id, defId: def.id, name: def.name, tier: def.tier, format: def.format, date: Date.now(), place, size: t.entrants.length, record: { w: rec.w, l: rec.l, d: rec.d }, opponents: rec.opponents, credits: summary.credits, items: summary.items.map((i) => itemName(i)), withdrawn: t.withdrawn });
  hist.length = Math.min(hist.length, 60);
  // item history: tournament wins
  if (place === 1) {
    const L = profile.loadouts.find((l) => l.id === t.loadout.id);
    if (L) for (const uid of [...Object.values(L.parts), L.launcher, L.cable]) { const it = uid && profile.inventory[uid]; if (it) { it.history.tournamentWins = (it.history.tournamentWins || 0) + 1; it.history.moments.unshift(`${new Date().toLocaleDateString()}: Won the ${def.name}`); it.history.moments.length = Math.min(8, it.history.moments.length); } }
  }
  if (t.storyNode) {
    const SR = profile.story.results = profile.story.results || {};
    SR[t.storyNode] = { place, withdrawn: !!t.withdrawn, at: Date.now(), tournament: t.id };
    summary.storyNode = t.storyNode;
  }
  if (t.league) {
    summary.leagueMove = applyLeagueResult(profile, t, place);
    summary.notes.unshift(summary.leagueMove === 'promoted' ? 'Promoted to the next division!' : summary.leagueMove === 'relegated' ? 'Relegated to the division below.' : 'You stay in this division next season.');
  }
  t.rewarded = true;
  t.summary = summary;
  if (profile.tournaments.active === t || profile.tournaments.active?.id === t.id) profile.tournaments.active = null;
  if (profile.league?.active === t || profile.league?.active?.id === t.id) profile.league.active = null;
  return summary;
}

function rivalFavour(t) {
  const out = [];
  for (const e of t.entrants) {
    if (e.kind !== 'rival') continue;
    const ch = CHARACTER_INDEX[e.rivalId];
    for (const b of ch.builds) if (b.tier <= t.tier) out.push(...Object.values(b.parts));
  }
  return [...new Set(out)];
}

export function grantUnlock(profile, u) {
  const [kind, val] = u.split(':');
  if (kind === 'arena') { if (profile.arenasUnlocked.includes(val)) return false; profile.arenasUnlocked.push(val); return true; }
  if (kind === 'technique') { if (profile.techniques.includes(val)) return false; profile.techniques.push(val); return true; }
  if (kind === 'title') { const T = profile.player.titles = profile.player.titles || []; if (T.includes(val)) return false; T.push(val); return true; }
  return false;
}

export function unlockLabel(u) {
  const [kind, val] = u.split(':');
  return kind === 'arena' ? `Stadium: ${val}` : kind === 'technique' ? `Technique: ${val}` : kind === 'title' ? `Title: ${val}` : u;
}

export function withdraw(profile, t) {
  t.withdrawn = true;
  t.status = 'complete';
  return finishTournament(profile, t);
}

export { FORMAT_NAMES };
