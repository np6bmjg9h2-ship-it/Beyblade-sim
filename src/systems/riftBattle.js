// Rift Run: turning a run into battle participants. The player's top is
// assembled from the run's equipped parts. Charms, family resonance, boons,
// forge levels, a ring's element and talents become modifier sources,
// technique/launch modifiers and the `rift` block that game/riftEffects.js
// reads. Opponents come from the act's archetype pool or its rival bosses;
// elite traits and vault rules are added as modifier sources.

import { CHARM_INDEX, FAMILIES, RESONANCE_COUNT, charmK } from '../data/riftCharms.js';
import { BOON_INDEX } from '../data/riftBoons.js';
import { RIFT_ACTS, ACT_DIFFICULTY, AFFIX_INDEX, VAULT_INDEX, FORGE_BONUS, RING_ELEMENT_CHANCE, depthRules } from '../data/rift.js';
import { SLOTS, SLOT_NAMES } from '../data/parts.js';
import { setSources } from '../data/sets.js';
import { computeSkillEffects } from '../data/skills.js';
import { bondLevel } from '../data/beasts.js';
import { opponentFrom } from './modes.js';
import { rivalParticipant } from './rivals.js';

const addTo = (o, x) => { for (const [k, v] of Object.entries(x || {})) if (typeof v === 'number') o[k] = (o[k] || 0) + v; };

export function familyCounts(run) {
  const n = {};
  for (const h of run.charms) { const c = CHARM_INDEX[h.id]; if (c) n[c.family] = (n[c.family] || 0) + 1; }
  return n;
}

// Every effect source active in the run, as { src, name, fx }.
export function runFx(profile, run) {
  const list = [];
  for (const h of run.charms) {
    const c = CHARM_INDEX[h.id];
    if (c) list.push({ src: 'charm:' + h.id, name: c.name, fx: c.fx(charmK(h)) });
  }
  for (const [fam, n] of Object.entries(familyCounts(run))) {
    if (n >= RESONANCE_COUNT) list.push({ src: 'family:' + fam, name: `${FAMILIES[fam].name} Resonance`, fx: FAMILIES[fam].bonus });
  }
  for (const [id, lv] of Object.entries(run.boons || {})) {
    const b = BOON_INDEX[id];
    if (b && lv > 0) list.push({ src: 'boon:' + id, name: b.name(run.beast), fx: b.fx(lv, run.beast) });
  }
  const T = profile?.rift?.talents || {};
  if (T.lucky) list.push({ src: 'talent:lucky', name: 'Lucky Charm', fx: { sweet: 0.03 * T.lucky } });
  return list;
}

// Merge a list of fx objects into one summary.
export function combineFx(list) {
  const out = { mods: [], skill: {}, launch: {}, status: {}, statusPower: {}, statusTime: {}, econ: {}, sweet: 0, sweetMul: 2, sweetSpirit: 0, secondWind: 0, awaken: false };
  for (const { src, name, fx } of list) {
    (fx.mods || []).forEach((m, i) => out.mods.push({ id: `rift:${src}:${i}`, name, origin: 'rift', cond: m.cond || { type: 'always' }, deltas: m.deltas }));
    addTo(out.skill, fx.skill);
    addTo(out.launch, fx.launch);
    addTo(out.status, fx.status);
    addTo(out.statusPower, fx.statusPower);
    addTo(out.statusTime, fx.statusTime);
    addTo(out.econ, fx.econ);
    out.sweet += fx.sweet || 0;
    out.sweetSpirit += fx.sweetSpirit || 0;
    out.secondWind = Math.max(out.secondWind, fx.secondWind || 0);
    if (fx.sweetMul) out.sweetMul = Math.max(out.sweetMul, fx.sweetMul);
    if (fx.awaken) out.awaken = true;
  }
  return out;
}

export const runEffects = (profile, run) => combineFx(runFx(profile, run));

// Forge levels on equipped parts, as always-on modifier sources.
export function forgeSources(run) {
  const out = [];
  for (const slot of SLOTS) {
    const it = run.equipped[slot];
    if (it?.forge > 0 && FORGE_BONUS[slot]) {
      out.push({ id: `rift:forge:${slot}`, name: `${SLOT_NAMES[slot]} +${it.forge}`, origin: 'rift', cond: { type: 'always' }, deltas: FORGE_BONUS[slot].deltas(it.forge) });
    }
  }
  return out;
}

