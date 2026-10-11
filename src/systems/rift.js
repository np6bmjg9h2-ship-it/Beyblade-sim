// Rift Run: run lifecycle. All state is plain data in profile.rift so a run
// survives reloads: the map of each act, the current position, hearts,
// shards, the top's parts and bag, charms, boons and any reward the player
// still has to pick (run.pending). Loot rolls live in riftLoot.js, battle
// participants in riftBattle.js.

import { Rng, mixSeeds } from '../core/rng.js';
import { SLOTS } from '../data/parts.js';
import { CHARM_INDEX } from '../data/riftCharms.js';
import {
  RIFT_ACTS, FLOORS_PER_ACT, FLOOR_WEIGHTS, FLOOR_GUARANTEE, ELITE_AFFIXES, VAULT_RULES, VAULT_INDEX, RIFT_EVENTS,
  HEARTS_BASE, BAG_SIZE, SHARD_REWARD, START_SHARDS, ESSENCE_REWARD, CAREER_REWARD, MAX_DEPTH, RIFT_TALENTS, TALENT_INDEX, depthRules,
} from '../data/rift.js';
import { bondLevel, BEAST_INDEX } from '../data/beasts.js';
import { validateLoadout } from './loadout.js';
import { makeUid } from './items.js';
import { addItem } from './loot.js';
import { addPlayerXp } from './profile.js';
import { runEffects } from './riftBattle.js';
import { rollSpoils, rollPartChoice, rollCharms, rollBoons, runRng, skipShards } from './riftLoot.js';

export const BATTLE_NODES = ['battle', 'elite', 'vault', 'boss'];

export function riftState(profile) {
  const R = profile.rift = profile.rift || {};
  R.essence ??= 0; R.essenceEarned ??= 0; R.talents ??= {}; R.depthUnlocked ??= 0;
  R.runs ??= 0; R.clears ??= 0; R.bestDepth ??= -1; R.bestAct ??= 0; R.history ??= []; R.active ??= null;
  return R;
}

// ---------------------------------------------------------------- map

function makeNode(run, rng, a, f, i, type) {
  const act = RIFT_ACTS[a];
  const D = depthRules(run.depth);
  const node = { id: `a${a}f${f}n${i}`, act: a, floor: f, type, seed: rng.nextU32() };
  if (BATTLE_NODES.includes(type)) node.arena = rng.pick(act.arenas);
  if (type === 'battle' || type === 'elite' || type === 'vault') node.archetype = rng.pick(act.archetypes);
  if (type === 'elite') node.affixes = [rng.pick(ELITE_AFFIXES).id];
  if (type === 'battle' && D.normalAffix && rng.chance(D.normalAffix)) node.affixes = [rng.pick(ELITE_AFFIXES).id];
  if (type === 'vault') { const v = rng.pick(VAULT_RULES); node.vault = v.id; if (v.affixes) node.affixes = [...v.affixes]; }
  if (type === 'boss') { node.rival = rng.pick(act.bosses); if (D.bossAffix) node.affixes = [rng.pick(ELITE_AFFIXES).id]; }
  if (type === 'event') node.event = rng.pick(RIFT_EVENTS).id;
  return node;
}

export function generateAct(run, a) {
  const rng = new Rng(mixSeeds(run.seed, 'act', a));
  const D = depthRules(run.depth);
  const floors = [];
  for (let f = 0; f < FLOORS_PER_ACT; f++) {
    const w = { ...FLOOR_WEIGHTS[f] };
    if (!run.vaults) delete w.vault;
    if (w.elite) w.elite *= D.eliteMul;
    const g = FLOOR_GUARANTEE[f];
    const types = [Array.isArray(g) ? rng.pick(g) : g];
    const n = rng.chance(0.55) ? 3 : 2;
    while (types.length < n) {
      const left = Object.entries(w).filter(([k]) => !types.includes(k));
      if (!left.length) break;
      types.push(rng.weighted(left.map(([type, weight]) => ({ type, weight }))).type);
    }
    rng.shuffle(types);
    floors.push(types.map((type, i) => makeNode(run, rng, a, f, i, type)));
  }
  return { act: a, floors, boss: makeNode(run, rng, a, FLOORS_PER_ACT, 0, 'boss') };
}

