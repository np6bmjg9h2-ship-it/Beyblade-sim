// Rivals: player habit tracking, rival memory and adaptation.
//
// After every match the player's habits are measured from the battle record
// (how often they close distance, how much time they spend near the edge,
// dash/counter/ability rates, spin direction, launch accuracy and the role of
// the build they used). Rivals who have met the player before use those
// habits to pick a counter build from their own roster and to nudge their
// behaviour (counter timing, edge caution, aggression). Adaptation is bounded
// and purely behavioural — rivals never gain physics advantages.

import { CHARACTERS, CHARACTER_INDEX, RIVAL_GEAR, FILLER_FIRST, FILLER_LAST } from '../data/characters.js';
import { PART_INDEX } from '../data/parts.js';
import { BEAST_INDEX } from '../data/beasts.js';
import { setSources } from '../data/sets.js';
import { createItem } from './items.js';
import { Rng, mixSeeds } from '../core/rng.js';
import * as dm from '../core/dmath.js';

export const ROLES = ['attack', 'defense', 'stamina', 'balance', 'burst', 'upper'];
export const ROLE_NAMES = { attack: 'Attack', defense: 'Defense', stamina: 'Stamina', balance: 'Balance', burst: 'Burst', upper: 'Upper' };

// Which roles answer a given player style (in order of preference).
export const COUNTER_ROLES = {
  attack: ['defense', 'stamina'],
  defense: ['stamina', 'upper', 'burst'],
  stamina: ['attack', 'upper', 'burst'],
  balance: ['attack', 'stamina', 'balance'],
  burst: ['defense', 'stamina'],
  upper: ['stamina', 'balance', 'defense'],
};

const TIP_CLASS = {
  tip_needle: 'stamina', tip_bearing: 'stamina',
  tip_pivotball: 'defense', tip_wideball: 'defense', tip_griphold: 'defense',
  tip_flatstrike: 'attack', tip_rubberflat: 'attack',
  tip_semiflat: 'balance', tip_hybrid: 'balance', tip_orbit: 'balance',
};

const baseOf = (x) => (!x ? null : typeof x === 'string' ? PART_INDEX[x] || null : PART_INDEX[x.base || x.id] || null);

// Classify a build (items or part definitions) into a play role.
export function buildRole(build) {
  const ring = baseOf(build.ring);
  const tip = baseOf(build.tip);
  const rt = ring?.role || 'balance';
  const tc = (tip && TIP_CLASS[tip.id]) || 'balance';
  if (rt === tc) return rt;
  if (tc === 'stamina') return 'stamina';
  if ((rt === 'burst' || rt === 'upper') && tc === 'attack') return rt;
  if (tc === 'attack' && rt === 'attack') return 'attack';
  if (tc === 'defense' && (rt === 'defense' || rt === 'stamina')) return 'defense';
  if (tc === 'attack') return 'attack';
  return 'balance';
}

// ------------------------------------------------------------ habits

export function emptyHabits() {
  return {
    matches: 0, style: Object.fromEntries(ROLES.map((r) => [r, 0])), recentStyles: [],
    aggression: 0.5, edge: 0.2, dashRate: 0, counterRate: 0, abilityRate: 0, leftSpin: 0, perfectRate: 0,
  };
}

