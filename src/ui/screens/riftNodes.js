// Rift Run screens for the stops between battles: trader, forge, shrine,
// camp and events. Each acts through systems/riftNodes.js and hands control
// back to the Rift hub when the player leaves.

import { h, btn } from '../ui.js';
import { SLOTS, SLOT_NAMES } from '../../data/parts.js';
import { RARITY_INDEX } from '../../data/rarity.js';
import { TRAIT_INDEX } from '../../data/traits.js';
import { CHARM_INDEX, canEnhance } from '../../data/riftCharms.js';
import { NODE_TYPES, STATUS_IDS, STATUSES, EVENT_INDEX, FORGE_BONUS, FORGE_MAX_LEVEL } from '../../data/rift.js';
import { baseOf } from '../../systems/items.js';
import { riftState, nodeById, maxHearts } from '../../systems/rift.js';
import { restockPrice } from '../../systems/riftLoot.js';
import { traderStock, buy, restock, forgeState, forgeCost, forgeJob, shrineOffers, takeShrine, campRest, campTune, eventAction, eventOptions, findRunItem } from '../../systems/riftNodes.js';
import { flagNotes } from '../../systems/riftFlags.js';
import { offerCard, partCard, charmCard, runStatus, chooseDrop } from './riftReward.js';

const JOB_NAMES = { upgrade: 'Upgrade', reroll: 'Reroll trait', engrave: 'Engrave a trait', infuse: 'Infuse', enhance: 'Enhance charm' };

export class RiftNodeScreen {
  static screenName = 'RiftNodeScreen';
  constructor(hub, node) { this.hub = hub; this.nodeId = node.id; this.sel = null; this.note = null; }
  get P() { return this.app.profile; }
  get run() { return riftState(this.P).active; }
  get node() { return nodeById(this.run, this.nodeId); }

  render() {
    const node = this.node;
    const T = NODE_TYPES[node.type];
    const title = node.type === 'event' ? EVENT_INDEX[node.event]?.name || T.name : T.name;
    const body = node.type === 'trader' ? this.trader() : node.type === 'forge' ? this.forge() : node.type === 'shrine' ? this.shrine() : node.type === 'camp' ? this.camp() : this.event();
    return h('div', { class: 'std-screen rift-node', style: { '--nc': T.color } },
      h('div', { class: 'screen-head' }, h('h1', {}, title), runStatus(this.P, this.run)),
      this.note ? h('div', { class: 'note-box' }, this.note) : null,
      body,
      h('div', { class: 'row gap' }, node.type === 'trader' ? this.restockButton() : null, btn('Leave', () => this.leave(), { class: 'primary', id: 'node-leave', desc: 'Move on to the next floor.' })));
  }

  async after(r, okText) {
    if (!r.ok) { this.ui.toast(r.reason, 'bad', 3500); this.app.audio.ui('error'); return false; }
    this.app.audio.ui('confirm');
    if (okText) this.ui.toast(okText, 'good');
    await this.app.save('silent');
    this.ui.refresh(this);
    if (this.run.pending.length) this.hub.flow();
    return true;
  }

  async leave() {
    if (this.node.type === 'event' && !this.node.done) eventAction(this.P, this.run, this.node, 'leave');
    this.ui.pop();
    await this.hub.leaveNode();
  }

  onBack() { this.leave(); return true; }
  prompts() { return [['confirm', 'Select'], ['back', 'Leave']]; }

  // ---------------------------------------------------------------- trader

  trader() {
    const P = this.P, run = this.run, node = this.node;
    const stock = traderStock(P, run, node);
    const cards = stock.map((o, i) => {
      const short = !o.sold && run.shards < o.price;
      const b = btn(offerCard(P, run, o, { price: o.price, short }), () => this.buy(i), { class: 'loot-btn' + (o.sold ? ' sold' : ''), id: 'buy-' + i, disabled: o.sold || short, desc: o.sold ? 'Sold.' : short ? `Costs ${o.price} shards: you have ${run.shards}.` : `Buy for ${o.price} shards.` });
      return b;
    });
    return h('div', { class: 'col gap trader' }, h('div', { class: 'small muted' }, 'Everything here is for this run only.'),
      h('div', { class: 'loot-row', 'data-wrap': '', 'data-scroll': 'trader' }, cards));
  }

