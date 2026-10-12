// Modifier channels and battle conditions shared by traits, sets, synergies,
// relics, Bit-Beast passives and Rift effects. The physics reads the final
// channel values every tick (TopBody.mods); systems/modifiers.js combines the
// sources and clamps them to these limits.

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
