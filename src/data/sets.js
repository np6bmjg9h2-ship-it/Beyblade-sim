// Equipment sets. Pieces can be any part, launcher or cable that rolled the
// set affiliation. Bonuses activate at 2, 3 and 5 equipped pieces and act on
// the same modifier channels / launch model as traits. Some carry drawbacks.

const D2R = Math.PI / 180;

export const SETS = [
  {
    id: 'tempest', name: 'Tempest Vanguard', color: '#5fc8ff', theme: 'Controlled aggression and counterattacks.',
    slots: ['ring', 'core', 'disc', 'tip', 'launcher', 'cable'],
    bonuses: {
      2: { desc: 'Restitution when struck +8% (counter-strikes).', deltas: [['restitutionWhenHit', 0.08]] },
      3: { desc: 'Blade face +2° while the opponent closes in.', cond: { type: 'opponentApproaching' }, deltas: [['faceAngle', 2 * D2R]] },
      5: { desc: 'Steering force +15% and ability charge +15%.', deltas: [['steerForce', 0.15], ['abilityCharge', 0.15]] },
    },
  },
  {
    id: 'bastion', name: 'Iron Bastion', color: '#9aa6b8', theme: 'Stability and defensive resistance.',
    slots: ['ring', 'disc', 'lock', 'core', 'aux', 'launcher'],
    bonuses: {
      2: { desc: 'Wobble damping +3/s.', deltas: [['nutationDamping', 3]] },
      3: { desc: 'Lock strength +15%.', deltas: [['burstThreshold', 0.15]] },
      5: { desc: 'While slow: restitution when struck -15%, tip grip +10%. Drawback: steering -10%.', cond: { type: 'slowMoving' }, deltas: [['restitutionWhenHit', -0.15], ['tipFriction', 0.1]], always: [['steerForce', -0.1]] },
    },
  },
  {
    id: 'astral', name: 'Astral Current', color: '#c6b8ff', theme: 'Endurance and energy efficiency.',
    slots: ['ring', 'disc', 'tip', 'core', 'cable'],
    bonuses: {
      2: { desc: 'Air drag -6%.', deltas: [['aeroDrag', -0.06]] },
      3: { desc: 'Tip spin drag -8%.', deltas: [['tipSpinDrag', -0.08]] },
      5: { desc: 'Below 40% spin: wobble damping +6/s, tip spin drag -10%.', cond: { type: 'spinBelow', value: 0.4 }, deltas: [['nutationDamping', 6], ['tipSpinDrag', -0.1]] },
    },
  },
  {
    id: 'rift', name: 'Rift Stalker', color: '#c04bff', theme: 'Risky movement and edge pressure.',
    slots: ['ring', 'tip', 'disc', 'lock', 'launcher'],
    bonuses: {
      2: { desc: 'Steering force +10%.', deltas: [['steerForce', 0.1]] },
      3: { desc: 'Near the edge: wall friction -30%, steering +20%.', cond: { type: 'nearEdge' }, deltas: [['wallFriction', -0.3], ['steerForce', 0.2]] },
      5: { desc: 'Lock stress dealt +20%. Drawback: own lock strength -10%.', deltas: [['burstStressDealt', 0.2], ['burstThreshold', -0.1]] },
    },
  },
  {
    id: 'solar', name: 'Solar Dominion', color: '#ffb84a', theme: 'Ability charging and explosive power windows.',
    slots: ['core', 'ring', 'disc', 'aux', 'launcher', 'cable'],
    bonuses: {
      2: { desc: 'Ability charge +12%.', deltas: [['abilityCharge', 0.12]] },
      3: { desc: 'Ability power +8%.', deltas: [['abilityPower', 0.08]] },
      5: { desc: 'Ability duration +20%, ability charge +15%. Drawback: air drag +5%.', deltas: [['abilityDuration', 0.2], ['abilityCharge', 0.15], ['aeroDrag', 0.05]] },
    },
  },
  {
    id: 'phantom', name: 'Phantom Circuit', color: '#8a7dff', theme: 'Technical launches and precision control.',
    slots: ['launcher', 'cable', 'tip', 'core', 'ring'],
    bonuses: {
      2: { desc: 'Launch angle error -15%.', launch: { consistency: 0.15 } },
      3: { desc: 'Perfect-release window +20%.', launch: { window: 0.2 } },
      5: { desc: 'Steering efficiency +20%, minor-contact friction -20%.', deltas: [['steerEfficiency', 0.2], ['grindLoss', -0.2]] },
    },
  },
];

export const SET_INDEX = Object.fromEntries(SETS.map((s) => [s.id, s]));

// Count set pieces among equipped items and return active bonus tiers.
export function activeSetBonuses(items) {
  const counts = {};
  for (const it of items) if (it?.set) counts[it.set] = (counts[it.set] || 0) + 1;
  const out = [];
  for (const [id, n] of Object.entries(counts)) {
    const s = SET_INDEX[id];
    if (!s) continue;
    for (const tier of [2, 3, 5]) {
      if (n >= tier && s.bonuses[tier]) out.push({ set: s, tier, count: n, bonus: s.bonuses[tier] });
    }
  }
  return { counts, active: out };
}

// Convert active set bonuses into modifier sources + launch mods.
export function setSources(items) {
  const { active } = activeSetBonuses(items);
  const sources = [];
  const launch = {};
  for (const { set, tier, bonus } of active) {
    if (bonus.deltas) sources.push({ id: `set:${set.id}:${tier}`, name: `${set.name} (${tier})`, origin: 'set', cond: bonus.cond || { type: 'always' }, deltas: bonus.deltas });
    if (bonus.always) sources.push({ id: `set:${set.id}:${tier}:always`, name: `${set.name} (${tier})`, origin: 'set', cond: { type: 'always' }, deltas: bonus.always });
    if (bonus.launch) for (const [k, v] of Object.entries(bonus.launch)) launch[k] = (launch[k] || 0) + v;
  }
  return { sources, launch, active };
}
