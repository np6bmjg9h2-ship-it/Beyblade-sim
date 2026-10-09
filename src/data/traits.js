// Item traits. Every trait acts through one of four mechanisms, all of which
// reach real gameplay:
//   kind 'physical'    : changes the part's physical numbers at assembly
//                        (mass, blade face, friction, inertia distribution...)
//   kind 'conditional' : writes simulation modifier channels while a battle
//                        condition holds (evaluated every tick, see systems/modifiers.js)
//   kind 'launch'      : changes the launch model (power, consistency, timing window)
//   kind 'item'        : changes durability behaviour of the item itself
//
// Magnitude m in [0,1] is rolled per item (rarity sets the range). Channel
// deltas are summed per channel then clamped (see CHANNEL_LIMITS), duplicate
// traits never stack (highest magnitude wins), and traits in the same
// `group` are mutually exclusive on one item.

const L = (a, b, m) => a + (b - a) * m;
const pct = (x) => `${x >= 0 ? '+' : ''}${Math.round(x * 100)}%`;
const deg = (x) => `${x >= 0 ? '+' : ''}${x.toFixed(1)}°`;
const D2R = Math.PI / 180;

// Modifier channel bounds after all sources are combined.
// mul channels: final = clamp(1 + sum(deltas)), add channels: clamp(sum).
export const CHANNEL_LIMITS = {
  faceAngle: { type: 'add', min: -0.15, max: 0.17, label: 'Blade face angle', unit: 'deg' },
  restitution: { type: 'mul', min: 0.6, max: 1.3, label: 'Contact restitution' },
  restitutionWhenHit: { type: 'mul', min: 0.5, max: 1.3, label: 'Restitution when struck' },
  contactFriction: { type: 'mul', min: 0.5, max: 1.5, label: 'Contact friction' },
  tipFriction: { type: 'mul', min: 0.6, max: 1.5, label: 'Tip grip' },
  tipSpinDrag: { type: 'mul', min: 0.5, max: 1.6, label: 'Tip spin drag' },
  aeroDrag: { type: 'mul', min: 0.6, max: 1.5, label: 'Air drag' },
  wallFriction: { type: 'mul', min: 0.5, max: 1.5, label: 'Wall friction' },
  wallRestitution: { type: 'mul', min: 0.6, max: 1.3, label: 'Wall restitution' },
  burstThreshold: { type: 'mul', min: 0.6, max: 1.6, label: 'Lock strength' },
  burstStressDealt: { type: 'mul', min: 0.6, max: 1.6, label: 'Lock stress dealt' },
  nutationDamping: { type: 'add', min: -1.5, max: 14, label: 'Wobble damping', unit: '/s' },
  steerForce: { type: 'mul', min: 0.6, max: 1.6, label: 'Steering force' },
  steerEfficiency: { type: 'mul', min: 0.6, max: 1.6, label: 'Steering efficiency' },
  abilityCharge: { type: 'mul', min: 0.6, max: 1.8, label: 'Ability charge rate' },
  abilityDuration: { type: 'mul', min: 0.7, max: 1.6, label: 'Ability duration' },
  abilityPower: { type: 'mul', min: 0.7, max: 1.5, label: 'Ability power' },
  grindLoss: { type: 'mul', min: 0.4, max: 1.3, label: 'Minor-contact friction' },
  liftForce: { type: 'add', min: 0, max: 0.6, label: 'Lift' },
};

export const CONDITIONS = {
  always: { label: () => 'Always' },
  opponentApproaching: { label: () => 'While the opponent closes in on you' },
  spinAbove: { label: (v) => `While spin is above ${Math.round(v * 100)}% of launch spin` },
  spinBelow: { label: (v) => `While spin is below ${Math.round(v * 100)}% of launch spin` },
  nearEdge: { label: () => 'While near the stadium edge' },
  opponentNearEdge: { label: () => 'While the opponent is near the stadium edge' },
  center: { label: () => 'While holding the centre' },
  slowMoving: { label: () => 'While moving slowly' },
  fastMoving: { label: () => 'While moving fast' },
  surface: { label: (v) => `On ${v.join('/')} surfaces` },
  afterCollision: { label: () => 'For 1 s after a collision' },
  lateBattle: { label: () => 'After 40 s of battle' },
  earlyBattle: { label: () => 'During the first 8 s' },
  critical: { label: () => 'While this part is in Critical condition' },
  oppositeSpin: { label: () => 'Against opposite-spin opponents' },
  abilityActive: { label: () => 'While a Bit-Beast ability is active' },
  opponentFaster: { label: () => 'While the opponent has more spin than you' },
};

