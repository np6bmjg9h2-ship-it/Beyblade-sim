// Item traits (the brief's "affixes"). Every trait is a declarative spec
// (see systems/effectSpec.js) compiled into the functions the game runs, and
// its description is generated from the same numbers. Effects reach real
// gameplay through:
//   ops        the part's physical numbers at assembly (mass, blade face, friction...)
//   cond+deltas  simulation modifier channels while a battle condition holds
//   launch     the launch model (power, consistency, timing window)
//   item       the item's own durability behaviour
//   react      battle triggers with cooldowns (game/itemEffects.js)
//   status     hit statuses (game/riftEffects.js)
//
// Magnitude m in [0,1] is rolled per item (rarity sets the range). Channel
// deltas are summed per channel then clamped (data/channels.js), duplicate
// traits never stack (highest magnitude wins), and traits in the same
// `group` are mutually exclusive on one item. `cost` is the trait's share of
// an item's power budget (systems/itemGen.js); curses have negative cost.

import { compileTrait } from '../systems/effectSpec.js';
import { CHANNEL_LIMITS, CONDITIONS } from './channels.js';

export { CHANNEL_LIMITS, CONDITIONS };

const S = [];
const def = (o) => S.push(o);
const ALL = ['ring', 'disc', 'core', 'lock', 'tip', 'aux', 'launcher', 'cable'];

// ================================================================ physical
def({ id: 'counterweight', name: 'Counterweight', adj: 'Weighted', family: 'defense', slots: ['ring', 'disc', 'core'], group: 'mass',
  ops: [{ f: 'mass', op: 'add', v: [1.0, 2.6] }, { f: 'massDist', op: 'add', v: -0.1, min: -0.5, when: 'defined' }],
  note: 'low ballast: more inertia and less knock from side impacts, but slower to accelerate and less launch spin' });
def({ id: 'featherweight', name: 'Featherweight', adj: 'Feather', family: 'mobility', slots: ['ring', 'disc', 'core', 'lock', 'aux'], group: 'mass',
  ops: [{ f: 'mass', op: 'mul', v: [0.95, 0.86] }],
  note: 'faster launches and nimbler steering, easier to knock away' });
def({ id: 'honedEdge', name: 'Honed Edge', adj: 'Honed', family: 'offense', slots: ['ring'], group: 'face',
  ops: [{ f: 'faceAngle', op: 'add', v: [1.5, 4], def: 0 }],
  note: 'harder smash strikes that also cost more of your own spin' });
def({ id: 'rimWeighted', name: 'Rim Weighted', adj: 'Rimmed', family: 'endurance', slots: ['ring', 'disc'],
  ops: [{ f: 'massDist', op: 'add', v: [0.1, 0.3], def: 0, max: 0.95 }],
  note: 'mass moves outward: more spin inertia and gyroscopic stability' });
def({ id: 'precisionBalanced', name: 'Precision Balanced', adj: 'Balanced', family: 'technical', slots: ['ring', 'disc', 'core'],
  ops: [{ f: 'ecc', op: 'add', v: [-0.04, -0.14], def: 0, min: 0 }],
  note: 'machined balance: less wobble and wandering' });
def({ id: 'extendedReach', name: 'Extended Reach', adj: 'Long', family: 'offense', slots: ['ring'],
  ops: [{ f: 'rOut', op: 'add', v: [0.3, 0.9], max: 27 }],
  note: 'earlier contact and more torque per hit' });
def({ id: 'deepHooks', name: 'Deep Hooks', adj: 'Hooked', family: 'offense', slots: ['ring', 'aux'],
  ops: [{ f: 'catch', op: 'add', v: [0.1, 0.3], def: 0.5, max: 1.2 }, { f: 'aero', op: 'mul', v: 1.1, def: 0.015 }],
  note: 'strikes wrench the opponent\'s lock harder' });
def({ id: 'raked', name: 'Raked Profile', adj: 'Raked', family: 'offense', slots: ['ring'], group: 'slope',
  ops: [{ f: 'slope', op: 'add', v: [3, 8], def: 0 }],
  note: 'contacts push the opponent upward, loosening its grip and lock' });
