// Launchers and launch cables. Their numbers feed game/launch.js, which turns
// player input (charge, release timing, aim, technique) into the top's
// initial physical state. Launch energy (J) = drive force (N) x cable length (m)
// x transfer efficiency x cable efficiency x charge, and the top's initial spin
// is then sqrt(2E / I3): heavier, high-inertia tops spin slower off the same
// launcher but carry more angular momentum.

export const LAUNCHERS = [
  { id: 'launcher_spark', slot: 'launcher', name: 'Spark Launcher', spinMech: 'R', tier: 1, color: '#4fc3ff',
    drive: { force: 13.0 }, transfer: { efficiency: 0.84 }, trigger: { window: 0.034, jitter: 0.012 }, grip: { stability: 0.55 },
    chargeRate: 0.62, stabilizer: null, desc: 'A dependable starter launcher. Right spin only.' },
  { id: 'launcher_twin', slot: 'launcher', name: 'Twin-Gear Launcher', spinMech: 'dual', tier: 2, color: '#ffd84d',
    drive: { force: 12.5 }, transfer: { efficiency: 0.83 }, trigger: { window: 0.032, jitter: 0.013 }, grip: { stability: 0.6 },
    chargeRate: 0.6, stabilizer: null, desc: 'A switchable gearbox launches either spin direction.' },
  { id: 'launcher_torque', slot: 'launcher', name: 'Torque Driver', spinMech: 'R', tier: 2, color: '#ff6a3d',
    drive: { force: 14.6 }, transfer: { efficiency: 0.82 }, trigger: { window: 0.026, jitter: 0.016 }, grip: { stability: 0.5 },
    chargeRate: 0.52, stabilizer: null, desc: 'Big drive spring: more energy, a narrower release window and slower charge.' },
  { id: 'launcher_precision', slot: 'launcher', name: 'Precision Launcher', spinMech: 'dual', tier: 3, color: '#9fe8ff',
    drive: { force: 12.2 }, transfer: { efficiency: 0.88 }, trigger: { window: 0.044, jitter: 0.008 }, grip: { stability: 0.7 },
    chargeRate: 0.66, stabilizer: { tiltReduce: 0.25 }, desc: 'Fine trigger, built-in stabiliser. Rewards accurate timing.' },
  { id: 'launcher_lefthand', slot: 'launcher', name: 'Mirror Launcher', spinMech: 'L', tier: 2, color: '#b78cff',
    drive: { force: 13.0 }, transfer: { efficiency: 0.85 }, trigger: { window: 0.034, jitter: 0.012 }, grip: { stability: 0.58 },
    chargeRate: 0.62, stabilizer: null, desc: 'Left-spin launcher with a mirrored gear train.' },
  { id: 'launcher_titan', slot: 'launcher', name: 'Titan Grip', spinMech: 'dual', tier: 4, color: '#c7ccd6',
    drive: { force: 15.1 }, transfer: { efficiency: 0.86 }, trigger: { window: 0.03, jitter: 0.012 }, grip: { stability: 0.75 },
    chargeRate: 0.5, stabilizer: { tiltReduce: 0.15 }, desc: 'Heavy-duty two-hand grip. Huge, steady power; slow to wind.' },
];

