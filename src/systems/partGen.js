// Prototype part generator for the Daily Store: brand-new rings, discs,
// tips, locks and launchers designed by the game each day from a seed. Every
// number is drawn inside the ranges of the real catalogue (data/parts.js,
// data/launchers.js) and tied together the way the catalogue is (heavier
// rings carry their mass outward, stronger launchers have narrower windows),
// so a prototype is new without being strictly better than what exists.
//
// A generated definition travels inside its item (item.def), so assembly,
// launch gear, the renderer (parametric models) and background workers all
// work without a registry.

import { Rng } from '../core/rng.js';

const PREFIX = ['Nova', 'Vortex', 'Hyper', 'Zenith', 'Crimson', 'Phantom', 'Thunder', 'Glacier', 'Inferno', 'Astral', 'Neon', 'Titan', 'Cyber', 'Storm',
  'Solar', 'Lunar', 'Onyx', 'Quantum', 'Sonic', 'Turbo', 'Rogue', 'Omega', 'Ultra', 'Shadow', 'Aurora', 'Blaze', 'Frost', 'Volt', 'Echo', 'Rift'];
const RING_NOUN = {
  attack: ['Fang', 'Saw', 'Edge', 'Lance', 'Claw', 'Razor'], defense: ['Bulwark', 'Crown', 'Wall', 'Aegis', 'Shell'], stamina: ['Halo', 'Drift', 'Orbit', 'Wave'],
  upper: ['Wing', 'Flare', 'Updraft', 'Rise'], burst: ['Talon', 'Hook', 'Maw', 'Jaw'], balance: ['Arc', 'Comet', 'Prism', 'Star'],
};
const TIP_NOUN = { sharp: ['Needle', 'Point', 'Spike'], ball: ['Dome', 'Ball', 'Pearl'], flat: ['Flat', 'Strike', 'Rush'], rubber: ['Grip', 'Treads', 'Tyre'], semi: ['Semi', 'Glide', 'Step'] };
const DISC_NOUN = ['Disc', 'Weight', 'Plate', 'Wheel'];
const LOCK_NOUN = ['Lock', 'Clasp', 'Latch', 'Seal'];
const LAUNCHER_NOUN = ['Launcher', 'Shooter', 'Driver', 'Grip'];

