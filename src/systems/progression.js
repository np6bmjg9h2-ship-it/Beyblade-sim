// Post-match progression. Turns a finished battle into persistent change:
// equipment wear, per-item XP / mastery / history, launcher and cable
// progress, Bit-Beast bond, player XP and level, credits, materials,
// research, loot, statistics and rival records. Rewards scale with
// opponent difficulty and decay when farming the same opponent repeatedly.

import { masteryOf, MASTERY_CAP, itemWearMultiplier, itemName } from './items.js';
import { addPlayerXp } from './profile.js';
import { rollLoot, addItem } from './loot.js';
import { computeSkillEffects } from '../data/skills.js';
import { BEAST_INDEX, bondLevel } from '../data/beasts.js';
import { ARCHETYPE_INDEX } from '../data/opponents.js';
import { Rng, mixSeeds } from '../core/rng.js';

const XP_CAP_PER_ITEM = 320;

export function repetitionFactor(profile, oppKey) {
  const recent = profile.stats.recentOpponents || [];
  const n = recent.filter((k) => k === oppKey).length;
  return 1 / (1 + 0.3 * n);
}

function pushRecent(profile, key) {
  const r = profile.stats.recentOpponents = profile.stats.recentOpponents || [];
  r.push(key);
  while (r.length > 10) r.shift();
}