const T = [];
const def = (o) => { T.push({ rarityMin: 'common', special: false, group: null, ...o }); };

// ================================================================ physical
def({ id: 'counterweight', name: 'Counterweight', family: 'defense', kind: 'physical', slots: ['ring', 'disc', 'core'], group: 'mass',
  physical: (p, m) => { p.mass += L(1.0, 2.6, m); if (p.massDist != null) p.massDist = Math.max(-0.5, p.massDist - 0.1); },
  desc: (m) => `Adds ${L(1.0, 2.6, m).toFixed(1)} g of low ballast: more inertia and less destabilisation from side impacts, but slower acceleration and launch spin.` });
def({ id: 'featherweight', name: 'Featherweight', family: 'mobility', kind: 'physical', slots: ['ring', 'disc', 'core', 'lock', 'aux'], group: 'mass',
  physical: (p, m) => { p.mass *= L(0.95, 0.86, m); },
  desc: (m) => `Mass ${pct(L(0.95, 0.86, m) - 1)}: faster launches and nimbler steering, easier to knock away.` });
def({ id: 'honedEdge', name: 'Honed Edge', family: 'offense', kind: 'physical', slots: ['ring'], group: 'face',
  physical: (p, m) => { p.faceAngle = (p.faceAngle || 0) + L(1.5, 4, m); },
  desc: (m) => `Blade face angle ${deg(L(1.5, 4, m))}: harder smash strikes that also cost more of your own spin.` });
def({ id: 'rimWeighted', name: 'Rim Weighted', family: 'endurance', kind: 'physical', slots: ['ring', 'disc'],
  physical: (p, m) => { p.massDist = Math.min(0.95, (p.massDist || 0) + L(0.1, 0.3, m)); },
  desc: (m) => `Shifts mass outward (distribution +${L(0.1, 0.3, m).toFixed(2)}): higher spin inertia and gyroscopic stability.` });
def({ id: 'precisionBalanced', name: 'Precision Balanced', family: 'technical', kind: 'physical', slots: ['ring', 'disc', 'core'],
  physical: (p, m) => { p.ecc = Math.max(0, (p.ecc || 0) - L(0.04, 0.14, m)); p._balanceFix = L(0.04, 0.14, m); },
  desc: (m) => `Machined balance: removes up to ${L(0.04, 0.14, m).toFixed(2)} mm of centre-of-mass offset (including wear).` });
def({ id: 'extendedReach', name: 'Extended Reach', family: 'offense', kind: 'physical', slots: ['ring'],
  physical: (p, m) => { p.rOut = Math.min(27, p.rOut + L(0.3, 0.9, m)); },
  desc: (m) => `Blade tips extend ${L(0.3, 0.9, m).toFixed(2)} mm further (legal max 27 mm): earlier contact, more torque per hit.` });
def({ id: 'deepHooks', name: 'Deep Hooks', family: 'offense', kind: 'physical', slots: ['ring', 'aux'],
  physical: (p, m) => { p.catch = Math.min(1.2, (p.catch ?? 0.5) + L(0.1, 0.3, m)); p.aero = (p.aero || 0.015) * 1.1; },
  desc: (m) => `Hook catch +${L(0.1, 0.3, m).toFixed(2)}: strikes transmit more counter-rotation into the opponent's lock (+10% air drag).` });
def({ id: 'raked', name: 'Raked Profile', family: 'offense', kind: 'physical', slots: ['ring'], group: 'slope',
  physical: (p, m) => { p.slope = (p.slope || 0) + L(3, 8, m); },
  desc: (m) => `Contact slope ${deg(L(3, 8, m))}: contacts push the opponent upward, loosening grip and lock.` });
