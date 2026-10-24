// Part setup: free fine-tuning sliders on every part, changed any time in
// the Workshop. Each axis is a whole number of steps from -STEPS to +STEPS
// (0 is the part as designed) and is a trade-off, never a free gain: it
// moves a part along a line the physics already prices (more grip is more
// drag, rim weight is more inertia and less agility, and so on).
// Applied in systems/assembly.js after traits, tuning and upgrades, before
// wear. AI opponents use the designed setup (all zero).

export const SETUP_STEPS = 5;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const pct = (x) => `${x > 0 ? '+' : ''}${Math.round(x * 100)}%`;
const num = (x, d = 1) => `${x > 0 ? '+' : ''}${x.toFixed(d)}`;

export const SETUP_AXES = {
  ring: [
    {
      id: 'angle', name: 'Blade angle', low: 'Shallow', high: 'Steep',
      desc: (v) => `Blade face ${num(v * 0.5)}°, air drag ${pct(v * 0.025)}`,
      apply: (p, v) => { p.faceAngle = Math.max(0, (p.faceAngle || 0) + v * 0.5); p.aero = (p.aero || 0.015) * (1 + v * 0.025); },
    },
    {
      id: 'weight', name: 'Weight placement', low: 'Centre', high: 'Rim',
      desc: (v) => `Mass toward the rim ${num(v * 0.012, 3)} (more inertia, slower to react)`,
      apply: (p, v) => { p.massDist = clamp((p.massDist || 0) + v * 0.012, 0.05, 0.95); },
    },
  ],
  disc: [
    {
      id: 'weight', name: 'Weight placement', low: 'Centre', high: 'Rim',
      desc: (v) => `Mass toward the rim ${num(v * 0.015, 3)} (more inertia, slower to react)`,
      apply: (p, v) => { p.massDist = clamp((p.massDist || 0) + v * 0.015, 0.05, 0.95); },
    },
  ],
  tip: [
    // Spin drag is friction x contact radius (physics/simulation.js), so the
    // grip slider moves both the other way round: traction changes, spin drag
    // stays about level. A pure drag dial was a straight win (setupprobe:
    // a slick Pivot Ball took 96% of mirror matches).
    {
      id: 'grip', name: 'Grip', low: 'Slick', high: 'Grippy',
      desc: (v) => `Tip friction ${pct(v * 0.03)}, contact patch ${pct(1 / (1 + v * 0.03) - 1)} (grip moves harder and holds its ground; slick slides away from hits)`,
      apply: (p, v) => { p.mu *= 1 + v * 0.03; p.patchRadius /= 1 + v * 0.03; },
    },
    {
      id: 'height', name: 'Tip height', low: 'Low', high: 'Tall',
      desc: (v) => `Tip length ${num(v * 0.2)} mm (low is steadier, tall reaches over the other ring)`,
      apply: (p, v) => { p.length = Math.max(6, p.length + v * 0.2); },
    },
  ],
  lock: [
    {
      id: 'tension', name: 'Lock tension', low: 'Loose', high: 'Tight',
      desc: (v) => `Lock threshold ${pct(v * 0.015)}, slip recovery ${num(-v * 0.04, 2)}/s`,
      apply: (p, v) => { p.threshold *= 1 + v * 0.015; p.recovery = Math.max(0, (p.recovery || 0) - v * 0.04); },
    },
  ],
  core: [
    {
      id: 'height', name: 'Seat height', low: 'Low', high: 'High',
      desc: (v) => `Core height ${num(v * 0.1)} mm (low is steadier, high reaches further)`,
      apply: (p, v) => { p.height = Math.max(2.5, p.height + v * 0.1); },
    },
  ],
};

export const setupAxes = (slot) => SETUP_AXES[slot] || [];

// A clean copy of an item's setup: known axes only, whole steps in range,
// zeros dropped. Anything else (old saves, edited files) is ignored.
export function cleanSetup(slot, setup) {
  const out = {};
  if (!setup || typeof setup !== 'object') return out;
  for (const ax of setupAxes(slot)) {
    const v = setup[ax.id];
    if (Number.isInteger(v) && v !== 0 && Math.abs(v) <= SETUP_STEPS) out[ax.id] = v;
  }
  return out;
}

export function applySetup(def, slot, setup, notes) {
  for (const ax of setupAxes(slot)) {
    const v = setup?.[ax.id];
    if (!Number.isInteger(v) || v === 0 || Math.abs(v) > SETUP_STEPS) continue;
    ax.apply(def, v);
    notes?.push(`${ax.name} ${v > 0 ? '+' : ''}${v}`);
  }
}
