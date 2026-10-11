// Rift Run: what the non-battle nodes do (trader, forge, shrine, camp and
// events). Node state (stock, forge uses, what was taken) is stored on the
// node object inside run.map, so it survives reloads and can't be rerolled.

import { FORGE_USES, FORGE_MAX_LEVEL } from '../data/rift.js';
import { CHARM_INDEX } from '../data/riftCharms.js';
import { rollTraderStock, restockPrice, forgePrice, forgeCheck, applyForge, rollShrine, spinWheel, openCuriosity, rollPartChoice, rollCharms, rollCharm, runRng } from './riftLoot.js';
import { spend, takePart, addCharm, heal, maxHearts, loseHeart, bagFull } from './rift.js';

const fail = (reason) => ({ ok: false, reason });

export function findRunItem(run, uid) {
  return [...Object.values(run.equipped), ...run.bag].find((x) => x && x.uid === uid) || null;
}

// ---------------------------------------------------------------- trader

export function traderStock(profile, run, node) {
  if (!node.stock) node.stock = rollTraderStock(profile, run, node);
  return node.stock;
}

export function buy(profile, run, node, i, { dropUid = null } = {}) {
  const o = traderStock(profile, run, node)[i];
  if (!o || o.sold) return fail('Sold out.');
  if (run.shards < o.price) return fail(`Needs ${o.price} shards.`);
  if (o.type === 'part' && bagFull(run) && !dropUid) return fail('bag-full');
  if (o.type === 'heart' && run.hearts >= maxHearts(profile, run)) return fail('Your hearts are already full.');
  if (o.type === 'charm' && run.charms.some((h) => h.id === o.charm.id)) return fail('You already hold this charm.');
  spend(run, o.price);
  if (o.type === 'part') {
    if (bagFull(run)) run.bag = run.bag.filter((x) => x.uid !== dropUid);
    takePart(run, o.item);
  } else if (o.type === 'charm') addCharm(profile, run, o.charm);
  else if (o.type === 'heart') heal(profile, run, 1);
  o.sold = true;
  return { ok: true, offer: o };
}

export function restock(profile, run, node) {
  const cost = restockPrice(profile, run, node);
  if (!spend(run, cost)) return fail(`Needs ${cost} shards.`);
  node.restocks = (node.restocks || 0) + 1;
  node.stock = rollTraderStock(profile, run, node);
  return { ok: true, cost };
}

// ---------------------------------------------------------------- forge

export function forgeState(node) {
  if (node.uses == null) node.uses = node.free ? 1 : FORGE_USES;
  return node;
}

export function forgeCost(profile, run, node, job, item) {
  return node.free ? 0 : forgePrice(profile, run, job, item);
}

export function forgeJob(profile, run, node, job, uid = null, extra = {}) {
  forgeState(node);
  if (node.uses <= 0) return fail('The forge has no more work for you here.');
  const item = uid ? findRunItem(run, uid) : null;
  const err = forgeCheck(run, job, item, extra);
  if (err) return fail(err);
  const cost = forgeCost(profile, run, node, job, item);
  if (!spend(run, cost)) return fail(`Needs ${cost} shards.`);
  applyForge(run, job, item, extra);
  node.uses--;
  return { ok: true, cost, item };
}

// ---------------------------------------------------------------- shrine

export function shrineOffers(profile, run, node) {
  if (!node.offers) node.offers = rollShrine(profile, run, node);
  return node.offers;
}

const NEXT_RARITY = { common: 'rare', rare: 'legendary' };

export function takeShrine(profile, run, node, id) {
  if (node.taken) return fail('The shrine has gone quiet.');
  if (!shrineOffers(profile, run, node).some((o) => o.id === id)) return fail('That bargain is not offered here.');
  const rng = runRng(run, 'shrine-take', node.id);
  let charm = null;
  if (id === 'blood') {
    if (run.hearts < 2) return fail('You need at least two hearts.');
    loseHeart(profile, run);
    run.pending.push({ kind: 'charm', title: 'Blood Pact: choose a legendary charm', options: rollCharms(run, rng, 2, { rarities: ['legendary'] }).map((c) => ({ type: 'charm', charm: c })) });
  } else if (id === 'tithe') {
    if (run.shards < 100) return fail('Needs 100 shards.');
    charm = rollCharm(run, rng, { rarities: ['rare'] });
    if (!charm) return fail('Nothing left to give.');
    spend(run, 100);
    addCharm(profile, run, charm);
  } else if (id === 'transmute') {
    const idx = run.charms.findIndex((h) => NEXT_RARITY[CHARM_INDEX[h.id]?.rarity]);
    if (idx < 0) return fail('You hold no common or rare charm.');
    const old = run.charms[idx];
    charm = rollCharm(run, rng, { rarities: [NEXT_RARITY[CHARM_INDEX[old.id].rarity]], exclude: [old.id] });
    if (!charm) return fail('Nothing to transmute into.');
    run.charms.splice(idx, 1);
    addCharm(profile, run, charm);
  } else if (id === 'curse') {
    charm = rollCharm(run, rng, { rarities: ['cursed'] });
    if (!charm) return fail('You already carry every curse.');
    addCharm(profile, run, charm);
    run.shards += 120;
  }
  node.taken = id;
  return { ok: true, charm };
}

// ---------------------------------------------------------------- camp

export function campRest(profile, run, node) {
  if (node.used) return fail('You already rested here.');
  if (run.hearts >= maxHearts(profile, run)) return fail('Your hearts are already full.');
  heal(profile, run, 1);
  node.used = 'rest';
  return { ok: true };
}

export function campTune(profile, run, node, uid) {
  if (node.used) return fail('You already rested here.');
  const it = findRunItem(run, uid);
  if (!it) return fail('Choose a part.');
  if ((it.forge || 0) >= FORGE_MAX_LEVEL) return fail(`Already at +${FORGE_MAX_LEVEL}.`);
  it.forge = (it.forge || 0) + 1;
  node.used = 'tune';
  return { ok: true, item: it };
}

// ---------------------------------------------------------------- events

export function eventAction(profile, run, node, action) {
  if (node.done) return fail('Nothing more happens here.');
  const out = { ok: true };
  switch (node.event) {
    case 'curiosity':
      if (action !== 'open') break;
      if (!spend(run, 50)) return fail('Needs 50 shards.');
      out.charms = openCuriosity(run);
      for (const c of out.charms) addCharm(profile, run, c);
      break;
    case 'cache':
      if (action !== 'open') break;
      run.pending.push({ kind: 'part', title: 'Hidden Cache: take a part', options: rollPartChoice(profile, run, node, 3) });
      break;
    case 'smith':
      if (action !== 'work') break;
      node.free = true;
      forgeState(node);
      out.forge = true;
      break;
    case 'wheel': {
      if (action !== 'spin') break;
      if (!spend(run, 30)) return fail('Needs 30 shards.');
      const w = spinWheel(run);
      out.wheel = w;
      if (w.kind === 'shards') run.shards += w.amount;
      else if (w.charm) addCharm(profile, run, w.charm);
      break;
    }
    case 'spring':
      if (action !== 'drink') break;
      if (run.hearts < maxHearts(profile, run)) { heal(profile, run, 1); out.healed = 1; } else { run.shards += 40; out.shards = 40; }
      break;
    default:
  }
  if (action !== 'leave' && node.event !== 'smith') node.done = true;
  if (action === 'leave') node.done = true;
  return out;
}
