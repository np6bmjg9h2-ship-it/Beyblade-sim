// Workshop operations on item instances. All functions validate, charge
// costs, mutate the profile and return { ok, ... } or { ok:false, reason }.
// Repairs keep identity, XP and history. A free Basic Service always brings a
// part back to 50% so no build can become permanently unusable.

import { RARITY_INDEX, rarityRank } from '../data/rarity.js';
import { TRAIT_INDEX } from '../data/traits.js';
import { UPGRADE_INDEX, MAX_UPGRADES } from '../data/upgrades.js';
import { TUNING_INDEX } from '../data/tuning.js';
import { computeSkillEffects } from '../data/skills.js';
import { eligibleTraits, masteryOf, tuningSlots, baseOf, createItem, itemName } from './items.js';
import { Rng, mixSeeds } from '../core/rng.js';
import { PART_INDEX } from '../data/parts.js';
import { LAUNCHER_INDEX, CABLE_INDEX } from '../data/launchers.js';
import { addItem } from './loot.js';
import { activeLocks } from './tournament.js';

const fail = (reason) => ({ ok: false, reason });

// Tournament rules (e.g. Iron Endurance: no repairs; loadout lock).
function repairBlocked(profile, uid) {
  const lk = activeLocks(profile);
  return !lk.repairs && lk.items.has(uid) ? `${lk.name}: repairs to your tournament loadout are not allowed until you finish or are knocked out.` : null;
}

function econ(profile) { return computeSkillEffects(profile.player.skills).economy; }

export function canAfford(profile, cost) {
  for (const [k, v] of Object.entries(cost)) {
    const have = k === 'credits' ? profile.currency.credits : k === 'research' ? profile.currency.research : profile.materials[k] || 0;
    if (have < v) return false;
  }
  return true;
}

export function pay(profile, cost) {
  for (const [k, v] of Object.entries(cost)) {
    if (k === 'credits') profile.currency.credits -= v;
    else if (k === 'research') profile.currency.research -= v;
    else profile.materials[k] = (profile.materials[k] || 0) - v;
  }
}

export function costText(cost) {
  const names = { credits: 'cr', scrap: 'scrap', polymer: 'polymer', alloy: 'alloy', coreShard: 'core shard', spiritDust: 'spirit dust', relicFragment: 'relic frag.', research: 'research' };
  return Object.entries(cost).filter(([, v]) => v > 0).map(([k, v]) => `${v} ${names[k] || k}`).join(' · ') || 'free';
}

function scaleCost(cost, mul) {
  const out = {};
  for (const [k, v] of Object.entries(cost)) out[k] = Math.max(k === 'credits' ? 0 : v > 0 ? 1 : 0, Math.round(v * mul));
  return out;
}

export function isEquipped(profile, uid) {
  return profile.loadouts.some((L) => Object.values(L.parts).includes(uid) || L.launcher === uid || L.cable === uid);
}

// ------------------------------------------------------------------ repair

export function repairCost(profile, item, target = 1) {
  const cur = item.durability / item.maxDurability;
  const missing = Math.max(0, target - cur) * item.maxDurability;
  if (missing <= 0.01) return { credits: 0 };
  const rr = rarityRank(item.rarity);
  const mul = (1 + rr * 0.25) * (1 + (econ(profile).repairCost || 0));
  const mat = ['launcher', 'disc', 'lock'].includes(item.slot) ? 'alloy' : 'polymer';
  return { credits: Math.round(missing * 1.6 * mul), scrap: Math.ceil(missing / 25), [mat]: missing > 40 ? 1 : 0 };
}

