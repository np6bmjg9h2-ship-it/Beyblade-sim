// Rift charms: run-only passive bonuses, found in spoils, vaults, shops and
// shrines and lost when the run ends. Four rarities: Common, Rare, Legendary
// and Cursed (a big upside with a real drawback). Common and rare charms can
// be Enhanced at the forge, which multiplies their upside by 1.6. Every charm
// belongs to a family; holding three of one family adds its resonance bonus.
//
// fx(k) returns any of:
//   mods        [{ cond?, deltas }]   modifier channels (cond: always if missing)
//   skill       { key: value }        technique/ability modifiers (abilities.js keys)
//   launch      { key: value }        launch modifiers (launch.js keys)
//   status      { scorch|static|rust: chance per hit }
//   statusPower { status: extra strength fraction }, statusTime { status: extra s }
//   sweet       sweet-spot chance; sweetMul (lock stress on a sweet spot); sweetSpirit
//   econ        { shards, trader, forge, spoils, healBoss, healElite, maxHearts, oppSkill }

const D2R = Math.PI / 180;
const pct = (x) => `${Math.round(x * 100)}%`;
const n1 = (x) => (Math.round(x * 10) / 10).toString();

export const ENHANCE_K = 1.6;

export const CHARM_RARITIES = {
  common: { name: 'Common', color: '#b9c1cc', weight: 64, rank: 0 },
  rare: { name: 'Rare', color: '#4aa8ff', weight: 30, rank: 1 },
  legendary: { name: 'Legendary', color: '#ffa53c', weight: 6, rank: 2 },
  cursed: { name: 'Cursed', color: '#e0466b', weight: 3, rank: 1 },
};

export const FAMILIES = {
  ember: { name: 'Ember', color: '#ff6a3d', bonus: { desc: 'Scorch lasts 2 s longer and burns 15% harder.', statusTime: { scorch: 2 }, statusPower: { scorch: 0.15 } } },
  storm: { name: 'Storm', color: '#ffe14d', bonus: { desc: 'Static knocks the target back 10% harder.', statusPower: { static: 0.1 } } },
  iron: { name: 'Iron', color: '#9aa6b8', bonus: { desc: 'Lock strength +15%.', mods: [{ deltas: [['burstThreshold', 0.15]] }] } },
  tide: { name: 'Tide', color: '#5fe0d0', bonus: { desc: 'Tip spin drag -8%, air drag -5%.', mods: [{ deltas: [['tipSpinDrag', -0.08], ['aeroDrag', -0.05]] }] } },
  gale: { name: 'Gale', color: '#7fd8ff', bonus: { desc: 'Steering efficiency +15%, dash cooldown -15%.', mods: [{ deltas: [['steerEfficiency', 0.15]] }], skill: { dashCooldown: 0.15 } } },
  void: { name: 'Void', color: '#a68cff', bonus: { desc: 'Sweet-spot chance +8%.', sweet: 0.08 } },
};
export const RESONANCE_COUNT = 3;

const always = (deltas) => ({ deltas });
const when = (cond, deltas) => ({ cond, deltas });

const C = [];
const charm = (o) => C.push(o);

// ---------------------------------------------------------------- common
charm({ id: 'kindling', name: 'Kindling', rarity: 'common', family: 'ember', desc: (k) => `Your hits Scorch ${pct(0.12 * k)} of the time.`, fx: (k) => ({ status: { scorch: 0.12 * k } }) });
charm({ id: 'sparkplug', name: 'Spark Plug', rarity: 'common', family: 'storm', desc: (k) => `Your hits put Static on the target ${pct(0.12 * k)} of the time.`, fx: (k) => ({ status: { static: 0.12 * k } }) });
charm({ id: 'rustdust', name: 'Rust Dust', rarity: 'common', family: 'iron', desc: (k) => `Your hits Rust the target's lock ${pct(0.12 * k)} of the time.`, fx: (k) => ({ status: { rust: 0.12 * k } }) });
charm({ id: 'lockwax', name: 'Lock Wax', rarity: 'common', family: 'iron', desc: (k) => `Lock strength +${pct(0.1 * k)}.`, fx: (k) => ({ mods: [always([['burstThreshold', 0.1 * k]])] }) });
charm({ id: 'smoothbearing', name: 'Smooth Bearing', rarity: 'common', family: 'tide', desc: (k) => `Tip spin drag -${pct(0.06 * k)}.`, fx: (k) => ({ mods: [always([['tipSpinDrag', -0.06 * k]])] }) });
charm({ id: 'lightshell', name: 'Light Shell', rarity: 'common', family: 'tide', desc: (k) => `Air drag -${pct(0.08 * k)}.`, fx: (k) => ({ mods: [always([['aeroDrag', -0.08 * k]])] }) });
charm({ id: 'quicklaces', name: 'Quick Laces', rarity: 'common', family: 'gale', desc: (k) => `Dash cooldown -${pct(0.15 * k)}.`, fx: (k) => ({ skill: { dashCooldown: 0.15 * k } }) });
charm({ id: 'steadyhand', name: 'Steady Hand', rarity: 'common', family: 'gale', desc: (k) => `Launch angle error -${pct(0.15 * k)}.`, fx: (k) => ({ skill: { launchConsistency: 0.15 * k } }) });
charm({ id: 'luckycoin', name: 'Lucky Coin', rarity: 'common', family: 'void', desc: (k) => `Sweet-spot chance +${pct(0.05 * k)}.`, fx: (k) => ({ sweet: 0.05 * k }) });
charm({ id: 'coinpurse', name: 'Coin Purse', rarity: 'common', family: 'void', desc: (k) => `+${pct(0.2 * k)} shards from battles.`, fx: (k) => ({ econ: { shards: 0.2 * k } }) });
charm({ id: 'chargedcore', name: 'Charged Core', rarity: 'common', family: 'storm', desc: (k) => `Spirit gain +${pct(0.12 * k)}.`, fx: (k) => ({ skill: { spiritGain: 0.12 * k } }) });
charm({ id: 'hotedge', name: 'Hot Edge', rarity: 'common', family: 'ember', desc: (k) => `Blade face +${n1(1 * k)}° while the opponent closes in.`, fx: (k) => ({ mods: [when({ type: 'opponentApproaching' }, [['faceAngle', 1 * k * D2R]])] }) });

