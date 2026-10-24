// Shared by energy.mjs: the legend and relic-build participants of legprobe.mjs.
const ROOT = new URL('../../', import.meta.url).href;
const RELIC_BUILDS = { attack: { ai: "aggressive", spin: "R", technique: "bank", parts: { ring: "emberCrown", core: "zeroPointCore", disc: "bondkeepersSeal", lock: "nullLattice", tip: "skywakeSpindle" } } };
const AI_OF = { Attack: "aggressive", Defense: "defensive", Stamina: "endurance", Balance: "balanced" };
export async function participants(legendId, relicKey) {
  const { newProfile } = await import(ROOT + 'src/systems/profile.js');
  const { createRelicItem } = await import(ROOT + 'src/systems/relics.js');
  const { createItem } = await import(ROOT + 'src/systems/items.js');
  const { buildParticipant } = await import(ROOT + 'src/systems/loadout.js');
  const { BOND_LEVELS } = await import(ROOT + 'src/data/beasts.js');
  const { LEGEND_INDEX } = await import(ROOT + 'src/data/legends.js');
  const prof = newProfile(42);
  prof.relics = prof.relics || { casts: {} };
  prof.relics.casts = prof.relics.casts || {};
  const put = (it) => { prof.inventory[it.uid] = it; return it.uid; };
  const bond5 = BOND_LEVELS[4];
  const L = LEGEND_INDEX[legendId];
  prof.beasts[L.beast] = { id: L.beast, bondXp: bond5, awakened: false };
  prof.beasts.orrery = { id: 'orrery', bondXp: bond5, awakened: false };
  const legL = { id: 'LEG', name: 'Legend', legend: legendId, parts: {}, spin: L.spin, technique: L.technique, beast: L.beast };
  const pl = { ...buildParticipant(prof, legL, { human: false, id: 'legend' }), ai: AI_OF[L.role] || 'balanced', difficulty: 1, name: L.name };
  const R = RELIC_BUILDS[relicKey];
  const parts = {};
  for (const [s, rid] of Object.entries(R.parts)) parts[s] = rid ? put(createRelicItem(prof, rid)) : put(createItem({ base: R.base[s], rarity: 'relic', level: 30, perfect: true, seed: 9, traits: [], special: null, set: null }));
  const relL = { id: 'REL', name: 'Relic', parts, spin: R.spin, technique: R.technique, beast: 'orrery',
    launcher: put(createRelicItem(prof, 'laurelLauncher')), cable: put(createRelicItem(prof, 'rivalbreakerCord')) };
  const pr = { ...buildParticipant(prof, relL, { human: false, id: 'relic' }), ai: R.ai, difficulty: 1, name: 'Relic ' + relicKey };
  return [pl, pr];
}
