// Synergy engine: evaluates data/synergies.js against what a top carries.
// Runs once when a participant is built (or the Workshop shows a loadout),
// never per tick. Output: active rules with the items behind each
// requirement (the synergy graph), rules one requirement away, and the
// effects as modifier sources, reactive triggers and launch / technique /
// status keys for the battle.

import { SYNERGIES, LOOT_REQUIREMENTS } from '../data/synergies.js';
import { TRAIT_INDEX } from '../data/traits.js';
import { SET_INDEX } from '../data/sets.js';
import { BEAST_INDEX } from '../data/beasts.js';
import { CHARM_INDEX, FAMILIES } from '../data/riftCharms.js';
import { rarityRank, RARITY_INDEX } from '../data/rarity.js';
import { MASTERY, masteryOf, baseOf, itemName } from './items.js';
import { resolvePart } from './assembly.js';
import { describe, channelValue, deltasText, effMag } from './effectSpec.js';
import { SLOTS } from '../data/parts.js';

const FAMILY_NAMES = {
  offense: 'Offense', defense: 'Defense', endurance: 'Endurance', mobility: 'Mobility', technical: 'Technical', risk: 'Risk',
  elemental: 'Elemental', mastery: 'Mastery', synergy: 'Synergy', curse: 'Curse',
};
const STATUS_NAMES = { scorch: 'Scorch', static: 'Static', rust: 'Rust' };
const MASTERY_RANK = Object.fromEntries(MASTERY.map((m, i) => [m.id, i]));

// What a top carries. build: { parts: { slot: item|def }, launcher, cable,
// beast: { id }, spin, run? }
export function synergyContext(build) {
  const equipped = [];
  for (const s of SLOTS) if (build.parts?.[s]) equipped.push({ slot: s, item: build.parts[s] });
  if (build.launcher) equipped.push({ slot: 'launcher', item: build.launcher });
  if (build.cable) equipped.push({ slot: 'cable', item: build.cable });
  const items = equipped.filter((e) => e.item?.base); // item instances (defs carry no loot)
  const traits = [];
  for (const { slot, item } of items) {
    for (const t of [...(item.traits || []), ...(item.special ? [item.special] : [])]) {
      const def = TRAIT_INDEX[t.id];
      if (def) traits.push({ id: t.id, def, item, slot, mag: t.mag ?? 1 });
    }
  }
  const parts = {};
  for (const { slot, item } of equipped) {
    if (!SLOTS.includes(slot)) continue;
    try { parts[slot] = item.base ? resolvePart(item) : item; } catch { /* unknown base */ }
  }
  const mass = Object.values(parts).reduce((m, p) => m + (p?.mass || 0), 0);
  const statuses = {};
  for (const t of traits) for (const id of Object.keys(t.def.spec.status || {})) (statuses[id] = statuses[id] || []).push(t.item);
  for (const { item } of items) if (item.element) (statuses[item.element] = statuses[item.element] || []).push(item);
  const charms = build.run?.charms || [];
  return { equipped, items, traits, parts, mass, statuses, beast: build.beast || null, spin: build.spin || 'R', launcher: build.launcher || null, run: build.run || null, charms };
}

const uniq = (xs) => [...new Set(xs)];