def({ id: 'polished', name: 'Polished Surface', adj: 'Polished', family: 'endurance', slots: ['ring', 'disc', 'aux'], group: 'surfacefriction',
  ops: [{ f: 'friction', op: 'mul', v: [0.9, 0.75], def: 0.3 }, { f: 'contactFriction', op: 'mul', v: [0.9, 0.75], when: 'truthy' }, { f: 'layer.friction', op: 'mul', v: [0.9, 0.75] }],
  note: 'contacts grind away less spin but convert less spin into knockback' });
def({ id: 'softEdge', name: 'Soft Edge', adj: 'Soft', family: 'defense', slots: ['ring', 'disc'], group: 'restitution',
  ops: [{ f: 'restitution', op: 'mul', v: [0.93, 0.82], def: 0.5 }, { f: 'contactRestitution', op: 'mul', v: [0.93, 0.82], when: 'truthy' }],
  note: 'absorbs impacts instead of bouncing away' });
def({ id: 'springSteel', name: 'Spring Steel', adj: 'Sprung', family: 'offense', slots: ['ring'], group: 'restitution',
  ops: [{ f: 'restitution', op: 'mul', v: [1.04, 1.12], max: 0.75 }],
  note: 'livelier rebounds for both tops' });
def({ id: 'hardenedTip', name: 'Hardened Tip', adj: 'Hardened', family: 'endurance', slots: ['tip'], group: 'tippatch',
  ops: [{ f: 'patchRadius', op: 'mul', v: [0.9, 0.74] }],
  note: 'less spin drag at the floor' });
def({ id: 'gripCompound', name: 'Grip Compound', adj: 'Gripping', family: 'mobility', slots: ['tip'], group: 'tipmu',
  ops: [{ f: 'mu', op: 'mul', v: [1.07, 1.2] }],
  note: 'stronger traction and acceleration, faster spin loss' });
def({ id: 'lowFrictionCoat', name: 'Low-Friction Coat', adj: 'Coated', family: 'endurance', slots: ['tip'], group: 'tipmu',
  ops: [{ f: 'mu', op: 'mul', v: [0.93, 0.8] }],
  note: 'glides with less drag, but grips less when pushed' });
def({ id: 'tightTeeth', name: 'Tight Teeth', adj: 'Tight', family: 'defense', slots: ['lock'], group: 'lockth',
  ops: [{ f: 'threshold', op: 'mul', v: [1.06, 1.18] }] });
def({ id: 'quickSeat', name: 'Quick Seat', adj: 'Reseating', family: 'defense', slots: ['lock'],
  ops: [{ f: 'recovery', op: 'add', v: [0.2, 0.6], def: 0 }],
  note: 'partial lock slips reseat faster' });
def({ id: 'extraNotch', name: 'Extra Notch', adj: 'Notched', family: 'defense', slots: ['lock'], rarityMin: 'epic', cost: 2,
  ops: [{ f: 'notches', op: 'add', v: 1 }, { f: 'mass', op: 'add', v: 0.5 }],
  note: 'one more notch to slip before a shatter' });
def({ id: 'lowProfile', name: 'Low Profile', adj: 'Low', family: 'defense', slots: ['tip', 'lock'],
  ops: [{ f: 'length', op: 'add', v: [-0.3, -0.9], when: 'truthy' }, { f: 'height', op: 'add', v: [-0.2, -0.6], when: 'truthy' }],
  note: 'lower centre of mass; contacts sit lower' });

// ================================================================ conditional / static
const cond = (o) => def({ cond: { type: 'always' }, ...o });

// offence
cond({ id: 'predatorsEdge', name: "Predator's Edge", adj: 'Predatory', family: 'offense', slots: ['ring'], cond: { type: 'opponentApproaching' },
  deltas: [['faceAngle', [1.5, 4]]] });
cond({ id: 'impactAmplifier', name: 'Impact Amplifier', adj: 'Amplified', family: 'offense', slots: ['ring', 'core'],
  deltas: [['restitution', [0.03, 0.09]], ['aeroDrag', 0.05]] });
cond({ id: 'glancingControl', name: 'Glancing Control', adj: 'Glancing', family: 'offense', slots: ['ring'], cond: { type: 'fastMoving' },
  deltas: [['contactFriction', [-0.1, -0.25]]], note: 'glancing hits slide off and keep your momentum' });
