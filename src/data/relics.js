// Handcrafted relics. One of each per save, earned along a path the Journal
// shows from the start. A relic is a fixed item: its base part with perfect
// tolerances, fixed traits, and a signature trait that exists only on that
// relic (data/traits.js, "relic signatures"). Instances store only the relic
// id; everything else comes from here.
//
// earn.progress(profile) -> [have, need]; the relic is earned at have >= need.

import { CHARACTERS } from './characters.js';
import { TRAIT_INDEX } from './traits.js';

const done = (ok) => [ok ? 1 : 0, 1];
const chapter = (id) => (p) => done((p.story?.completed || []).includes(id));
const RIVAL_IDS = CHARACTERS.filter((c) => c.builds?.length).map((c) => c.id);
const MASTERWORK_XP = 5000;

export const RELICS = [
  {
    id: 'emberCrown', name: 'Ember Crown', slot: 'ring', base: 'ring_galefang', color: '#ff6a2a', accent: '#ffd23f',
    signature: 'kindling', traits: [['honedEdge', 0.9]],
    lore: 'Forged for the first final ever held in the crater. Its fangs never quite cool down.',
    earn: { text: 'Finish Story Chapter 3, "Crater Heat".', progress: chapter('ch3') },
  },
  {
    id: 'skywakeSpindle', name: 'Skywake Spindle', slot: 'tip', base: 'tip_flatstrike', color: '#7fd4ff', accent: '#ffffff',
    signature: 'tailwind', traits: [['gripCompound', 0.85]],
    lore: 'Machined from a broken anemometer on the Skyfall rooftops. It loves to be pushed.',
    earn: { text: 'Finish Story Chapter 4, "Skyfall".', progress: chapter('ch4') },
  },
  {
    id: 'nullLattice', name: 'Null Lattice', slot: 'lock', base: 'lock_click3', color: '#9c7bff', accent: '#2ee9ff',
    signature: 'nullField', traits: [['tightTeeth', 0.9]],
    lore: 'A lock cut to a pattern nobody could read. Strike it hard enough and it answers.',
    earn: { text: 'Finish Story Chapter 5, "Null Signal".', progress: chapter('ch5') },
  },
  {
    id: 'zeroPointCore', name: 'Zero Point Core', slot: 'core', base: 'core_helix', color: '#f6f8ff', accent: '#ff3366',
    signature: 'zeroPoint', traits: [['efficientDrive', 0.9]],
    lore: 'The core at the heart of Arena Zero itself. It keeps something back for the very end.',
    earn: { text: 'Finish Story Chapter 6, "Arena Zero".', progress: chapter('ch6') },
  },
  {
    id: 'championsOrbit', name: "Champion's Orbit", slot: 'disc', base: 'disc_heavyring', color: '#ffd23f', accent: '#b46bff',
    signature: 'gravityWell', traits: [['rimWeighted', 0.9]],
    lore: 'Awarded with the Arena Zero Championship. Everything near the centre seems to fall towards it.',
    earn: { text: 'Win the Arena Zero Championship.', progress: (p) => done((p.tournaments?.records?.zero_championship?.wins || 0) > 0) },
  },
  {
    id: 'riftbornFang', name: 'Riftborn Fang', slot: 'ring', base: 'ring_rifttalon', color: '#3df5e1', accent: '#ff3366',
    signature: 'riftHunger', traits: [['deepHooks', 0.5]],
    lore: 'Pulled out of a Rift that had no bottom. It smells the edge of a stadium.',
    earn: { text: 'Clear a Rift Run on Depth 3 or deeper.', progress: (p) => [Math.max(0, Math.min(3, p.rift?.bestDepth ?? -1)), 3] },
  },
  {
    id: 'masterworkPivot', name: 'Masterwork Pivot', slot: 'tip', base: 'tip_needle', color: '#d9c38a', accent: '#4ef08f',
    signature: 'craftsmansPoise', traits: [['lowFrictionCoat', 0.7]],
    lore: 'Only given to spinners who have truly learned one part. Its point never wavers.',
    earn: { text: 'Reach Masterwork mastery on any part.', progress: (p) => [Math.min(MASTERWORK_XP, Math.max(0, ...Object.values(p.inventory || {}).map((i) => i.xp || 0))), MASTERWORK_XP] },
  },
  {
    id: 'archivistsLens', name: "Archivist's Lens", slot: 'core', base: 'core_lunar', color: '#8fb4ff', accent: '#ffd23f',
    signature: 'recall', traits: [['chargeConduit', 0.9]],
    lore: 'Kept by whoever writes the most pages of the Journal. It remembers every spirit it has met.',
    earn: { text: 'Discover 60 traits.', progress: (p) => [Math.min(60, Object.keys(p.discovery?.traits || {}).filter((id) => TRAIT_INDEX[id] && !TRAIT_INDEX[id].relic).length), 60] },
  },
  {
    id: 'bondkeepersSeal', name: "Bondkeeper's Seal", slot: 'disc', base: 'disc_ten', color: '#4ef08f', accent: '#ffffff',
    signature: 'kindredBond', traits: [['shockBrace', 0.85]],
    lore: 'Pressed the day the spirit in a Spirit Chip first woke beside its spinner.',
    earn: { text: 'Awaken a Spirit Chip.', progress: (p) => done(Object.values(p.beasts || {}).some((b) => b?.awakened)) },
  },
  {
    id: 'laurelLauncher', name: 'Laurel Launcher', slot: 'launcher', base: 'launcher_precision', color: '#ffe14d', accent: '#4ef08f',
    signature: 'laurel', traits: [['rapidReset', 0.9]],
    lore: 'The League gives one to every Division 1 champion. It has never fired a bad launch.',
    earn: { text: 'Win a League season in Division 1.', progress: (p) => done((p.league?.history || []).some((h) => h.division === 1 && h.place === 1)) },
  },
  {
    id: 'rivalbreakerCord', name: 'Rivalbreaker Cord', slot: 'cable', base: 'cable_silk', color: '#ff5468', accent: '#2ee9ff',
    signature: 'rivalbreak', traits: [['balancedTension', 0.9]],
    lore: 'Braided from a thread of every rival you have beaten.',
    earn: { text: `Beat each of the ${RIVAL_IDS.length} rivals at least once.`, progress: (p) => [RIVAL_IDS.filter((id) => (p.rivals?.[id]?.playerWins || 0) > 0).length, RIVAL_IDS.length] },
  },
  {
    id: 'survivorsWard', name: "Survivor's Ward", slot: 'aux', base: 'aux_damper', color: '#9aa6b8', accent: '#ffb53d',
    signature: 'lastWard', traits: [['shockAbsorber', 0.9]],
    lore: 'Worn by the few who keep winning long after everyone else has gone home.',
    earn: { text: 'Win 12 battles in one Survival run.', progress: (p) => [Math.min(12, p.survival?.best || 0), 12] },
  },
];

export const RELIC_INDEX = Object.fromEntries(RELICS.map((r) => [r.id, r]));
export const RELIC_SIGNATURES = new Set(RELICS.map((r) => r.signature));

// Recasting an earned relic you no longer have (lost, quarantined).
export const RECAST_COST = { credits: 1500, relicFragment: 6 };
