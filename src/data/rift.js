// Rift Run: the roguelite mode. A run climbs four Rifts (acts). Each act is
// three floors of node choices and a rival boss. Everything found in a run
// (parts, charms, boons, shards, hearts) belongs to that run; Essence, Rift
// Talents and the parts you put in the Locker carry over. Every bonus is a
// physical modifier channel, a launch or technique modifier, or an economy
// rule, so the simulation stays the same physics as everywhere else.

const D2R = Math.PI / 180;

export const RIFT_ACTS = [
  { n: 1, id: 'harbor', name: 'Harbor Rift', tier: 1, color: '#9fd7ff', arenas: ['standard', 'vortex'], bosses: ['sora', 'juno', 'rook'], archetypes: ['striker', 'wall', 'drifter', 'all'] },
  { n: 2, id: 'foundry', name: 'Foundry Rift', tier: 2, color: '#7fe3a8', arenas: ['vortex', 'edgebreaker', 'standard'], bosses: ['daichi', 'rook', 'mirelle'], archetypes: ['striker', 'wall', 'all', 'breaker', 'upper', 'clutch'] },
  { n: 3, id: 'crater', name: 'Crater Rift', tier: 3, color: '#ffd84d', arenas: ['magma', 'crystal', 'edgebreaker'], bosses: ['kaela', 'theo', 'mirelle'], archetypes: ['breaker', 'upper', 'counter', 'all', 'wall', 'magna'] },
  { n: 4, id: 'zero', name: 'Zero Rift', tier: 4, color: '#ff6ad5', arenas: ['skyfall', 'crystal', 'zero'], bosses: ['nyx', 'valen', 'aurelia'], archetypes: ['champion', 'counter', 'upper', 'breaker'] },
];

export const FLOORS_PER_ACT = 3;

// AI skill of ordinary opponents per act (elites +0.1, bosses +0.12).
export const ACT_DIFFICULTY = [0.6, 0.78, 0.92, 1.05];

export const NODE_TYPES = {
  battle: { name: 'Battle', color: '#4aa8ff', desc: 'A single-round battle. Win to open the spoils and pick one of the rewards.' },
  elite: { name: 'Elite Battle', color: '#ff6a3d', desc: 'A tougher opponent with an elite trait. Win for a charm of your choice and a boon.' },
  vault: { name: 'Vault', color: '#c6b8ff', desc: 'A challenge battle with a special rule. Meet it for a choice of rare charms.' },
  trader: { name: 'Trader', color: '#ffd84d', desc: 'Spend shards on parts, charms and hearts.' },
  forge: { name: 'Forge', color: '#ffa53c', desc: 'Upgrade parts, reroll or engrave traits, infuse an element, enhance a charm.' },
  shrine: { name: 'Shrine', color: '#e0466b', desc: 'Strange bargains: trade hearts, shards or charms for power.' },
  camp: { name: 'Camp', color: '#7fe3a8', desc: 'Rest to recover a heart, or tune a part for free.' },
  event: { name: 'Unknown', color: '#aab6d9', desc: 'Something is waiting here. It could be anything.' },
  boss: { name: 'Rift Boss', color: '#ff3366', desc: 'A rival guards the way out. Best of three.' },
};

// Node weights per floor; a floor offers two or three different nodes.
export const FLOOR_WEIGHTS = [
  { battle: 6, elite: 1, event: 2, vault: 2 },
  { battle: 3, elite: 3, trader: 3, event: 2, shrine: 1, vault: 2 },
  { battle: 3, elite: 2, forge: 3, camp: 3, shrine: 1, event: 1 },
];
// Every act guarantees these on its floors (index = floor).
export const FLOOR_GUARANTEE = ['battle', 'trader', ['forge', 'camp']];