def({ id: 'polished', name: 'Polished Surface', family: 'endurance', kind: 'physical', slots: ['ring', 'disc', 'aux'], group: 'surfacefriction',
  physical: (p, m) => { p.friction = (p.friction ?? 0.3) * L(0.9, 0.75, m); if (p.contactFriction) p.contactFriction *= L(0.9, 0.75, m); if (p.layer) p.layer.friction *= L(0.9, 0.75, m); },
  desc: (m) => `Contact friction ${pct(L(0.9, 0.75, m) - 1)}: contacts grind away less spin but convert less spin into knockback.` });
def({ id: 'softEdge', name: 'Soft Edge', family: 'defense', kind: 'physical', slots: ['ring', 'disc'], group: 'restitution',
  physical: (p, m) => { p.restitution = (p.restitution ?? 0.5) * L(0.93, 0.82, m); if (p.contactRestitution) p.contactRestitution *= L(0.93, 0.82, m); },
  desc: (m) => `Restitution ${pct(L(0.93, 0.82, m) - 1)}: absorbs impacts instead of bouncing away.` });
def({ id: 'springSteel', name: 'Spring Steel', family: 'offense', kind: 'physical', slots: ['ring'], group: 'restitution',
  physical: (p, m) => { p.restitution = Math.min(0.75, p.restitution * L(1.04, 1.12, m)); },
  desc: (m) => `Restitution ${pct(L(1.04, 1.12, m) - 1)}: livelier rebounds for both tops.` });
def({ id: 'hardenedTip', name: 'Hardened Tip', family: 'endurance', kind: 'physical', slots: ['tip'], group: 'tippatch',
  physical: (p, m) => { p.patchRadius *= L(0.9, 0.74, m); },
  desc: (m) => `Contact patch ${pct(L(0.9, 0.74, m) - 1)}: less spin drag at the floor.` });
def({ id: 'gripCompound', name: 'Grip Compound', family: 'mobility', kind: 'physical', slots: ['tip'], group: 'tipmu',
  physical: (p, m) => { p.mu *= L(1.07, 1.2, m); },
  desc: (m) => `Tip friction ${pct(L(1.07, 1.2, m) - 1)}: stronger traction and acceleration, faster spin loss.` });
def({ id: 'lowFrictionCoat', name: 'Low-Friction Coat', family: 'endurance', kind: 'physical', slots: ['tip'], group: 'tipmu',
  physical: (p, m) => { p.mu *= L(0.93, 0.8, m); },
  desc: (m) => `Tip friction ${pct(L(0.93, 0.8, m) - 1)}: glides with less drag, but grips less when pushed.` });
def({ id: 'tightTeeth', name: 'Tight Teeth', family: 'defense', kind: 'physical', slots: ['lock'], group: 'lockth',
  physical: (p, m) => { p.threshold *= L(1.06, 1.18, m); },
  desc: (m) => `Lock notch threshold ${pct(L(1.06, 1.18, m) - 1)}.` });
def({ id: 'quickSeat', name: 'Quick Seat', family: 'defense', kind: 'physical', slots: ['lock'],
  physical: (p, m) => { p.recovery = (p.recovery || 0) + L(0.2, 0.6, m); },
  desc: (m) => `Partial lock slips reseat ${L(0.2, 0.6, m).toFixed(2)} notches/s faster.` });
def({ id: 'extraNotch', name: 'Extra Notch', family: 'defense', kind: 'physical', slots: ['lock'], rarityMin: 'epic',
  physical: (p) => { p.notches += 1; p.mass += 0.5; },
  desc: () => 'One additional lock notch before a shatter (+0.5 g).' });
def({ id: 'lowProfile', name: 'Low Profile', family: 'defense', kind: 'physical', slots: ['tip', 'lock'],
  physical: (p, m) => { if (p.length) p.length -= L(0.3, 0.9, m); if (p.height) p.height -= L(0.2, 0.6, m); },
  desc: (m) => `Stack height ${(-L(0.3, 0.9, m)).toFixed(1)} mm: lower centre of mass, contacts sit lower.` });

// ================================================================ conditional / static
const cond = (o) => def({ kind: 'conditional', ...o });

