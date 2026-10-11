// Shop: packs, capsules, bundles, crates and daily deals for credits (CR),
// with the odds printed on every sealed offer, and a reveal screen that
// opens what you bought (rarest last).

import { h, btn } from '../ui.js';
import { itemCard } from '../widgets.js';
import { RARITY_INDEX, rarityRank } from '../../data/rarity.js';
import { STORE_TABS, OFFERS } from '../../data/store.js';
import { offerOdds, buyOffer, buyDeal, dailyDeals, markDealsSeen, dayKey, storeState } from '../../systems/store.js';

const KIND_NAMES = { pack: 'Pack', capsule: 'Capsule', bundle: 'Bundle', crate: 'Crate' };
const MAT_NAMES = { scrap: 'Scrap', polymer: 'Polymer', alloy: 'Alloy', coreShard: 'Core shard', spiritDust: 'Spirit dust', relicFragment: 'Relic fragment' };
const pct = (p) => (p >= 0.995 ? '100%' : p >= 0.01 ? `${Math.round(p * 100)}%` : p >= 0.001 ? `${(p * 100).toFixed(1)}%` : '<0.1%');

function oddsLine(list) {
  return list.filter((r) => r.p >= 0.0005).map((r) => h('span', { class: 'odd', style: { color: RARITY_INDEX[r.id].color } }, `${RARITY_INDEX[r.id].name} ${pct(r.p)}`));
}

export class StoreScreen {
  static screenName = 'StoreScreen';
  constructor() { this.tab = 'packs'; }
  get P() { return this.app.profile; }

  onEnter() { this.app.audio.playMusic('menu'); }
  onResume() { this.ui.refresh(this); }

  render() {
    const P = this.P;
    const body = this.tab === 'deals' ? this.deals() : this.offers(this.tab);
    return h('div', { class: 'std-screen store' },
      h('div', { class: 'screen-head' }, h('h1', {}, 'Shop'),
        h('div', { class: 'tabbar' }, h('kbd', {}, this.app.input.glyph('tab_prev')), STORE_TABS.map((t) => h('div', { class: 'tab' + (t.id === this.tab ? ' active' : ''), onclick: () => this.setTab(t.id) }, t.label)), h('kbd', {}, this.app.input.glyph('tab_next'))),
        h('span', { class: 'mats shop-cr' }, `${P.currency.credits.toLocaleString()} CR`)),
      body);
  }

  setTab(id) {
    this.tab = id;
    if (id === 'deals') markDealsSeen(this.P);
    this.app.audio.ui('tab');
    this.ui.refresh(this);
  }
  onTab(d) { const i = STORE_TABS.findIndex((t) => t.id === this.tab); this.setTab(STORE_TABS[(i + d + STORE_TABS.length) % STORE_TABS.length].id); return true; }
  prompts() { return [['confirm', 'Buy'], ['tab_prev', 'Tabs'], ['back', 'Back']]; }

  offers(tab) {
    const P = this.P;
    const cards = OFFERS.filter((o) => o.tab === tab).map((o) => {
      const odds = offerOdds(o);
      const short = P.currency.credits < o.price;
      const card = h('div', { class: 'shop-card', style: { '--sc': o.color } },
        h('div', { class: 'sc-art' }, h('span', { class: 'sc-glyph' }, o.glyph), h('span', { class: 'sc-kind' }, KIND_NAMES[o.kind])),
        h('div', { class: 'sc-name' }, o.name),
        h('div', { class: 'sc-desc' }, o.desc),
        odds ? h('div', { class: 'sc-odds' }, h('b', {}, o.kind === 'capsule' || !o.guarantee ? 'Odds: ' : 'Each item: '), ...oddsLine(odds.item)) : null,
        odds?.guaranteed ? h('div', { class: 'sc-odds' }, h('b', {}, 'Guaranteed item: '), ...oddsLine(odds.guaranteed)) : null,
        o.materials ? h('div', { class: 'sc-odds' }, Object.entries(o.materials).map(([k, v]) => `${MAT_NAMES[k] || k} ×${v}`).join(' · ')) : null,
        h('div', { class: 'sc-price' + (short ? ' short' : '') }, `${o.price.toLocaleString()} CR`));
      return btn(card, () => this.buy(o), { class: 'shop-btn', id: 'offer-' + o.id, desc: short ? `${o.name}: you need ${o.price - P.currency.credits} more CR.` : `Buy ${o.name} for ${o.price} CR.` });
    });
    return h('div', { class: 'panel scroll', 'data-scroll': 'shop-' + tab }, h('div', { class: 'shop-grid', 'data-wrap': '' }, cards),
      h('div', { class: 'small muted shop-note' }, 'Everything here is earned with CR from battles, tournaments and challenges. Odds are per item and come from the same rarity weights as battle drops.'));
  }