export const CABLES = [
  { id: 'cable_standard', slot: 'cable', name: 'Standard Cord', tier: 1, color: '#e7e7e7', material: 'Nylon',
    length: 0.3, efficiency: 0.92, flexibility: 0.6, grip: 0.6, directional: 0.6, wearResist: 0.6,
    compat: { normal: 1, power: 1, controlled: 1, bank: 1, spiral: 1, phantom: 1, lance: 1 }, desc: 'A balanced nylon launch cord.' },
  { id: 'cable_long', slot: 'cable', name: 'Long-Pull Cord', tier: 2, color: '#ffe08a', material: 'Braided nylon',
    length: 0.36, efficiency: 0.9, flexibility: 0.55, grip: 0.55, directional: 0.55, wearResist: 0.55,
    compat: { normal: 1, power: 1.1, controlled: 0.95, bank: 1, spiral: 1.1, phantom: 1.1, lance: 1 }, desc: 'Longer pull stores more energy, but takes longer to charge.' },
  { id: 'cable_steel', slot: 'cable', name: 'Steel-Core Line', tier: 3, color: '#aeb7c4', material: 'Steel core',
    length: 0.3, efficiency: 0.95, flexibility: 0.35, grip: 0.7, directional: 0.75, wearResist: 0.85,
    compat: { normal: 1, power: 0.9, controlled: 1.1, bank: 1.15, spiral: 1.1, phantom: 0.95, lance: 1 }, desc: 'Stiff, efficient, durable. Less forgiving on angled techniques.' },
  { id: 'cable_silk', slot: 'cable', name: 'Silkline', tier: 2, color: '#fff3fb', material: 'Synthetic silk',
    length: 0.28, efficiency: 0.9, flexibility: 0.85, grip: 0.75, directional: 0.65, wearResist: 0.4,
    compat: { normal: 1, power: 1.15, controlled: 0.75, bank: 0.85, spiral: 0.8, phantom: 0.8, lance: 0.9 }, desc: 'Supple and consistent across techniques; wears quickly.' },
  { id: 'cable_carbon', slot: 'cable', name: 'Carbon Weave', tier: 4, color: '#3a3a44', material: 'Carbon fibre weave',
    length: 0.33, efficiency: 0.96, flexibility: 0.6, grip: 0.8, directional: 0.8, wearResist: 0.8,
    compat: { normal: 1, power: 0.95, controlled: 0.9, bank: 0.9, spiral: 0.9, phantom: 0.85, lance: 0.9 }, desc: 'Top-grade weave: efficient, steady, long-lasting.' },
];

// Launch techniques. `var` multiplies angle error, `adv` techniques must be learned.
export const TECHNIQUES = [
  { id: 'normal', name: 'Standard Release', adv: false, power: 1, var: 1, window: 1, lean: 1, speed: 1, wear: 1,
    desc: 'Balanced power and control.' },
  { id: 'power', name: 'Power Launch', adv: false, power: 1.1, var: 1.6, window: 0.7, lean: 1.1, speed: 1.2, wear: 1.6,
    desc: '+10% energy, wider angle error, narrower perfect window, extra wear.' },
  { id: 'controlled', name: 'Controlled Launch', adv: false, power: 0.9, var: 0.45, window: 1.25, lean: 0.5, speed: 0.4, wear: 0.8,
    desc: '-10% energy for a precise, upright, slow start. Ideal for endurance tops.' },
  { id: 'bank', name: 'Bank Shot', adv: false, power: 0.97, var: 1.1, window: 1, lean: 1.7, speed: 2.2, wear: 1,
    desc: 'Leaned release that starts flat tips racing immediately.' },
  { id: 'spiral', name: 'Spiral Drive', adv: true, power: 1, var: 1.15, window: 0.85, lean: 1.2, speed: 1.6, wear: 1.1, tangential: true,
    desc: 'Advanced: releases into a circling path around the stadium. Mistimed releases wobble.' },
  { id: 'phantom', name: 'Phantom Release', adv: true, power: 1.05, var: 0.1, window: 0.7, lean: 0, speed: 0.3, wear: 1.2, perfectOnly: true,
    desc: 'Advanced: a perfect release lands dead-upright with +5% energy; anything else is badly off-axis.' },
  { id: 'lance', name: 'Lance Shot', adv: true, power: 0.95, var: 1.2, window: 0.9, lean: 1.3, speed: 2.4, wear: 1.2, aimed: true,
    desc: 'Advanced: fires straight at the opponent\'s launch point for an opening strike.' },
];

export const LAUNCHER_INDEX = Object.fromEntries(LAUNCHERS.map((x) => [x.id, x]));
export const CABLE_INDEX = Object.fromEntries(CABLES.map((x) => [x.id, x]));
export const TECHNIQUE_INDEX = Object.fromEntries(TECHNIQUES.map((x) => [x.id, x]));