// offence
cond({ id: 'predatorsEdge', name: "Predator's Edge", family: 'offense', slots: ['ring'], cond: { type: 'opponentApproaching' },
  fx: (m) => [['faceAngle', L(1.5, 4, m) * D2R]],
  desc: (m) => `${CONDITIONS.opponentApproaching.label()}: blade face ${deg(L(1.5, 4, m))}.` });
cond({ id: 'impactAmplifier', name: 'Impact Amplifier', family: 'offense', slots: ['ring', 'core'], cond: { type: 'always' },
  fx: (m) => [['restitution', L(0.03, 0.09, m)], ['aeroDrag', 0.05]],
  desc: (m) => `Contact restitution ${pct(L(0.03, 0.09, m))}, air drag +5%.` });
cond({ id: 'glancingControl', name: 'Glancing Control', family: 'offense', slots: ['ring'], cond: { type: 'fastMoving' },
  fx: (m) => [['contactFriction', -L(0.1, 0.25, m)]],
  desc: (m) => `${CONDITIONS.fastMoving.label()}: contact friction ${pct(-L(0.1, 0.25, m))} — glancing hits slide off and keep your momentum.` });
cond({ id: 'momentumConversion', name: 'Momentum Conversion', family: 'offense', slots: ['ring', 'core'], cond: { type: 'spinAbove', value: 0.55 },
  fx: (m) => [['contactFriction', L(0.08, 0.2, m)]],
  desc: (m) => `${CONDITIONS.spinAbove.label(0.55)}: contact friction ${pct(L(0.08, 0.2, m))}, converting your spin into opponent knockback.` });
cond({ id: 'counterStrike', name: 'Counter Strike', family: 'offense', slots: ['ring', 'disc'], group: 'whenhit', cond: { type: 'always' },
  fx: (m) => [['restitutionWhenHit', L(0.05, 0.15, m)]],
  desc: (m) => `When struck by a faster opponent: restitution ${pct(L(0.05, 0.15, m))} (sends attackers back).` });
cond({ id: 'efficientImpact', name: 'Efficient Impact', family: 'offense', slots: ['ring', 'core'], cond: { type: 'always' },
  fx: (m) => [['contactFriction', -L(0.06, 0.16, m)], ['restitution', 0.02]],
  desc: (m) => `Contact friction ${pct(-L(0.06, 0.16, m))}, restitution +2%: strikes waste less of your spin.` });
cond({ id: 'edgeHunter', name: 'Edge Hunter', family: 'offense', slots: ['ring', 'tip'], cond: { type: 'opponentNearEdge' },
  fx: (m) => [['steerForce', L(0.1, 0.25, m)], ['faceAngle', 1.5 * D2R]],
  desc: (m) => `${CONDITIONS.opponentNearEdge.label()}: steering force ${pct(L(0.1, 0.25, m))}, blade face +1.5°.` });

// defence
cond({ id: 'bulwark', name: 'Bulwark', family: 'defense', slots: ['disc', 'ring', 'aux'], cond: { type: 'always' },
  fx: (m) => [['nutationDamping', L(2, 5, m)]],
  desc: (m) => `Wobble damping +${L(2, 5, m).toFixed(1)}/s: recovers its axis faster after hits.` });
cond({ id: 'shockAbsorber', name: 'Shock Absorber', family: 'defense', slots: ['ring', 'disc', 'aux'], group: 'whenhit', cond: { type: 'always' },
  fx: (m) => [['restitutionWhenHit', -L(0.08, 0.22, m)]],
  desc: (m) => `When struck: restitution ${pct(-L(0.08, 0.22, m))} — absorbs knockback.` });
cond({ id: 'lockGuard', name: 'Lock Guard', family: 'defense', slots: ['lock', 'core'], cond: { type: 'always' },
  fx: (m) => [['burstThreshold', L(0.06, 0.2, m)]],
  desc: (m) => `Lock strength ${pct(L(0.06, 0.2, m))}.` });