export function currentChoices(run) {
  const A = run.map[run.act];
  if (!A) return [];
  return run.floor < FLOORS_PER_ACT ? A.floors[run.floor] : [A.boss];
}

export function nodeById(run, id) {
  for (const A of run.map) {
    for (const fl of A.floors) { const n = fl.find((x) => x.id === id); if (n) return n; }
    if (A.boss.id === id) return A.boss;
  }
  return null;
}

// ---------------------------------------------------------------- hearts

export function maxHearts(profile, run) {
  const T = riftState(profile).talents;
  return Math.max(1, HEARTS_BASE + (T.grit || 0) + depthRules(run.depth).heartsDelta + (runEffects(profile, run).econ.maxHearts || 0));
}

export function heal(profile, run, n = 1) {
  const before = run.hearts;
  run.hearts = Math.min(maxHearts(profile, run), run.hearts + n);
  return run.hearts - before;
}

export function loseHeart(profile, run) {
  run.hearts--;
  if (run.hearts > 0) return 'hurt';
  if ((riftState(profile).talents.secondwind || 0) > 0 && !run.secondWindUsed) {
    run.secondWindUsed = true;
    run.hearts = 1;
    run.log.push('Second Wind: back on your feet with one heart.');
    return 'revived';
  }
  run.status = 'lost';
  return 'lost';
}

// ---------------------------------------------------------------- start

export function canStart(profile, loadoutIndex) {
  const L = profile.loadouts[loadoutIndex];
  if (!L) return { ok: false, reason: 'Choose a loadout.' };
  const v = validateLoadout(profile, L);
  if (!v.ok) return { ok: false, reason: v.errors[0] };
  return { ok: true };
}

export function startRun(profile, { loadoutIndex = profile.activeLoadout, depth = 0, seed = (Date.now() ^ 0x5f3759df) >>> 0 } = {}) {
  const R = riftState(profile);
  const L = profile.loadouts[loadoutIndex];
  const T = R.talents;
  const d = Math.max(0, Math.min(depth, R.depthUnlocked, MAX_DEPTH));
  const equipped = {};
  for (const s of SLOTS) {
    const src = L.parts[s] ? profile.inventory[L.parts[s]] : null;
    if (!src) { equipped[s] = null; continue; }
    const it = structuredClone(src);
    it.uid = `rift_kit_${s}_${seed.toString(36)}`;
    it.origin = 'kit'; it.forge = 0; it.element = null; it.durability = it.maxDurability;
    equipped[s] = it;
  }
  const run = {
    v: 1, seed: seed >>> 0, depth: d, startedAt: Date.now(), status: 'active',
    loadoutId: L.id, loadoutName: L.name, launcher: L.launcher, cable: L.cable, spin: L.spin || 'R', technique: L.technique || 'normal',
    beast: L.beast ? { id: L.beast } : null, vaults: (T.vault || 0) > 0,
    act: 0, floor: 0, map: [], path: [], current: null,
    hearts: 0, shards: START_SHARDS + 25 * (T.pockets || 0), essence: 0,
    equipped, bag: [], charms: [], boons: {}, pending: [], counter: 0, secondWindUsed: false,
    stats: { battles: 0, wins: 0, losses: 0, elites: 0, bosses: 0, vaults: 0, ringOuts: 0, shatters: 0, shardsEarned: 0, partsFound: 0 },
    log: [],
  };
  run.map.push(generateAct(run, 0));
  run.hearts = maxHearts(profile, run);
  if ((T.headstart || 0) > 0) {
    const rng = runRng(run, 'headstart');
    run.pending.push({ kind: 'charm', title: 'Head Start: choose a charm', options: rollCharms(run, rng, 3, { rarities: ['common', 'rare'] }).map((c) => ({ type: 'charm', charm: c })) });
  }
  R.active = run;
  R.runs++;
  return run;
}