export function processMatch(profile, result, session, battle) {
  const hi = result.fighters.findIndex((f) => f.human);
  if (hi < 0) return null;
  const me = battle.fighters[hi];
  const st = result.fighters[hi].stats;
  const opp = battle.fighters[1 - hi];
  const won = result.winner === hi;
  const draw = result.winner == null;
  const difficulty = session.difficulty ?? opp.p.difficulty ?? 1;
  const oppKey = session.opponentKey || opp.p.id || opp.name;
  const rep = session.noRepetitionPenalty ? 1 : repetitionFactor(profile, oppKey);
  const sk = computeSkillEffects(profile.player.skills);
  const wearMul = Math.max(0.3, 1 + (sk.economy.wear || 0));
  const rw = { credits: 0, playerXp: 0, research: 0, materials: {}, itemXp: [], items: [], unlocks: [], notes: [], wear: [] };
  const L = profile.loadouts.find((l) => l.id === me.p.loadoutId) || profile.loadouts[profile.activeLoadout];
  const rules = session.rules || {};

  // ---------------------------------------------------------- wear
  const partItems = {};
  for (const s of ['ring', 'core', 'disc', 'lock', 'tip', 'aux']) if (L?.parts[s]) partItems[s] = profile.inventory[L.parts[s]];
  const launcher = L?.launcher ? profile.inventory[L.launcher] : null;
  const cable = L?.cable ? profile.inventory[L.cable] : null;
  if (rules.durability !== false) {
    for (const [key, amount] of Object.entries(st.wear || {})) {
      let item = partItems[key];
      if (key.startsWith('launcher.')) item = launcher;
      if (key === 'cable') item = cable;
      if (!item) continue;
      const loss = amount * wearMul * itemWearMultiplier(item);
      if (key.startsWith('launcher.')) {
        const comp = key.split('.')[1];
        item.parts[comp] = Math.max(0, (item.parts[comp] ?? 100) - loss);
        item.durability = Math.max(0, Math.min(item.maxDurability, (item.parts.drive + item.parts.trigger + item.parts.grip) / 300 * item.maxDurability));
      } else item.durability = Math.max(0, item.durability - loss);
      rw.wear.push({ name: itemName(item), key, loss });
    }
  }

  // ---------------------------------------------------------- item XP
  const winMul = won ? 1.3 : draw ? 1.1 : 1;
  const xpMul = winMul * Math.max(0.5, difficulty) * rep;
  const finishesWon = st.finishes;
  const longestRound = Math.max(0, ...result.rounds.map((r) => r.time));
  const xpFor = {
    ring: 15 + st.impacts * 3 + st.impulseTotal * 120 + (finishesWon.out + finishesWon.burst) * 25,
    disc: 15 + st.heavyHitsTaken * 5 + st.impacts * 2,
    tip: 15 + st.spinTime * 0.6 + st.distance * 1.5,
    lock: 15 + (st.lockClicksTaken > 0 && st.losses.burst === 0 ? 30 : 0) + st.roundsFought * 5,
    core: 15 + st.abilitiesUsed * 6 + st.roundsFought * 4,
    aux: 15 + st.impacts * 2,
    launcher: 10 + st.launches.length * 6 + st.perfectLaunches * 15,
    cable: 10 + st.launches.length * 6 + st.perfectLaunches * 10,
  };
  const grant = (item, slot, raw) => {
    if (!item) return;
    const xp = Math.round(Math.min(XP_CAP_PER_ITEM, raw * xpMul));
    const before = masteryOf(item.xp || 0);
    let next = (item.xp || 0) + xp;
    if (next > MASTERY_CAP) {
      const over = next - Math.max(item.xp || 0, MASTERY_CAP);
      rw.research += Math.floor(over / 10);
      next = MASTERY_CAP;
    }
    item.xp = next;
    const after = masteryOf(item.xp);
    rw.itemXp.push({ name: itemName(item), xp, mastery: after.index > before.index ? after.name : null });
    // history
    const H = item.history;
    H.battles++;
    if (won) H.wins++;
    if (slot === 'ring' || slot === 'disc') H.highestImpact = Math.max(H.highestImpact || 0, st.impulseMax);
    if (slot === 'ring') { H.knockouts += finishesWon.out; H.bursts += finishesWon.burst; }
    if (slot === 'lock' && st.lockClicksTaken > 0 && st.losses.burst === 0) H.burstsSurvived++;
    if (slot === 'tip') H.longestSpin = Math.max(H.longestSpin || 0, longestRound);
    if (session.mode === 'tournament' && session.isFinal && won) H.tournamentWins++;
    const moment = signatureMoment(result, hi, session, battle);
    if (moment && (slot === 'ring' || slot === 'tip' || slot === 'launcher')) { H.moments.unshift(moment); H.moments.length = Math.min(H.moments.length, 8); }
  };
  for (const [slot, item] of Object.entries(partItems)) grant(item, slot, xpFor[slot]);
  grant(launcher, 'launcher', xpFor.launcher);
  grant(cable, 'cable', xpFor.cable);

  // ---------------------------------------------------------- player & economy
  const base = session.rewardScale ?? 1;
  rw.playerXp = Math.round((40 + (won ? 45 : draw ? 20 : 10) + st.roundsWon * 10) * Math.max(0.5, difficulty) * rep * base);
  rw.credits = Math.round((won ? 60 + 40 * difficulty : draw ? 35 : 22) * rep * base);
  const mats = { scrap: 2 + (won ? 2 : 0), polymer: won ? 1 : 0 };
  if (difficulty >= 1 && won) mats.alloy = 1;
  if (difficulty >= 1.15 && won) mats.coreShard = 1;
  for (const [k, v] of Object.entries(mats)) if (v > 0) { rw.materials[k] = Math.round(v * Math.max(0.5, rep)); }
  rw.research += Math.round((st.launches.filter((l) => l.techniqueSuccess).length * 2 + (st.abilitiesUsed > 0 ? 2 : 0)) * rep);
  rw.levelUps = addPlayerXp(profile, rw.playerXp);
  profile.currency.credits += rw.credits;
  profile.currency.research += rw.research;
  for (const [k, v] of Object.entries(rw.materials)) profile.materials[k] = (profile.materials[k] || 0) + v;
  profile.stats.earnings = (profile.stats.earnings || 0) + rw.credits;

  // ---------------------------------------------------------- Bit-Beast bond
  const bid = L?.beast;
  if (bid && profile.beasts[bid]) {
    const bs = profile.beasts[bid];
    const def = BEAST_INDEX[bid];
    const metric = def.preferred.metric;
    const styleScore = {
      impacts: st.impacts * 2, spinTime: st.spinTime * 0.4, counters: (st.counters || 0) * 10, bursts: finishesWon.burst * 25,
      comebacks: st.comebacks * 25, distance: st.distance * 0.8, impactsSurvived: st.heavyHitsTaken * 4, evades: (st.dashes || 0) * 2,
      perfectLaunches: st.perfectLaunches * 10,
    }[metric] || 0;
    const kin = 1 + (sk.economy.bondXp || 0);
    const xp = Math.round((15 + (won ? 15 : 0) + Math.min(60, styleScore) + st.abilitiesUsed * 2) * kin * rep * base);
    const lv0 = bondLevel(bs.bondXp);
    bs.bondXp += xp;
    const lv1 = bondLevel(bs.bondXp);
    rw.bond = { name: def.name, xp, level: lv1, levelUp: lv1 > lv0 };
    // tracked achievements for awakening requirements
    const S = bs.stats;
    const add = (k, v) => { S[k] = (S[k] || 0) + v; };
    add('roundsWith', st.roundsFought); add('ringOutsWith', finishesWon.out); add('burstsWith', finishesWon.burst); add('spinWinsWith', finishesWon.spin + finishesWon.decision);
    add('countersWith', st.counters || 0); add('comebacksWith', st.comebacks); add('heavyHitsSurvivedWith', st.heavyHitsTaken); add('distanceWith', st.distance);
    add('abilityHitsWith', st.abilityHits || 0); add('battlesWith', 1); if (won) add('winsWith', 1);
    profile.stats.beastUse[bid] = (profile.stats.beastUse[bid] || 0) + 1;
  }

  // ---------------------------------------------------------- loot
  const lootSource = session.loot ?? defaultLootSource(session, opp, difficulty);
  if (lootSource && rules.loot !== false) {
    const chance = (won ? lootSource.winChance ?? 0.75 : lootSource.lossChance ?? 0.3) * Math.max(0.4, rep);
    const roll = new Rng(mixSeeds(profile.seeds.loot, profile.seeds.counter, 'drop')).next(); // reproducible per profile
    if (roll < chance || lootSource.guaranteed) {
      const item = rollLoot(profile, lootSource);
      const first = addItem(profile, item);
      rw.items.push(item);
      if (first) rw.notes.push(`New discovery: ${itemName(item)} added to your collection log.`);
    } else profile.seeds.counter++;
  }

  // ---------------------------------------------------------- statistics
  updateStats(profile, result, hi, session, battle);
  pushRecent(profile, oppKey);
  if (rep < 0.99) rw.notes.push(`Repeated opponent: rewards ×${rep.toFixed(2)} (fight different opponents for full rewards).`);
  return rw;
}

