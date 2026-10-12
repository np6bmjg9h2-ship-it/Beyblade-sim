// Swap comparison: what changes if `candidate` replaces what a loadout has in
// its slot. Everything is measured, not guessed: part rows come from the
// resolved parts (rolled tolerances, physical traits, upgrades, tuning and
// wear included), top rows from the assembled top's physical summary, launch
// rows from the resolved launch gear. Each row says which play roles a higher
// value helps (+1) or hurts (-1); the verdict adds those up, weighted by the
// relative size of each change.

import { SLOTS } from '../data/parts.js';
import { TRAIT_INDEX } from '../data/traits.js';
import { activeSetBonuses } from '../data/sets.js';
import { resolvePart, assembleTop, validateBuild } from './assembly.js';
import { loadoutItems } from './loadout.js';
import { resolveLaunchGear } from '../game/launch.js';

export const ROLES = {
  atk: 'Attack', def: 'Defense', sta: 'Stamina', stb: 'Stability', lock: 'Burst resistance', mob: 'Mobility', pow: 'Launch power', ctl: 'Launch control',
};

const RPM = 60 / (2 * Math.PI);
const f0 = (x) => x.toFixed(0), f1 = (x) => x.toFixed(1), f2 = (x) => x.toFixed(2), f3 = (x) => x.toFixed(3);

// Assembled top. roles: sign per role for a HIGHER value.
const TOP_ROWS = [
  { key: 'estSpinTime', label: 'Free spin (estimate)', unit: 's', fmt: f0, roles: { sta: 1 }, hint: 'How long it would spin alone on a standard floor.' },
  { key: 'critSpin', label: 'Topples below', unit: 'RPM', fmt: (x) => f0(x * RPM), roles: { stb: -1, sta: -1 }, hint: 'Lower is better: stays upright down to a slower spin.' },
  { key: 'I3gcm2', label: 'Spin inertia', unit: 'g·cm²', fmt: f1, roles: { sta: 1, def: 1 }, hint: 'Holds its spin and resists being slowed by hits.' },
  { key: 'massG', label: 'Mass', unit: 'g', fmt: f1, roles: { def: 1, mob: -1 }, hint: 'Heavier is harder to knock away but slower to steer.' },
  { key: 'reachMm', label: 'Reach', unit: 'mm', fmt: f1, roles: { atk: 1 }, hint: 'Longer reach makes contact first.' },
  { key: 'faceDeg', label: 'Blade face', unit: '°', fmt: f1, roles: { atk: 1, sta: -1 }, hint: 'Steeper faces smash harder and cost more of your own spin.' },
  { key: 'catch', label: 'Hook catch', unit: '', fmt: f2, roles: { atk: 1 }, hint: 'How much a hit wrenches the opponent\'s lock.' },
  { key: 'lockNotches', label: 'Lock notches', unit: '', fmt: f0, roles: { lock: 1 }, hint: 'Notches to slip before a shatter.' },
  { key: 'lockStrength', label: 'Lock strength', unit: '', fmt: f2, roles: { lock: 1 }, hint: 'Stress a hit needs to slip a notch.' },
  { key: 'comMm', label: 'Centre of mass height', unit: 'mm', fmt: f1, roles: { stb: -1 }, hint: 'Lower is steadier.' },
  { key: 'eccMm', label: 'Off-centre mass', unit: 'mm', fmt: f2, roles: { stb: -1 }, hint: 'Imbalance makes the top wobble and wander.' },
  { key: 'tipMu', label: 'Tip grip', unit: 'μ', fmt: f2, roles: { mob: 1, sta: -1 }, hint: 'More grip: faster movement, faster spin loss.' },
  { key: 'aeroK', label: 'Air drag', unit: '', fmt: f3, roles: { sta: -1 }, hint: 'Relative air drag (lower keeps spin longer).' },
];

// Per-part rows (resolved part fields). roles as above; info rows have none.
const PART_ROWS = {
  ring: [
    ['mass', 'Mass', 'g', f1, { def: 1, mob: -1 }], ['rOut', 'Reach', 'mm', f1, { atk: 1 }], ['faceAngle', 'Blade face', '°', f1, { atk: 1, sta: -1 }],
    ['slope', 'Upward slope', '°', f1, { atk: 1 }], ['catch', 'Hook catch', '', f2, { atk: 1 }], ['friction', 'Contact friction', '', f2, { atk: 1, sta: -1 }],
    ['restitution', 'Restitution', '', f2, null], ['massDist', 'Rim weighting', '', f2, { sta: 1, def: 1 }], ['aero', 'Air drag', '', f3, { sta: -1 }],
  ],
  core: [['mass', 'Mass', 'g', f1, { def: 1, mob: -1 }], ['radius', 'Radius', 'mm', f1, null], ['ecc', 'Off-centre', 'mm', f2, { stb: -1 }]],
  disc: [
    ['mass', 'Mass', 'g', f1, { def: 1, mob: -1 }], ['massDist', 'Rim weighting', '', f2, { sta: 1, def: 1 }], ['rOut', 'Radius', 'mm', f1, null],
    ['thickness', 'Thickness', 'mm', f1, null], ['ecc', 'Off-centre', 'mm', f2, { stb: -1 }],
  ],
  lock: [['notches', 'Notches', '', f0, { lock: 1 }], ['threshold', 'Strength', '', f2, { lock: 1 }], ['recovery', 'Reseat', '/s', f2, { lock: 1 }], ['mass', 'Mass', 'g', f1, { def: 1, mob: -1 }], ['height', 'Height', 'mm', f1, { stb: -1 }]],
  tip: [
    ['mu', 'Friction', 'μ', f2, { mob: 1, sta: -1 }], ['patchRadius', 'Contact patch', 'mm', f2, { sta: -1 }], ['flatRadius', 'Flat', 'mm', f1, { mob: 1, sta: -1 }],
    ['ballRadius', 'Ball', 'mm', f1, { stb: 1 }], ['length', 'Height', 'mm', f1, { stb: -1 }], ['mass', 'Mass', 'g', f1, { def: 1, mob: -1 }],
  ],
  aux: [['mass', 'Mass', 'g', f1, { def: 1, mob: -1 }]],
};