cond({ id: 'momentumConversion', name: 'Momentum Conversion', adj: 'Driving', family: 'offense', slots: ['ring', 'core'], cond: { type: 'spinAbove', value: 0.55 },
  deltas: [['contactFriction', [0.08, 0.2]]], note: 'converts your spin into knockback on the opponent' });
cond({ id: 'counterStrike', name: 'Counter Strike', adj: 'Countering', family: 'offense', slots: ['ring', 'disc'], group: 'whenhit',
  deltas: [['restitutionWhenHit', [0.05, 0.15]]], note: 'attackers bounce back harder' });
cond({ id: 'efficientImpact', name: 'Efficient Impact', adj: 'Efficient', family: 'offense', slots: ['ring', 'core'],
  deltas: [['contactFriction', [-0.06, -0.16]], ['restitution', 0.02]], note: 'strikes waste less of your spin' });
cond({ id: 'edgeHunter', name: 'Edge Hunter', adj: 'Hunting', family: 'offense', slots: ['ring', 'tip'], cond: { type: 'opponentNearEdge' },
  deltas: [['steerForce', [0.1, 0.25]], ['faceAngle', 1.5]] });

// defence
cond({ id: 'bulwark', name: 'Bulwark', adj: 'Steady', family: 'defense', slots: ['disc', 'ring', 'aux'],
  deltas: [['nutationDamping', [2, 5]]], note: 'recovers its axis faster after hits' });
cond({ id: 'shockAbsorber', name: 'Shock Absorber', adj: 'Cushioned', family: 'defense', slots: ['ring', 'disc', 'aux'], group: 'whenhit',
  deltas: [['restitutionWhenHit', [-0.08, -0.22]]], note: 'absorbs knockback' });
cond({ id: 'lockGuard', name: 'Lock Guard', adj: 'Guarded', family: 'defense', slots: ['lock', 'core'],
  deltas: [['burstThreshold', [0.06, 0.2]]] });
cond({ id: 'recoveryStance', name: 'Recovery Stance', adj: 'Recovering', family: 'defense', slots: ['disc', 'tip'], cond: { type: 'afterCollision' },
  deltas: [['nutationDamping', [4, 10]]] });
cond({ id: 'wallGlide', name: 'Wall Glide', adj: 'Gliding', family: 'defense', slots: ['ring', 'disc'],
  deltas: [['wallFriction', [-0.15, -0.35]], ['wallRestitution', -0.05]], note: 'loses less spin against walls' });
cond({ id: 'anchoredStance', name: 'Anchored Stance', adj: 'Anchored', family: 'defense', slots: ['tip'], cond: { type: 'slowMoving' },
  deltas: [['tipFriction', [0.1, 0.3]]], note: 'resists being shoved' });

// endurance
cond({ id: 'stillPoint', name: 'Still Point', adj: 'Still', family: 'endurance', slots: ['tip'], cond: { type: 'slowMoving' },
  deltas: [['tipSpinDrag', [-0.1, -0.25]]] });
cond({ id: 'streamlined', name: 'Streamlined', adj: 'Streamlined', family: 'endurance', slots: ['ring', 'core', 'disc'],
  deltas: [['aeroDrag', [-0.08, -0.2]]] });
cond({ id: 'lateBloom', name: 'Late Bloom', adj: 'Blooming', family: 'endurance', slots: ['disc', 'core'], cond: { type: 'spinBelow', value: 0.35 },
  deltas: [['nutationDamping', [3, 8]], ['tipSpinDrag', -0.08]] });
cond({ id: 'featherTouch', name: 'Feather Touch', adj: 'Light', family: 'endurance', slots: ['ring', 'aux'],
  deltas: [['grindLoss', [-0.15, -0.4]]], note: 'slow grinding contacts lose less spin' });
cond({ id: 'surfaceSkater', name: 'Surface Skater', adj: 'Skating', family: 'endurance', slots: ['tip'], cond: { type: 'surface', value: ['smooth', 'ice'] },
  deltas: [['tipSpinDrag', [-0.1, -0.25]]] });

// mobility
cond({ id: 'nimble', name: 'Nimble', adj: 'Nimble', family: 'mobility', slots: ['tip', 'disc'],
  deltas: [['steerForce', [0.08, 0.2]]] });
