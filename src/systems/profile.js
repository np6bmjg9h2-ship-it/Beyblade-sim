// Player profile: the persistent game state. newProfile() creates a fresh
// save with the starter kit; normalizeProfile() repairs any missing fields so
// older or partially corrupted saves keep working (see save.js migrations).

import { createItem } from './items.js';
import { DEFAULT_INPUT_SETTINGS } from '../input/inputManager.js';

export const SCHEMA_VERSION = 3;

export const MATERIALS = {
  scrap: { name: 'Scrap Alloy', desc: 'Salvaged metal and polymer. Used in repairs and basic upgrades.' },
  polymer: { name: 'Tuned Polymer', desc: 'Refined plastic for rings and tips.' },
  alloy: { name: 'Precision Alloy', desc: 'High-grade metal for discs, locks and launchers.' },
  coreShard: { name: 'Core Shard', desc: 'Crystallised energy from rare parts. Used for rerolls and trait work.' },
  spiritDust: { name: 'Spirit Dust', desc: 'Residue of Bit-Beast resonance. Used for bond and resonance work.' },
  relicFragment: { name: 'Relic Fragment', desc: 'Fragments of ancient equipment. Used for the highest-tier crafting.' },
};

export const STARTER_PARTS = [
  ['ring', 'ring_galefang'], ['ring', 'ring_bastion'], ['ring', 'ring_tidalhalo'], ['ring', 'ring_cometarc'],
  ['core', 'core_helix'], ['core', 'core_helix'], ['core', 'core_quad'],
  ['disc', 'disc_ten'], ['disc', 'disc_heavyring'], ['disc', 'disc_feather'],
  ['lock', 'lock_click3'], ['lock', 'lock_click3'], ['lock', 'lock_click3'], ['lock', 'lock_snap'],
  ['tip', 'tip_needle'], ['tip', 'tip_pivotball'], ['tip', 'tip_flatstrike'], ['tip', 'tip_semiflat'],
  ['launcher', 'launcher_spark'], ['cable', 'cable_standard'],
];

export const PLAYER_LEVEL_XP = (lv) => Math.round(120 * Math.pow(lv, 1.45));

export function defaultSettings() {
  return {
    audio: { master: 0.8, sfx: 0.9, music: 0.45, ambience: 0.5, muted: false },
    graphics: { quality: 'high', shadows: true, outlines: true, reducedEffects: false, showFps: false, debugOverlay: false, renderScale: 1, fpsCap: 0 },
    gameplay: { slowmo: true, camera: 'broadcast', hudScale: 1, telemetry: false, subtitles: true, dialogueSpeed: 1, colorblind: false, highContrast: false, storyDifficulty: 'normal' },
    input: { ...DEFAULT_INPUT_SETTINGS },
    bindings: null,
  };
}

export function newProfile(seed = Date.now()) {
  const p = {
    version: SCHEMA_VERSION,
    createdAt: Date.now(), updatedAt: Date.now(), playtime: 0,
    player: { name: 'Rookie', created: false, color: '#4fc3ff', title: 'Newcomer', level: 1, xp: 0, skillPoints: 0, skills: {}, archetype: null, pronoun: 'they' },
    currency: { credits: 300, research: 0 },
    materials: { scrap: 10, polymer: 4, alloy: 2, coreShard: 0, spiritDust: 0, relicFragment: 0 },
    inventory: {},
    loadouts: [],
    activeLoadout: 0,
    beasts: { orrery: { id: 'orrery', bondXp: 0, awakened: false, unlockedAt: Date.now(), stats: {}, nickname: null } },
    techniques: ['normal', 'power', 'controlled', 'bank'],
    story: { chapter: 1, node: null, flags: {}, choices: {}, completed: [], seen: [] },
    tournaments: { history: [], active: null, ranking: { points: 0 }, records: {}, league: null },
    rivals: {},
    survival: { best: 0, runs: 0, active: null },
    league: { division: 5, season: 1, active: null, history: [] },
    habits: { matches: 0, style: { attack: 0, defense: 0, stamina: 0, balance: 0, burst: 0, upper: 0 }, recentStyles: [], aggression: 0.5, edge: 0.2, dashRate: 0, counterRate: 0, abilityRate: 0, leftSpin: 0, perfectRate: 0 },
    arenasUnlocked: ['standard'],
    stats: { battles: 0, wins: 0, losses: 0, draws: 0, rounds: 0, roundsWon: 0, finishes: { spin: 0, out: 0, burst: 0, decision: 0 }, losses_by: { spin: 0, out: 0, burst: 0, decision: 0 }, highestImpact: 0, longestSpin: 0, totalBattleTime: 0, perfectLaunches: 0, launches: 0, abilityUses: 0, streak: 0, bestStreak: 0, arenaUse: {}, beastUse: {}, buildUse: {}, tournamentsWon: 0, finals: 0, earnings: 0, survivalBest: 0, challengesDone: {} },
    discovery: { parts: {}, sets: {}, traits: {}, beasts: { orrery: true } },
    seeds: { loot: seed >>> 0, counter: 0 },
    tutorial: {},
    settings: defaultSettings(),
    undo: [],
  };
  // starter kit
  const kit = {};
  STARTER_PARTS.forEach(([slot, base], i) => {
    const it = createItem({ base, rarity: 'common', level: 1, seed: (seed + i * 7919) >>> 0, noTraits: true, set: null, special: null, source: 'starter kit' });
    p.inventory[it.uid] = it;
    p.discovery.parts[base] = true;
    (kit[base] = kit[base] || []).push(it.uid);
  });
  const take = (base) => kit[base].shift();
  const launcher = take('launcher_spark'), cable = take('cable_standard');
  p.loadouts = [
    { id: 'L1', name: 'Gale Striker', role: 'Attack', parts: { ring: take('ring_galefang'), core: take('core_helix'), disc: kit.disc_ten[0], lock: take('lock_click3'), tip: take('tip_flatstrike') }, launcher, cable, beast: 'orrery', spin: 'R', technique: 'bank' },
    { id: 'L2', name: 'Tidal Drift', role: 'Stamina', parts: { ring: take('ring_tidalhalo'), core: take('core_helix'), disc: kit.disc_heavyring[0], lock: take('lock_click3'), tip: take('tip_needle') }, launcher, cable, beast: 'orrery', spin: 'R', technique: 'controlled' },
    { id: 'L3', name: 'Comet Balance', role: 'Balance', parts: { ring: take('ring_cometarc'), core: take('core_quad'), disc: take('disc_feather'), lock: take('lock_click3'), tip: take('tip_semiflat') }, launcher, cable, beast: 'orrery', spin: 'R', technique: 'normal' },
  ];
  return p;
}