export function defaultLootSource(session, opp, difficulty) {
  if (session.mode === 'lab' || session.mode === 'exhibition') return null;
  const tier = difficulty < 0.7 ? 0 : difficulty < 0.95 ? 1 : difficulty < 1.1 ? 2 : difficulty < 1.25 ? 3 : 4;
  const arch = session.opponentDef || ARCHETYPE_INDEX[opp.p.id];
  const favour = arch ? [...Object.values(arch.parts), arch.launcher, arch.cable].filter(Boolean) : [];
  return { label: `${session.title || 'Battle'} vs ${opp.name}`, tier, favour, winChance: 0.7, lossChance: 0.25 };
}

function signatureMoment(result, hi, session, battle) {
  const st = result.fighters[hi].stats;
  const oppName = result.fighters[1 - hi].name;
  const arena = battle.arenaDef.name;
  const date = new Date().toLocaleDateString();
  if (result.winner === hi && st.finishes.burst > 0) return `${date}: Shattered ${oppName} in ${arena}`;
  if (result.winner === hi && st.finishes.out > 0) return `${date}: Rang out ${oppName} in ${arena}`;
  if (result.winner === hi && st.comebacks > 0) return `${date}: Comeback win vs ${oppName}`;
  if (st.impulseMax > 0.12) return `${date}: Landed a ${st.impulseMax.toFixed(3)} N·s strike vs ${oppName}`;
  if (session.mode === 'tournament' && session.isFinal && result.winner === hi) return `${date}: Won the ${session.title} final`;
  return null;
}

export function updateStats(profile, result, hi, session, battle) {
  const S = profile.stats;
  const st = result.fighters[hi].stats;
  S.battles++;
  if (result.winner === hi) { S.wins++; S.streak++; S.bestStreak = Math.max(S.bestStreak, S.streak); }
  else if (result.winner == null) { S.draws++; S.streak = 0; }
  else { S.losses++; S.streak = 0; }
  S.rounds += st.roundsFought;
  S.roundsWon += st.roundsWon;
  for (const k of Object.keys(st.finishes)) S.finishes[k] = (S.finishes[k] || 0) + st.finishes[k];
  for (const k of Object.keys(st.losses)) S.losses_by[k] = (S.losses_by[k] || 0) + st.losses[k];
  S.highestImpact = Math.max(S.highestImpact, st.impulseMax);
  S.longestSpin = Math.max(S.longestSpin, ...result.rounds.map((r) => r.time));
  S.totalBattleTime += result.rounds.reduce((s, r) => s + r.time, 0);
  S.perfectLaunches += st.perfectLaunches;
  S.launches += st.launches.length;
  S.abilityUses += st.abilitiesUsed;
  S.impacts = (S.impacts || 0) + st.impacts;
  S.counters = (S.counters || 0) + (st.counters || 0);
  S.distance = (S.distance || 0) + st.distance;
  S.arenaUse[battle.arenaDef.id] = (S.arenaUse[battle.arenaDef.id] || 0) + 1;
  const L = profile.loadouts.find((l) => l.id === battle.fighters[hi].p.loadoutId);
  if (L) S.buildUse[L.name] = (S.buildUse[L.name] || 0) + 1;
  S.history = S.history || [];
  S.history.unshift({ t: Date.now(), mode: session.mode, opp: result.fighters[1 - hi].name, won: result.winner === hi, draw: result.winner == null, score: result.score.map((s) => s.rounds).join('-'), arena: battle.arenaDef.id });
  S.history.length = Math.min(S.history.length, 50);
}