// ---------------------------------------------------------------- rare
charm({ id: 'firebrand', name: 'Firebrand', rarity: 'rare', family: 'ember', desc: (k) => `Your hits Scorch ${pct(0.18 * k)} of the time; your Scorch lasts ${n1(1 * k)} s longer.`, fx: (k) => ({ status: { scorch: 0.18 * k }, statusTime: { scorch: 1 * k } }) });
charm({ id: 'thundercap', name: 'Thunder Cap', rarity: 'rare', family: 'storm', desc: (k) => `Your hits put Static on the target ${pct(0.18 * k)} of the time; your Static hits ${pct(0.1 * k)} harder.`, fx: (k) => ({ status: { static: 0.18 * k }, statusPower: { static: 0.1 * k } }) });
charm({ id: 'acidvial', name: 'Acid Vial', rarity: 'rare', family: 'iron', desc: (k) => `Your hits Rust the target ${pct(0.18 * k)} of the time; your Rust bites ${pct(0.1 * k)} deeper.`, fx: (k) => ({ status: { rust: 0.18 * k }, statusPower: { rust: 0.1 * k } }) });
charm({ id: 'bulwarkplate', name: 'Bulwark Plate', rarity: 'rare', family: 'iron', desc: (k) => `Knockback taken -${pct(0.12 * k)}, lock strength +${pct(0.08 * k)}.`, fx: (k) => ({ mods: [always([['restitutionWhenHit', -0.12 * k], ['burstThreshold', 0.08 * k]])] }) });
charm({ id: 'deepbreath', name: 'Deep Breath', rarity: 'rare', family: 'tide', desc: (k) => `Below 35% spin: tip spin drag -${pct(0.15 * k)}, wobble damping +${n1(3 * k)}/s.`, fx: (k) => ({ mods: [when({ type: 'spinBelow', value: 0.35 }, [['tipSpinDrag', -0.15 * k], ['nutationDamping', 3 * k]])] }) });
charm({ id: 'springwater', name: 'Spring Water', rarity: 'rare', family: 'tide', desc: (k) => (k > 1 ? 'Recover a heart after every boss and every elite.' : 'Recover a heart after every boss.'), fx: (k) => ({ econ: { healBoss: 1, healElite: k > 1 ? 1 : 0 } }) });
charm({ id: 'slipstream', name: 'Slipstream', rarity: 'rare', family: 'gale', desc: (k) => `Steering +${pct(0.12 * k)}, steering efficiency +${pct(0.1 * k)}.`, fx: (k) => ({ mods: [always([['steerForce', 0.12 * k], ['steerEfficiency', 0.1 * k]])] }) });
charm({ id: 'tailwind', name: 'Tailwind', rarity: 'rare', family: 'gale', desc: (k) => `While moving fast: tip spin drag -${pct(0.1 * k)}.`, fx: (k) => ({ mods: [when({ type: 'fastMoving' }, [['tipSpinDrag', -0.1 * k]])] }) });
charm({ id: 'fourleaf', name: 'Four-Leaf', rarity: 'rare', family: 'void', desc: (k) => `Sweet-spot chance +${pct(0.08 * k)}; every sweet spot gives ${Math.round(10 * k)} spirit.`, fx: (k) => ({ sweet: 0.08 * k, sweetSpirit: 10 * k }) });
charm({ id: 'hagglersmark', name: 'Haggler\'s Mark', rarity: 'rare', family: 'void', desc: (k) => `Trader prices -${pct(0.2 * k)}.`, fx: (k) => ({ econ: { trader: -0.2 * k } }) });
charm({ id: 'overclock', name: 'Overclock', rarity: 'rare', family: 'storm', desc: (k) => `Ability charge +${pct(0.2 * k)}.`, fx: (k) => ({ mods: [always([['abilityCharge', 0.2 * k]])] }) });
charm({ id: 'berserkerband', name: 'Berserker Band', rarity: 'rare', family: 'ember', desc: (k) => `Blade face +${n1(2.5 * k)}°, but air drag +8%.`, fx: (k) => ({ mods: [always([['faceAngle', 2.5 * k * D2R], ['aeroDrag', 0.08]])] }) });