const GEAR_ROWS = [
  { key: 'energyMax', label: 'Launch energy', unit: 'J', fmt: f2, roles: { pow: 1 }, hint: 'Energy at a full charge.' },
  { key: 'launchRpm', label: 'Your top at full charge', unit: 'RPM', fmt: f0, roles: { pow: 1 }, hint: 'Launch spin of the top in this loadout.' },
  { key: 'windowPct', label: 'Perfect window', unit: '%', fmt: f1, roles: { ctl: 1 }, hint: 'Width of the perfect-release zone.' },
  { key: 'sigmaDeg', label: 'Launch angle error', unit: '°', fmt: f2, roles: { ctl: -1 }, hint: 'Typical tilt error (lower is steadier).' },
  { key: 'chargeRate', label: 'Charge speed', unit: '/s', fmt: f2, roles: { ctl: 1 }, hint: 'How fast the meter fills.' },
];

function rowOf(def, a, b) {
  const d = b - a;
  // a change too small to show at the row's precision counts as no change
  const same = def.fmt(a) === def.fmt(b);
  const signs = Object.values(def.roles || {});
  let tone = 'same';
  if (!same) {
    if (!signs.length) tone = 'info';
    else {
      const s = signs.map((x) => Math.sign(x * d));
      tone = s.every((x) => x > 0) ? 'good' : s.every((x) => x < 0) ? 'bad' : 'mixed';
    }
  }
  const rel = same ? 0 : Math.max(-1, Math.min(1, d / Math.max(Math.abs(a), Math.abs(b), 1e-9)));
  const delta = same ? '' : (d > 0 ? '+' : '−') + def.fmt(Math.abs(d)); // formatters are linear
  return { key: def.key, label: def.label, unit: def.unit, a, b, text: [def.fmt(a), def.fmt(b)], delta, tone, rel, roles: def.roles || null, hint: def.hint || null };
}

function topValues(summary, spec) {
  return {
    ...summary,
    lockStrength: summary.lockThreshold * 1e4,
    aeroK: spec ? spec.aero / Math.pow(spec.radius, 5) : 0,
  };
}

function gearValues(gear, I3) {
  return {
    energyMax: gear.energyMax,
    launchRpm: I3 ? Math.sqrt((2 * gear.energyMax) / I3) * RPM : 0,
    windowPct: gear.window * 100,
    sigmaDeg: (gear.sigma * 180) / Math.PI,
    chargeRate: gear.chargeRate,
  };
}

const allTraits = (it) => (it ? [...(it.traits || []), ...(it.special ? [it.special] : [])] : []);

function traitDiff(cur, cand) {
  const a = new Map(allTraits(cur).map((t) => [t.id, t]));
  const b = new Map(allTraits(cand).map((t) => [t.id, t]));
  const view = (t) => ({ id: t.id, mag: t.mag ?? 1, name: TRAIT_INDEX[t.id]?.name || t.id, desc: TRAIT_INDEX[t.id]?.desc(t.mag ?? 1) || '', special: !!TRAIT_INDEX[t.id]?.special });
  const gained = [], lost = [], changed = [];
  for (const [id, t] of b) {
    if (!a.has(id)) gained.push(view(t));
    else if (Math.abs((a.get(id).mag ?? 1) - (t.mag ?? 1)) > 1e-6) changed.push({ ...view(t), from: a.get(id).mag ?? 1 });
  }
  for (const [id, t] of a) if (!b.has(id)) lost.push(view(t));
  return { gained, lost, changed };
}

function setDiff(beforeItems, afterItems) {
  const key = (x) => `${x.set.id}:${x.tier}`;
  const A = activeSetBonuses(beforeItems).active, B = activeSetBonuses(afterItems).active;
  const ka = new Set(A.map(key)), kb = new Set(B.map(key));
  const view = (x) => ({ set: x.set.id, name: x.set.name, color: x.set.color, tier: x.tier, desc: x.bonus.desc });
  return { gained: B.filter((x) => !ka.has(key(x))).map(view), lost: A.filter((x) => !kb.has(key(x))).map(view) };
}