  restockButton() {
    const P = this.P, run = this.run, node = this.node;
    const rp = restockPrice(P, run, node);
    return btn(`Restock (${rp} shards)`, async () => this.after(restock(P, run, node), 'New stock.'), { id: 'restock', disabled: run.shards < rp, desc: 'Replace the whole stock.' });
  }

  async buy(i) {
    const P = this.P, run = this.run, node = this.node;
    let r = buy(P, run, node, i);
    if (!r.ok && r.reason === 'bag-full') {
      const drop = await chooseDrop(this.ui, run);
      if (!drop) return;
      r = buy(P, run, node, i, { dropUid: drop });
    }
    await this.after(r, r.ok ? 'Bought.' : null);
  }

  // ---------------------------------------------------------------- forge

  forge() {
    const P = this.P, run = this.run, node = forgeState(this.node);
    const parts = [...SLOTS.map((s) => run.equipped[s]).filter(Boolean), ...run.bag];
    if (!this.sel || !parts.some((x) => x.uid === this.sel)) this.sel = parts[0]?.uid;
    const it = findRunItem(run, this.sel);
    const list = h('div', { class: 'col gap', 'data-wrap': '' }, parts.map((x) => btn(h('div', { class: 'rift-part-row' }, h('span', { class: 'slot-name' }, run.bag.includes(x) ? 'Bag' : SLOT_NAMES[x.slot]), h('b', { style: { color: RARITY_INDEX[x.rarity].color } }, `${baseOf(x)?.name}${x.forge ? ` +${x.forge}` : ''}`)),
      () => { this.sel = x.uid; this.ui.refresh(this); }, { class: 'tour-btn' + (this.sel === x.uid ? ' sel' : ''), id: 'fp-' + x.uid })));
    const job = (label, j, extra = {}, disabled = false, desc = '') => {
      const cost = forgeCost(P, run, node, j, it);
      return btn(`${label} (${cost ? `${cost} shards` : 'free'})`, async () => this.after(forgeJob(P, run, node, j, j === 'enhance' ? null : it?.uid, extra), `${JOB_NAMES[j]} done.`), { id: `job-${j}${extra.traitIndex ?? ''}${extra.element || ''}${extra.charmIndex ?? ''}`, disabled: disabled || node.uses <= 0 || run.shards < cost, desc });
    };
    const jobs = it ? h('div', { class: 'col gap', 'data-wrap': '' },
      job(`Upgrade to +${(it.forge || 0) + 1}`, 'upgrade', {}, (it.forge || 0) >= FORGE_MAX_LEVEL, FORGE_BONUS[it.slot] ? `At +${(it.forge || 0) + 1}: ${FORGE_BONUS[it.slot].desc((it.forge || 0) + 1)}.` : ''),
      ...(it.traits || []).map((t, k) => job(`Reroll ${TRAIT_INDEX[t.id]?.name || t.id}`, 'reroll', { traitIndex: k }, false, 'Replace this trait with a random one.')),
      job('Engrave a new trait', 'engrave', {}, false, 'Add a random trait (up to one more than its rarity allows).'),
      ...(it.slot === 'ring' ? STATUS_IDS.map((el) => job(`Infuse ${STATUSES[el].name}`, 'infuse', { element: el }, it.element === el, `Hits inflict ${STATUSES[el].name}: ${STATUSES[el].desc}`)) : [])) : null;
    const charms = run.charms.map((hd, k) => ({ hd, k })).filter(({ hd }) => canEnhance(CHARM_INDEX[hd.id]) && !hd.enhanced);
    return h('div', { class: 'col gap' },
      h('div', { class: 'small' }, `Jobs left at this forge: ${node.uses}`),
      h('div', { class: 'ws-cols three' },
        h('div', { class: 'panel scroll' }, h('h3', {}, 'Parts'), list),
        h('div', { class: 'panel scroll', 'data-scroll': 'forge-part' }, it ? partCard(P, run, it, { compare: false }) : h('div', { class: 'muted' }, 'No parts.')),
        h('div', { class: 'panel scroll col gap' }, h('h3', {}, 'Work'), jobs,
          h('h3', {}, 'Enhance a charm'), ...(charms.length ? charms.map(({ hd, k }) => job(`Enhance ${CHARM_INDEX[hd.id].name}`, 'enhance', { charmIndex: k }, false, 'Common and rare charms grow 60% stronger.')) : [h('div', { class: 'small muted' }, 'No common or rare charm to enhance.')]))));
  }

