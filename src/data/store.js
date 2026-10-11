// Shop catalogue: what credits (CR) buy. Every item comes from the same loot
// generator as battle drops (systems/loot.js), so shop parts are ordinary
// item instances with rolled stats, traits and sets. Odds are shown in the
// shop and computed from the same rarity weights (systems/store.js).
//
// Offer fields:
//   kind     : 'pack' (several items), 'capsule' (one sealed item), 'bundle'
//              (one item per listed slot from a themed pool), 'crate' (materials)
//   count    : items in a pack
//   tier     : loot tier 0-4 (rarity odds and how advanced the parts can be)
//   luck     : extra rarity luck
//   guarantee: { minRarity } for the first item of a pack or bundle
//   minRarity: every item at least this rare (capsules)
//   pool     : 'classic' = classic-series parts and launchers only
//   slots    : restrict a pack to these slots
//   items    : bundle contents [{ slot, pool: [baseIds] }]
//   materials: crate contents

const ATTACK = {
  ring: ['ring_galefang', 'ring_cyclonesaw', 'ring_starlance', 'ring_rifttalon', 'ring_solarflare', 'ring_quadspike', 'ring_twinwing'],
  tip: ['tip_flatstrike', 'tip_rubberflat', 'tip_griphold', 'tip_orbit', 'tip_clutchhit'],
  disc: ['disc_ten', 'disc_wide', 'disc_counter', 'disc_starlobe', 'disc_magna'],
};
const DEFENSE = {
  ring: ['ring_bastion', 'ring_ironwall', 'ring_aegisprism', 'ring_rollerguard'],
  tip: ['tip_pivotball', 'tip_wideball', 'tip_steelball', 'tip_springjump'],
  disc: ['disc_heavyring', 'disc_titan', 'disc_hexheavy', 'disc_magna'],
};
const STAMINA = {
  ring: ['ring_tidalhalo', 'ring_phantomedge', 'ring_cometarc', 'ring_hoophalo'],
  tip: ['tip_needle', 'tip_bearing', 'tip_hybrid', 'tip_semiflat', 'tip_autoshift', 'tip_clutchfinal'],
  disc: ['disc_heavyring', 'disc_orbit', 'disc_octawide', 'disc_feather'],
};
const bundleItems = (T) => [{ slot: 'ring', pool: T.ring }, { slot: 'tip', pool: T.tip }, { slot: 'disc', pool: T.disc }];

export const STORE_TABS = [
  { id: 'main', label: 'Main Store' },
  { id: 'daily', label: 'Daily Store' },
];

export const OFFERS = [
  // packs and capsules
  { id: 'pack_starter', tab: 'packs', kind: 'pack', name: 'Starter Pack', price: 200, count: 3, tier: 0, color: '#4fc3ff', glyph: '✦',
    desc: 'Three random parts. A cheap way to fill out your collection.' },
  { id: 'pack_street', tab: 'packs', kind: 'pack', name: 'Street Pack', price: 500, count: 4, tier: 1, guarantee: { minRarity: 'rare' }, color: '#5fd27a', glyph: '✚',
    desc: 'Four parts, one of them Rare or better.' },
  { id: 'pack_pro', tab: 'packs', kind: 'pack', name: 'Pro Pack', price: 1200, count: 5, tier: 2, guarantee: { minRarity: 'epic' }, color: '#b46bff', glyph: '◆',
    desc: 'Five parts from the pro circuit, one of them Epic or better.' },
  { id: 'pack_champion', tab: 'packs', kind: 'pack', name: 'Champion Pack', price: 2800, count: 5, tier: 3, luck: 0.2, guarantee: { minRarity: 'legendary' }, color: '#ffa53c', glyph: '★',
    desc: 'Five top-tier parts, one of them Legendary or better.' },
  { id: 'pack_classic', tab: 'packs', kind: 'pack', name: 'Classic Pack', price: 650, count: 3, tier: 1, pool: 'classic', guarantee: { minRarity: 'rare' }, color: '#ffd21f', glyph: '❂',
    desc: 'Three parts or launchers from the classic series, one of them Rare or better.' },
  { id: 'pack_launch', tab: 'packs', kind: 'pack', name: 'Launch Gear Pack', price: 450, count: 2, tier: 1, slots: ['launcher', 'cable'], guarantee: { minRarity: 'rare' }, color: '#9fe8ff', glyph: '➤',
    desc: 'Two launchers or cords, one of them Rare or better.' },
  { id: 'cap_mystery', tab: 'packs', kind: 'capsule', name: 'Mystery Capsule', price: 260, count: 1, tier: 1, luck: 0.35, color: '#ff4f7b', glyph: '?',
    desc: 'One sealed item. Usually common, now and then something special.' },
  { id: 'cap_gold', tab: 'packs', kind: 'capsule', name: 'Gold Capsule', price: 1400, count: 1, tier: 3, luck: 0.4, minRarity: 'epic', color: '#ffe14d', glyph: '◉',
    desc: 'One sealed item, Epic or better, with a real chance of Mythic or Relic.' },
  // themed bundles and crates
  { id: 'bundle_attack', tab: 'bundles', kind: 'bundle', name: 'Attack Bundle', price: 950, tier: 1, items: bundleItems(ATTACK), guarantee: { minRarity: 'rare' }, color: '#ff5a5a', glyph: '⚔',
    desc: 'An attack ring (Rare or better), an aggressive tip and a disc that hits hard.' },
  { id: 'bundle_defense', tab: 'bundles', kind: 'bundle', name: 'Defense Bundle', price: 950, tier: 1, items: bundleItems(DEFENSE), guarantee: { minRarity: 'rare' }, color: '#9aa6b8', glyph: '⛨',
    desc: 'A defence ring (Rare or better), a steady ball tip and a heavy disc.' },
  { id: 'bundle_stamina', tab: 'bundles', kind: 'bundle', name: 'Stamina Bundle', price: 950, tier: 1, items: bundleItems(STAMINA), guarantee: { minRarity: 'rare' }, color: '#5fe0d0', glyph: '∞',
    desc: 'A stamina ring (Rare or better), a long-spinning tip and a rim-heavy disc.' },
  { id: 'crate_materials', tab: 'bundles', kind: 'crate', name: 'Materials Crate', price: 350, materials: { scrap: 20, polymer: 8, alloy: 3, coreShard: 1 }, color: '#c7a76a', glyph: '▣',
    desc: 'Workshop materials for repairs, upgrades and crafting.' },
];

export const OFFER_INDEX = Object.fromEntries(OFFERS.map((o) => [o.id, o]));

// Daily deals: three specific items a day, shown in full before you buy.
export const DAILY = { count: 3, tier: 2, luck: 0.3, minRarity: 'rare', discount: 0.8 };
export const DEAL_PRICE = { rare: 380, epic: 900, legendary: 2000, mythic: 4500, relic: 9000 };
export const DEAL_SLOT_MUL = { ring: 1.2, tip: 1.1, disc: 1, lock: 0.9, core: 0.9, aux: 0.8, launcher: 1, cable: 0.8 };

// Daily Store: six prototype designs a day, Rare or better, one of each.
export const DAILY_STORE = {
  lineup: ['ring', 'ring', 'tip', 'disc', 'lock', 'launcher'],
  tier: 2, luck: 0.15, minRarity: 'rare',
  price: { rare: 450, epic: 1000, legendary: 2200, mythic: 4800, relic: 9500 },
};