export const RIFT_DEPTHS = [
  { n: 0, rule: 'The Rift as it is.' },
  { n: 1, rule: 'Elite battles turn up more often.' },
  { n: 2, rule: 'Opponents launch and steer more precisely.' },
  { n: 3, rule: 'Trader and forge prices +25%.' },
  { n: 4, rule: 'Bosses carry an elite trait.' },
  { n: 5, rule: 'You start with one heart fewer.' },
  { n: 6, rule: 'Cursed charms turn up more often.' },
  { n: 7, rule: 'Ordinary opponents can carry elite traits.' },
  { n: 8, rule: 'Opponents are sharper still, and boons offer one choice fewer.' },
];
export const MAX_DEPTH = RIFT_DEPTHS.length - 1;

// All rules in force at a depth (each depth keeps the ones below it).
export function depthRules(d = 0) {
  return {
    eliteMul: d >= 1 ? 2 : 1,
    oppSkill: (d >= 2 ? 0.06 : 0) + (d >= 8 ? 0.08 : 0),
    priceMul: d >= 3 ? 1.25 : 1,
    bossAffix: d >= 4,
    heartsDelta: d >= 5 ? -1 : 0,
    cursedMul: d >= 6 ? 2.5 : 1,
    normalAffix: d >= 7 ? 0.35 : 0,
    boonChoices: d >= 8 ? -1 : 0,
    rewardMul: 1 + 0.2 * d,
    luck: 0.12 * d,
  };
}

// ---------------------------------------------------------------- statuses
// Hits can inflict a status on the struck top: a short timed set of modifier
// channels. Two different statuses on one top fuse into a stronger effect.
export const STATUSES = {
  scorch: { name: 'Scorch', color: '#ff6a3d', duration: 4, deltas: [['tipSpinDrag', 0.3], ['aeroDrag', 0.15]], desc: 'Burns spin away: tip drag +30% and air drag +15% for 4 s.' },
  static: { name: 'Static', color: '#ffe14d', duration: 3, deltas: [['steerForce', -0.35], ['restitutionWhenHit', 0.15]], desc: 'Scrambles control: steering -35%, knocked back 15% harder for 3 s.' },
  rust: { name: 'Rust', color: '#7fe3a8', duration: 5, deltas: [['burstThreshold', -0.25], ['nutationDamping', -1]], desc: 'Corrodes the lock: lock strength -25%, wobble damping -1/s for 5 s.' },
};
export const STATUS_IDS = Object.keys(STATUSES);

export const FUSIONS = {
  'rust+scorch': { id: 'meltdown', name: 'Meltdown', color: '#ff8a3d', desc: 'The lock melts: the next hit on the target deals triple lock stress.' },
  'scorch+static': { id: 'flashover', name: 'Flashover', color: '#fff27a', desc: 'A burst of force throws the target away from the attacker.' },
  'rust+static': { id: 'brittle', name: 'Brittle', color: '#9affd8', desc: 'Stacks up to 3: lock strength -15% and tip drag +10% per stack for 6 s.' },
};
export const fusionKey = (a, b) => [a, b].sort().join('+');

// Sweet spot: a chance that a hit lands perfectly (double lock stress, more knockback).
export const SWEET_SPOT = { stressMul: 2, deltas: [['restitution', 0.12]] };

// Spirit Chip elements map onto the three statuses (for element boons).
export const ELEMENT_STATUS = {
  storm: 'static', thunder: 'static', phantom: 'static',
  solar: 'scorch', magma: 'scorch', celestial: 'scorch',
  iron: 'rust', abyss: 'rust', crystal: 'rust', void: 'rust', zero: 'scorch',
};