  // ---------------------------------------------------------------- shrine

  shrine() {
    const P = this.P, run = this.run, node = this.node;
    const offers = shrineOffers(P, run, node);
    if (node.taken) return h('div', { class: 'panel' }, h('div', {}, `You made the ${offers.find((o) => o.id === node.taken)?.name || ''} bargain. The shrine falls silent.`));
    return h('div', { class: 'loot-row', 'data-wrap': '' }, offers.map((o) => btn(h('div', { class: 'loot-card shrine-card', style: { '--rc': '#e0466b' } }, h('div', { class: 'lc-top' }, h('span', { class: 'lc-slot' }, 'Bargain')), h('div', { class: 'lc-name' }, o.name), h('div', { class: 'lc-desc' }, o.desc)),
      async () => { const r = takeShrine(P, run, node, o.id); await this.after(r, r.charm ? `${CHARM_INDEX[r.charm.id].name} joins your charms.` : 'Done.'); }, { class: 'loot-btn', id: 'shrine-' + o.id, desc: o.desc })));
  }

  // ---------------------------------------------------------------- camp

  camp() {
    const P = this.P, run = this.run, node = this.node;
    if (node.used) return h('div', { class: 'panel' }, node.used === 'rest' ? 'You rested and recovered a heart.' : 'You tuned a part by the fire.');
    const parts = [...SLOTS.map((s) => run.equipped[s]).filter(Boolean), ...run.bag].filter((x) => (x.forge || 0) < FORGE_MAX_LEVEL);
    return h('div', { class: 'ws-cols two-wide' },
      h('div', { class: 'panel col gap', 'data-wrap': '' }, h('h3', {}, 'Rest'), h('div', { class: 'small' }, 'Sleep by the fire and recover one heart.'),
        btn('Rest (+1 heart)', async () => this.after(campRest(P, run, node), 'Recovered a heart.'), { class: 'primary', id: 'camp-rest', disabled: run.hearts >= maxHearts(P, run), desc: run.hearts >= maxHearts(P, run) ? 'Your hearts are already full.' : 'Recover one heart.' })),
      h('div', { class: 'panel col gap', 'data-wrap': '' }, h('h3', {}, 'Tune'), h('div', { class: 'small' }, 'Raise one part\'s forge level by one, for free.'),
        ...parts.map((x) => btn(`${SLOT_NAMES[x.slot]}: ${baseOf(x)?.name} +${x.forge || 0} → +${(x.forge || 0) + 1}`, async () => this.after(campTune(P, run, node, x.uid), 'Tuned.'), { id: 'tune-' + x.uid, desc: FORGE_BONUS[x.slot] ? FORGE_BONUS[x.slot].desc((x.forge || 0) + 1) : '' }))));
  }

  // ---------------------------------------------------------------- events