// One requirement: { met, have, need, items: contributing items, text }.
export function checkRequirement(q, ctx) {
  const out = (met, items, text, have = met ? 1 : 0, need = 1) => ({ met, items: uniq(items), text, have, need });
  if (q.trait) {
    const hits = ctx.traits.filter((t) => t.id === q.trait);
    return out(hits.length >= (q.count || 1), hits.map((t) => t.item), `${TRAIT_INDEX[q.trait]?.name || q.trait} trait${(q.count || 1) > 1 ? ` ×${q.count}` : ''}`, hits.length, q.count || 1);
  }
  if (q.family) {
    const hits = ctx.traits.filter((t) => t.def.family === q.family);
    return out(hits.length >= q.count, hits.map((t) => t.item), `${q.count} ${FAMILY_NAMES[q.family] || q.family} trait${q.count > 1 ? 's' : ''}`, hits.length, q.count);
  }
  if (q.kind) {
    const hits = ctx.traits.filter((t) => t.def.kind === q.kind);
    return out(hits.length >= q.count, hits.map((t) => t.item), `${q.count} ${q.kind} trait${q.count > 1 ? 's' : ''}`, hits.length, q.count);
  }
  if (q.status) {
    const hits = ctx.statuses[q.status] || [];
    return out(hits.length > 0, hits, `a ${STATUS_NAMES[q.status] || q.status} effect`);
  }
  if (q.set) {
    const hits = ctx.items.filter((e) => e.item.set === q.set).map((e) => e.item);
    return out(hits.length >= q.count, hits, `${q.count} ${SET_INDEX[q.set]?.name || q.set} pieces`, hits.length, q.count);
  }
  if (q.mastery) {
    const hits = ctx.items.filter((e) => masteryOf(e.item.xp || 0).index >= MASTERY_RANK[q.mastery]).map((e) => e.item);
    return out(hits.length >= q.count, hits, `${q.count} parts at ${MASTERY[MASTERY_RANK[q.mastery]].name} mastery`, hits.length, q.count);
  }
  if (q.rarity) {
    const hits = ctx.items.filter((e) => rarityRank(e.item.rarity) >= rarityRank(q.rarity)).map((e) => e.item);
    return out(hits.length >= q.count, hits, `${q.count} ${RARITY_INDEX[q.rarity]?.name || q.rarity}+ items`, hits.length, q.count);
  }
  if (q.curse != null) {
    const hits = ctx.traits.filter((t) => t.def.curse);
    return out(hits.length >= q.curse, hits.map((t) => t.item), `${q.curse} curse${q.curse > 1 ? 's' : ''}`, hits.length, q.curse);
  }
  if (q.tip) {
    const tip = ctx.parts.tip;
    return out(!!tip && q.tip.includes(tip.wear), [ctx.equipped.find((e) => e.slot === 'tip')?.item].filter(Boolean), `a ${q.tip.join(' or ')} tip`);
  }
  if (q.ring) {
    const ring = ctx.parts.ring;
    return out(!!ring && q.ring.includes(ring.role), [ctx.equipped.find((e) => e.slot === 'ring')?.item].filter(Boolean), `a ${q.ring.join(' or ')} ring`);
  }
  if (q.part) {
    const hit = ctx.equipped.find((e) => (e.item.base || e.item.id) === q.part);
    return out(!!hit, hit ? [hit.item] : [], `the ${baseOf({ base: q.part })?.name || q.part}`);
  }
  if (q.mechanism) {
    const P = ctx.parts;
    const has = { magnet: !!P.disc?.magnet, clutch: !!P.tip?.clutch, spring: !!P.tip?.spring, shift: !!P.tip?.shift }[q.mechanism];
    const slot = q.mechanism === 'magnet' ? 'disc' : 'tip';
    return out(!!has, has ? [ctx.equipped.find((e) => e.slot === slot)?.item].filter(Boolean) : [], `a ${q.mechanism} part`);
  }
  if (q.massAbove != null) return out(ctx.mass > q.massAbove, [], `a top over ${q.massAbove} g`);
  if (q.massBelow != null) return out(ctx.mass > 0 && ctx.mass < q.massBelow, [], `a top under ${q.massBelow} g`);
  if (q.spin) return out(ctx.spin === q.spin, [], q.spin === 'L' ? 'left spin' : 'right spin');
  if (q.beastElement) {
    const el = BEAST_INDEX[ctx.beast?.id]?.element;
    return out(!!el && q.beastElement.includes(el), [], `a ${q.beastElement.join(' or ')} Spirit Chip`);
  }
  if (q.launcherMech) {
    const L = baseOf(ctx.launcher) || ctx.launcher;
    return out(L?.spinMech === q.launcherMech, ctx.launcher ? [ctx.launcher] : [], `a ${q.launcherMech === 'dual' ? 'dual-spin' : q.launcherMech + '-spin'} launcher`);
  }
  if (q.charmFamily) {
    const n = ctx.charms.filter((h) => CHARM_INDEX[h.id]?.family === q.charmFamily).length;
    return out(!!ctx.run && n >= q.count, [], `${q.count} ${FAMILIES[q.charmFamily]?.name || q.charmFamily} charms (Rift Run)`, n, q.count);
  }
  if (q.boon) return out(!!ctx.run?.boons?.[q.boon], [], `the ${q.boon} boon (Rift Run)`);
  return out(false, [], 'unknown requirement');
}

export function ruleIsValid(rule) {
  return rule.requires.some((q) => LOOT_REQUIREMENTS.some((k) => q[k] != null));
}

