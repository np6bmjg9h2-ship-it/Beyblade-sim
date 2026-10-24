// Player profile: the persistent game state. newProfile() creates a fresh
// save with the starter kit; normalizeProfile() repairs any missing fields so
// older or partially corrupted saves keep working (see save.js migrations).

import { createItem } from './items.js';
import { RECRUIT_BOND_XP } from '../data/beasts.js';
import { LEGEND_INDEX } from '../data/legends.js';
import { ensureLegendLoadout } from './legends.js';
import { recruitBeast } from './beasts.js';
import { validateItem } from './itemValidate.js';
import { cleanSetup } from '../data/setup.js';
import { cleanPaint } from '../data/paint.js';
import { DEFAULT_INPUT_SETTINGS } from '../input/inputManager.js';
import * as dm from '../core/dmath.js';
import { PATTERNS, DEFAULT_PLAYBOOK } from '../game/playbook.js';

export const SCHEMA_VERSION = 4;

export const MATERIALS = {
  scrap: { name: 'Scrap Alloy', desc: 'Salvaged metal and polymer. Used in repairs and basic upgrades.' },
  polymer: { name: 'Tuned Polymer', desc: 'Refined plastic for rings and tips.' },
  alloy: { name: 'Precision Alloy', desc: 'High-grade metal for discs, locks and launchers.' },
  coreShard: { name: 'Core Shard', desc: 'Crystallised energy from rare parts. Used for rerolls and trait work.' },
  spiritDust: { name: 'Spirit Dust', desc: 'Residue of Spirit Chip resonance. Used for bond and resonance work.' },
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

export const PLAYER_LEVEL_XP = (lv) => Math.round(120 * dm.pow(lv, 1.45));

export function defaultSettings() {
  return {
    audio: { master: 0.8, sfx: 0.9, music: 0.45, ambience: 0.5, muted: false },
    graphics: { quality: 'high', style: 'ink', shadows: true, outlines: true, reducedEffects: false, showFps: false, debugOverlay: false, renderScale: 1, fpsCap: 0 },
    gameplay: { slowmo: true, camera: 'broadcast', hudScale: 1, telemetry: false, subtitles: true, dialogueSpeed: 1, colorblind: false, highContrast: false, storyDifficulty: 'normal', shareData: null },
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
    // research projects done and legends awakened (systems/legends.js)
    archive: { done: {}, legends: {} },
    // D-pad patterns: the ones learned, and the four slots (up, down, left, right)
    playbook: { owned: [...DEFAULT_PLAYBOOK], slots: [...DEFAULT_PLAYBOOK] },
    story: { chapter: 1, node: null, flags: {}, choices: {}, completed: [], seen: [] },
    tournaments: { history: [], active: null, ranking: { points: 0 }, records: {}, league: null },
    rivals: {},
    survival: { best: 0, runs: 0, active: null },
    league: { division: 5, season: 1, active: null, history: [] },
    rift: { essence: 0, essenceEarned: 0, talents: {}, depthUnlocked: 0, runs: 0, clears: 0, bestDepth: -1, bestAct: 0, history: [], active: null },
    store: { purchases: 0, spent: 0, opened: {}, daily: { day: '', bought: [], protos: [], seen: '' } },
    habits: { matches: 0, style: { attack: 0, defense: 0, stamina: 0, balance: 0, burst: 0, upper: 0 }, recentStyles: [], aggression: 0.5, edge: 0.2, dashRate: 0, counterRate: 0, abilityRate: 0, leftSpin: 0, perfectRate: 0 },
    arenasUnlocked: ['standard'],
    stats: { battles: 0, wins: 0, losses: 0, draws: 0, rounds: 0, roundsWon: 0, finishes: { spin: 0, out: 0, burst: 0, decision: 0 }, losses_by: { spin: 0, out: 0, burst: 0, decision: 0 }, highestImpact: 0, longestSpin: 0, totalBattleTime: 0, perfectLaunches: 0, launches: 0, abilityUses: 0, streak: 0, bestStreak: 0, arenaUse: {}, beastUse: {}, buildUse: {}, tournamentsWon: 0, finals: 0, earnings: 0, survivalBest: 0, challengesDone: {} },
    discovery: { parts: {}, sets: {}, traits: {}, beasts: { orrery: true }, synergies: {} },
    seeds: { loot: seed >>> 0, counter: 0, pity: { epic: 0, legendary: 0 } },
    quarantine: {}, // items that failed validation on load, kept for inspection
    relics: { earned: {}, casts: {} }, // handcrafted relics earned (data/relics.js)
    imprints: [], // traits kept from dismantled parts, ready to engrave
    journal: { claimed: {} }, // Journal milestone rewards collected
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

const kindOf = (x) => (Array.isArray(x) ? 'array' : x === null ? 'null' : typeof x);
const isRecord = (o) => kindOf(o) === 'object';
const ITEM_HISTORY = { battles: 0, wins: 0, knockouts: 0, bursts: 0, burstsSurvived: 0, highestImpact: 0, longestSpin: 0, tournamentWins: 0, moments: [] };

// Fill in anything missing from older or damaged saves. A field of the
// default shape that holds the wrong kind of value (or a non-finite number)
// is damaged and gets its default; fields whose default is null are
// optional and keep whatever was saved.
export function normalizeProfile(p) {
  const d = newProfileShape();
  const fill = (target, def) => {
    for (const [k, v] of Object.entries(def)) {
      const t = target[k];
      if (t === undefined || (t === null && v !== null)) target[k] = structuredClone(v);
      else if (v === null) continue;
      else if (kindOf(t) !== kindOf(v) || (typeof v === 'number' && !Number.isFinite(t))) target[k] = structuredClone(v);
      else if (isRecord(v)) fill(t, v);
    }
  };
  fill(p, d);
  // settings sub-objects
  const ds = defaultSettings();
  for (const k of Object.keys(ds)) {
    if (!p.settings[k] || typeof p.settings[k] !== 'object') p.settings[k] = structuredClone(ds[k]);
    else if (ds[k]) for (const [kk, vv] of Object.entries(ds[k])) if (p.settings[k][kk] === undefined) p.settings[k][kk] = vv;
  }
  // a damaged Spirit Chip record keeps the beast (ownership) with a fresh bond
  for (const [id, b] of Object.entries(p.beasts)) {
    if (!isRecord(b)) { p.beasts[id] = { id, bondXp: 0, awakened: false, unlockedAt: Date.now(), stats: {}, nickname: null }; continue; }
    if (!isRecord(b.stats)) b.stats = {};
    if (!Number.isFinite(b.bondXp) || b.bondXp < 0) b.bondXp = 0;
    // recruited chips start at the recruit bond (older saves catch up here)
    if (id !== 'orrery' && b.bondXp < RECRUIT_BOND_XP) b.bondXp = RECRUIT_BOND_XP;
  }
  for (const [uid, it] of Object.entries(p.inventory)) {
    if (isRecord(it)) {
      if (it.uid !== uid) it.uid = uid; // the inventory key is the item's identity
      if (!isRecord(it.history)) it.history = structuredClone(ITEM_HISTORY);
      for (const [k, v] of Object.entries(ITEM_HISTORY)) if (typeof v === 'number' && !Number.isFinite(it.history[k])) it.history[k] = v;
      if (!Array.isArray(it.history.moments)) it.history.moments = [];
      if (!Array.isArray(it.tuning)) it.tuning = [];
      if (it.setup != null) it.setup = cleanSetup(it.slot, it.setup);
      if (it.paint != null) it.paint = cleanPaint(it.paint, it.rarity);
      if (!Array.isArray(it.upgrades)) it.upgrades = [];
      if (it.traits == null) it.traits = [];
      if (it.slot === 'launcher' && !isRecord(it.parts)) it.parts = { drive: 100, trigger: 100, grip: 100 };
    }
    // impossible or corrupted items are set aside, not deleted (unequipped below)
    const v = validateItem(it);
    if (!v.ok) { p.quarantine[uid] = { item: it, errors: v.errors, at: Date.now() }; delete p.inventory[uid]; }
  }
  // repair damaged loadouts and drop references to items that no longer exist
  const owned = (uid) => (typeof uid === 'string' && p.inventory[uid] ? uid : null);
  p.loadouts = p.loadouts.filter(isRecord);
  if (!p.loadouts.length) p.loadouts.push({ id: 'L1', name: 'Loadout 1', role: 'Balance', parts: {}, launcher: null, cable: null, beast: 'orrery', spin: 'R', technique: 'normal' });
  p.loadouts.forEach((L, i) => {
    if (!isRecord(L.parts)) L.parts = {};
    for (const s of Object.keys(L.parts)) L.parts[s] = owned(L.parts[s]);
    L.launcher = owned(L.launcher);
    L.cable = owned(L.cable);
    // no Spirit Chip is a valid choice (null); an unknown one falls back to Orrery
    if (L.beast != null && !(typeof L.beast === 'string' && p.beasts[L.beast])) L.beast = L.beast ? 'orrery' : null;
    if (L.spin !== 'R' && L.spin !== 'L') L.spin = 'R';
    if (typeof L.technique !== 'string') L.technique = 'normal';
    if (typeof L.name !== 'string') L.name = `Loadout ${i + 1}`;
    if (typeof L.id !== 'string') { let n = i + 1; while (p.loadouts.some((o) => o.id === `L${n}`)) n++; L.id = `L${n}`; }
  });
  // the Archive and the Legend slot: one slot, only for awakened legends
  if (!isRecord(p.archive)) p.archive = { done: {}, legends: {} };
  if (!isRecord(p.archive.done)) p.archive.done = {};
  if (!isRecord(p.archive.legends)) p.archive.legends = {};
  for (const id of Object.keys(p.archive.legends)) if (!LEGEND_INDEX[id]) delete p.archive.legends[id];
  const legendSlots = p.loadouts.filter((L) => L.legend);
  for (const L of legendSlots.slice(1)) p.loadouts.splice(p.loadouts.indexOf(L), 1);
  for (const id of Object.keys(p.archive.legends)) if (!p.beasts[LEGEND_INDEX[id].beast]) recruitBeast(p, LEGEND_INDEX[id].beast);
  ensureLegendLoadout(p);
  if (!Number.isInteger(p.activeLoadout) || p.activeLoadout < 0 || p.activeLoadout >= p.loadouts.length) p.activeLoadout = 0;
  // playbook: known pattern ids only; every slot holds an owned pattern or none
  const pb = p.playbook;
  pb.owned = [...new Set([...DEFAULT_PLAYBOOK, ...pb.owned.filter((id) => PATTERNS[id])])];
  pb.slots = [0, 1, 2, 3].map((i) => (pb.owned.includes(pb.slots[i]) ? pb.slots[i] : pb.slots[i] === null ? null : DEFAULT_PLAYBOOK[i]));
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