export function runGear(profile, run) {
  return { launcher: profile.inventory[run.launcher] || null, cable: profile.inventory[run.cable] || null };
}

// The player's battle participant for the current run.
export function riftParticipant(profile, run) {
  const parts = {};
  for (const s of SLOTS) parts[s] = run.equipped[s] || null;
  const { launcher, cable } = runGear(profile, run);
  const sets = setSources([...Object.values(parts), launcher, cable].filter(Boolean));
  const sk = computeSkillEffects(profile.player.skills);
  const fx = runEffects(profile, run);
  const skillMods = { ...sk.skillMods };
  addTo(skillMods, fx.skill);
  const launchMods = { ...sets.launch };
  addTo(launchMods, sk.launch);
  addTo(launchMods, fx.launch);
  const status = { ...fx.status };
  const el = parts.ring?.element;
  if (el) status[el] = (status[el] || 0) + RING_ELEMENT_CHANCE;
  const bs = run.beast ? profile.beasts[run.beast.id] : null;
  const beast = run.beast ? { id: run.beast.id, bondLevel: bs ? bondLevel(bs.bondXp) : 1, awakened: !!(bs?.awakened || fx.awaken), resonanceBoost: sk.economy.resonance || 0 } : null;
  return {
    id: 'player', name: profile.player.name, human: true,
    build: parts, launcher, cable, beast,
    spin: run.spin || 'R', technique: run.technique || 'normal',
    modSources: [...sets.sources, ...sk.sources, ...fx.mods, ...forgeSources(run)],
    launchMods, skillMods, knownTechniques: profile.techniques, color: profile.player.color,
    rift: { status, statusPower: fx.statusPower, statusTime: fx.statusTime, sweet: fx.sweet, sweetMul: fx.sweetMul, sweetSpirit: fx.sweetSpirit, secondWind: fx.secondWind },
  };
}

// AI skill for a node (act base, node type, depth, cursed charms).
export function nodeDifficulty(profile, run, node) {
  const fx = runEffects(profile, run);
  const extra = depthRules(run.depth).oppSkill + (fx.econ.oppSkill || 0);
  const bump = node.type === 'boss' ? 0.12 : node.type === 'elite' || node.type === 'vault' ? 0.1 : 0;
  return Math.max(0.4, Math.min(1.35, ACT_DIFFICULTY[node.act] + bump + extra));
}

// The opponent for a battle node.
export function nodeOpponent(profile, run, node) {
  const act = RIFT_ACTS[node.act];
  const difficulty = nodeDifficulty(profile, run, node);
  let p;
  if (node.type === 'boss') {
    p = rivalParticipant(profile, node.rival, act.tier, { difficulty, seed: node.seed, pid: 'rift-boss' });
  } else {
    const tier = Math.min(5, act.tier + (node.type === 'battle' ? 0 : 1));
    p = opponentFrom({ archetype: node.archetype, difficulty, tier }, { id: 'rift-opp', seedKey: `rift:${run.seed}:${node.id}` });
  }
  p.modSources = [...(p.modSources || [])];
  const names = [];
  for (const id of node.affixes || []) {
    const a = AFFIX_INDEX[id];
    if (!a) continue;
    names.push(a.name);
    if (a.mods) p.modSources.push({ id: 'affix:' + id, name: a.name, origin: 'rift', cond: a.cond || { type: 'always' }, deltas: a.mods });
    if (a.status) { p.rift = p.rift || { status: {} }; addTo(p.rift.status, a.status); }
  }
  const v = node.vault ? VAULT_INDEX[node.vault] : null;
  if (v?.oppMods) p.modSources.push({ id: 'vault:' + v.id, name: v.name, origin: 'rift', cond: { type: 'always' }, deltas: v.oppMods });
  if (names.length && node.type !== 'boss') p.name = `${names.join(' ')} ${p.name}`;
  p.affixNames = names;
  return p;
}

export function nodeRules(node) {
  const v = node.vault ? VAULT_INDEX[node.vault] : null;
  return { durability: false, loot: false, ...(v?.rules || {}) };
}