// Measure one match's habits for fighter index `hi` from the battle record.
export function measureHabits(result, hi, arenaRadius = 0.21) {
  const st = result.fighters[hi].stats;
  const tel = result.telemetry || [];
  let approach = 0, moving = 0, edge = 0, samples = 0;
  for (let i = 1; i < tel.length; i++) {
    const a = tel[i - 1], b = tel[i];
    if (a.round !== b.round) continue;
    const me0 = a.f[hi], me1 = b.f[hi], op1 = b.f[1 - hi];
    if (!me1?.active || !op1?.active) continue;
    samples++;
    if (dm.hypot(me1.x, me1.z) > 0.7 * arenaRadius) edge++;
    const dx = me1.x - me0.x, dz = me1.z - me0.z;
    const step = dm.hypot(dx, dz);
    if (step < 0.008) continue; // < 8 cm/s: drifting, not moving with intent
    const ox = op1.x - me1.x, oz = op1.z - me1.z;
    const od = dm.hypot(ox, oz);
    if (od < 0.07) continue; // already in contact range: shuffling, not approaching
    moving++;
    if ((dx * ox + dz * oz) / (step * od) > 0.5) approach++;
  }
  const minutes = Math.max(0.25, result.rounds.reduce((s, r) => s + r.time, 0) / 60);
  const launches = st.launches || [];
  return {
    aggression: moving ? approach / moving : 0.3,
    edge: samples ? edge / samples : 0.2,
    dashRate: (st.dashes || 0) / minutes,
    counterRate: (st.counters || 0) / minutes,
    abilityRate: (st.abilitiesUsed || 0) / minutes,
    leftSpin: launches.length ? launches.filter((l) => l.spinDir === 'L').length / launches.length : 0,
    perfectRate: launches.length ? (st.perfectLaunches || 0) / launches.length : 0,
  };
}

export function updateHabits(profile, measured, role) {
  const H = profile.habits = profile.habits || emptyHabits();
  const a = H.matches === 0 ? 1 : 0.3; // exponential moving average
  for (const k of ['aggression', 'edge', 'dashRate', 'counterRate', 'abilityRate', 'leftSpin', 'perfectRate']) {
    H[k] = H[k] + (measured[k] - H[k]) * a;
  }
  for (const r of ROLES) H.style[r] = (H.style[r] || 0) * 0.8;
  if (role) {
    H.style[role] = (H.style[role] || 0) + 1;
    H.recentStyles.push(role);
    while (H.recentStyles.length > 5) H.recentStyles.shift();
  }
  H.matches++;
  return H;
}

export function dominantStyle(H) {
  if (!H || !H.matches) return null;
  let best = null, bv = 0;
  for (const [k, v] of Object.entries(H.style)) if (v > bv) { bv = v; best = k; }
  return best;
}

// Short human-readable description of the player's habits (scouting, career).
export function describeHabits(H) {
  if (!H || H.matches < 1) return ['Not enough battles recorded yet.'];
  const out = [];
  const st = dominantStyle(H);
  if (st) out.push(`Most-used style: ${ROLE_NAMES[st]}.`);
  out.push(H.aggression > 0.55 ? 'Closes distance aggressively.' : H.aggression < 0.3 ? 'Rarely initiates contact.' : 'Mixes approach and patience.');
  if (H.edge > 0.3) out.push('Spends a lot of time near the stadium edge.');
  if (H.dashRate > 3) out.push('Dashes frequently.');
  if (H.counterRate > 1) out.push('Uses Counter Stance often.');
  if (H.leftSpin > 0.5) out.push('Prefers left spin.');
  out.push(`Perfect launch rate ${(H.perfectRate * 100).toFixed(0)}%.`);
  return out;
}

// ------------------------------------------------------------ rival memory

export function rivalRecord(profile, id) {
  const R = profile.rivals = profile.rivals || {};
  return R[id] || null;
}

// A rival has been seen (e.g. in your bracket): public profile becomes visible.
export function markSeen(profile, id) {
  const R = profile.rivals = profile.rivals || {};
  if (!R[id]) R[id] = { met: false, seen: true, playerWins: 0, playerLosses: 0, draws: 0, lastResult: null, lastMet: 0, buildsSeen: [], rolesFaced: {}, finishes: {}, events: [] };
  else R[id].seen = true;
  return R[id];
}

export function recordRivalResult(profile, id, { won, draw = false, role = null, buildId = null, how = null, event = null } = {}) {
  const R = profile.rivals = profile.rivals || {};
  const r = R[id] = R[id] || { met: false, playerWins: 0, playerLosses: 0, draws: 0, lastResult: null, lastMet: 0, buildsSeen: [], rolesFaced: {}, finishes: {}, events: [] };
  r.met = true;
  r.seen = true;
  if (draw) r.draws++;
  else if (won) r.playerWins++;
  else r.playerLosses++;
  r.lastResult = draw ? 'draw' : won ? 'win' : 'loss';
  r.lastMet = Date.now();
  if (buildId && !r.buildsSeen.includes(buildId)) r.buildsSeen.push(buildId);
  if (role) r.rolesFaced[role] = (r.rolesFaced[role] || 0) + 1;
  if (how) r.finishes[how] = (r.finishes[how] || 0) + 1;
  if (event) { r.events.unshift(event); r.events.length = Math.min(r.events.length, 12); }
  return r;
}

