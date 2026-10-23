// The four legendary Spirit Chips: the spirits of the Four Founders' tops
// (data/legends.js), modelled on the Four Symbols of the old sky charts:
// the Azure Dragon of the east, the Vermilion Bird of the south, the White
// Tiger of the west and the Black Tortoise of the north. They are not found
// in Spirit Trials; Archive research awakens them with their top. Same op
// language as data/beasts.js.

const D2R = Math.PI / 180;

export const LEGEND_BEASTS = [
  {
    id: 'seiryuga', name: 'Seiryuga', title: 'the Azure Tempest', element: 'storm', rarity: 'legendary', emblem: 'seiryu', legend: 'azure',
    colors: { primary: '#2f8bff', secondary: '#e6f3ff', glow: '#62b6ff' },
    personality: 'Loud, hungry, fearless. Would rather lose charging than win waiting.',
    lore: 'The dragon of the east wind. Its founder swore it was the storm that taught him to spin, not the other way round.',
    origin: 'Sealed in the Azure Tempest, the left-spin top of the first founder.',
    style: 'attack', preferred: { metric: 'impacts', desc: 'Charging in and landing hits' },
    passive: { id: 'eyeOfTheStorm', name: 'Eye of the Storm', desc: 'While above 50% spin: steering +12% and steering efficiency +10%.', cond: { type: 'spinAbove', value: 0.5 }, deltas: [['steerForce', 0.12], ['steerEfficiency', 0.1]] },
    abilities: {
      signature: { id: 'stormStrike', name: 'Storm Strike', category: 'attack', cost: 75, cooldown: 7, duration: 1.2,
        desc: 'A spiralling lunge at the opponent (paid from spin): blade face +5° and restitution +10% for 1.2 s.', counterplay: 'Side-step it, or meet it with a Counter Stance.',
        ops: [{ op: 'dash', speed: 0.95, dir: 'opponent' }, { op: 'mods', deltas: [['faceAngle', 5 * D2R], ['restitution', 0.1]], duration: 1.2 }], vfx: 'rush', sfx: 'rush' },
      secondary: { id: 'risingGust', name: 'Rising Gust', category: 'movement', cost: 30, cooldown: 3, duration: 0.2, bond: 3,
        desc: 'A gust-step in the stick direction (paid from spin).', counterplay: 'Each step costs spin.',
        ops: [{ op: 'dash', speed: 0.6, dir: 'stick' }], vfx: 'step', sfx: 'dash' },
      ultimate: { id: 'galeTyphoon', name: 'Gale Typhoon', category: 'ultimate', cost: 100, cooldown: 30, duration: 2.5, awaken: 1,
        desc: 'The full storm: a shockwave, then a lunge with blade face +7° and steering +50% for 2.5 s.', counterplay: 'Brace and absorb; it burns a lot of spin.',
        ops: [{ op: 'shockwave', impulse: 0.03, range: 0.1 }, { op: 'dash', speed: 1.1, dir: 'opponent' }, { op: 'mods', deltas: [['faceAngle', 7 * D2R], ['steerForce', 0.5]], duration: 2.5 }], vfx: 'storm', sfx: 'ultimate' },
    },
    resonance: { affinity: ['storm', 'spirit'], desc: 'Storm cores feed the tempest.', deltas: [['abilityCharge', 0.15]] },
    awakening: { name: 'Awakening: Eastern Sky', bond: 8, requirement: { type: 'stat', stat: 'ringOutsWith', value: 8 }, desc: 'Win 8 rounds by Ring Out with Seiryuga bonded.' },
  },
  {
    id: 'suzakuen', name: 'Suzakuen', title: 'the Vermilion Wing', element: 'solar', rarity: 'legendary', emblem: 'suzaku', legend: 'vermilion',
    colors: { primary: '#ff4a2a', secondary: '#ffe1b8', glow: '#ff7a3d' },
    personality: 'Proud, cold, alone by choice. Burns hotter the more it is pushed.',
    lore: 'The bird of the south. Its founder never thanked anyone, but he never once left a teammate behind.',
    origin: 'Sealed in the Vermilion Wing, the top of the second founder.',
    style: 'balance', preferred: { metric: 'comebacks', desc: 'Rising again from low spin' },
    passive: { id: 'emberRise', name: 'Ember Rise', desc: 'Below 35% spin: wobble damping +3/s and ability charge +20%.', cond: { type: 'spinBelow', value: 0.35 }, deltas: [['nutationDamping', 3], ['abilityCharge', 0.2]] },
    abilities: {
      signature: { id: 'flameArrow', name: 'Flame Arrow', category: 'attack', cost: 70, cooldown: 7, duration: 1.5,
        desc: 'A diving strike at the opponent; the next collision within 1.5 s deals 1.4× lock stress with blade face +3°.', counterplay: 'Dodge the dive; Counter Stance reflects it.',
        ops: [{ op: 'dash', speed: 0.85, dir: 'opponent' }, { op: 'nextHit', window: 1.5, stressMul: 1.4, deltas: [['faceAngle', 3 * D2R]] }], vfx: 'meteor', sfx: 'rush' },
      secondary: { id: 'spiralSurvivor', name: 'Spiral Survivor', category: 'recovery', cost: 40, cooldown: 6, duration: 0.8, bond: 3,
        desc: 'Channel for 0.8 s, then turn spirit into 0.2 J of spin. A collision cancels it.', counterplay: 'Hit it while it channels.',
        ops: [{ op: 'restore', energy: 0.2, channel: 0.8, interruptible: true }], vfx: 'rekindle', sfx: 'heal' },
      ultimate: { id: 'vermilionRebirth', name: 'Vermilion Rebirth', category: 'ultimate', cost: 100, cooldown: 30, duration: 3, awaken: 1, condition: { spinBelow: 0.3 },
        desc: 'Below 30% spin: burst into flame, pour 0.6 J back into rotation and steady the axis for 3 s.', counterplay: 'Strike during the 0.8 s channel.',
        ops: [{ op: 'restore', energy: 0.6, channel: 0.8, interruptible: true }, { op: 'mods', deltas: [['nutationDamping', 10], ['tipSpinDrag', -0.2]], duration: 3 }], vfx: 'awaken', sfx: 'ultimate' },
    },
    resonance: { affinity: ['solar', 'spirit'], desc: 'Solar cores fan the flame.', deltas: [['abilityPower', 0.12]] },
    awakening: { name: 'Awakening: Southern Fire', bond: 8, requirement: { type: 'stat', stat: 'comebacksWith', value: 4 }, desc: 'Win 4 rounds after dropping below 20% spin with Suzakuen bonded.' },
  },
  {
    id: 'byakkorai', name: 'Byakkorai', title: 'the White Fang', element: 'thunder', rarity: 'legendary', emblem: 'tiger', legend: 'white',
    colors: { primary: '#f4f1e6', secondary: '#3ad86b', glow: '#9dffc0' },
    personality: 'Calm, quick, loyal to its home mountains. Waits, then strikes once.',
    lore: 'The tiger of the west. Its founder left his village to see the world and kept its claw marks on every top he ever built.',
    origin: 'Sealed in the White Fang, the top of the third founder.',
    style: 'balance', preferred: { metric: 'counters', desc: 'Striking back the moment it is hit' },
    passive: { id: 'tigerPoise', name: 'Tiger Poise', desc: 'For 1 s after a collision: wobble damping +4/s and steering +15%.', cond: { type: 'afterCollision' }, deltas: [['nutationDamping', 4], ['steerForce', 0.15]] },
    abilities: {
      signature: { id: 'tigerClaw', name: 'Tiger Claw', category: 'counter', cost: 55, cooldown: 5, duration: 0.9,
        desc: 'For 0.9 s, a collision triggers the claw: wobble damping +10/s, restitution when struck -20% and 2× lock stress on the attacker.', counterplay: 'Do not attack into it; wait 0.9 s.',
        ops: [{ op: 'counter', window: 0.9, deltas: [['restitutionWhenHit', -0.2], ['nutationDamping', 10]], duration: 0.6, stressMul: 2, spirit: 20 }], vfx: 'coil', sfx: 'counter' },
      secondary: { id: 'lightningStep', name: 'Lightning Step', category: 'movement', cost: 30, cooldown: 3, duration: 0.2, bond: 3,
        desc: 'A crackling step in the stick direction (paid from spin).', counterplay: 'Each step costs spin.',
        ops: [{ op: 'dash', speed: 0.65, dir: 'stick' }], vfx: 'bolt', sfx: 'dash' },
      ultimate: { id: 'thunderPounce', name: 'Thunder Pounce', category: 'ultimate', cost: 100, cooldown: 30, duration: 1.5, awaken: 1,
        desc: 'Lightning pounce; the next collision within 1.5 s deals 2.6× lock stress with blade face +5°.', counterplay: 'Counter Stance, or be elsewhere.',
        ops: [{ op: 'dash', speed: 1.1, dir: 'opponent' }, { op: 'nextHit', window: 1.5, stressMul: 2.6, deltas: [['faceAngle', 5 * D2R]] }], vfx: 'thunder', sfx: 'ultimate' },
    },
    resonance: { affinity: ['storm', 'spirit'], desc: 'Storm cores charge its claws.', deltas: [['abilityDuration', 0.2]] },
    awakening: { name: 'Awakening: Western Thunder', bond: 8, requirement: { type: 'stat', stat: 'countersWith', value: 12 }, desc: 'Land 12 successful counters with Byakkorai bonded.' },
  },
  {
    id: 'genbukai', name: 'Genbukai', title: 'the Black Bulwark', element: 'abyss', rarity: 'legendary', emblem: 'genbu', legend: 'black',
    colors: { primary: '#1f4f7a', secondary: '#8fe0ff', glow: '#4fb8ff' },
    personality: 'Cheerful, patient, impossible to rattle. Laughs at the hardest hits.',
    lore: 'The tortoise of the north sea. Its founder ate too many sweets, smiled through every loss and never once lost his centre.',
    origin: 'Sealed in the Black Bulwark, the top of the fourth founder.',
    style: 'defense', preferred: { metric: 'impactsSurvived', desc: 'Taking hits and staying put' },
    passive: { id: 'tortoiseShell', name: 'Tortoise Shell', desc: 'Lock strength +12%, restitution when struck -14% and tip grip +10%.', cond: { type: 'always' }, deltas: [['burstThreshold', 0.12], ['restitutionWhenHit', -0.14], ['tipFriction', 0.1]] },
    abilities: {
      signature: { id: 'steelShell', name: 'Steel Shell', category: 'defense', cost: 50, cooldown: 5, duration: 3.5,
        desc: 'For 3.5 s: restitution when struck -40%, tip grip +30%, wobble damping +8/s and lock +30%. Tip drag +10% while it lasts.', counterplay: 'Wait it out, or out-spin the shell.',
        ops: [{ op: 'mods', deltas: [['restitutionWhenHit', -0.4], ['tipFriction', 0.3], ['nutationDamping', 8], ['burstThreshold', 0.3], ['tipSpinDrag', 0.1]], duration: 3.5 }], vfx: 'guard', sfx: 'guard' },
      secondary: { id: 'deepCalm', name: 'Deep Calm', category: 'defense', cost: 35, cooldown: 5, duration: 4, bond: 3,
        desc: 'For 4 s: wobble damping +10/s and tip spin drag -20%.', counterplay: 'Push it toward the edge instead.',
        ops: [{ op: 'mods', deltas: [['nutationDamping', 10], ['tipSpinDrag', -0.2]], duration: 4 }], vfx: 'crystal', sfx: 'guard' },
      ultimate: { id: 'tidalWall', name: 'Tidal Wall', category: 'ultimate', cost: 100, cooldown: 30, duration: 5, awaken: 1,
        desc: 'A wave shoves the opponent off, then a 5 s wall: restitution when struck -35%, wobble damping +12/s, lock +40%.', counterplay: 'Stay at range while the wave rises.',
        ops: [{ op: 'shockwave', impulse: 0.04, range: 0.11 }, { op: 'mods', deltas: [['restitutionWhenHit', -0.35], ['nutationDamping', 12], ['burstThreshold', 0.4]], duration: 5 }], vfx: 'howl', sfx: 'ultimate' },
    },
    resonance: { affinity: ['iron', 'abyss', 'spirit'], desc: 'Iron and abyss cores thicken the shell.', deltas: [['abilityDuration', 0.2]] },
    awakening: { name: 'Awakening: Northern Sea', bond: 8, requirement: { type: 'stat', stat: 'heavyHitsSurvivedWith', value: 30 }, desc: 'Survive 30 heavy impacts with Genbukai bonded.' },
  },
];