export function repair(profile, uid) {
  const it = profile.inventory[uid];
  if (!it) return fail('Item not found');
  const blocked = repairBlocked(profile, uid);
  if (blocked) return fail(blocked);
  const cost = repairCost(profile, it, 1);
  if (cost.credits === 0) return fail('Already in full condition');
  if (!canAfford(profile, cost)) return fail('Not enough resources: ' + costText(cost));
  pay(profile, cost);
  it.durability = it.maxDurability;
  if (it.parts) for (const k of Object.keys(it.parts)) it.parts[k] = 100;
  it.repairs = (it.repairs || 0) + 1;
  // material fatigue: every full repair costs 1% of max durability (restored by Advanced Restoration)
  it.fatigue = Math.min(0.25, (it.fatigue || 0) + 0.01);
  it.maxDurability = Math.round(baseMaxDurability(it) * (1 - it.fatigue));
  it.durability = it.maxDurability;
  return { ok: true, cost };
}

// Free emergency service: brings an item up to 50% condition.
export function basicService(profile, uid) {
  const it = profile.inventory[uid];
  if (!it) return fail('Item not found');
  const blocked = repairBlocked(profile, uid);
  if (blocked) return fail(blocked);
  const target = 0.5 * it.maxDurability;
  if (it.durability >= target) return fail('Basic Service only restores parts below 50% condition');
  it.durability = target;
  if (it.parts) for (const k of Object.keys(it.parts)) it.parts[k] = Math.max(it.parts[k], 50);
  return { ok: true, cost: {} };
}

export function baseMaxDurability(it) {
  if (it.baseMax) return it.baseMax;
  it.baseMax = Math.round(it.maxDurability / (1 - (it.fatigue || 0)));
  return it.baseMax;
}

export function restoreCost(profile, it) {
  const rr = rarityRank(it.rarity);
  return scaleCost({ credits: 220, alloy: 2, coreShard: 1 }, (1 + rr * 0.3) * (1 + (econ(profile).repairCost || 0)));
}

// Advanced restoration: removes material fatigue and fully repairs.
export function restore(profile, uid) {
  const it = profile.inventory[uid];
  if (!it) return fail('Item not found');
  const blocked = repairBlocked(profile, uid);
  if (blocked) return fail(blocked);
  if (!(it.fatigue > 0) && it.durability >= it.maxDurability) return fail('Nothing to restore');
  const cost = restoreCost(profile, it);
  if (!canAfford(profile, cost)) return fail('Not enough resources: ' + costText(cost));
  pay(profile, cost);
  const base = baseMaxDurability(it);
  it.fatigue = 0;
  it.maxDurability = base;
  it.durability = base;
  if (it.parts) for (const k of Object.keys(it.parts)) it.parts[k] = 100;
  return { ok: true, cost };
}

// ------------------------------------------------------------------ dismantle

export function dismantleYield(it) {
  const R = RARITY_INDEX[it.rarity] || RARITY_INDEX.common;
  const n = R.dismantle;
  const out = { scrap: 2 + n };
  if (['ring', 'tip', 'cable'].includes(it.slot)) out.polymer = Math.ceil(n / 2);
  else out.alloy = Math.ceil(n / 3);
  if (R.rank >= 2) out.coreShard = Math.max(1, Math.floor(n / 4));
  if (R.rank >= 5) out.relicFragment = R.rank - 4;
  out.research = Math.floor((it.xp || 0) / 200) + R.rank;
  return out;
}

export function dismantleNeedsConfirm(it) {
  return rarityRank(it.rarity) >= 2 || masteryOf(it.xp || 0).index >= 2 || it.favourite || !!it.nickname || (it.history?.battles || 0) > 10;
}

export function dismantle(profile, uid) {
  const it = profile.inventory[uid];
  if (!it) return fail('Item not found');
  if (it.locked) return fail('Item is locked');
  if (isEquipped(profile, uid)) return fail('Item is equipped in a loadout');
  if (activeLocks(profile).registered.has(uid)) return fail('Item is registered for your current tournament');
  const y = dismantleYield(it);
  for (const [k, v] of Object.entries(y)) {
    if (k === 'research') profile.currency.research += v;
    else profile.materials[k] = (profile.materials[k] || 0) + v;
  }
  delete profile.inventory[uid];
  pushUndo(profile, { type: 'dismantle', item: it, yield: y, label: `Dismantle ${itemName(it)}` });
  return { ok: true, yield: y };
}

