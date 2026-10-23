// Loadouts -> battle participants. Validates every loadout against the
// assembly rules before battle and gathers all modifier sources that apply:
// item traits (collected in battle), set bonuses, player skills, beast
// bond state and launch modifiers.

import { validateBuild, assembleTop } from './assembly.js';
import { resolveLaunchGear } from '../game/launch.js';
import { setSources } from '../data/sets.js';
import { computeSkillEffects } from '../data/skills.js';
import { bondLevel, BEAST_INDEX } from '../data/beasts.js';
import { SLOTS } from '../data/parts.js';
import { buildBattleFx } from './synergy.js';
import { legendKit } from './legends.js';

export function loadoutItems(profile, L) {
  // the Legend slot fields a fixed kit, not inventory items (systems/legends.js)
  if (L?.legend) {
    const kit = legendKit(L.legend);
    if (kit) return { parts: Object.fromEntries(SLOTS.map((s) => [s, kit.parts[s] || null])), launcher: kit.launcher, cable: kit.cable };
  }
  const parts = {};
  for (const s of SLOTS) parts[s] = L.parts[s] ? profile.inventory[L.parts[s]] || null : null;
  return { parts, launcher: L.launcher ? profile.inventory[L.launcher] : null, cable: L.cable ? profile.inventory[L.cable] : null };
}

export function validateLoadout(profile, L) {
  const { parts, launcher, cable } = loadoutItems(profile, L);
  const errors = [];
  if (!launcher) errors.push('No launcher equipped.');
  if (!cable) errors.push('No launch cable equipped.');
  if (launcher && launcher.durability <= 0) errors.push('Launcher is broken — repair it in the Workshop.');
  if (cable && cable.durability <= 0) errors.push('Launch cable is broken — repair it in the Workshop.');
  const gear = launcher ? resolveLaunchGear(launcher, cable) : null;
  const v = validateBuild(parts, { spin: L.spin, launcher: gear ? { spinMech: gear.spinMech } : null });
  return { ok: v.ok && errors.length === 0, errors: [...v.errors, ...errors], warnings: v.warnings, validation: v, parts, launcher, cable };
}

export function buildParticipant(profile, L, opts = {}) {
  const { parts, launcher, cable } = loadoutItems(profile, L);
  const all = [...Object.values(parts), launcher, cable].filter(Boolean);
  const sets = setSources(all);
  const sk = computeSkillEffects(profile.player.skills);
  const launchMods = { ...sets.launch };
  for (const [k, v] of Object.entries(sk.launch)) launchMods[k] = (launchMods[k] || 0) + v;
  const bs = L.beast ? profile.beasts[L.beast] : null;
  const beast = bs ? { id: bs.id, bondLevel: bondLevel(bs.bondXp), awakened: !!bs.awakened, resonanceBoost: sk.economy.resonance || 0 } : null;
  // synergies and elemental traits (systems/synergy.js)
  const fx = buildBattleFx({ parts, launcher, cable, beast, spin: L.spin }, profile.discovery?.synergies || {});
  for (const [k, v] of Object.entries(fx.launch)) launchMods[k] = (launchMods[k] || 0) + v;
  const skillMods = { ...sk.skillMods };
  for (const [k, v] of Object.entries(fx.skill)) skillMods[k] = (skillMods[k] || 0) + v;
  return {
    id: opts.id || 'player',
    name: profile.player.name,
    human: opts.human !== false,
    build: parts,
    launcher, cable,
    beast,
    spin: L.spin || 'R',
    technique: L.technique || 'normal',
    modSources: [...sets.sources, ...sk.sources, ...fx.sources],
    launchMods,
    skillMods,
    reactive: fx.reactive,
    synergies: fx.ids,
    ...(fx.rift ? { rift: fx.rift } : {}),
    knownTechniques: profile.techniques,
    color: profile.player.color,
    loadoutId: L.id,
    loadoutName: L.name,
  };
}

// Summary used by the workshop/loadout screens.
export function loadoutSummary(profile, L) {
  const val = validateLoadout(profile, L);
  let asm = null;
  if (val.validation.ok) {
    try { asm = assembleTop(val.parts, { spin: L.spin }); } catch { asm = null; }
  }
  const { parts, launcher, cable } = val;
  const all = [...Object.values(parts), launcher, cable].filter(Boolean);
  const sets = setSources(all);
  const beast = L.beast ? BEAST_INDEX[L.beast] : null;
  return { validation: val, assembly: asm, sets, beast };
}