cond({ id: 'efficientDrive', name: 'Efficient Drive', adj: 'Thrifty', family: 'mobility', slots: ['core', 'tip'],
  deltas: [['steerEfficiency', [0.1, 0.3]]], note: 'steering costs less spin' });
cond({ id: 'surfaceGrip', name: 'Surface Grip', adj: 'Grounded', family: 'mobility', slots: ['tip'], cond: { type: 'surface', value: ['rough', 'standard'] },
  deltas: [['tipFriction', [0.08, 0.2]]] });
cond({ id: 'orbitalFlow', name: 'Orbital Flow', adj: 'Orbiting', family: 'mobility', slots: ['tip', 'ring'], cond: { type: 'fastMoving' },
  deltas: [['tipSpinDrag', [-0.08, -0.18]]], note: 'efficient circling' });
cond({ id: 'edgeRecovery', name: 'Edge Recovery', adj: 'Recovering', family: 'mobility', slots: ['tip', 'disc'], cond: { type: 'nearEdge' },
  deltas: [['steerForce', [0.2, 0.45]], ['tipFriction', 0.1]] });

// technical (ability)
cond({ id: 'abilityFocus', name: 'Ability Focus', adj: 'Focused', family: 'technical', slots: ['core', 'ring'],
  deltas: [['abilityDuration', [0.08, 0.22]]] });
cond({ id: 'chargeConduit', name: 'Charge Conduit', adj: 'Charged', family: 'technical', slots: ['core', 'ring', 'disc'],
  deltas: [['abilityCharge', [0.1, 0.3]]] });
cond({ id: 'beastAttuned', name: 'Beast Attuned', adj: 'Attuned', family: 'technical', slots: ['core'],
  deltas: [['abilityPower', [0.05, 0.15]]] });

// risk / reward
cond({ id: 'berserker', name: 'Berserker', adj: 'Berserk', family: 'risk', slots: ['ring'],
  deltas: [['faceAngle', [2, 4]], ['aeroDrag', 0.12], ['tipSpinDrag', 0.05]] });
cond({ id: 'lastStand', name: 'Last Stand', adj: 'Defiant', family: 'risk', slots: ['ring', 'disc', 'lock', 'tip', 'core'], cond: { type: 'critical' },
  deltas: [['restitution', [0.06, 0.14]], ['faceAngle', 3], ['burstThreshold', 0.1]] });
cond({ id: 'turtle', name: 'Turtle', adj: 'Shelled', family: 'risk', slots: ['disc', 'tip'], cond: { type: 'slowMoving' },
  deltas: [['restitutionWhenHit', [-0.1, -0.2]], ['burstThreshold', 0.1], ['steerForce', -0.15]] });
cond({ id: 'glassCannon', name: 'Glass Cannon', adj: 'Glass', family: 'risk', slots: ['ring', 'lock'],
  deltas: [['burstStressDealt', [0.15, 0.35]], ['burstThreshold', -0.15]] });
cond({ id: 'wildSpin', name: 'Wild Spin', adj: 'Wild', family: 'risk', slots: ['core', 'disc'],
  deltas: [['contactFriction', [0.1, 0.22]], ['nutationDamping', -1]], note: 'harder-gripping contacts, a less stable axis' });
cond({ id: 'spinThief', name: 'Spin Thief', adj: 'Thieving', family: 'risk', slots: ['ring'], cond: { type: 'oppositeSpin' },
  deltas: [['contactFriction', [0.12, 0.3]]], note: 'co-moving surfaces drag spin toward the slower top' });

// ================================================================ special (legendary+)
const special = (o) => cond({ special: true, rarityMin: 'legendary', ...o });
special({ id: 'stormHeart', name: 'Storm Heart', family: 'offense', slots: ['ring', 'core'], cond: { type: 'spinAbove', value: 0.6 },
  deltas: [['faceAngle', 3], ['abilityCharge', 0.2]] });
special({ id: 'ironWill', name: 'Iron Will', family: 'defense', slots: ['lock', 'disc', 'core'],
  deltas: [['burstThreshold', 0.25], ['nutationDamping', 3]] });
special({ id: 'eternalOrbit', name: 'Eternal Orbit', family: 'endurance', slots: ['tip', 'disc'], cond: { type: 'center' },
  deltas: [['tipSpinDrag', -0.2], ['aeroDrag', -0.1]] });