  deals() {
    const P = this.P;
    const list = dailyDeals(P);
    const cards = list.map((d) => {
      const short = P.currency.credits < d.price;
      return h('div', { class: 'col gap deal' + (d.bought ? ' sold' : '') },
        itemCard(d.item),
        h('div', { class: 'row gap deal-price' }, h('s', { class: 'muted' }, `${d.full.toLocaleString()} CR`), h('b', { class: short ? 'bad' : 'gold' }, `${d.price.toLocaleString()} CR`)),
        btn(d.bought ? 'Sold' : 'Buy', () => this.buyDeal(d), { class: 'primary', id: 'deal-' + d.index, disabled: d.bought, desc: d.bought ? 'Bought today. New deals tomorrow.' : `Buy this exact part for ${d.price} CR (20% off).` }));
    });
    return h('div', { class: 'panel scroll', 'data-scroll': 'shop-deals' },
      h('div', { class: 'small muted' }, `Three exact parts a day, 20% off, Rare or better. You see every stat before you buy. New deals at midnight (today: ${dayKey()}).`),
      h('div', { class: 'deal-row', 'data-wrap': '' }, cards));
  }

  async buy(o) {
    if (this.P.currency.credits < o.price) { this.ui.toast(`You need ${o.price - this.P.currency.credits} more CR.`, 'bad'); this.app.audio.ui('error'); return; }
    if (!(await this.ui.confirm(`Buy ${o.name}?`, `${o.price.toLocaleString()} CR. ${o.desc}`, { yes: `Buy for ${o.price} CR` }))) return;
    const r = buyOffer(this.P, o.id);
    if (!r.ok) { this.ui.toast(r.reason, 'bad'); this.app.audio.ui('error'); return; }
    await this.app.save('silent');
    this.ui.push(new StoreRevealScreen(this, r, o));
  }

  async buyDeal(d) {
    if (this.P.currency.credits < d.price) { this.ui.toast(`You need ${d.price - this.P.currency.credits} more CR.`, 'bad'); this.app.audio.ui('error'); return; }
    if (!(await this.ui.confirm('Buy this deal?', `${d.price.toLocaleString()} CR for the part shown.`, { yes: `Buy for ${d.price} CR` }))) return;
    const r = buyDeal(this.P, d.index);
    if (!r.ok) { this.ui.toast(r.reason, 'bad'); this.app.audio.ui('error'); return; }
    await this.app.save('silent');
    this.ui.push(new StoreRevealScreen(this, r, null));
  }
}

export class StoreRevealScreen {
  static screenName = 'StoreRevealScreen';
  constructor(shop, result, offer) { this.shop = shop; this.result = result; this.offer = offer; }
  get P() { return this.app.profile; }

  onEnter() {
    const best = Math.max(-1, ...this.result.items.map((it) => rarityRank(it.rarity)));
    this.app.audio.ui(best >= 4 ? 'levelup' : 'loot');
  }

  render() {
    const { items, materials } = this.result;
    const best = items.reduce((b, it) => (rarityRank(it.rarity) > rarityRank(b?.rarity) ? it : b), null);
    const cards = items.map((it, i) => {
      const c = h('div', { class: 'reveal-card' }, itemCard(it, { class: 'new-loot' }));
      c.style.animationDelay = `${0.12 + i * 0.32}s`;
      return c;
    });
    if (materials) cards.push(h('div', { class: 'reveal-card' }, h('div', { class: 'item-card mats-card' }, h('div', { class: 'item-name' }, 'Materials'), ...Object.entries(materials).map(([k, v]) => h('div', {}, `${MAT_NAMES[k] || k} +${v}`)))));
    const o = this.offer;
    const again = o && this.P.currency.credits >= o.price;
    return h('div', { class: 'std-screen rift-reward store-reveal', style: { '--chest': best ? RARITY_INDEX[best.rarity].color : '#c6b8ff' } },
      h('div', { class: 'screen-head' }, h('h1', {}, o ? o.name : 'Daily Deal'), h('span', { class: 'mats shop-cr' }, `${this.P.currency.credits.toLocaleString()} CR`)),
      h('div', { class: 'reward-title' }, items.length ? `${items.length} new item${items.length > 1 ? 's' : ''} in your Workshop${best && rarityRank(best.rarity) >= 3 ? ` · best: ${RARITY_INDEX[best.rarity].name}!` : ''}` : 'Added to your materials.'),
      h('div', { class: 'loot-row reveal-row', 'data-wrap': '' }, cards),
      h('div', { class: 'row gap' },
        o ? btn(`Open another (${o.price.toLocaleString()} CR)`, () => this.again(), { class: 'primary', id: 'reveal-again', disabled: !again, desc: again ? 'Buy and open the same offer again.' : 'Not enough CR.' }) : null,
        btn('Back to the Shop', () => this.ui.pop(), { id: 'reveal-done' })));
  }

  async again() {
    const r = buyOffer(this.P, this.offer.id);
    if (!r.ok) { this.ui.toast(r.reason, 'bad'); return; }
    await this.app.save('silent');
    this.result = r;
    this.onEnter();
    this.ui.refresh(this);
  }

  prompts() { return [['confirm', 'Select'], ['back', 'Back']]; }
}

export { storeState };
