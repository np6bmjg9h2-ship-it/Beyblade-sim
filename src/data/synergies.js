// Cross-item synergies: rules over what a top carries (traits, trait
// families, sets, part types, mastery, Spirit Chip, launcher, curses and, in a
// Rift Run, charms) that add an effect when every requirement holds. Rules
// are plain data evaluated by systems/synergy.js; effects use the trait
// vocabulary (data/channels.js deltas with an optional condition, a reactive
// trigger, launch keys, hit statuses, Rift status power/time, technique keys)
// at fixed strength. Every rule needs at least one collected thing (a trait,
// set piece, mastery, curse, charm...), so bare reference builds never get a
// synergy and the type balance stays as measured.
//
// Requirement types:
//   { trait: id, count? }        equipped items carrying the trait
//   { family: f, count }         equipped traits of a family
//   { kind: 'reactive', count }  equipped traits of a kind
//   { status: 'scorch' }         an equipped hit status (trait, or a Rift ring's element)
//   { set: id, count }           equipped set pieces
//   { mastery: level, count }    equipped items at that mastery or above
//   { rarity: id, count }        equipped items at that rarity or above
//   { curse: n }                 equipped curse traits
//   { tip: [wear] } { ring: [role] } { part: baseId }
//   { mechanism: 'clutch'|'magnet'|'spring'|'shift' }
//   { massAbove: g } { massBelow: g } { spin: 'R'|'L' }
//   { beastElement: [elements] } { launcherMech: 'dual'|'R'|'L' }
//   { charmFamily: f, count }    Rift charms held (run only)
//   { boon: id }                 Rift boon taken (run only)