// ---------------------------------------------------------------- elites
export const ELITE_AFFIXES = [
  { id: 'spiked', name: 'Spiked', desc: 'Restitution +15%: its hits bounce you harder.', mods: [['restitution', 0.15]] },
  { id: 'bulwark', name: 'Bulwark', desc: 'Lock strength +35%.', mods: [['burstThreshold', 0.35]] },
  { id: 'swift', name: 'Swift', desc: 'Steering +30%, steering efficiency +20%.', mods: [['steerForce', 0.3], ['steerEfficiency', 0.2]] },
  { id: 'anchored', name: 'Anchored', desc: 'Tip grip +30%, absorbs 15% of knockback.', mods: [['tipFriction', 0.3], ['restitutionWhenHit', -0.15]] },
  { id: 'enduring', name: 'Enduring', desc: 'Tip spin drag -20%.', mods: [['tipSpinDrag', -0.2]] },
  { id: 'honed', name: 'Honed', desc: 'Blade face +3° when closing in.', mods: [['faceAngle', 3 * D2R]], cond: { type: 'opponentApproaching' } },
  { id: 'blazing', name: 'Blazing', desc: 'Its hits Scorch you (40%).', status: { scorch: 0.4 } },
  { id: 'charged', name: 'Charged', desc: 'Its hits put Static on you (40%).', status: { static: 0.4 } },
  { id: 'corroding', name: 'Corroding', desc: 'Its hits Rust your lock (40%).', status: { rust: 0.4 } },
];
export const AFFIX_INDEX = Object.fromEntries(ELITE_AFFIXES.map((a) => [a.id, a]));

// ---------------------------------------------------------------- vaults
// Challenge battles. `need` is the finish that counts as meeting the rule.
export const VAULT_RULES = [
  { id: 'ringout', name: 'Ring-Out Trial', desc: 'Win by Ring Out to claim the vault.', need: 'out' },
  { id: 'shatter', name: 'Shatter Trial', desc: 'The guardian\'s lock is weakened. Win by Shatter to claim the vault.', need: 'burst', oppMods: [['burstThreshold', -0.3]] },
  { id: 'stillspirit', name: 'Still Spirit', desc: 'No Spirit Chip abilities for either side. Win to claim the vault.', rules: { abilities: false } },
  { id: 'giant', name: 'The Giant', desc: 'The guardian is Bulwark and Anchored. Win to claim the vault.', affixes: ['bulwark', 'anchored'] },
];
export const VAULT_INDEX = Object.fromEntries(VAULT_RULES.map((v) => [v.id, v]));

// ---------------------------------------------------------------- events
export const RIFT_EVENTS = [
  { id: 'curiosity', name: 'Curiosity Box', desc: 'A humming box. Pay 50 shards to open it: one to three random charms, and a small chance one of them is cursed.' },
  { id: 'cache', name: 'Hidden Cache', desc: 'A battler\'s abandoned case. Take one of the parts inside.' },
  { id: 'smith', name: 'Wandering Smith', desc: 'A travelling smith offers one free forge job.' },
  { id: 'wheel', name: 'Spin the Wheel', desc: 'Pay 30 shards to spin: shards, a charm, or a curse.' },
  { id: 'spring', name: 'Healing Spring', desc: 'Clear water. Recover a heart (or gain 40 shards if you are full).' },
];
export const EVENT_INDEX = Object.fromEntries(RIFT_EVENTS.map((e) => [e.id, e]));

// ---------------------------------------------------------------- economy
export const HEARTS_BASE = 3;
export const BAG_SIZE = 6;
export const FORGE_MAX_LEVEL = 5;
export const FORGE_USES = 2;

export const SHARD_REWARD = { battle: 30, elite: 45, vault: 40, boss: 75, perAct: 10, out: 8, burst: 12, skip: 18 };
export const START_SHARDS = 20;
export const ESSENCE_REWARD = { battle: 6, elite: 12, vault: 10, boss: 25, clear: 40 };

export const PART_PRICE = { common: 35, uncommon: 50, rare: 80, epic: 125, legendary: 190, mythic: 270, relic: 360 };
export const CHARM_PRICE = { common: 50, rare: 95, legendary: 200, cursed: 35 };
export const HEART_PRICE = 70;
export const RESTOCK_PRICE = 25;

export const FORGE_PRICE = {
  upgrade: (lv) => 30 * (lv + 1),
  reroll: 45,
  engrave: 120,
  infuse: 80,
  enhance: 150,
};