cond({ id: 'recoveryStance', name: 'Recovery Stance', family: 'defense', slots: ['disc', 'tip'], cond: { type: 'afterCollision' },
  fx: (m) => [['nutationDamping', L(4, 10, m)]],
  desc: (m) => `${CONDITIONS.afterCollision.label()}: wobble damping +${L(4, 10, m).toFixed(1)}/s.` });
cond({ id: 'wallGlide', name: 'Wall Glide', family: 'defense', slots: ['ring', 'disc'], cond: { type: 'always' },
  fx: (m) => [['wallFriction', -L(0.15, 0.35, m)], ['wallRestitution', -0.05]],
  desc: (m) => `Wall friction ${pct(-L(0.15, 0.35, m))}, wall restitution -5%: loses less spin against walls.` });
cond({ id: 'anchoredStance', name: 'Anchored Stance', family: 'defense', slots: ['tip'], cond: { type: 'slowMoving' },
  fx: (m) => [['tipFriction', L(0.1, 0.3, m)]],
  desc: (m) => `${CONDITIONS.slowMoving.label()}: tip grip ${pct(L(0.1, 0.3, m))} — resists being shoved.` });

// endurance
cond({ id: 'stillPoint', name: 'Still Point', family: 'endurance', slots: ['tip'], cond: { type: 'slowMoving' },
  fx: (m) => [['tipSpinDrag', -L(0.1, 0.25, m)]],
  desc: (m) => `${CONDITIONS.slowMoving.label()}: tip spin drag ${pct(-L(0.1, 0.25, m))}.` });
cond({ id: 'streamlined', name: 'Streamlined', family: 'endurance', slots: ['ring', 'core', 'disc'], cond: { type: 'always' },
  fx: (m) => [['aeroDrag', -L(0.08, 0.2, m)]],
  desc: (m) => `Air drag ${pct(-L(0.08, 0.2, m))}.` });
cond({ id: 'lateBloom', name: 'Late Bloom', family: 'endurance', slots: ['disc', 'core'], cond: { type: 'spinBelow', value: 0.35 },
  fx: (m) => [['nutationDamping', L(3, 8, m)], ['tipSpinDrag', -0.08]],
  desc: (m) => `${CONDITIONS.spinBelow.label(0.35)}: wobble damping +${L(3, 8, m).toFixed(1)}/s, tip spin drag -8%.` });
cond({ id: 'featherTouch', name: 'Feather Touch', family: 'endurance', slots: ['ring', 'aux'], cond: { type: 'always' },
  fx: (m) => [['grindLoss', -L(0.15, 0.4, m)]],
  desc: (m) => `Minor contacts (slow grinding) lose ${Math.round(L(0.15, 0.4, m) * 100)}% less spin to friction.` });
cond({ id: 'surfaceSkater', name: 'Surface Skater', family: 'endurance', slots: ['tip'], cond: { type: 'surface', value: ['smooth', 'ice'] },
  fx: (m) => [['tipSpinDrag', -L(0.1, 0.25, m)]],
  desc: (m) => `On smooth/ice surfaces: tip spin drag ${pct(-L(0.1, 0.25, m))}.` });

// mobility
cond({ id: 'nimble', name: 'Nimble', family: 'mobility', slots: ['tip', 'disc'], cond: { type: 'always' },
  fx: (m) => [['steerForce', L(0.08, 0.2, m)]],
  desc: (m) => `Steering force ${pct(L(0.08, 0.2, m))}.` });
cond({ id: 'efficientDrive', name: 'Efficient Drive', family: 'mobility', slots: ['core', 'tip'], cond: { type: 'always' },
  fx: (m) => [['steerEfficiency', L(0.1, 0.3, m)]],
  desc: (m) => `Steering costs ${Math.round((1 - 1 / (1 + L(0.1, 0.3, m))) * 100)}% less spin.` });
cond({ id: 'surfaceGrip', name: 'Surface Grip', family: 'mobility', slots: ['tip'], cond: { type: 'surface', value: ['rough', 'standard'] },
  fx: (m) => [['tipFriction', L(0.08, 0.2, m)]],
  desc: (m) => `On standard/rough surfaces: tip grip ${pct(L(0.08, 0.2, m))}.` });