  event() {
    const P = this.P, run = this.run, node = this.node;
    const E = EVENT_INDEX[node.event];
    if (PACK_EVENTS.includes(node.event)) return this.packEvent(E);
    if (node.event === 'smith' && node.free) return h('div', { class: 'col gap' }, h('div', { class: 'small' }, 'The smith rolls up their sleeves: one job, free of charge.'), this.forge());
    const act = (label, action, okText, opts = {}) => btn(label, async () => {
      const r = eventAction(P, run, node, action);
      if (r.ok) this.note = describeEvent(r) || okText;
      await this.after(r, null);
    }, { class: 'primary', id: 'ev-' + action, ...opts });
    const actions = {
      curiosity: () => act('Open the box (50 shards)', 'open', 'The box clicks open.', { disabled: run.shards < 50 }),
      cache: () => act('Open the case', 'open', 'You look inside.'),
      smith: () => act('Ask for a job', 'work', 'The smith gets to work.'),
      wheel: () => act('Spin (30 shards)', 'spin', 'The wheel spins.', { disabled: run.shards < 30 }),
      spring: () => act('Drink', 'drink', 'The water is cold and clear.'),
    };
    return h('div', { class: 'panel col gap' }, h('div', {}, E?.desc || ''), node.done ? h('div', { class: 'small muted' }, 'Nothing more happens here.') : actions[node.event]?.());
  }

  // Event pack: one card per choice, gain and cost shown before the pick.
  packEvent(E) {
    const P = this.P, run = this.run, node = this.node;
    const notes = flagNotes(run).map((t) => h('div', { class: 'small', style: { color: '#c6b8ff' } }, t));
    if (node.done) return h('div', { class: 'panel col gap' }, h('div', {}, E.desc), h('div', { class: 'small muted' }, node.result || 'Nothing more happens here.'), ...notes);
    const opts = eventOptions(P, run, node);
    const card = (o) => h('div', { class: 'loot-card shrine-card', style: { '--rc': NODE_TYPES.event.color } },
      ...[h('div', { class: 'lc-top' }, h('span', { class: 'lc-slot' }, 'Choice')), h('div', { class: 'lc-name' }, o.label),
        h('div', { class: 'lc-desc' }, h('b', { style: { color: '#7fe3a8' } }, 'Gain: '), o.gain),
        h('div', { class: 'lc-desc' }, h('b', { style: { color: '#ff7a8a' } }, 'Cost: '), o.cost),
        o.disabled ? h('div', { class: 'small muted' }, o.disabled) : null].filter(Boolean));
    const cards = opts.map((o) => btn(card(o), async () => {
      const r = eventAction(P, run, node, o.action, o.arg);
      if (r.ok) this.note = describeEvent(r);
      await this.after(r, null);
    }, { class: 'loot-btn', id: `ev-${o.action}${o.arg ?? ''}`, disabled: !!o.disabled, desc: o.disabled || `${o.label}. Gain: ${o.gain}. Cost: ${o.cost}.` }));
    return h('div', { class: 'col gap' }, h('div', { class: 'panel' }, E.desc), ...notes,
      cards.length ? h('div', { class: 'loot-row', 'data-wrap': '', 'data-scroll': 'event' }, cards) : h('div', { class: 'small muted' }, 'You have nothing to offer here. Leave when you are ready.'));
  }
}

const PACK_EVENTS = ['gambler', 'echo', 'mirror', 'library', 'arena'];

function describeEvent(r) {
  if (r.text) return r.text;
  if (r.charms) return r.charms.length ? `Inside: ${r.charms.map((c) => CHARM_INDEX[c.id].name).join(', ')}.` : 'The box was empty.';
  if (r.wheel) return r.wheel.kind === 'shards' ? `+${r.wheel.amount} shards!` : r.wheel.charm ? `${r.wheel.kind === 'curse' ? 'Cursed! ' : ''}${CHARM_INDEX[r.wheel.charm.id].name} joins your charms.` : 'Nothing.';
  if (r.healed) return 'You recover a heart.';
  if (r.shards) return `Your hearts are full: +${r.shards} shards instead.`;
  return null;
}

export { charmCard };