// Forge levels: +1..+5 add a modest bonus on the part's own job, as an
// always-on modifier channel (so it shows in the same telemetry as traits).
export const FORGE_BONUS = {
  ring: { desc: (n) => `Blade face +${(0.5 * n).toFixed(1)}°, restitution +${(1.5 * n).toFixed(1)}%`, deltas: (n) => [['faceAngle', 0.5 * n * D2R], ['restitution', 0.015 * n]] },
  core: { desc: (n) => `Ability charge +${5 * n}%, steering efficiency +${3 * n}%`, deltas: (n) => [['abilityCharge', 0.05 * n], ['steerEfficiency', 0.03 * n]] },
  disc: { desc: (n) => `Wobble damping +${(0.8 * n).toFixed(1)}/s, knockback taken -${2 * n}%`, deltas: (n) => [['nutationDamping', 0.8 * n], ['restitutionWhenHit', -0.02 * n]] },
  lock: { desc: (n) => `Lock strength +${4 * n}%`, deltas: (n) => [['burstThreshold', 0.04 * n]] },
  tip: { desc: (n) => `Tip spin drag -${4 * n}%`, deltas: (n) => [['tipSpinDrag', -0.04 * n]] },
  aux: { desc: (n) => `Wall friction -${4 * n}%, wobble damping +${(0.4 * n).toFixed(1)}/s`, deltas: (n) => [['wallFriction', -0.04 * n], ['nutationDamping', 0.4 * n]] },
};

// Elements a ring can carry in the Rift (chance per hit to inflict it).
export const RING_ELEMENT_CHANCE = 0.3;

// ---------------------------------------------------------------- talents
// Bought with Essence between runs; they never expire.
export const RIFT_TALENTS = [
  { id: 'pockets', name: 'Deep Pockets', max: 3, cost: [40, 80, 140], desc: (r) => `Start every run with +${25 * r} shards.` },
  { id: 'grit', name: 'Grit', max: 2, cost: [80, 180], desc: (r) => `+${r} max heart${r > 1 ? 's' : ''}.` },
  { id: 'locker', name: 'Locker', max: 2, cost: [60, 160], desc: (r) => `Keep ${1 + r} found parts when a run ends (one without this talent).` },
  { id: 'vault', name: 'Vault Key', max: 1, cost: [70], desc: () => 'Vault challenge nodes appear on the map.' },
  { id: 'keen', name: 'Keen Eye', max: 1, cost: [150], desc: () => 'Spoils offer one extra choice.' },
  { id: 'ascendant', name: 'Ascendant', max: 1, cost: [150], desc: () => 'Boons offer one extra choice.' },
  { id: 'haggle', name: 'Haggler', max: 2, cost: [50, 110], desc: (r) => `Trader prices -${10 * r}%.` },
  { id: 'smith', name: 'Smith\'s Friend', max: 2, cost: [50, 110], desc: (r) => `Forge prices -${15 * r}%.` },
  { id: 'headstart', name: 'Head Start', max: 1, cost: [90], desc: () => 'Choose a starting charm from three.' },
  { id: 'lucky', name: 'Lucky Charm', max: 2, cost: [60, 140], desc: (r) => `Sweet-spot chance +${3 * r}%.` },
  { id: 'treasure', name: 'Treasure Sense', max: 2, cost: [80, 180], desc: (r) => `Better rarity odds for parts (luck +${r}).` },
  { id: 'secondwind', name: 'Second Wind', max: 1, cost: [200], desc: () => 'Once per run, losing your last heart brings you back with one.' },
];
export const TALENT_INDEX = Object.fromEntries(RIFT_TALENTS.map((t) => [t.id, t]));

// Rewards into the main career when a run ends (per win / per boss beaten).
export const CAREER_REWARD = { credits: [20, 80], xp: [25, 100], bond: [8, 30], scrap: [1, 0], alloy: [0, 1] };