cond({ id: 'orbitalFlow', name: 'Orbital Flow', family: 'mobility', slots: ['tip', 'ring'], cond: { type: 'fastMoving' },
  fx: (m) => [['tipSpinDrag', -L(0.08, 0.18, m)]],
  desc: (m) => `${CONDITIONS.fastMoving.label()}: tip spin drag ${pct(-L(0.08, 0.18, m))} — efficient circling.` });
cond({ id: 'edgeRecovery', name: 'Edge Recovery', family: 'mobility', slots: ['tip', 'disc'], cond: { type: 'nearEdge' },
  fx: (m) => [['steerForce', L(0.2, 0.45, m)], ['tipFriction', 0.1]],
  desc: (m) => `${CONDITIONS.nearEdge.label()}: steering ${pct(L(0.2, 0.45, m))}, tip grip +10%.` });

// technical (ability)
cond({ id: 'abilityFocus', name: 'Ability Focus', family: 'technical', slots: ['core', 'ring'], cond: { type: 'always' },
  fx: (m) => [['abilityDuration', L(0.08, 0.22, m)]],
  desc: (m) => `Bit-Beast ability duration ${pct(L(0.08, 0.22, m))}.` });
cond({ id: 'chargeConduit', name: 'Charge Conduit', family: 'technical', slots: ['core', 'ring', 'disc'], cond: { type: 'always' },
  fx: (m) => [['abilityCharge', L(0.1, 0.3, m)]],
  desc: (m) => `Bit-Beast charge rate ${pct(L(0.1, 0.3, m))}.` });
cond({ id: 'beastAttuned', name: 'Beast Attuned', family: 'technical', slots: ['core'], cond: { type: 'always' },
  fx: (m) => [['abilityPower', L(0.05, 0.15, m)]],
  desc: (m) => `Bit-Beast ability power ${pct(L(0.05, 0.15, m))}.` });

// risk / reward
cond({ id: 'berserker', name: 'Berserker', family: 'risk', slots: ['ring'], cond: { type: 'always' },
  fx: (m) => [['faceAngle', L(2, 4, m) * D2R], ['aeroDrag', 0.12], ['tipSpinDrag', 0.05]],
  desc: (m) => `Blade face ${deg(L(2, 4, m))} — but air drag +12% and tip spin drag +5%.` });
cond({ id: 'lastStand', name: 'Last Stand', family: 'risk', slots: ['ring', 'disc', 'lock', 'tip', 'core'], cond: { type: 'critical' },
  fx: (m) => [['restitution', L(0.06, 0.14, m)], ['faceAngle', 3 * D2R], ['burstThreshold', 0.1]],
  desc: (m) => `${CONDITIONS.critical.label()}: restitution ${pct(L(0.06, 0.14, m))}, blade face +3°, lock strength +10%.` });
cond({ id: 'turtle', name: 'Turtle', family: 'risk', slots: ['disc', 'tip'], cond: { type: 'slowMoving' },
  fx: (m) => [['restitutionWhenHit', -L(0.1, 0.2, m)], ['burstThreshold', 0.1], ['steerForce', -0.15]],
  desc: (m) => `${CONDITIONS.slowMoving.label()}: restitution when struck ${pct(-L(0.1, 0.2, m))}, lock +10%, steering -15%.` });
cond({ id: 'glassCannon', name: 'Glass Cannon', family: 'risk', slots: ['ring', 'lock'], cond: { type: 'always' },
  fx: (m) => [['burstStressDealt', L(0.15, 0.35, m)], ['burstThreshold', -0.15]],
  desc: (m) => `Lock stress dealt ${pct(L(0.15, 0.35, m))}, but your own lock strength -15%.` });
cond({ id: 'wildSpin', name: 'Wild Spin', family: 'risk', slots: ['core', 'disc'], cond: { type: 'always' },
  fx: (m) => [['contactFriction', L(0.1, 0.22, m)], ['nutationDamping', -1]],
  desc: (m) => `Contact friction ${pct(L(0.1, 0.22, m))}, wobble damping -1/s (less stable).` });