function verdictOf(rows) {
  const score = {};
  for (const r of rows) {
    if (!r.roles || !r.rel) continue;
    for (const [role, sign] of Object.entries(r.roles)) score[role] = (score[role] || 0) + sign * r.rel;
  }
  const better = [], worse = [];
  for (const [role, s] of Object.entries(score).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]))) {
    if (s > 0.015) better.push(ROLES[role]);
    else if (s < -0.015) worse.push(ROLES[role]);
  }
  return { better, worse, score };
}

const summaryOf = (build, spin) => {
  try { const asm = assembleTop(build, { force: true, spin }); return { summary: asm.summary, spec: asm.spec }; } catch { return null; }
};

// Compare swapping `candidate` (an item, or null to empty an optional slot)
// into slot `slot` of loadout L.
export function compareSwap(profile, L, slot, candidate) {
  const { parts, launcher, cable } = loadoutItems(profile, L);
  return compareBuildSwap({ parts, launcher, cable, spin: L.spin }, slot, candidate);
}

// The same for any build of item instances (Rift runs keep theirs outside
// the inventory): { parts: { slot: item }, launcher, cable, spin }.
export function compareBuildSwap(build, slot, candidate) {
  const { parts, launcher, cable } = build;
  const L = { spin: build.spin || 'R' };
  const isGear = slot === 'launcher' || slot === 'cable';
  const current = slot === 'launcher' ? launcher : slot === 'cable' ? cable : parts[slot];
  const newParts = isGear ? parts : { ...parts, [slot]: candidate };
  const newLauncher = slot === 'launcher' ? candidate : launcher;
  const newCable = slot === 'cable' ? candidate : cable;
  const out = { slot, current, candidate, same: !!(current && candidate && current.uid === candidate.uid), part: [], top: [], gear: [], traits: { gained: [], lost: [], changed: [] }, sets: { gained: [], lost: [] }, verdict: { better: [], worse: [] }, valid: null };

  // the part itself
  if (!isGear && PART_ROWS[slot]) {
    let pa = null, pb = null;
    try { pa = current ? resolvePart(current) : null; pb = candidate ? resolvePart(candidate) : null; } catch { /* unknown base */ }
    for (const [key, label, unit, fmt, roles] of PART_ROWS[slot]) {
      const a = pa?.[key], b = pb?.[key];
      if (typeof a !== 'number' && typeof b !== 'number') continue;
      out.part.push(rowOf({ key, label, unit, fmt, roles }, typeof a === 'number' ? a : 0, typeof b === 'number' ? b : 0));
    }
  }

  // the assembled top
  const before = summaryOf(parts, L.spin), after = summaryOf(newParts, L.spin);
  if (before && after && !isGear) {
    const a = topValues(before.summary, before.spec), b = topValues(after.summary, after.spec);
    out.top = TOP_ROWS.filter((d) => typeof a[d.key] === 'number' && typeof b[d.key] === 'number').map((d) => rowOf(d, a[d.key], b[d.key]));
  }

  // launch gear (launch spin depends on the top's inertia, so parts move it too)
  try {
    const ga = resolveLaunchGear(launcher, cable), gb = resolveLaunchGear(newLauncher, newCable);
    const Ia = before?.summary.I3, Ib = (after || before)?.summary.I3;
    const a = gearValues(ga, Ia), b = gearValues(gb, Ib);
    // for a part swap launch spin only follows from the new inertia: shown, not judged
    out.gear = GEAR_ROWS.filter((d) => isGear || d.key === 'launchRpm').map((d) => rowOf(isGear ? d : { ...d, roles: null }, a[d.key], b[d.key]));
    out.spinMech = { a: ga.spinMech, b: gb.spinMech };
  } catch { /* no gear */ }

  out.traits = traitDiff(current, candidate);
  const equippedNow = [...SLOTS.map((s) => parts[s]), launcher, cable].filter(Boolean);
  const equippedAfter = [...SLOTS.map((s) => (s === slot ? candidate : parts[s])), newLauncher, newCable].filter(Boolean);
  out.sets = setDiff(equippedNow, equippedAfter);
  out.verdict = verdictOf(isGear ? out.gear : out.top.length ? out.top : out.part);

  const gear = (() => { try { return resolveLaunchGear(newLauncher, newCable); } catch { return null; } })();
  out.valid = validateBuild(newParts, { spin: L.spin, launcher: gear ? { spinMech: gear.spinMech } : null });
  return out;
}

// One-line summary for list rows.
export function verdictLine(cmp) {
  if (cmp.same) return 'Equipped';
  const parts = [];
  if (cmp.verdict.better.length) parts.push('+ ' + cmp.verdict.better.slice(0, 2).join(', '));
  if (cmp.verdict.worse.length) parts.push('− ' + cmp.verdict.worse.slice(0, 2).join(', '));
  return parts.join('  ') || 'About the same';
}