// ---------------------------------------------------------------- progress

export function enterNode(run, node) {
  run.current = node.id;
}

// Leave the current node and move to the next floor (or act).
export function completeNode(profile, run) {
  const node = nodeById(run, run.current);
  if (node) run.path.push(node.id);
  run.current = null;
  if (run.floor < FLOORS_PER_ACT) { run.floor++; return; }
  run.act++;
  run.floor = 0;
  if (run.act >= RIFT_ACTS.length) { run.status = 'won'; return; }
  run.map.push(generateAct(run, run.act));
}

// Record a battle node's result and queue its rewards.
export function recordBattle(profile, run, node, { won, how = null, forfeit = false } = {}) {
  run.stats.battles++;
  const out = { won, shards: 0, essence: 0, met: true, heart: null };
  if (!won) {
    run.stats.losses++;
    out.heart = loseHeart(profile, run);
    run.log.push(`${forfeit ? 'Retreated from' : 'Lost'} ${node.type === 'boss' ? 'the boss' : 'a battle'} in ${RIFT_ACTS[node.act].name}.`);
    // a lost boss must be fought again; any other node is passed without rewards
    if (run.status === 'active' && node.type !== 'boss') completeNode(profile, run);
    else if (node.type === 'boss') run.current = null;
    return out;
  }
  const fx = runEffects(profile, run);
  const D = depthRules(run.depth);
  run.stats.wins++;
  if (node.type === 'elite') run.stats.elites++;
  if (node.type === 'boss') run.stats.bosses++;
  if (how === 'out') run.stats.ringOuts++;
  if (how === 'burst') run.stats.shatters++;
  const v = node.vault ? VAULT_INDEX[node.vault] : null;
  out.met = !v?.need || how === v.need;
  if (node.type === 'vault' && out.met) run.stats.vaults++;
  out.shards = Math.round((SHARD_REWARD[node.type] + SHARD_REWARD.perAct * node.act + (SHARD_REWARD[how] || 0)) * (1 + (fx.econ.shards || 0)));
  run.shards += out.shards;
  run.stats.shardsEarned += out.shards;
  out.essence = Math.round(ESSENCE_REWARD[node.type] * D.rewardMul);
  run.essence += out.essence;
  if (node.type === 'boss' && fx.econ.healBoss) heal(profile, run, fx.econ.healBoss);
  if (node.type === 'elite' && fx.econ.healElite) heal(profile, run, fx.econ.healElite);
  queueRewards(profile, run, node, out.met);
  return out;
}

export function queueRewards(profile, run, node, met = true) {
  const P = run.pending;
  if (node.type === 'battle') P.push({ kind: 'spoils', title: 'Spoils: choose one', options: rollSpoils(profile, run, node) });
  else if (node.type === 'elite') {
    P.push({ kind: 'charm', title: 'Elite spoils: choose a charm', options: rollCharms(run, runRng(run, 'elite', node.id), 3, { rarities: ['common', 'rare', 'rare', 'cursed'], cursedMul: depthRules(run.depth).cursedMul }).map((c) => ({ type: 'charm', charm: c })) });
    P.push({ kind: 'boon', title: 'Choose a boon', options: rollBoons(profile, run, runRng(run, 'boon', node.id)) });
  } else if (node.type === 'vault') {
    if (met) P.push({ kind: 'charm', title: 'Vault: choose a charm', options: rollCharms(run, runRng(run, 'vault', node.id), 3, { rarities: ['rare', 'legendary', 'cursed'] }).map((c) => ({ type: 'charm', charm: c })) });
  } else if (node.type === 'boss') {
    P.push({ kind: 'charm', title: 'Boss treasure: choose a legendary charm', options: rollCharms(run, runRng(run, 'boss', node.id), 2, { rarities: ['legendary'] }).map((c) => ({ type: 'charm', charm: c })) });
    P.push({ kind: 'part', title: 'Boss spoils: choose a part', options: rollPartChoice(profile, run, node, 3, { minRarity: run.act >= 2 ? 'epic' : 'rare', rarityBoost: 1 }) });
    P.push({ kind: 'boon', title: 'Choose a boon', options: rollBoons(profile, run, runRng(run, 'boon', node.id)) });
  }
  for (let i = P.length - 1; i >= 0; i--) if (!P[i].options.length) P.splice(i, 1);
}