// Fill in anything missing from older or damaged saves.
export function normalizeProfile(p) {
  const d = newProfileShape();
  const fill = (target, def) => {
    for (const [k, v] of Object.entries(def)) {
      if (target[k] === undefined || target[k] === null && v !== null) target[k] = structuredClone(v);
      else if (v && typeof v === 'object' && !Array.isArray(v) && typeof target[k] === 'object' && !Array.isArray(target[k])) fill(target[k], v);
    }
  };
  fill(p, d);
  // settings sub-objects
  const ds = defaultSettings();
  for (const k of Object.keys(ds)) {
    if (!p.settings[k] || typeof p.settings[k] !== 'object') p.settings[k] = structuredClone(ds[k]);
    else if (ds[k]) for (const [kk, vv] of Object.entries(ds[k])) if (p.settings[k][kk] === undefined) p.settings[k][kk] = vv;
  }
  if (!p.beasts.orrery) p.beasts.orrery = { id: 'orrery', bondXp: 0, awakened: false, unlockedAt: Date.now(), stats: {} };
  for (const b of Object.values(p.beasts)) { b.stats = b.stats || {}; b.bondXp = b.bondXp || 0; }
  for (const it of Object.values(p.inventory)) {
    it.history = it.history || { battles: 0, wins: 0, knockouts: 0, bursts: 0, burstsSurvived: 0, highestImpact: 0, longestSpin: 0, tournamentWins: 0, moments: [] };
    it.history.moments = it.history.moments || [];
    it.tuning = it.tuning || []; it.upgrades = it.upgrades || []; it.traits = it.traits || [];
    if (it.slot === 'launcher' && !it.parts) it.parts = { drive: 100, trigger: 100, grip: 100 };
  }
  // drop loadout references to items that no longer exist
  for (const L of p.loadouts) {
    for (const s of Object.keys(L.parts)) if (L.parts[s] && !p.inventory[L.parts[s]]) L.parts[s] = null;
    if (L.launcher && !p.inventory[L.launcher]) L.launcher = null;
    if (L.cable && !p.inventory[L.cable]) L.cable = null;
    if (L.beast && !p.beasts[L.beast]) L.beast = 'orrery';
  }
  p.version = SCHEMA_VERSION;
  return p;
}

function newProfileShape() {
  // structural defaults without generating items
  const p = newProfile(1);
  p.inventory = {}; p.loadouts = [];
  return p;
}

export function addPlayerXp(p, xp) {
  const pl = p.player;
  pl.xp += xp;
  let ups = 0;
  while (pl.level < 60 && pl.xp >= PLAYER_LEVEL_XP(pl.level)) {
    pl.xp -= PLAYER_LEVEL_XP(pl.level);
    pl.level++;
    pl.skillPoints++;
    ups++;
  }
  return ups;
}