// ------------------------------------------------------------------ upgrades

export function maxUpgrades(it) { return MAX_UPGRADES + (masteryOf(it.xp || 0).index >= 3 ? 1 : 0); }

export function upgradeCost(profile, up, it) {
  return scaleCost(up.cost, (1 + rarityRank(it.rarity) * 0.15) * (1 + (econ(profile).craftCost || 0)));
}

export function applyUpgrade(profile, uid, upId) {
  const it = profile.inventory[uid];
  const up = UPGRADE_INDEX[upId];
  if (!it || !up) return fail('Unknown item or upgrade');
  if (up.slot !== it.slot) return fail('Wrong slot');
  if (it.upgrades.includes(upId)) return fail('Already applied');
  if (it.upgrades.length >= maxUpgrades(it)) return fail(`Upgrade capacity reached (${maxUpgrades(it)})`);
  const cost = upgradeCost(profile, up, it);
  if (!canAfford(profile, cost)) return fail('Not enough resources: ' + costText(cost));
  pay(profile, cost);
  it.upgrades.push(upId);
  if (up.maxDurability) {
    const base = baseMaxDurability(it) * (1 + up.maxDurability);
    it.baseMax = Math.round(base);
    it.maxDurability = Math.round(it.baseMax * (1 - (it.fatigue || 0)));
    it.durability = Math.min(it.durability, it.maxDurability);
  }
  it.history.upgrades = it.history.upgrades || [];
  it.history.upgrades.push({ id: upId, at: Date.now() });
  return { ok: true, cost };
}

// ------------------------------------------------------------------ traits

export function rerollCost(profile, it) {
  const rr = rarityRank(it.rarity);
  const n = it.rerolls || 0;
  return scaleCost({ credits: 150 + 60 * n, coreShard: 1 + Math.floor(n / 2), research: 5 }, (1 + rr * 0.35) * (1 + (econ(profile).craftCost || 0)));
}

export function rerollTrait(profile, uid, index) {
  const it = profile.inventory[uid];
  if (!it) return fail('Item not found');
  const t = it.traits[index];
  if (!t) return fail('No trait in that position');
  const cost = rerollCost(profile, it);
  if (!canAfford(profile, cost)) return fail('Not enough resources: ' + costText(cost));
  const R = RARITY_INDEX[it.rarity];
  const groups = new Set(it.traits.filter((_, i) => i !== index).map((x) => TRAIT_INDEX[x.id]?.group).filter(Boolean));
  const pool = eligibleTraits(it.slot, it.rarity).filter((d) => !it.traits.some((x) => x.id === d.id) && !(d.group && groups.has(d.group)));
  if (!pool.length) return fail('No alternative traits available');
  pay(profile, cost);
  const rng = new Rng(mixSeeds(it.seed, 'reroll', it.rerolls || 0, index));
  const d = rng.pick(pool);
  const old = it.traits[index];
  it.traits[index] = { id: d.id, mag: +rng.range(R.mag[0], R.mag[1]).toFixed(3) };
  it.rerolls = (it.rerolls || 0) + 1;
  profile.discovery.traits[d.id] = true;
  it.history.upgrades = it.history.upgrades || [];
  it.history.upgrades.push({ reroll: `${old.id} → ${d.id}`, at: Date.now() });
  return { ok: true, cost, trait: it.traits[index], old };
}

export function transferCost(profile, donor) {
  return scaleCost({ credits: 200, coreShard: 2, research: 10 }, (1 + rarityRank(donor.rarity) * 0.3) * (1 + (econ(profile).craftCost || 0)));
}

export function traitCapacity(it) { return RARITY_INDEX[it.rarity].traits[1]; }