// ---------------------------------------------------------------- picking rewards

export const bagFull = (run) => run.bag.length >= BAG_SIZE;

export function takePart(run, item) {
  if (bagFull(run)) return false;
  run.bag.push(item);
  run.stats.partsFound++;
  return true;
}

export function addCharm(profile, run, charm) {
  if (!charm || !CHARM_INDEX[charm.id] || run.charms.some((h) => h.id === charm.id)) return false;
  run.charms.push({ id: charm.id, enhanced: !!charm.enhanced });
  run.hearts = Math.min(run.hearts, maxHearts(profile, run));
  if (run.hearts <= 0) run.hearts = 1;
  return true;
}

// Resolve the first pending step with option index i (null = skip).
export function pickReward(profile, run, i, { dropUid = null } = {}) {
  const step = run.pending[0];
  if (!step) return { ok: false, reason: 'Nothing to pick.' };
  if (i == null) {
    run.pending.shift();
    if (step.kind !== 'boon') { const s = skipShards(run); run.shards += s; return { ok: true, skipped: true, shards: s }; }
    return { ok: true, skipped: true, shards: 0 };
  }
  const o = step.options[i];
  if (!o) return { ok: false, reason: 'Unknown choice.' };
  if (o.type === 'part') {
    if (bagFull(run)) {
      if (!dropUid) return { ok: false, reason: 'bag-full' };
      run.bag = run.bag.filter((x) => x.uid !== dropUid);
    }
    takePart(run, o.item);
  } else if (o.type === 'charm') addCharm(profile, run, o.charm);
  else if (o.type === 'boon') run.boons[o.id] = (run.boons[o.id] || 0) + 1;
  else if (o.type === 'shards') run.shards += o.amount;
  else if (o.type === 'heart') heal(profile, run, 1);
  run.pending.shift();
  return { ok: true, option: o };
}

// ---------------------------------------------------------------- parts

// Swap a bag part into its slot (the old part goes to the bag).
export function equipFromBag(run, uid, validate) {
  const it = run.bag.find((x) => x.uid === uid);
  if (!it) return { ok: false, reason: 'Part not found.' };
  const build = { ...run.equipped, [it.slot]: it };
  const v = validate(build);
  if (!v.ok) return { ok: false, reason: v.errors[0] };
  const old = run.equipped[it.slot];
  run.equipped[it.slot] = it;
  run.bag = run.bag.filter((x) => x.uid !== uid);
  if (old) run.bag.push(old);
  return { ok: true, old };
}

export function unequipAux(run) {
  const a = run.equipped.aux;
  if (!a || bagFull(run)) return false;
  run.equipped.aux = null;
  run.bag.push(a);
  return true;
}

export function dropFromBag(run, uid) {
  const n = run.bag.length;
  run.bag = run.bag.filter((x) => x.uid !== uid);
  return run.bag.length < n;
}

export function spend(run, cost) {
  if (run.shards < cost) return false;
  run.shards -= cost;
  return true;
}

// ---------------------------------------------------------------- ending

export function lockerSize(profile) { return 1 + (riftState(profile).talents.locker || 0); }

export function keepableParts(run) {
  return [...SLOTS.map((s) => run.equipped[s]), ...run.bag].filter((x) => x && x.origin === 'found');
}