// Text for a rule's effect (generated from its numbers, like traits).
export function synergyEffectText(rule) {
  const e = rule.effect;
  const parts = [];
  if (e.deltas || e.react || e.status) parts.push(describe({ cond: e.cond, deltas: e.deltas, react: e.react, status: e.status }, 1).replace(/\.$/, ''));
  if (e.statusPower) for (const [k, v] of Object.entries(e.statusPower)) parts.push(`your ${STATUS_NAMES[k]} hits ${Math.round(v * 100)}% harder`);
  if (e.statusTime) for (const [k, v] of Object.entries(e.statusTime)) parts.push(`your ${STATUS_NAMES[k]} lasts ${v} s longer`);
  if (e.skill?.dashCooldown) parts.push(`dash cooldown −${Math.round(e.skill.dashCooldown * 100)}%`);
  if (e.launch) parts.push(Object.entries(e.launch).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(', '));
  return parts.join('; ') + '.';
}

// Evaluate every rule. discovered: { id: true } (hidden rules stay unnamed
// in "near" lists until found).
export function evaluateSynergies(ctx, discovered = {}) {
  const active = [], near = [];
  for (const rule of SYNERGIES) {
    const checks = rule.requires.map((q) => checkRequirement(q, ctx));
    const met = checks.filter((c) => c.met).length;
    if (met === checks.length) active.push({ rule, checks, items: uniq(checks.flatMap((c) => c.items)) });
    else if (met === checks.length - 1 && met > 0) near.push({ rule, checks, missing: checks.filter((c) => !c.met), hidden: !!rule.hidden && !discovered[rule.id] });
  }
  return { active, near };
}

// Battle-facing effects of the active rules.
export function synergyEffects(active) {
  const sources = [], reactive = [], launch = {}, skill = {}, status = {}, statusPower = {}, statusTime = {};
  const add = (o, x) => { for (const [k, v] of Object.entries(x || {})) o[k] = (o[k] || 0) + v; };
  for (const { rule } of active) {
    const e = rule.effect;
    const id = 'synergy:' + rule.id;
    if (e.deltas) sources.push({ id, name: rule.name, origin: 'synergy', cond: e.cond || { type: 'always' }, deltas: e.deltas.map(([ch, v]) => [ch, channelValue(ch, v, 1)]) });
    if (e.react) {
      const r = e.react, x = r.effect;
      reactive.push({ id: id + ':react', name: rule.name, origin: 'synergy', r: {
        on: r.on, min: r.min ?? 0, value: r.value ?? null, chance: r.chance ?? 1, cooldown: r.cooldown ?? 0, limit: r.limit ?? Infinity,
        effect: { deltas: x.deltas ? x.deltas.map(([ch, v]) => [ch, channelValue(ch, v, 1)]) : null, duration: x.duration || 0, stacks: x.stacks || 1, spirit: x.spirit || 0, stress: x.stress || 0, spin: x.spin || 0 },
      } });
    }
    add(launch, e.launch); add(skill, e.skill); add(status, e.status); add(statusPower, e.statusPower); add(statusTime, e.statusTime);
  }
  return { sources, reactive, launch, skill, status, statusPower, statusTime, ids: active.map((a) => a.rule.id) };
}

// Readable graph: which items feed each active rule.
export function synergyGraph(result) {
  return result.active.map(({ rule, checks }) => ({
    id: rule.id, name: rule.name,
    edges: checks.map((c) => ({ requirement: c.text, items: c.items.map((it) => itemName(it)) })),
  }));
}

// Everything a carried build adds to a battle beyond its physics: synergy
// effects plus hit statuses from elemental traits (best roll per trait,
// summed per status). `rift` is the block game/riftEffects.js reads; null
// when nothing inflicts a status.
export function buildBattleFx(build, discovered = {}) {
  const ctx = synergyContext(build);
  const result = evaluateSynergies(ctx, discovered);
  const fx = synergyEffects(result.active);
  const best = new Map();
  for (const t of ctx.traits) {
    if (!t.def.status) continue;
    const m = effMag(t.def, t, t.item);
    if (!best.has(t.id) || best.get(t.id).m < m) best.set(t.id, { def: t.def, m });
  }
  const status = { ...fx.status };
  for (const { def, m } of best.values()) for (const [k, v] of Object.entries(def.status(m))) status[k] = (status[k] || 0) + v;
  const anyStatus = Object.values(status).some((v) => v > 0);
  return { ...fx, result, rift: anyStatus ? { status, statusPower: fx.statusPower, statusTime: fx.statusTime } : null };
}

// Synergies that were active in a battle count as discovered (hidden ones
// reveal their names). Returns the names discovered just now.
export function discoverSynergies(profile, ids = []) {
  const d = profile.discovery || (profile.discovery = {});
  const known = d.synergies || (d.synergies = {});
  const found = [];
  for (const id of ids) {
    if (known[id] || !SYNERGIES.some((s) => s.id === id)) continue;
    known[id] = true;
    found.push(SYNERGIES.find((s) => s.id === id).name);
  }
  return found;
}

export { deltasText };