// Extract a trait from a donor item (consumed) into a target of the same
// slot. Transfer loses 15% magnitude and cannot exceed the target's
// rarity capacity or break exclusivity groups.
export function transferTrait(profile, donorUid, index, targetUid, replaceIndex = null) {
  const donor = profile.inventory[donorUid], target = profile.inventory[targetUid];
  if (!donor || !target) return fail('Item not found');
  if (donorUid === targetUid) return fail('Choose a different donor');
  if (donor.slot !== target.slot) return fail('Donor and target must be the same slot type');
  if (donor.locked) return fail('Donor is locked');
  if (isEquipped(profile, donorUid)) return fail('Donor is equipped');
  const t = donor.traits[index];
  if (!t) return fail('No trait in that position');
  const d = TRAIT_INDEX[t.id];
  if (rarityRank(d.rarityMin) > rarityRank(target.rarity)) return fail(`${d.name} needs a ${RARITY_INDEX[d.rarityMin].name} or rarer item`);
  if (target.traits.some((x) => x.id === t.id)) return fail('Target already has this trait');
  const keep = target.traits.filter((_, i) => i !== replaceIndex);
  if (d.group && keep.some((x) => TRAIT_INDEX[x.id]?.group === d.group)) return fail('Conflicts with an existing trait');
  if (replaceIndex == null && target.traits.length >= traitCapacity(target)) return fail(`Target has no free trait capacity (${traitCapacity(target)} for ${RARITY_INDEX[target.rarity].name})`);
  const cost = transferCost(profile, donor);
  if (!canAfford(profile, cost)) return fail('Not enough resources: ' + costText(cost));
  pay(profile, cost);
  const moved = { id: t.id, mag: +(t.mag * 0.85).toFixed(3) };
  if (replaceIndex != null) target.traits[replaceIndex] = moved; else target.traits.push(moved);
  delete profile.inventory[donorUid];
  target.history.upgrades = target.history.upgrades || [];
  target.history.upgrades.push({ transfer: t.id, from: itemName(donor), at: Date.now() });
  return { ok: true, cost, trait: moved };
}

// ------------------------------------------------------------------ tuning

export function applyTuning(profile, uid, tuningId) {
  const it = profile.inventory[uid];
  const tu = TUNING_INDEX[tuningId];
  if (!it || !tu) return fail('Unknown');
  if (tu.slot !== it.slot) return fail('Wrong slot');
  if (it.tuning.includes(tuningId)) return fail('Already tuned');
  if (it.tuning.length >= tuningSlots(it.xp || 0)) return fail('Reach the next mastery stage to unlock another tuning slot');
  it.tuning.push(tuningId);
  if (tu.maxDurability) { it.baseMax = Math.round(baseMaxDurability(it) * (1 + tu.maxDurability)); it.maxDurability = Math.round(it.baseMax * (1 - (it.fatigue || 0))); it.durability = Math.min(it.durability, it.maxDurability); }
  return { ok: true };
}

// ------------------------------------------------------------------ crafting

export function blueprintCost(profile, base) {
  const tier = base.tier || 1;
  return scaleCost({ credits: 180 * tier, scrap: 6 * tier, polymer: 2 * tier, alloy: tier, research: 8 * tier }, 1 + (econ(profile).craftCost || 0));
}

// Craft a fresh Uncommon copy of a discovered base part (targeted acquisition).
export function craftBlueprint(profile, baseId) {
  const base = PART_INDEX[baseId] || LAUNCHER_INDEX[baseId] || CABLE_INDEX[baseId];
  if (!base) return fail('Unknown blueprint');
  if (!profile.discovery.parts[baseId]) return fail('Discover this part first to unlock its blueprint');
  const cost = blueprintCost(profile, base);
  if (!canAfford(profile, cost)) return fail('Not enough resources: ' + costText(cost));
  pay(profile, cost);
  const counter = profile.seeds.counter = (profile.seeds.counter || 0) + 1;
  const it = createItem({ base: baseId, rarity: 'uncommon', level: profile.player.level, seed: mixSeeds(profile.seeds.loot, counter, 'craft'), source: 'crafted' });
  addItem(profile, it);
  return { ok: true, cost, item: it };
}

export const FORGE_COST = { credits: 600, coreShard: 3, relicFragment: 1, research: 30 };