// Bank a finished run: essence, records, career rewards and kept parts.
export function finishRun(profile, run, { keep = [] } = {}) {
  const R = riftState(profile);
  if (run.status === 'active') run.status = 'abandoned';
  const D = depthRules(run.depth);
  const won = run.status === 'won';
  const essence = run.essence + (won ? Math.round(ESSENCE_REWARD.clear * D.rewardMul) : 0);
  R.essence += essence;
  R.essenceEarned += essence;
  if (won) {
    R.clears++;
    R.bestDepth = Math.max(R.bestDepth, run.depth);
    if (run.depth >= R.depthUnlocked && R.depthUnlocked < MAX_DEPTH) R.depthUnlocked = run.depth + 1;
  }
  R.bestAct = Math.max(R.bestAct, Math.min(RIFT_ACTS.length, run.act + (won ? 0 : 1)));
  const s = run.stats;
  const k = 1 + 0.15 * run.depth;
  const career = {
    credits: Math.round((CAREER_REWARD.credits[0] * s.wins + CAREER_REWARD.credits[1] * s.bosses) * k),
    xp: Math.round((CAREER_REWARD.xp[0] * s.wins + CAREER_REWARD.xp[1] * s.bosses) * k),
    bond: Math.round(CAREER_REWARD.bond[0] * s.wins + CAREER_REWARD.bond[1] * s.bosses),
    materials: { scrap: CAREER_REWARD.scrap[0] * s.wins, alloy: CAREER_REWARD.alloy[1] * s.bosses },
  };
  profile.currency.credits += career.credits;
  career.levelUps = addPlayerXp(profile, career.xp);
  for (const [m, v] of Object.entries(career.materials)) if (v > 0) profile.materials[m] = (profile.materials[m] || 0) + v;
  if (run.beast && profile.beasts[run.beast.id] && career.bond > 0) {
    const bs = profile.beasts[run.beast.id];
    const lv0 = bondLevel(bs.bondXp);
    bs.bondXp += career.bond;
    career.bondLevelUp = bondLevel(bs.bondXp) > lv0;
    career.beastName = BEAST_INDEX[run.beast.id]?.name;
  }
  const allowed = new Set(keepableParts(run).map((x) => x.uid));
  const kept = [];
  for (const uid of keep.slice(0, lockerSize(profile))) {
    if (!allowed.has(uid)) continue;
    const src = keepableParts(run).find((x) => x.uid === uid);
    const it = structuredClone(src);
    delete it.origin; delete it.forge; delete it.element;
    it.uid = makeUid(it.seed);
    it.durability = it.maxDurability;
    it.history = { ...(it.history || {}), acquired: 'Rift Run', acquiredAt: Date.now() };
    addItem(profile, it);
    kept.push(it);
  }
  const entry = {
    date: Date.now(), depth: run.depth, outcome: run.status, act: Math.min(run.act + 1, RIFT_ACTS.length), wins: s.wins, bosses: s.bosses,
    essence, charms: run.charms.length, kept: kept.map((x) => x.base),
  };
  R.history.unshift(entry);
  R.history.length = Math.min(R.history.length, 30);
  R.active = null;
  return { essence, career, kept, entry };
}

// ---------------------------------------------------------------- talents

export function talentCost(profile, id) {
  const t = TALENT_INDEX[id];
  const r = riftState(profile).talents[id] || 0;
  return r >= t.max ? null : t.cost[r];
}

export function buyTalent(profile, id) {
  const R = riftState(profile);
  const t = TALENT_INDEX[id];
  if (!t) return { ok: false, reason: 'Unknown talent.' };
  const cost = talentCost(profile, id);
  if (cost == null) return { ok: false, reason: 'Maxed.' };
  if (R.essence < cost) return { ok: false, reason: `Needs ${cost} Essence.` };
  R.essence -= cost;
  R.talents[id] = (R.talents[id] || 0) + 1;
  return { ok: true, rank: R.talents[id] };
}

export { RIFT_TALENTS };