// ---------------------------------------------------------------- legendary
charm({ id: 'phoenixcinder', name: 'Phoenix Cinder', rarity: 'legendary', family: 'ember', desc: () => 'Your hits Scorch 25% of the time, and your Scorch burns 50% harder.', fx: () => ({ status: { scorch: 0.25 }, statusPower: { scorch: 0.5 } }) });
charm({ id: 'stormheart', name: 'Stormheart', rarity: 'legendary', family: 'storm', desc: () => 'Your hits put Static on the target 25% of the time, and your Static hits 25% harder.', fx: () => ({ status: { static: 0.25 }, statusPower: { static: 0.25 } }) });
charm({ id: 'titanrivet', name: 'Titan Rivet', rarity: 'legendary', family: 'iron', desc: () => 'Lock strength +25%, wobble damping +3/s.', fx: () => ({ mods: [always([['burstThreshold', 0.25], ['nutationDamping', 3]])] }) });
charm({ id: 'tidecaller', name: 'Tidecaller', rarity: 'legendary', family: 'tide', desc: () => 'Tip spin drag -15%, air drag -10%.', fx: () => ({ mods: [always([['tipSpinDrag', -0.15], ['aeroDrag', -0.1]])] }) });
charm({ id: 'comettail', name: 'Comet Tail', rarity: 'legendary', family: 'gale', desc: () => 'Dash cooldown -35%, dash speed +20%.', fx: () => ({ skill: { dashCooldown: 0.35, dashPower: 0.2 } }) });
charm({ id: 'gamblersdie', name: 'Gambler\'s Die', rarity: 'legendary', family: 'void', desc: () => 'Sweet-spot chance +15%, and sweet spots deal triple lock stress instead of double.', fx: () => ({ sweet: 0.15, sweetMul: 3 }) });
charm({ id: 'spiritengine', name: 'Spirit Engine', rarity: 'legendary', family: 'storm', desc: () => 'Spirit gain +25%, ability power +10%.', fx: () => ({ skill: { spiritGain: 0.25, abilityPower: 0.1 } }) });
charm({ id: 'crownofspoils', name: 'Crown of Spoils', rarity: 'legendary', family: 'void', desc: () => 'Spoils offer one extra choice, and battles pay 30% more shards.', fx: () => ({ econ: { spoils: 1, shards: 0.3 } }) });

// ---------------------------------------------------------------- cursed
charm({ id: 'glassfang', name: 'Glass Fang', rarity: 'cursed', family: 'ember', desc: () => 'Blade face +4° and restitution +10%. Curse: lock strength -30%.', fx: () => ({ mods: [always([['faceAngle', 4 * D2R], ['restitution', 0.1], ['burstThreshold', -0.3]])] }) });
charm({ id: 'leechcoil', name: 'Leech Coil', rarity: 'cursed', family: 'tide', desc: () => 'Tip spin drag -25%. Curse: launch energy -8%.', fx: () => ({ mods: [always([['tipSpinDrag', -0.25]])], skill: { launchPower: -0.08 } }) });
charm({ id: 'greedidol', name: 'Greed Idol', rarity: 'cursed', family: 'void', desc: () => 'Battles pay double shards. Curse: one max heart fewer.', fx: () => ({ econ: { shards: 1, maxHearts: -1 } }) });
charm({ id: 'stormshackles', name: 'Storm Shackles', rarity: 'cursed', family: 'storm', desc: () => 'Your hits put Static on the target 40% of the time. Curse: your steering -15%.', fx: () => ({ status: { static: 0.4 }, mods: [always([['steerForce', -0.15]])] }) });
charm({ id: 'rustcrown', name: 'Rust Crown', rarity: 'cursed', family: 'iron', desc: () => 'Your hits Rust the target 40% of the time. Curse: your own lock strength -15%.', fx: () => ({ status: { rust: 0.4 }, mods: [always([['burstThreshold', -0.15]])] }) });
charm({ id: 'bloodmoon', name: 'Blood Moon', rarity: 'cursed', family: 'void', desc: () => 'Sweet-spot chance +20%. Curse: opponents are sharper (+8% skill).', fx: () => ({ sweet: 0.2, econ: { oppSkill: 0.08 } }) });

export const CHARMS = C;
export const CHARM_INDEX = Object.fromEntries(C.map((c) => [c.id, c]));

export const canEnhance = (c) => c.rarity === 'common' || c.rarity === 'rare';
export const charmK = (held) => (held.enhanced ? ENHANCE_K : 1);
export const charmDesc = (held) => CHARM_INDEX[held.id]?.desc(charmK(held)) || '';