// Forge: a random Epic-or-better part for a chosen slot.
export function forge(profile, slot, rollLoot) {
  if (!canAfford(profile, FORGE_COST)) return fail('Not enough resources: ' + costText(FORGE_COST));
  pay(profile, FORGE_COST);
  const it = rollLoot(profile, { label: 'Forge', tier: 3, slots: [slot], minRarity: 'epic', level: profile.player.level + 2 });
  addItem(profile, it);
  return { ok: true, item: it };
}

// ------------------------------------------------------------------ personalisation & undo

export function setNickname(profile, uid, name) {
  const it = profile.inventory[uid];
  if (!it) return fail('Item not found');
  const prev = it.nickname;
  it.nickname = name ? String(name).slice(0, 20) : null;
  pushUndo(profile, { type: 'field', uid, field: 'nickname', prev, label: 'Rename' });
  return { ok: true };
}

export function toggleFlag(profile, uid, field) {
  const it = profile.inventory[uid];
  if (!it || !['favourite', 'locked'].includes(field)) return fail('Invalid');
  const prev = !!it[field];
  it[field] = !prev;
  pushUndo(profile, { type: 'field', uid, field, prev, label: field === 'favourite' ? 'Favourite' : 'Lock' });
  return { ok: true, value: it[field] };
}

// Turn a magnet disc over: N face up <-> S face up.
export function flipMagnet(profile, uid) {
  const it = profile.inventory[uid];
  if (!it || !PART_INDEX[it.base]?.magnet) return fail('Only magnet discs can be flipped.');
  const prev = it.pole ?? null;
  it.pole = it.pole === 'S' ? 'N' : 'S';
  pushUndo(profile, { type: 'field', uid, field: 'pole', prev, label: 'Flip magnet' });
  return { ok: true, pole: it.pole };
}

export function equip(profile, loadoutIndex, slot, uid) {
  const L = profile.loadouts[loadoutIndex];
  if (!L) return fail('No loadout');
  if (uid && !profile.inventory[uid]) return fail('Item not found');
  const lk = activeLocks(profile);
  if (lk.lockedLoadout === L.id) return fail(`${lk.name}: this loadout is locked for the tournament.`);
  const prev = slot === 'launcher' ? L.launcher : slot === 'cable' ? L.cable : L.parts[slot];
  if (slot === 'launcher') L.launcher = uid; else if (slot === 'cable') L.cable = uid; else L.parts[slot] = uid;
  pushUndo(profile, { type: 'equip', loadoutIndex, slot, prev, label: `Equip ${slot}` });
  return { ok: true };
}

export function pushUndo(profile, entry) {
  profile.undo = profile.undo || [];
  profile.undo.push(entry);
  while (profile.undo.length > 12) profile.undo.shift();
}

export function undo(profile) {
  const e = profile.undo?.pop();
  if (!e) return fail('Nothing to undo');
  switch (e.type) {
    case 'dismantle': {
      for (const [k, v] of Object.entries(e.yield)) {
        if (k === 'research') { if (profile.currency.research < v) return fail('Research already spent'); profile.currency.research -= v; }
        else { if ((profile.materials[k] || 0) < v) return fail('Materials already spent'); profile.materials[k] -= v; }
      }
      profile.inventory[e.item.uid] = e.item;
      break;
    }
    case 'field': { const it = profile.inventory[e.uid]; if (it) it[e.field] = e.prev; break; }
    case 'equip': {
      const L = profile.loadouts[e.loadoutIndex];
      if (L) { if (e.slot === 'launcher') L.launcher = e.prev; else if (e.slot === 'cable') L.cable = e.prev; else L.parts[e.slot] = e.prev; }
      break;
    }
    default: return fail('Cannot undo');
  }
  return { ok: true, label: e.label };
}

export function bulkDismantleCandidates(profile, maxRarity = 'uncommon') {
  return Object.values(profile.inventory).filter((it) => !it.locked && !it.favourite && !it.nickname && rarityRank(it.rarity) <= rarityRank(maxRarity) && !isEquipped(profile, it.uid) && masteryOf(it.xp || 0).index < 2);
}

export { baseOf };