const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;
const r3 = (x) => Math.round(x * 1000) / 1000;
function hue(rng) {
  const h = rng.next(), s = 0.7 + rng.next() * 0.2, l = 0.5 + rng.next() * 0.12;
  const f = (n) => { const k = (n + h * 12) % 12; const a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
  return '#' + [f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('');
}
const nameOf = (rng, nouns) => `${rng.pick(PREFIX)} ${rng.pick(nouns)}`;
const common = (rng, slot, id, name) => ({ id, slot, name, tier: 3, generated: true, series: 'proto', designer: 'Rift Lab AI', color: hue(rng) });

// ------------------------------------------------------------ rings

const RING_ROLES = ['attack', 'attack', 'defense', 'stamina', 'upper', 'burst', 'balance'];
function ring(rng, id) {
  const role = rng.pick(RING_ROLES);
  const v = (a, b) => rng.range(a, b);
  let d;
  if (role === 'attack') {
    const rOut = v(25, 26.5);
    d = { spin: rng.pick(['R', 'R', 'L', 'dual']), blades: rng.int(3, 6), bladeWidth: v(0.35, 0.55), faceAngle: v(12, 18), slope: 0, restitution: v(0.5, 0.57), friction: v(0.22, 0.28), catch: v(0.45, 0.65), aero: v(0.018, 0.03), massDist: v(0.15, 0.3), mass: v(14, 17), rOut, rBase: rOut - v(3.5, 4.5), thickness: v(5.5, 6.5) };
  } else if (role === 'defense') {
    const rOut = v(24, 25), smooth = rng.chance(0.4);
    d = { spin: 'dual', blades: smooth ? 0 : rng.int(3, 8), bladeWidth: v(0.6, 0.8), faceAngle: smooth ? 0 : v(0, 6), slope: v(-10, 0), restitution: v(0.38, 0.46), friction: v(0.15, 0.22), catch: v(0.1, 0.25), aero: v(0.009, 0.015), massDist: v(0.4, 0.6), mass: v(18, 23), rOut, rBase: smooth ? rOut : rOut - v(0.5, 1.5), thickness: v(6.5, 7.5) };
  } else if (role === 'stamina') {
    const rOut = v(24, 25);
    d = { spin: 'dual', blades: rng.int(0, 6), bladeWidth: v(0.6, 0.75), faceAngle: v(2, 6), slope: 0, restitution: v(0.45, 0.52), friction: v(0.13, 0.18), catch: v(0.15, 0.3), aero: v(0.008, 0.012), massDist: v(0.5, 0.75), mass: v(13, 16), rOut, rBase: rOut - v(1, 1.5), thickness: v(5.5, 6.5) };
    if (d.blades === 0) d.rBase = d.rOut;
  } else if (role === 'upper') {
    const rOut = v(25, 26);
    d = { spin: rng.pick(['R', 'L']), blades: rng.int(2, 4), bladeWidth: v(0.45, 0.55), faceAngle: v(8, 12), slope: v(12, 18), restitution: v(0.48, 0.53), friction: v(0.22, 0.26), catch: v(0.45, 0.55), aero: v(0.018, 0.024), massDist: v(0.15, 0.25), mass: v(14.5, 16), rOut, rBase: rOut - v(3.5, 5), thickness: v(5.8, 6.5) };
  } else if (role === 'burst') {
    d = { spin: rng.pick(['R', 'L']), blades: rng.int(2, 3), bladeWidth: v(0.42, 0.46), faceAngle: v(14, 16.5), slope: 0, restitution: v(0.5, 0.53), friction: v(0.26, 0.28), catch: v(0.68, 0.8), aero: v(0.024, 0.027), massDist: v(0.15, 0.25), mass: v(16, 17.5), rOut: v(25.8, 26.2), rBase: v(21, 21.6), thickness: v(6, 6.6) };
  } else {
    d = { spin: 'dual', blades: rng.int(3, 5), bladeWidth: v(0.5, 0.56), faceAngle: v(9, 13), slope: 0, restitution: v(0.5, 0.53), friction: v(0.19, 0.23), catch: v(0.4, 0.52), aero: v(0.013, 0.017), massDist: v(0.25, 0.35), mass: v(14.5, 16), rOut: v(24.7, 25.3), rBase: v(22.2, 22.8), thickness: v(5.8, 6.4) };
  }
  // the rolled value is the physical hit band; the drawn plate is thin, as on
  // real attack rings (about 6% of the diameter)
  d.hitBand = d.thickness;
  d.thickness = d.hitBand * (role === 'defense' ? 0.49 : 0.47);
  const thin = d.hitBand <= 6.1 && d.mass <= 16;
  const def = {
    ...common(rng, 'ring', id, nameOf(rng, RING_NOUN[role])), role,
    arch: thin ? ['helix', 'quad', 'apex'] : ['helix', 'quad'],
    spin: d.spin, mass: r1(d.mass), rIn: 11, rOut: r1(d.rOut), rBase: r1(d.rBase), blades: d.blades, bladeWidth: r2(d.bladeWidth), faceAngle: r1(d.faceAngle),
    slope: r1(d.slope), thickness: r1(d.thickness), hitBand: r1(d.hitBand), restitution: r2(d.restitution), friction: r2(d.friction), catch: r2(d.catch), aero: r3(d.aero), massDist: r2(d.massDist),
  };
  const spinTxt = def.spin === 'dual' ? 'either spin' : def.spin === 'R' ? 'right spin' : 'left spin';
  const lines = {
    attack: `${def.blades} blades with ${def.faceAngle.toFixed(0)}° strike faces for ${spinTxt}. Hits hard, costs spin.`,
    defense: def.blades ? `${def.blades} low studs on a heavy guard (${def.mass} g). Turns hits aside.` : `A smooth heavy guard (${def.mass} g). Turns hits aside.`,
    stamina: `Light and rim-weighted for long spins, with soft ${def.blades ? `${def.blades}-crest ` : ''}contact.`,
    upper: `${def.blades} raked blades with a ${def.slope.toFixed(0)}° upward slope: lifts the opponent.`,
    burst: `${def.blades} deep hooks for ${spinTxt} that wrench the other lock.`,
    balance: `${def.blades} symmetric arcs: steady hits in either spin.`,
  };
  def.desc = `Prototype ${role} ring. ${lines[role]}`;
  return def;
}

// ------------------------------------------------------------ discs

function disc(rng, id) {
  const rOut = rng.range(18, 23), thickness = rng.range(2.2, 4), massDist = rng.range(0, 0.85);
  const mass = Math.min(28, Math.max(11, 10 + (rOut - 18) * 1.4 + (thickness - 2.2) * 5.8 + rng.range(-1.5, 1.5)));
  const def = { ...common(rng, 'disc', id, nameOf(rng, DISC_NOUN)), mass: r1(mass), rIn: 6, rOut: r1(rOut), thickness: r1(thickness), massDist: r2(massDist), contact: rOut >= 22, auxPort: rng.chance(0.12) };
  if (def.contact) { def.contactRestitution = r2(rng.range(0.4, 0.46)); def.contactFriction = r2(rng.range(0.2, 0.25)); }
  if (rng.chance(0.15)) def.ecc = r2(rng.range(0.08, 0.16));
  def.desc = `Prototype disc: ${def.mass} g, ${massDist > 0.6 ? 'rim-heavy for big spin inertia' : massDist < 0.25 ? 'compact and centred' : 'balanced'}${def.contact ? ', with a rim that takes low hits' : ''}${def.ecc ? ', off-centre weight that makes it walk' : ''}${def.auxPort ? ', skirt mount for modules' : ''}.`;
  return def;
}

// ------------------------------------------------------------ tips

function tip(rng, id) {
  const kind = rng.pick(['sharp', 'ball', 'flat', 'rubber', 'semi']);
  const v = (a, b) => rng.range(a, b);
  const T = {
    sharp: { ballRadius: v(0.45, 0.6), flatRadius: 0, mu: v(0.15, 0.22), patchRadius: v(0.25, 0.45), compliance: 0.12, wear: 'sharp' },
    ball: { ballRadius: v(1.8, 3.6), flatRadius: 0, mu: v(0.18, 0.24), patchRadius: v(0.8, 1.3), compliance: 0.12, wear: 'ball' },
    flat: { ballRadius: v(0.7, 1.0), flatRadius: v(1.6, 3.0), mu: v(0.24, 0.3), patchRadius: v(0.6, 0.85), compliance: 0.12, wear: 'flat' },
    rubber: { ballRadius: v(0.8, 1.2), flatRadius: v(2.0, 2.9), mu: v(0.38, 0.46), patchRadius: v(0.9, 1.0), compliance: v(0.16, 0.18), restitution: 0.6, wear: 'rubber' },
    semi: { ballRadius: v(0.9, 1.2), flatRadius: v(0.8, 1.2), mu: v(0.18, 0.22), patchRadius: v(0.3, 0.6), compliance: 0.13, wear: 'flat' },
  }[kind];
  const def = { ...common(rng, 'tip', id, nameOf(rng, TIP_NOUN[kind])), socket: 'std', mass: r1(v(2.5, 4)), length: r1(v(9.2, 10.8)), bodyRadius: r1(v(6, 7)) };
  for (const [k, x] of Object.entries(T)) def[k] = typeof x === 'number' ? r2(x) : x;
  const what = { sharp: 'a hardened point for endurance', ball: 'a rounded ball that resists toppling', flat: 'a hard flat for fast movement', rubber: 'high-grip rubber: explosive but draining', semi: 'a small flat: controllable movement' }[kind];
  def.desc = `Prototype tip: ${what} (friction ${def.mu}).`;
  return def;
}

// ------------------------------------------------------------ locks

function lock(rng, id) {
  const notches = rng.int(2, 5);
  const def = {
    ...common(rng, 'lock', id, nameOf(rng, LOCK_NOUN)), arch: notches >= 5 ? ['quad'] : rng.pick([['helix', 'quad', 'apex'], ['helix', 'quad'], ['helix', 'apex']]),
    mass: r1(2.5 + notches * 0.7 + rng.range(-0.3, 0.3)), radius: r1(rng.range(9.5, 10.5)), height: r1(rng.range(5, 6.5)), notches,
    threshold: r2(1.5 + notches * 0.12 + rng.range(-0.06, 0.06)), recovery: r2(rng.range(0.15, 1.0)), tipSocket: 'std', auxPort: rng.chance(0.15),
  };
  def.desc = `Prototype lock: ${notches} notches, ${def.recovery > 0.6 ? 'springy teeth that reseat fast' : 'firm teeth'}${def.auxPort ? ', band mount for modules' : ''}.`;
  return def;
}

// ------------------------------------------------------------ launchers

function launcher(rng, id) {
  const force = rng.range(12, 15);
  const def = {
    ...common(rng, 'launcher', id, nameOf(rng, LAUNCHER_NOUN)), spinMech: rng.pick(['R', 'R', 'L', 'dual', 'dual']),
    drive: { force: r1(force) }, transfer: { efficiency: r2(rng.range(0.82, 0.88)) },
    trigger: { window: r3(Math.max(0.024, 0.06 - (force - 12) * 0.009 + rng.range(-0.004, 0.004))), jitter: r3(rng.range(0.008, 0.016)) },
    grip: { stability: r2(rng.range(0.5, 0.8)) }, chargeRate: r2(Math.max(0.45, 0.75 - (force - 12) * 0.07 + rng.range(-0.03, 0.03))),
    stabilizer: rng.chance(0.2) ? { tiltReduce: r2(rng.range(0.1, 0.25)) } : null,
  };
  if (rng.chance(0.15)) def.speedMul = r2(rng.range(1.15, 1.35));
  if (rng.chance(0.1)) def.readout = true;
  if (!def.speedMul && rng.chance(0.08)) def.fixedPower = true;
  const spin = def.spinMech === 'dual' ? 'either spin' : def.spinMech === 'R' ? 'right spin' : 'left spin';
  def.desc = `Prototype launcher for ${spin}: drive ${def.drive.force} N, ${force > 14 ? 'big power and a tight window' : force < 12.8 ? 'gentle power and a forgiving window' : 'balanced power'}${def.stabilizer ? ', built-in stabiliser' : ''}${def.speedMul ? ', catapult release' : ''}${def.readout ? ', LCD readout' : ''}${def.fixedPower ? ', wind-up spring (never overcharges)' : ''}.`;
  return def;
}

const MAKERS = { ring, disc, tip, lock, launcher };
export const GEN_SLOTS = Object.keys(MAKERS);

// One prototype definition for a slot from a seed.
export function generatePart(seed, slot, id) {
  const rng = new Rng(seed);
  return MAKERS[slot](rng, id);
}