cond({ id: 'spinThief', name: 'Spin Thief', family: 'risk', slots: ['ring'], cond: { type: 'oppositeSpin' },
  fx: (m) => [['contactFriction', L(0.12, 0.3, m)]],
  desc: (m) => `${CONDITIONS.oppositeSpin.label()}: contact friction ${pct(L(0.12, 0.3, m))} — co-moving surfaces drag spin toward the slower top.` });

// ================================================================ special (legendary+)
const special = (o) => cond({ special: true, rarityMin: 'legendary', ...o });
special({ id: 'stormHeart', name: 'Storm Heart', family: 'offense', slots: ['ring', 'core'], cond: { type: 'spinAbove', value: 0.6 },
  fx: () => [['faceAngle', 3 * D2R], ['abilityCharge', 0.2]],
  desc: () => `${CONDITIONS.spinAbove.label(0.6)}: blade face +3°, ability charge +20%.` });
special({ id: 'ironWill', name: 'Iron Will', family: 'defense', slots: ['lock', 'disc', 'core'], cond: { type: 'always' },
  fx: () => [['burstThreshold', 0.25], ['nutationDamping', 3]],
  desc: () => 'Lock strength +25%, wobble damping +3/s.' });
special({ id: 'eternalOrbit', name: 'Eternal Orbit', family: 'endurance', slots: ['tip', 'disc'], cond: { type: 'center' },
  fx: () => [['tipSpinDrag', -0.2], ['aeroDrag', -0.1]],
  desc: () => `${CONDITIONS.center.label()}: tip spin drag -20%, air drag -10%.` });
special({ id: 'riftWalker', name: 'Rift Walker', family: 'mobility', slots: ['tip', 'ring'], cond: { type: 'nearEdge' },
  fx: () => [['steerForce', 0.4], ['wallFriction', -0.4]],
  desc: () => `${CONDITIONS.nearEdge.label()}: steering +40%, wall friction -40%.` });
special({ id: 'solarCoreTrait', name: 'Solar Reservoir', family: 'technical', slots: ['core', 'ring'], cond: { type: 'always' },
  fx: () => [['abilityCharge', 0.35], ['abilityPower', 0.1]],
  desc: () => 'Ability charge +35%, ability power +10%.' });
special({ id: 'apexPredator', name: 'Apex Predator', family: 'offense', slots: ['ring'], cond: { type: 'opponentApproaching' },
  fx: () => [['faceAngle', 4 * D2R], ['restitution', 0.08]],
  desc: () => `${CONDITIONS.opponentApproaching.label()}: blade face +4°, restitution +8%.` });
special({ id: 'lastSpinTrait', name: 'Last Spin', family: 'endurance', slots: ['tip', 'core', 'disc'], cond: { type: 'spinBelow', value: 0.15 },
  fx: () => [['tipSpinDrag', -0.4], ['nutationDamping', 8]],
  desc: () => `${CONDITIONS.spinBelow.label(0.15)}: tip spin drag -40%, wobble damping +8/s.` });

// ================================================================ launch (launchers, cables)
const launch = (o) => def({ kind: 'launch', ...o });
launch({ id: 'precisionRelease', name: 'Precision Release', family: 'technical', slots: ['launcher'],
  launch: (m) => ({ window: L(0.12, 0.3, m), perfectBonus: 0.02 }),
  desc: (m) => `Perfect-release window ${pct(L(0.12, 0.3, m))}, perfect launches +2% energy.` });
launch({ id: 'highTorque', name: 'High-Torque Drive', family: 'risk', slots: ['launcher'],
  launch: (m) => ({ power: L(0.04, 0.1, m), wear: 0.4 }),
  desc: (m) => `Launch energy ${pct(L(0.04, 0.1, m))}, but launcher wear +40%.` });
launch({ id: 'stableGrip', name: 'Stable Grip', family: 'technical', slots: ['launcher'],
  launch: (m) => ({ consistency: L(0.12, 0.32, m) }),
  desc: (m) => `Launch angle error ${pct(-L(0.12, 0.32, m))}.` });
launch({ id: 'rapidReset', name: 'Rapid Reset', family: 'technical', slots: ['launcher'],
  launch: (m) => ({ chargeRate: L(0.1, 0.3, m) }),
  desc: (m) => `Charge builds ${pct(L(0.1, 0.3, m))} faster (shorter preparation).` });
