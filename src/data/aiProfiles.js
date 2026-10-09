// AI personalities. The AI uses exactly the same controls as a player
// (steering, dash, brace, counter, abilities, launch) and the same physics.
// It only observes what the HUD shows (positions, velocities, spin, spirit),
// with a reaction delay. Difficulty comes from these behavioural parameters,
// never from physics advantages.

export const AI_PROFILES = {
  aggressive: {
    name: 'Aggressive Attacker', desc: 'Constant pressure. Hunts collisions and ring-outs, spends spin freely.',
    aggression: 0.95, edgeCaution: 0.35, centerPref: 0.2, risk: 0.7, launchSkill: 0.55, steerSkill: 0.65,
    reaction: 0.22, decisionInterval: 0.18, counterSkill: 0.15, dashUse: 0.85, abilityStyle: 'aggressive', steerEconomy: 0.1,
    technique: ['bank', 'power', 'lance'], lean: 0.2,
  },
  defensive: {
    name: 'Defensive Wall', desc: 'Holds the centre, braces against attacks and counters.',
    aggression: 0.2, edgeCaution: 0.9, centerPref: 0.95, risk: 0.2, launchSkill: 0.6, steerSkill: 0.55,
    reaction: 0.2, decisionInterval: 0.22, counterSkill: 0.55, dashUse: 0.2, abilityStyle: 'conservative', steerEconomy: 0.6,
    technique: ['controlled', 'normal'], lean: 0.05,
  },
  endurance: {
    name: 'Endurance Specialist', desc: 'Avoids contact, saves every joule of spin, outlasts.',
    aggression: 0.08, edgeCaution: 0.8, centerPref: 0.85, risk: 0.15, launchSkill: 0.65, steerSkill: 0.6,
    reaction: 0.2, decisionInterval: 0.25, counterSkill: 0.3, dashUse: 0.1, abilityStyle: 'conservative', steerEconomy: 0.85,
    technique: ['controlled', 'phantom'], lean: 0.02,
  },
  balanced: {
    name: 'Balanced Rival', desc: 'Reads the spin race: attacks when ahead, retreats when behind.',
    aggression: 0.55, edgeCaution: 0.6, centerPref: 0.55, risk: 0.45, launchSkill: 0.65, steerSkill: 0.65,
    reaction: 0.18, decisionInterval: 0.18, counterSkill: 0.4, dashUse: 0.5, abilityStyle: 'opportunistic', steerEconomy: 0.4,
    technique: ['normal', 'bank', 'spiral'], lean: 0.18,
  },
  risky: {
    name: 'Risk-Taking Challenger', desc: 'Overcharged launches, edge plays and all-in abilities.',
    aggression: 0.8, edgeCaution: 0.15, centerPref: 0.25, risk: 0.95, launchSkill: 0.45, steerSkill: 0.6,
    reaction: 0.2, decisionInterval: 0.16, counterSkill: 0.2, dashUse: 0.9, abilityStyle: 'aggressive', steerEconomy: 0.05,
    technique: ['power', 'lance', 'bank'], lean: 0.24,
  },
  technical: {
    name: 'Technical Strategist', desc: 'Perfect launches, precise interceptions, counters timed to the frame.',
    aggression: 0.5, edgeCaution: 0.7, centerPref: 0.6, risk: 0.35, launchSkill: 0.88, steerSkill: 0.85,
    reaction: 0.14, decisionInterval: 0.14, counterSkill: 0.7, dashUse: 0.55, abilityStyle: 'opportunistic', steerEconomy: 0.45,
    technique: ['phantom', 'spiral', 'controlled'], lean: 0.12,
  },
  elite: {
    name: 'Elite Champion', desc: 'Adapts to the spin race, the arena and your habits. Rarely wastes anything.',
    aggression: 0.6, edgeCaution: 0.7, centerPref: 0.6, risk: 0.5, launchSkill: 0.94, steerSkill: 0.92,
    reaction: 0.11, decisionInterval: 0.12, counterSkill: 0.75, dashUse: 0.65, abilityStyle: 'opportunistic', steerEconomy: 0.4,
    technique: ['phantom', 'spiral', 'lance', 'normal'], lean: 0.15,
  },
  dummy: {
    name: 'Training Dummy', desc: 'Does not steer or use abilities.',
    aggression: 0, edgeCaution: 0, centerPref: 0, risk: 0, launchSkill: 0.7, steerSkill: 0, reaction: 1, decisionInterval: 1,
    counterSkill: 0, dashUse: 0, abilityStyle: 'none', steerEconomy: 1, technique: ['controlled'], lean: 0, passive: true,
  },
};

export function scaledProfile(id, difficulty = 1) {
  const p = { ...(AI_PROFILES[id] || AI_PROFILES.balanced), id };
  // difficulty in [0.5, 1.3]: scales skill-type parameters only
  const k = Math.max(0.4, Math.min(1.35, difficulty));
  p.launchSkill = Math.min(0.98, p.launchSkill * k);
  p.steerSkill = Math.min(0.98, p.steerSkill * k);
  p.counterSkill = Math.min(0.95, p.counterSkill * k);
  p.reaction = p.reaction / k;
  return p;
}