special({ id: 'riftWalker', name: 'Rift Walker', family: 'mobility', slots: ['tip', 'ring'], cond: { type: 'nearEdge' },
  deltas: [['steerForce', 0.4], ['wallFriction', -0.4]] });
special({ id: 'solarCoreTrait', name: 'Solar Reservoir', family: 'technical', slots: ['core', 'ring'],
  deltas: [['abilityCharge', 0.35], ['abilityPower', 0.1]] });
special({ id: 'apexPredator', name: 'Apex Predator', family: 'offense', slots: ['ring'], cond: { type: 'opponentApproaching' },
  deltas: [['faceAngle', 4], ['restitution', 0.08]] });
special({ id: 'lastSpinTrait', name: 'Last Spin', family: 'endurance', slots: ['tip', 'core', 'disc'], cond: { type: 'spinBelow', value: 0.15 },
  deltas: [['tipSpinDrag', -0.4], ['nutationDamping', 8]] });

// ================================================================ launch (launchers, cables)
const launch = (o) => def(o);
launch({ id: 'precisionRelease', name: 'Precision Release', adj: 'Precise', family: 'technical', slots: ['launcher'],
  launch: { window: [0.12, 0.3], perfectBonus: 0.02 } });
launch({ id: 'highTorque', name: 'High-Torque Drive', adj: 'Torqued', family: 'risk', slots: ['launcher'],
  launch: { power: [0.04, 0.1], wear: 0.4 } });
launch({ id: 'stableGrip', name: 'Stable Grip', adj: 'Stable', family: 'technical', slots: ['launcher'],
  launch: { consistency: [0.12, 0.32] } });
launch({ id: 'rapidReset', name: 'Rapid Reset', adj: 'Rapid', family: 'technical', slots: ['launcher'],
  launch: { chargeRate: [0.1, 0.3] }, note: 'shorter preparation' });
launch({ id: 'balancedMechanism', name: 'Balanced Mechanism', adj: 'Even', family: 'technical', slots: ['launcher'],
  launch: { techniqueVar: [-0.15, -0.35] }, note: 'steadier with every launch style' });
launch({ id: 'overdrive', name: 'Overdrive', adj: 'Overdriven', family: 'risk', slots: ['launcher', 'cable'], group: 'power',
  launch: { power: [0.05, 0.1], window: -0.2 } });
launch({ id: 'snapRelease', name: 'Snap Release', adj: 'Snapping', family: 'risk', slots: ['cable'],
  launch: { perfectBonus: [0.03, 0.07], missPenalty: 0.3 } });
launch({ id: 'balancedTension', name: 'Balanced Tension', adj: 'Tensioned', family: 'technical', slots: ['cable'],
  launch: { consistency: [0.1, 0.25] } });
launch({ id: 'powerConduit', name: 'Power Conduit', adj: 'Conductive', family: 'risk', slots: ['cable'], group: 'power',
  launch: { power: [0.03, 0.08], overchargeWear: 0.5 } });
launch({ id: 'featherline', name: 'Featherline', adj: 'Fine', family: 'technical', slots: ['cable'],
  launch: { controlledConsistency: [0.25, 0.5], power: -0.03 } });
launch({ id: 'adaptiveGrip', name: 'Adaptive Grip', adj: 'Adaptive', family: 'technical', slots: ['cable'],
  launch: { techniqueVar: [-0.15, -0.3] }, note: 'steadier advanced techniques' });
launch({ id: 'overchargeTolerance', name: 'Overload Tolerance', adj: 'Tolerant', family: 'risk', slots: ['launcher', 'cable'],
  launch: { overcharge: [0.02, 0.05] } });
def({ id: 'phantomStep', name: 'Phantom Step', family: 'technical', slots: ['launcher', 'cable'], special: true, rarityMin: 'legendary',
  launch: { window: 0.5, consistency: 0.3 } });

// ================================================================ item (durability)
def({ id: 'reinforced', name: 'Reinforced', adj: 'Reinforced', family: 'defense', slots: ALL, item: { maxDurability: [0.1, 0.3] } });
def({ id: 'resilient', name: 'Resilient', adj: 'Resilient', family: 'defense', slots: ALL, item: { wear: [-0.1, -0.3] } });