export const SYNERGIES = [
  { id: 'gyroLock', name: 'Gyro Lock', requires: [{ tip: ['ball'] }, { family: 'defense', count: 2 }],
    effect: { deltas: [['nutationDamping', 3], ['burstThreshold', 0.08]] },
    lore: 'A ball tip under a fortified stack stops fighting the hit and pivots with it.' },
  { id: 'longHorizon', name: 'Long Horizon', requires: [{ family: 'endurance', count: 3 }],
    effect: { deltas: [['tipSpinDrag', -0.06], ['aeroDrag', -0.05]] },
    lore: 'Every part tuned for the long game.' },
  { id: 'bladeDancer', name: 'Blade Dancer', requires: [{ family: 'offense', count: 2 }, { family: 'mobility', count: 1 }],
    effect: { deltas: [['steerForce', 0.08]], react: { on: 'hit', min: 0.012, cooldown: 1.5, effect: { deltas: [['faceAngle', 1]], duration: 1 } } },
    lore: 'Strike, slide, strike again.' },
  { id: 'stormfront', name: 'Stormfront', hidden: true, hint: 'A storm-born Spirit Chip and crackling steel…',
    requires: [{ beastElement: ['storm', 'thunder'] }, { status: 'static' }],
    effect: { status: { static: 0.05 }, deltas: [['abilityCharge', 0.1]] },
    lore: 'The beast answers the spark in the steel.' },
  { id: 'wildfire', name: 'Wildfire', hidden: true, hint: 'Fire and recklessness…',
    requires: [{ status: 'scorch' }, { family: 'risk', count: 1 }],
    effect: { statusPower: { scorch: 0.2 }, deltas: [['abilityPower', 0.05]] },
    lore: 'Burn hotter, burn faster.' },
  { id: 'meltdownProtocol', name: 'Meltdown Protocol', hidden: true, hint: 'Two elements that should never meet…',
    requires: [{ status: 'scorch' }, { status: 'rust' }],
    effect: { statusTime: { scorch: 1, rust: 1 } },
    lore: 'Heat the lock, then let the rust in: Scorch and Rust together fuse into Meltdown.' },
  { id: 'ironCurtain', name: 'Iron Curtain', requires: [{ set: 'bastion', count: 2 }, { tip: ['ball', 'rubber'] }],
    effect: { deltas: [['restitutionWhenHit', -0.08]] } },
  { id: 'eyeOfTheStorm', name: 'Eye of the Storm', hidden: true, hint: 'Two sets, one calm centre…',
    requires: [{ set: 'tempest', count: 2 }, { set: 'astral', count: 2 }],
    effect: { deltas: [['steerEfficiency', 0.1], ['tipSpinDrag', -0.04]] } },
  { id: 'craftsmansHarmony', name: "Craftsman's Harmony", requires: [{ mastery: 'expert', count: 3 }],
    effect: { deltas: [['nutationDamping', 2], ['steerEfficiency', 0.08], ['abilityCharge', 0.08]] },
    lore: 'Parts that have fought together move together.' },
  { id: 'desperateGambit', name: 'Desperate Gambit', hidden: true, hint: 'Fortune favours the cursed…',
    requires: [{ curse: 1 }, { family: 'risk', count: 2 }],
    effect: { deltas: [['burstStressDealt', 0.12], ['faceAngle', 1]] } },
  { id: 'mirrorHeart', name: 'Mirror Heart', requires: [{ spin: 'L' }, { trait: 'spinThief' }],
    effect: { cond: { type: 'oppositeSpin' }, deltas: [['contactFriction', 0.06]] } },
  { id: 'clutchMaster', name: 'Clutch Master', hidden: true, hint: 'A clutch and a technician…',
    requires: [{ mechanism: 'clutch' }, { family: 'technical', count: 1 }],
    effect: { react: { on: 'heavyHit', cooldown: 2, effect: { spirit: 6 } } } },
  { id: 'fieldLines', name: 'Field Lines', requires: [{ mechanism: 'magnet' }, { family: 'defense', count: 1 }],
    effect: { deltas: [['wallRestitution', -0.05], ['burstThreshold', 0.06]] } },
  { id: 'heavyMetal', name: 'Heavy Metal', requires: [{ massAbove: 52 }, { family: 'defense', count: 1 }],
    effect: { cond: { type: 'slowMoving' }, deltas: [['restitutionWhenHit', -0.06], ['tipFriction', 0.06]] } },
  { id: 'featherStorm', name: 'Feather Storm', requires: [{ massBelow: 44 }, { family: 'mobility', count: 2 }],
    effect: { cond: { type: 'fastMoving' }, deltas: [['steerForce', 0.1]] } },
  { id: 'kindredSpirit', name: 'Kindred Spirit', requires: [{ trait: 'beastAttuned' }, { family: 'technical', count: 2 }],
    effect: { deltas: [['abilityDuration', 0.1], ['abilityPower', 0.05]] } },
  { id: 'chainReaction', name: 'Chain Reaction', requires: [{ kind: 'reactive', count: 3 }],
    effect: { react: { on: 'hit', min: 0.012, cooldown: 1, effect: { spirit: 2 } }, deltas: [['abilityCharge', 0.08]] },
    lore: 'Every trigger feeds the next.' },
  { id: 'emberforge', name: 'Emberforge', hidden: true, hint: 'Ember charms around a burning blade…',
    requires: [{ charmFamily: 'ember', count: 2 }, { status: 'scorch' }],
    effect: { statusPower: { scorch: 0.15 } } },
  { id: 'galeRider', name: 'Gale Rider', requires: [{ charmFamily: 'gale', count: 2 }, { family: 'mobility', count: 1 }],
    effect: { deltas: [['steerForce', 0.08]], skill: { dashCooldown: 0.1 } } },
];

export const SYNERGY_INDEX = Object.fromEntries(SYNERGIES.map((s) => [s.id, s]));

// Requirement types that come from collected loot (each rule needs one).
export const LOOT_REQUIREMENTS = ['trait', 'family', 'kind', 'status', 'set', 'mastery', 'rarity', 'curse', 'charmFamily', 'boon'];