// ------------------------------------------------------------ adaptation

export function buildsAtTier(ch, tier) {
  const avail = ch.builds.filter((b) => b.tier <= tier);
  return avail.length ? avail : [ch.builds.reduce((a, b) => (b.tier < a.tier ? b : a))];
}

export function signatureBuild(ch, tier) {
  const avail = buildsAtTier(ch, tier);
  const role = ch.builds[0].role;
  const same = avail.filter((b) => b.role === role);
  const pool = same.length ? same : avail;
  return pool.reduce((a, b) => (b.tier > a.tier ? b : a));
}

// Plan a rival's build and behaviour for a match against this profile.
export function rivalPlan(profile, id, tier, { seed = 1 } = {}) {
  const ch = CHARACTER_INDEX[id];
  if (!ch) throw new Error('Unknown rival ' + id);
  const H = profile.habits;
  const mem = rivalRecord(profile, id);
  const rng = new Rng(mixSeeds(seed, id, tier, 'plan'));
  const notes = [];
  let build = signatureBuild(ch, tier);
  const tweaks = { ...(ch.aiTweaks || {}) };
  let target = null;
  const k = ch.adapt || 0;
  const canAdapt = mem?.met && H?.matches >= 2 && k > 0;
  if (canAdapt) {
    // highly adaptive rivals react to your latest style, others to your habits overall
    target = k >= 0.85 && H.recentStyles.length ? H.recentStyles[H.recentStyles.length - 1] : dominantStyle(H);
    if (target && rng.chance(k)) {
      const avail = buildsAtTier(ch, tier);
      for (const role of COUNTER_ROLES[target] || []) {
        const cands = avail.filter((b) => b.role === role);
        if (cands.length) {
          const pick = cands.reduce((a, b) => (b.tier > a.tier ? b : a));
          if (pick.id !== build.id) notes.push(`Switched to ${pick.name} (${ROLE_NAMES[pick.role]}) to counter your ${ROLE_NAMES[target]} style.`);
          build = pick;
          break;
        }
      }
    }
    const add = (key, v, why) => { tweaks[key] = (tweaks[key] || 0) + v; notes.push(why); };
    if (H.aggression > 0.55) add('counterSkill', 0.15 * k, 'Sharper counters: you often charge in.');
    if (H.aggression > 0.55) add('edgeCaution', 0.1 * k, 'Stays further from the edge against your pressure.');
    if (H.edge > 0.3) add('aggression', 0.1 * k, 'More ring-out pushes: you spend time near the edge.');
    if (H.aggression < 0.3) add('aggression', 0.1 * k, 'More aggressive: you rarely start contact.');
    if (H.dashRate > 3) add('counterSkill', 0.08 * k, 'Watches for your dashes.');
  }
  // spin choice: dual launchers may pick a spin relative to yours
  let spin = build.spin || ch.spin || 'R';
  const launcherBase = build.launcher;
  const dual = launcherBase === 'launcher_twin' || launcherBase === 'launcher_precision' || launcherBase === 'launcher_titan';
  if (dual && canAdapt) {
    const yours = H.leftSpin > 0.5 ? 'L' : 'R';
    const want = target === 'stamina' || build.role === 'stamina' ? (yours === 'L' ? 'R' : 'L') : spin;
    if (want !== spin) { notes.push(`Launches ${want === 'L' ? 'left' : 'right'} spin to oppose yours.`); spin = want; }
  }
  for (const key of Object.keys(tweaks)) tweaks[key] = Math.max(-0.2, Math.min(0.2, tweaks[key]));
  return { character: ch, build, spin, technique: build.technique || 'normal', tweaks, notes, target, adapted: notes.length > 0 };
}