// ================================================================ reactive (battle triggers)
// Fired by game/itemEffects.js from real battle events; cooldowns and limits
// keep them from chaining.
def({ id: 'reboundCoil', name: 'Rebound Coil', adj: 'Coiled', family: 'mobility', slots: ['ring', 'disc'],
  react: { on: 'wall', min: 0.01, cooldown: 2, effect: { deltas: [['steerForce', [0.1, 0.25]], ['tipFriction', 0.1]], duration: 1.5 } },
  note: 'turns a wall bounce into a fast return' });
def({ id: 'adrenalStrike', name: 'Adrenal Strike', adj: 'Fierce', family: 'offense', slots: ['ring'],
  react: { on: 'heavyHit', cooldown: 3, effect: { deltas: [['faceAngle', [1.5, 3]]], duration: 2 } },
  note: 'one big clash sharpens the next' });
def({ id: 'shockBrace', name: 'Shock Brace', adj: 'Braced', family: 'defense', slots: ['disc', 'aux'],
  react: { on: 'struck', cooldown: 4, effect: { deltas: [['restitutionWhenHit', [-0.1, -0.25]]], duration: 2 } },
  note: 'follow-up hits land softer' });
def({ id: 'notchGuard', name: 'Notch Guard', adj: 'Warded', family: 'defense', slots: ['lock', 'core'],
  react: { on: 'lockSlip', cooldown: 5, effect: { deltas: [['burstThreshold', [0.1, 0.3]]], duration: 3 } } });
def({ id: 'secondBreath', name: 'Second Breath', adj: 'Enduring', family: 'endurance', slots: ['tip', 'disc'],
  react: { on: 'lowSpin', value: 0.3, limit: 1, effect: { deltas: [['tipSpinDrag', [-0.1, -0.25]], ['nutationDamping', 4]], duration: 6 } } });
def({ id: 'spiritSiphon', name: 'Spirit Siphon', adj: 'Siphoning', family: 'technical', slots: ['core', 'ring'],
  react: { on: 'hit', min: 0.012, cooldown: 0.5, effect: { spirit: [2, 5] } } });
def({ id: 'afterburn', name: 'Afterburn', adj: 'Burning', family: 'technical', slots: ['core'],
  react: { on: 'ability', effect: { deltas: [['steerForce', [0.1, 0.25]], ['steerEfficiency', 0.1]], duration: 3 } } });
def({ id: 'slipstreamFin', name: 'Slipstream Fin', adj: 'Finned', family: 'mobility', slots: ['tip', 'ring'],
  react: { on: 'dash', cooldown: 2, effect: { deltas: [['faceAngle', 2], ['steerForce', [0.1, 0.2]]], duration: 1 } } });
def({ id: 'riposteSpring', name: 'Riposte Spring', adj: 'Riposting', family: 'risk', slots: ['disc', 'lock'],
  react: { on: 'counter', cooldown: 3, effect: { stress: [1.3, 1.6] } },
  note: 'a counter primes a lock-cracking reply' });
def({ id: 'edgeDancer', name: 'Edge Dancer', adj: 'Dancing', family: 'mobility', slots: ['tip'],
  react: { on: 'edgeEscape', cooldown: 3, effect: { deltas: [['tipFriction', [0.1, 0.25]]], duration: 2 } } });
def({ id: 'momentumEngine', name: 'Momentum Engine', adj: 'Building', family: 'offense', slots: ['ring', 'core'],
  react: { on: 'hit', min: 0.012, cooldown: 0.4, effect: { deltas: [['contactFriction', [0.03, 0.06]]], duration: 4, stacks: 4 } },
  note: 'grows stronger while you keep trading hits' });
def({ id: 'lastLight', name: 'Last Light', family: 'endurance', slots: ['core', 'tip'], special: true, rarityMin: 'legendary',
  react: { on: 'lowSpin', value: 0.15, limit: 1, effect: { spin: 0.1 } } });

// ================================================================ elemental (hit statuses)
def({ id: 'emberEdge', name: 'Ember Edge', adj: 'Ember', family: 'elemental', slots: ['ring'], rarityMin: 'rare', group: 'element',
  status: { scorch: [0.08, 0.16] } });
