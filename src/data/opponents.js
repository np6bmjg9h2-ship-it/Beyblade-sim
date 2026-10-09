// Generic opponent archetypes for Quick/Custom Battle and filler entrants in
// tournaments. Rivals with personal stories live in data/characters.js.

import { PART_INDEX } from './parts.js';
import { LAUNCHER_INDEX, CABLE_INDEX } from './launchers.js';

export const ARCHETYPES = [
  { id: 'striker', name: 'Street Striker', ai: 'aggressive', color: '#ff5a5a', beast: 'kerauno', spin: 'R', technique: 'bank',
    parts: { ring: 'ring_galefang', core: 'core_helix', disc: 'disc_ten', lock: 'lock_click3', tip: 'tip_flatstrike' }, launcher: 'launcher_spark', cable: 'cable_standard',
    desc: 'Flat-tip attacker that hunts collisions.' },
  { id: 'wall', name: 'Iron Wall', ai: 'defensive', color: '#9aa6b8', beast: 'ferrowulf', spin: 'R', technique: 'controlled',
    parts: { ring: 'ring_bastion', core: 'core_quad', disc: 'disc_heavyring', lock: 'lock_ironclasp', tip: 'tip_pivotball' }, launcher: 'launcher_spark', cable: 'cable_standard',
    desc: 'Heavy ball-tip defender with a five-notch lock.' },
  { id: 'drifter', name: 'Long Drifter', ai: 'endurance', color: '#5fe0d0', beast: 'caelumanta', spin: 'R', technique: 'controlled',
    parts: { ring: 'ring_tidalhalo', core: 'core_helix', disc: 'disc_heavyring', lock: 'lock_click3', tip: 'tip_needle' }, launcher: 'launcher_spark', cable: 'cable_standard',
    desc: 'Needle-tip stamina specialist.' },
  { id: 'all', name: 'All-Rounder', ai: 'balanced', color: '#ffd84d', beast: 'zephyrax', spin: 'R', technique: 'normal',
    parts: { ring: 'ring_cometarc', core: 'core_helix', disc: 'disc_ten', lock: 'lock_click3', tip: 'tip_semiflat' }, launcher: 'launcher_spark', cable: 'cable_standard',
    desc: 'Balanced semi-flat build that reads the spin race.' },
  { id: 'breaker', name: 'Lock Breaker', ai: 'risky', color: '#c04bff', beast: 'vexscor', spin: 'R', technique: 'power',
    parts: { ring: 'ring_rifttalon', core: 'core_helix', disc: 'disc_feather', lock: 'lock_click3', tip: 'tip_rubberflat' }, launcher: 'launcher_torque', cable: 'cable_standard',
    desc: 'Hooked talons and rubber grip, built to shatter locks.' },
  { id: 'counter', name: 'Counter Spinner', ai: 'technical', color: '#8a7dff', beast: 'abyssion', spin: 'L', technique: 'phantom',
    parts: { ring: 'ring_phantomedge', core: 'core_helix', disc: 'disc_wide', lock: 'lock_click3', tip: 'tip_hybrid' }, launcher: 'launcher_lefthand', cable: 'cable_steel',
    desc: 'Left-spin technician that steals spin and counters.' },
  { id: 'upper', name: 'Sky Lifter', ai: 'aggressive', color: '#ffb33c', beast: 'magmarion', spin: 'R', technique: 'bank',
    parts: { ring: 'ring_solarflare', core: 'core_solar', disc: 'disc_ten', lock: 'lock_click3', tip: 'tip_flatstrike' }, launcher: 'launcher_torque', cable: 'cable_long',
    desc: 'Upward-raked flares that lift opponents off their tips.' },
  { id: 'champion', name: 'Circuit Champion', ai: 'elite', color: '#e8f0ff', beast: 'pyrrhex', spin: 'R', technique: 'spiral',
    parts: { ring: 'ring_starlance', core: 'core_storm', disc: 'disc_heavyring', lock: 'lock_spring', tip: 'tip_semiflat' }, launcher: 'launcher_precision', cable: 'cable_carbon',
    desc: 'Elite all-rounder with perfect launches.' },
];

export const ARCHETYPE_INDEX = Object.fromEntries(ARCHETYPES.map((a) => [a.id, a]));

export const DIFFICULTIES = [
  { id: 'rookie', name: 'Rookie', value: 0.6 },
  { id: 'regular', name: 'Regular', value: 0.85 },
  { id: 'veteran', name: 'Veteran', value: 1.0 },
  { id: 'elite', name: 'Elite', value: 1.15 },
  { id: 'legend', name: 'Legend', value: 1.3 },
];

// Build a battle participant from a data definition (base parts, no items).
export function participantFromDef(def, opts = {}) {
  const build = Object.fromEntries(Object.entries(def.parts).map(([s, id]) => [s, PART_INDEX[id]]));
  return {
    id: opts.id || def.id,
    name: opts.name || def.name,
    human: false,
    ai: opts.ai || def.ai,
    difficulty: opts.difficulty ?? 1,
    build,
    launcher: LAUNCHER_INDEX[def.launcher] || LAUNCHER_INDEX.launcher_spark,
    cable: CABLE_INDEX[def.cable] || CABLE_INDEX.cable_standard,
    beast: def.beast ? { id: def.beast, bondLevel: opts.bondLevel ?? 4, awakened: !!opts.awakened } : null,
    spin: def.spin || 'R',
    technique: def.technique || 'normal',
    color: def.color,
    knownTechniques: ['normal', 'power', 'controlled', 'bank', 'spiral', 'phantom', 'lance'],
    modSources: opts.modSources || [],
  };
}
