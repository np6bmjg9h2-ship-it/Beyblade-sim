// Rift Run: what the non-battle nodes do (trader, forge, shrine, camp and
// events). Node state (stock, forge uses, what was taken) is stored on the
// node object inside run.map, so it survives reloads and can't be rerolled.

import { FORGE_USES, FORGE_MAX_LEVEL, EVENT_INDEX } from '../data/rift.js';
import { CHARM_INDEX } from '../data/riftCharms.js';
import { rollTraderStock, restockPrice, forgePrice, forgeCheck, applyForge, rollShrine, spinWheel, openCuriosity, rollPartChoice, rollCharms, rollCharm, rollBoons, runRng } from './riftLoot.js';
import { ECHO_GIFTS } from './riftFlags.js';
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

export function eventAction(profile, run, node, action, arg = null) {
  if (node.done) return fail('Nothing more happens here.');
  if (PACK[node.event] && action !== 'leave') return packAction(profile, run, node, action, arg);
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

// ---------------------------------------------------------------- event pack
// Gambling Spinner, The Echo, Cracked Mirror, Quiet Library, Abandoned Arena.
// eventOptions lists every choice with its gain and cost (and why it is shut)
// before the player picks; packAction resolves it on the run's seeded rng.

const PACK = { gambler: 1, echo: 1, mirror: 1, library: 1, arena: 1 };
const rarityOf = (h) => CHARM_INDEX[h.id]?.rarity;
const charmName = (h) => CHARM_INDEX[h.id]?.name || h.id;
const libraryFee = (run) => EVENT_INDEX.library.fee + EVENT_INDEX.library.feePerAct * run.act;
const scavengeShards = (run) => EVENT_INDEX.arena.scavenge + EVENT_INDEX.arena.scavengePerAct * run.act;
const pct = (x) => `${Math.round(x * 100)}%`;
const lowHearts = (run, n) => (run.hearts <= n ? 'You need more than one heart for this.' : '');

// The Echo's offer: two gifts, rolled once and kept on the node.
export function echoOffers(run, node) {
  if (!node.echoes) node.echoes = runRng(run, 'echo-offer', node.id).shuffle(Object.keys(ECHO_GIFTS)).slice(0, EVENT_INDEX.echo.offers);
  return node.echoes;
}

// Every choice: { action, arg, label, gain, cost, disabled } (disabled = reason or '').
export function eventOptions(profile, run, node) {
  const E = EVENT_INDEX[node.event] || {};
  const o = (action, arg, label, gain, cost, disabled = '') => ({ action, arg, label, gain, cost, disabled });
  const charmsOf = (pred) => run.charms.map((h, i) => ({ h, i })).filter(({ h }) => pred(rarityOf(h)));
  switch (node.event) {
    case 'gambler': return [
      ...charmsOf((r) => NEXT_RARITY[r]).map(({ h, i }) => o('wager', i, `Wager ${charmName(h)}`, `${pct(E.odds)}: a random ${NEXT_RARITY[rarityOf(h)]} charm in its place`, `${pct(1 - E.odds)}: ${charmName(h)} is lost`)),
      o('stake', null, `Bet ${E.stake} shards`, `${pct(E.odds)}: ${E.payout} shards back`, `${E.stake} shards (lost on tails)`, run.shards < E.stake ? `Needs ${E.stake} shards.` : ''),
    ];
    case 'echo': return echoOffers(run, node).map((id) => o('gift', id, `Take the ${ECHO_GIFTS[id].name}`, `Next boss fight only: ${ECHO_GIFTS[id].desc.replace(/\.$/, '')}`, `${E.heartCost} heart now`, run.flags?.echo ? 'You already carry an echo.' : lowHearts(run, E.heartCost)));
    case 'mirror': return [
      ...charmsOf((r) => r === 'common' || r === 'rare').map(({ h, i }) => o('reflect', i, `Reflect ${charmName(h)}`, `A second ${charmName(h)} (counts twice, and for its family)`, 'A random cursed charm comes through the crack')),
      ...charmsOf((r) => r === 'cursed').map(({ h, i }) => o('smash', i, `Smash it on ${charmName(h)}`, `${charmName(h)} is destroyed`, `${E.heartCost} heart`, lowHearts(run, E.heartCost))),
    ];
    case 'library': return [
      o('study', null, 'Study the notes', 'Choose a boon: +1 level', 'Your next elite gains an extra elite trait'),
      o('pay', null, `Pay the librarian (${libraryFee(run)} shards)`, 'Choose a boon: +1 level, quietly', `${libraryFee(run)} shards`, run.shards < libraryFee(run) ? `Needs ${libraryFee(run)} shards.` : ''),
    ];
    case 'arena': return [
      o('fight', null, 'Fight the wounded spinner', `${pct(E.winChance)}: choose one of three parts (better rarity)`, `${pct(1 - E.winChance)}: lose ${E.heartCost} heart`, lowHearts(run, E.heartCost)),
      o('scavenge', null, 'Scavenge the stands', `${scavengeShards(run)} shards`, 'Nothing'),
    ];
    default: return [];
  }
}

function packAction(profile, run, node, action, arg) {
  const opt = eventOptions(profile, run, node).find((x) => x.action === action && (x.arg ?? null) === (arg ?? null));
  if (!opt) return fail('That choice is not offered here.');
  if (opt.disabled) return fail(opt.disabled);
  const E = EVENT_INDEX[node.event];
  const rng = runRng(run, 'event', node.event, node.id);
  const out = { ok: true, choice: action };
  run.flags ||= {};
  if (action === 'wager') {
    const old = run.charms[arg];
    const next = rollCharm(run, rng, { rarities: [NEXT_RARITY[rarityOf(old)]] });
    if (!next) return fail('The spinner has nothing better to put up.');
    out.win = rng.chance(E.odds);
    run.charms.splice(arg, 1);
    if (out.win) { addCharm(profile, run, next); out.charm = next; out.text = `Heads! ${charmName(old)} becomes ${charmName(next)}.`; } else out.text = `Tails. The spinner pockets ${charmName(old)}.`;
  } else if (action === 'stake') {
    spend(run, E.stake);
    out.win = rng.chance(E.odds);
    if (out.win) run.shards += E.payout;
    out.text = out.win ? `Heads! +${E.payout} shards.` : `Tails. ${E.stake} shards gone.`;
  } else if (action === 'gift') {
    loseHeart(profile, run);
    run.flags.echo = arg;
    out.text = `${ECHO_GIFTS[arg].name} follows you. It will fight beside you at the next boss.`;
  } else if (action === 'reflect') {
    const src = run.charms[arg];
    const curse = rollCharm(run, rng, { rarities: ['cursed'] });
    if (!curse) return fail('The crack has no curse left to give you.');
    run.charms.push({ id: src.id, enhanced: false });
    addCharm(profile, run, curse);
    out.charm = curse;
    out.text = `A second ${charmName(src)} joins you, and ${charmName(curse)} with it.`;
  } else if (action === 'smash') {
    const gone = run.charms[arg];
    loseHeart(profile, run);
    run.charms.splice(arg, 1);
    out.text = `The mirror shatters, and ${charmName(gone)} with it.`;
  } else if (action === 'study' || action === 'pay') {
    const options = rollBoons(profile, run, rng);
    if (!options.length) return fail('You already know everything these notes teach.');
    if (action === 'pay') spend(run, libraryFee(run));
    else run.flags.nextEliteAffix = (run.flags.nextEliteAffix || 0) + 1;
    run.pending.push({ kind: 'boon', title: 'Quiet Library: study a boon (+1 level)', options });
    out.text = action === 'pay' ? 'The librarian keeps your secret.' : 'Somewhere, an elite hears you were reading.';
  } else if (action === 'fight') {
    out.win = rng.chance(E.winChance);
    if (out.win) {
      const options = rollPartChoice(profile, run, node, 3, { rarityBoost: 1 });
      if (options.length) run.pending.push({ kind: 'part', title: 'Abandoned Arena: take a part', options });
      out.text = 'The wounded spinner topples. Its case is yours.';
    } else { loseHeart(profile, run); out.text = 'It still has a bite. You limp away a heart lighter.'; }
  } else if (action === 'scavenge') {
    out.shards = scavengeShards(run);
    run.shards += out.shards;
    out.text = `You find ${out.shards} shards under the seats.`;
  }
  node.done = true;
  node.result = out.text;
  return out;
}