def({ id: 'staticCoil', name: 'Static Coil', adj: 'Crackling', family: 'elemental', slots: ['ring', 'aux'], rarityMin: 'rare', group: 'element',
  status: { static: [0.08, 0.16] } });
def({ id: 'rustBite', name: 'Rust Bite', adj: 'Corroding', family: 'elemental', slots: ['ring', 'disc'], rarityMin: 'rare', group: 'element',
  status: { rust: [0.08, 0.16] } });

// ================================================================ mastery (grow with use)
cond({ id: 'awakeningEdge', name: 'Awakening Edge', adj: 'Awakening', family: 'mastery', slots: ['ring'], rarityMin: 'rare', grow: { by: 'mastery', from: 0.4 },
  deltas: [['faceAngle', [1.5, 3.5]], ['restitution', [0.02, 0.06]]] });
cond({ id: 'trueBalance', name: 'True Balance', adj: 'True', family: 'mastery', slots: ['disc', 'core'], rarityMin: 'rare', grow: { by: 'mastery', from: 0.4 },
  deltas: [['nutationDamping', [2, 6]], ['aeroDrag', [-0.04, -0.1]]] });
cond({ id: 'veteranGrip', name: 'Veteran Grip', adj: 'Veteran', family: 'mastery', slots: ['tip'], rarityMin: 'rare', grow: { by: 'mastery', from: 0.4 },
  deltas: [['steerEfficiency', [0.08, 0.2]], ['tipFriction', [0.04, 0.1]]] });

// ================================================================ component synergy (need a matching part)
cond({ id: 'ballSeat', name: 'Ball Seat', adj: 'Seated', family: 'synergy', slots: ['lock'], requires: [{ slot: 'tip', wear: ['ball'] }],
  deltas: [['nutationDamping', [2, 5]], ['restitutionWhenHit', [-0.04, -0.1]]] });
cond({ id: 'needlePoise', name: 'Needle Poise', adj: 'Poised', family: 'synergy', slots: ['disc', 'lock'], requires: [{ slot: 'tip', wear: ['sharp'] }],
  deltas: [['tipSpinDrag', [-0.05, -0.12]]] });
cond({ id: 'flatDrive', name: 'Flat Drive', adj: 'Driven', family: 'synergy', slots: ['ring', 'core'], requires: [{ slot: 'tip', wear: ['flat', 'rubber'] }],
  deltas: [['steerForce', [0.06, 0.15]]] });
cond({ id: 'hookChain', name: 'Hook Chain', adj: 'Chained', family: 'synergy', slots: ['disc', 'core'], requires: [{ slot: 'ring', role: ['attack', 'burst'] }],
  deltas: [['burstStressDealt', [0.06, 0.15]]] });

// ================================================================ curses (drawbacks that buy power elsewhere)
const curse = (o) => cond({ curse: true, family: 'curse', rarityMin: 'rare', ...o });
curse({ id: 'brittle', name: 'Brittle', adj: 'Brittle', slots: ['lock', 'ring', 'disc'], deltas: [['burstThreshold', [-0.1, -0.2]]] });
curse({ id: 'dragging', name: 'Dragging', adj: 'Dragging', slots: ['tip', 'disc', 'core'], deltas: [['tipSpinDrag', [0.06, 0.12]]] });
curse({ id: 'leaden', name: 'Leaden', adj: 'Leaden', slots: ['ring', 'disc', 'core'], deltas: [['steerForce', [-0.08, -0.15]]] });
curse({ id: 'reckless', name: 'Reckless', adj: 'Reckless', slots: ['ring', 'tip'], deltas: [['restitutionWhenHit', [0.08, 0.15]]] });
curse({ id: 'thirsty', name: 'Thirsty', adj: 'Thirsty', slots: ['core', 'ring'], deltas: [['abilityCharge', [-0.1, -0.2]]] });

export const TRAIT_SPECS = S;
export const TRAITS = S.map(compileTrait);
export const TRAIT_INDEX = Object.fromEntries(TRAITS.map((t) => [t.id, t]));

export function traitDescription(t, item = null) {
  const d = TRAIT_INDEX[t.id];
  if (!d) return '';
  return d.desc(t.mag ?? 1, item);
}