// Deterministic equipment for a rival build at a tier, using the item system.
export function rivalItems(id, build, tier) {
  const gear = RIVAL_GEAR[Math.max(1, Math.min(8, tier))];
  const mk = (base, slot) => createItem({ base, rarity: gear.rarity, level: gear.level, seed: mixSeeds(id, build.id, tier, slot), source: `rival:${id}` });
  const parts = {};
  for (const [slot, base] of Object.entries(build.parts)) parts[slot] = mk(base, slot);
  return { parts, launcher: mk(build.launcher || 'launcher_spark', 'launcher'), cable: mk(build.cable || 'cable_standard', 'cable') };
}

// Battle participant for a rival (same structure the player's participant uses).
export function rivalParticipant(profile, id, tier, { difficulty = 1, seed = 1, plan = null, pid } = {}) {
  const P = plan || rivalPlan(profile || { habits: null, rivals: {} }, id, tier, { seed });
  const ch = P.character;
  const items = rivalItems(id, P.build, tier);
  const all = [...Object.values(items.parts), items.launcher, items.cable];
  const sets = setSources(all);
  return {
    id: pid || 'rival-' + id,
    rivalId: id,
    name: ch.name,
    human: false,
    ai: ch.ai,
    aiTweaks: P.tweaks,
    adaptRounds: ch.adapt >= 0.5,
    difficulty,
    build: items.parts,
    launcher: items.launcher,
    cable: items.cable,
    beast: ch.beast ? { id: ch.beast, bondLevel: Math.min(10, 2 + tier * 2), awakened: !!ch.awakened || tier >= 5 } : null,
    spin: P.spin,
    technique: P.technique,
    color: ch.color,
    knownTechniques: ['normal', 'power', 'controlled', 'bank', 'spiral', 'phantom', 'lance'],
    modSources: sets.sources,
    launchMods: sets.launch,
    plan: { buildId: P.build.id, buildName: P.build.name, role: P.build.role, notes: P.notes },
  };
}

// ------------------------------------------------------------ dialogue

export function fill(text, ctx) {
  return text.replace(/\{(\w+)\}/g, (_, k) => (ctx[k] != null ? ctx[k] : `{${k}}`));
}

// Choose a pre-match line that reflects your history with this rival.
export function preMatchLine(profile, id, { plan = null, final = false, seed = 1 } = {}) {
  const ch = CHARACTER_INDEX[id];
  const mem = rivalRecord(profile, id);
  const rng = new Rng(mixSeeds(seed, id, 'line'));
  const D = ch.dialogue;
  const ctx = { player: profile.player?.name || 'you', rival: ch.name, beast: BEAST_INDEX[ch.beast]?.name || '' };
  let text;
  if (!mem?.met) text = rng.pick(D.intro);
  else if (final && D.final) text = rng.pick(D.final);
  else if (plan?.target && plan.adapted && D.adapt?.[plan.target] && rng.chance(0.75)) text = D.adapt[plan.target];
  else if (mem.lastResult === 'loss' && D.preWonLast) text = rng.pick(D.preWonLast);
  else if (mem.lastResult === 'win' && D.preLostLast) text = rng.pick(D.preLostLast);
  else text = rng.pick(D.pre);
  return fill(text, ctx);
}

export function postMatchLine(profile, id, playerWon, seed = 1) {
  const ch = CHARACTER_INDEX[id];
  const rng = new Rng(mixSeeds(seed, id, 'post'));
  const lines = playerWon ? ch.dialogue.loss : ch.dialogue.win;
  return fill(rng.pick(lines), { player: profile.player?.name || 'you', rival: ch.name });
}

// ------------------------------------------------------------ filler entrants

export function fillerName(rng, used) {
  const firsts = new Set([...used].map((n) => n.split(' ')[0]));
  for (let i = 0; i < 80; i++) {
    const f = rng.pick(FILLER_FIRST);
    const n = `${f} ${rng.pick(FILLER_LAST)}`;
    if (!used.has(n) && (i > 60 || !firsts.has(f))) { used.add(n); return n; }
  }
  return `Entrant ${used.size + 1}`;
}

export { CHARACTERS, CHARACTER_INDEX };