launch({ id: 'balancedMechanism', name: 'Balanced Mechanism', family: 'technical', slots: ['launcher'],
  launch: (m) => ({ techniqueVar: -L(0.15, 0.35, m) }),
  desc: (m) => `Technique-specific variance ${pct(-L(0.15, 0.35, m))} for every launch style.` });
launch({ id: 'overdrive', name: 'Overdrive', family: 'risk', slots: ['launcher', 'cable'], group: 'power',
  launch: (m) => ({ power: L(0.05, 0.1, m), window: -0.2 }),
  desc: (m) => `Launch energy ${pct(L(0.05, 0.1, m))}, perfect window -20%.` });
launch({ id: 'snapRelease', name: 'Snap Release', family: 'risk', slots: ['cable'],
  launch: (m) => ({ perfectBonus: L(0.03, 0.07, m), missPenalty: 0.3 }),
  desc: (m) => `Perfect launches ${pct(L(0.03, 0.07, m))} energy; mistimed launches 30% more erratic.` });
launch({ id: 'balancedTension', name: 'Balanced Tension', family: 'technical', slots: ['cable'],
  launch: (m) => ({ consistency: L(0.1, 0.25, m) }),
  desc: (m) => `Launch angle error ${pct(-L(0.1, 0.25, m))}.` });
launch({ id: 'powerConduit', name: 'Power Conduit', family: 'risk', slots: ['cable'], group: 'power',
  launch: (m) => ({ power: L(0.03, 0.08, m), overchargeWear: 0.5 }),
  desc: (m) => `Transfer efficiency ${pct(L(0.03, 0.08, m))}; overcharged launches wear the cable 50% faster.` });
launch({ id: 'featherline', name: 'Featherline', family: 'technical', slots: ['cable'],
  launch: (m) => ({ controlledConsistency: L(0.25, 0.5, m), power: -0.03 }),
  desc: (m) => `Controlled launches ${pct(-L(0.25, 0.5, m))} angle error; launch energy -3%.` });
launch({ id: 'adaptiveGrip', name: 'Adaptive Grip', family: 'technical', slots: ['cable'],
  launch: (m) => ({ techniqueVar: -L(0.15, 0.3, m) }),
  desc: (m) => `Advanced-technique variance ${pct(-L(0.15, 0.3, m))}.` });
launch({ id: 'overchargeTolerance', name: 'Overload Tolerance', family: 'risk', slots: ['launcher', 'cable'],
  launch: (m) => ({ overcharge: L(0.02, 0.05, m) }),
  desc: (m) => `Misfire point +${Math.round(L(0.02, 0.05, m) * 100)}% charge.` });
special({ id: 'phantomStep', name: 'Phantom Step', family: 'technical', slots: ['launcher', 'cable'], kind: 'launch',
  launch: () => ({ window: 0.5, consistency: 0.3 }),
  desc: () => 'Perfect window +50%, launch angle error -30%.' });

// ================================================================ item (durability)
const item = (o) => def({ kind: 'item', ...o });
item({ id: 'reinforced', name: 'Reinforced', family: 'defense', slots: ['ring', 'disc', 'core', 'lock', 'tip', 'aux', 'launcher', 'cable'],
  item: (m) => ({ maxDurability: L(0.1, 0.3, m) }),
  desc: (m) => `Maximum durability ${pct(L(0.1, 0.3, m))}.` });
item({ id: 'resilient', name: 'Resilient', family: 'defense', slots: ['ring', 'disc', 'core', 'lock', 'tip', 'aux', 'launcher', 'cable'],
  item: (m) => ({ wear: -L(0.1, 0.3, m) }),
  desc: (m) => `Takes ${Math.round(L(0.1, 0.3, m) * 100)}% less wear.` });

export const TRAITS = T;
export const TRAIT_INDEX = Object.fromEntries(T.map((t) => [t.id, t]));

export function traitDescription(t) {
  const d = TRAIT_INDEX[t.id];
  if (!d) return '';
  return d.desc(t.mag ?? 1);
}
