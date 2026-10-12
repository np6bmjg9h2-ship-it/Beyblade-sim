// fast-check generators shared by the property tests (tests/properties-*).
// Everything is built through the game's own pipelines (item generation,
// prototype makers, assembly rules), so a generated value is something the
// game could really produce. FC_RUNS=<n> overrides every run count.

import fc from 'fast-check';
import { PARTS, SLOTS } from '../src/data/parts.js';
import { LAUNCHERS, CABLES } from '../src/data/launchers.js';
import { RARITIES } from '../src/data/rarity.js';
import { validateBuild } from '../src/systems/assembly.js';
import { generateItem } from '../src/systems/itemGen.js';
import { generatePart, GEN_SLOTS } from '../src/systems/partGen.js';

const RUNS = Number(process.env.FC_RUNS) || 0;
export const runs = (n) => RUNS || n;

export const CORE_SLOTS = ['ring', 'core', 'disc', 'lock', 'tip'];
const bySlot = Object.fromEntries(SLOTS.map((s) => [s, PARTS.filter((p) => p.slot === s)]));
export const RARITY_IDS = RARITIES.map((r) => r.id);

export const partChoice = fc.record({
  pick: fc.nat(), rarity: fc.constantFrom(...RARITY_IDS), seed: fc.nat(), level: fc.integer({ min: 1, max: 60 }), proto: fc.nat({ max: 9 }),
});

// A legal build of item instances: compatible frame, socket and disc
// thickness; rolled tolerances and traits; one part in ten a prototype.
export const buildArb = fc.record({
  core: partChoice, ring: partChoice, disc: partChoice, lock: partChoice, tip: partChoice,
  spin: fc.constantFrom('R', 'L'),
}).map((r) => {
  const core = bySlot.core[r.core.pick % bySlot.core.length];
  const fits = {
    core: [core],
    ring: bySlot.ring.filter((p) => p.arch.includes(core.arch)),
    lock: bySlot.lock.filter((p) => p.arch.includes(core.arch)),
    disc: bySlot.disc.filter((p) => core.arch !== 'apex' || p.thickness <= 3.6),
  };
  const lock = fits.lock[r.lock.pick % fits.lock.length];
  fits.tip = bySlot.tip.filter((p) => p.socket === lock.tipSocket);
  const build = {};
  for (const slot of CORE_SLOTS) {
    const c = r[slot];
    let base = slot === 'lock' ? lock : fits[slot][c.pick % fits[slot].length];
    if (c.proto === 0 && GEN_SLOTS.includes(slot) && slot !== 'core' && slot !== 'lock') {
      const proto = generatePart(c.seed, slot, `proto_${slot}_${c.seed}`);
      if ((slot !== 'ring' || proto.arch?.includes(core.arch)) && (slot !== 'tip' || proto.socket === lock.tipSocket)) base = proto;
    }
    build[slot] = generateItem({ base, rarity: c.rarity, level: c.level, seed: c.seed, source: 'property test' });
  }
  return { build, spin: r.spin };
}).filter(({ build, spin }) => validateBuild(build, { spin }).ok);

// Launcher and cable items that can launch the given spin direction.
export const gearArb = (spin) => fc.record({ l: partChoice, c: partChoice }).map(({ l, c }) => {
  const ls = LAUNCHERS.filter((x) => x.spinMech === 'dual' || x.spinMech === spin);
  return {
    launcher: generateItem({ base: ls[l.pick % ls.length], rarity: l.rarity, level: l.level, seed: l.seed, source: 'property test' }),
    cable: generateItem({ base: CABLES[c.pick % CABLES.length], rarity: c.rarity, level: c.level, seed: c.seed, source: 'property test' }),
  };
});

// Any base the loot tables can drop, or a generated prototype.
const ALL_BASES = [...PARTS, ...LAUNCHERS, ...CABLES];
export const baseArb = fc.oneof(
  { weight: 5, arbitrary: fc.nat().map((i) => ALL_BASES[i % ALL_BASES.length]) },
  { weight: 1, arbitrary: fc.record({ seed: fc.nat(), slot: fc.constantFrom(...GEN_SLOTS) }).map(({ seed, slot }) => generatePart(seed, slot, `proto_${slot}_${seed}`)) },
);

export const genOptsArb = fc.record({
  base: baseArb, rarity: fc.constantFrom(...RARITY_IDS), level: fc.integer({ min: 1, max: 60 }), seed: fc.nat(),
  noCurse: fc.boolean(), tier: fc.integer({ min: 0, max: 4 }),
});
