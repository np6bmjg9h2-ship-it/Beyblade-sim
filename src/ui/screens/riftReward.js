// Rift Run screens for loot: the cards every offer is drawn with (parts,
// charms, boons), the pick-one reward screen, the parts and bag screen, and
// the end-of-run summary with the Locker.

import { h, btn } from '../ui.js';
import { rarityChip, statRow } from '../widgets.js';
import { compareBuildSwap } from '../../systems/compare.js';
import { compareMini } from '../compare.js';
import { RARITY_INDEX } from '../../data/rarity.js';
import { SLOTS, SLOT_NAMES } from '../../data/parts.js';
import { TRAIT_INDEX } from '../../data/traits.js';
import { SET_INDEX } from '../../data/sets.js';
import { CHARM_INDEX, CHARM_RARITIES, FAMILIES, RESONANCE_COUNT, charmK } from '../../data/riftCharms.js';
import { BOON_INDEX } from '../../data/riftBoons.js';
import { STATUSES, RIFT_ACTS, RING_ELEMENT_CHANCE, FORGE_BONUS, BAG_SIZE } from '../../data/rift.js';
import { baseOf } from '../../systems/items.js';
import { validateBuild } from '../../systems/assembly.js';
import { resolveLaunchGear } from '../../game/launch.js';
import { LAUNCHER_INDEX, runLauncherOf } from '../../data/launchers.js';
import { riftState, pickReward, equipFromBag, dropFromBag, unequipAux, keepableParts, lockerSize, finishRun, maxHearts, sendHome, homeBound, lockerChoices } from '../../systems/rift.js';
import { familyCounts } from '../../systems/riftBattle.js';
import { skipShards, fitsBuild } from '../../systems/riftLoot.js';
import { partFit, charmFit } from '../../systems/riftFit.js';

const fitChip = (why) => (why ? h('div', { class: 'lc-fit' }, why) : null);

// ---------------------------------------------------------------- shared bits

export function heartsLine(profile, run) {
  const max = maxHearts(profile, run);
  return h('span', { class: 'rift-hearts', title: `${run.hearts} of ${max} hearts` },
    ...Array.from({ length: max }, (_, i) => h('span', { class: 'heart' + (i < run.hearts ? ' full' : '') })));
}

export function runStatus(profile, run) {
  return h('div', { class: 'rift-status' }, heartsLine(profile, run),
    h('span', { class: 'rift-shards' }, `${run.shards} shards`),
    h('span', { class: 'muted' }, `Depth ${run.depth} · ${RIFT_ACTS[Math.min(run.act, RIFT_ACTS.length - 1)].name}`));
}

export function validator(profile, run) {
  const gear = resolveLaunchGear(runLauncherOf(profile.inventory, run), profile.inventory[run.cable]);
  return (build) => validateBuild(build, { spin: run.spin, launcher: { spinMech: gear.spinMech } });
}

// How a part would change the top if swapped in (systems/compare.js).
function compareRows(profile, run, item) {
  const cur = run.equipped[item.slot];
  if (cur?.uid === item.uid) return h('div', { class: 'lc-equipped' }, 'Equipped');
  let cmp;
  try { cmp = compareBuildSwap({ parts: run.equipped, launcher: runLauncherOf(profile.inventory, run), cable: profile.inventory[run.cable], spin: run.spin }, item.slot, item); } catch { return null; }
  return h('div', { class: 'lc-compare' }, h('div', { class: 'lc-cmp-title' }, cur ? `vs your ${baseOf(cur)?.name}` : 'vs empty slot'), compareMini(cmp));
}

const priceTag = (price, short) => (price != null ? h('div', { class: 'lc-price' + (short ? ' short' : '') }, `${price} shards`) : null);

export function partCard(profile, run, item, { price = null, short = false, compare = true } = {}) {
  const base = baseOf(item);
  const R = RARITY_INDEX[item.rarity];
  const st = item.element ? STATUSES[item.element] : null;
  const traits = [...(item.traits || []), ...(item.special ? [item.special] : [])];
  const set = item.set ? SET_INDEX[item.set] : null;
  const fits = fitsBuild(profile, run, item);
  return h('div', { class: 'loot-card rarity-' + item.rarity, style: { '--rc': R.color } },
    h('div', { class: 'lc-top' }, h('span', { class: 'lc-slot' }, SLOT_NAMES[item.slot]), rarityChip(item.rarity)),
    h('div', { class: 'lc-name' }, base?.name || item.base, item.forge ? h('span', { class: 'lc-plus' }, ` +${item.forge}`) : null),
    fits ? fitChip(partFit(profile, run, item)) : null,
    st ? h('div', { class: 'lc-el', style: { '--ec': st.color } }, `${st.name} ring: hits inflict ${st.name} ${Math.round(RING_ELEMENT_CHANCE * 100)}% of the time`) : null,
    item.forge && FORGE_BONUS[item.slot] ? h('div', { class: 'lc-desc' }, `Forge +${item.forge}: ${FORGE_BONUS[item.slot].desc(item.forge)}`) : null,
    traits.length ? h('div', { class: 'lc-traits' }, traits.map((t) => h('div', { class: 'lc-trait' + (TRAIT_INDEX[t.id]?.special ? ' special' : '') }, h('b', {}, TRAIT_INDEX[t.id]?.name || t.id), ' ', TRAIT_INDEX[t.id]?.desc(t.mag) || ''))) : h('div', { class: 'lc-desc muted' }, 'No traits.'),
    set ? h('span', { class: 'chip', style: { color: set.color, borderColor: set.color } }, set.name) : null,
    compare && fits ? compareRows(profile, run, item) : null,
    !fits ? h('div', { class: 'lc-warn' }, 'Does not fit your current top.') : null,
    priceTag(price, short));
}

export function charmCard(run, held, { price = null, short = false } = {}) {
  const c = CHARM_INDEX[held.id];
  const R = CHARM_RARITIES[c.rarity];
  const fam = FAMILIES[c.family];
  const owned = run.charms.some((x) => x.id === held.id);
  const n = (familyCounts(run)[c.family] || 0) + (owned ? 0 : 1);
  return h('div', { class: 'loot-card charm rarity-' + c.rarity + (held.enhanced ? ' enhanced' : ''), style: { '--rc': R.color } },
    h('div', { class: 'lc-top' }, h('span', { class: 'lc-slot' }, 'Charm'), h('span', { class: 'chip', style: { color: R.color, borderColor: R.color } }, held.enhanced ? `Enhanced ${R.name}` : c.keystone ? `${R.name} Keystone` : R.name)),
    h('div', { class: 'lc-name' }, c.name),
    owned ? null : fitChip(charmFit(run, held)),
    h('div', { class: 'lc-desc' }, c.desc(charmK(held))),
    h('div', { class: 'lc-fam', style: { '--fc': fam.color } }, `${fam.name} ${Math.min(n, RESONANCE_COUNT)}/${RESONANCE_COUNT}`, h('span', { class: 'muted' }, n >= RESONANCE_COUNT ? ` · Resonance: ${fam.bonus.desc}` : ` · at ${RESONANCE_COUNT}: ${fam.bonus.desc}`)),
    priceTag(price, short));
}

export function boonCard(run, id) {
  const b = BOON_INDEX[id];
  const lv = run.boons[id] || 0;
  return h('div', { class: 'loot-card boon', style: { '--rc': '#c6b8ff' } },
    h('div', { class: 'lc-top' }, h('span', { class: 'lc-slot' }, 'Boon'), h('span', { class: 'chip' }, lv ? `Level ${lv} → ${lv + 1}` : 'New')),
    h('div', { class: 'lc-name' }, b.name(run.beast)),
    h('div', { class: 'lc-desc' }, b.desc(lv + 1, run.beast)));
}

export function offerCard(profile, run, o, opts = {}) {
  if (o.type === 'part') return partCard(profile, run, o.item, opts);
  if (o.type === 'charm') return charmCard(run, o.charm, opts);
  if (o.type === 'boon') return boonCard(run, o.id);
  if (o.type === 'launcher') {
    const L = LAUNCHER_INDEX[o.base];
    return h('div', { class: 'loot-card', style: { '--rc': L.color } }, h('div', { class: 'lc-top' }, h('span', { class: 'lc-slot' }, 'Launcher'), h('span', { class: 'chip' }, 'This run')), h('div', { class: 'lc-name' }, L.name), h('div', { class: 'lc-desc' }, 'Launches right or left spin: pick the spin in each battle setup. Replaces your launcher until the run ends.'), priceTag(opts.price, opts.short));
  }
  if (o.type === 'heart') return h('div', { class: 'loot-card heart-card', style: { '--rc': '#ff5a7a' } }, h('div', { class: 'lc-top' }, h('span', { class: 'lc-slot' }, 'Heart')), h('div', { class: 'lc-name' }, '+1 heart'), h('div', { class: 'lc-desc' }, 'Recover one heart (up to your maximum).'), priceTag(opts.price, opts.short));
  return h('div', { class: 'loot-card shards', style: { '--rc': '#ffd84d' } }, h('div', { class: 'lc-top' }, h('span', { class: 'lc-slot' }, 'Shards')), h('div', { class: 'lc-name' }, `+${o.amount} shards`), h('div', { class: 'lc-desc' }, 'Spend them at traders, forges and shrines.'));
}

// The best rarity among offers (drives the chest glow).
function topColor(step) {
  let best = null, rank = -1;
  for (const o of step.options) {
    const r = o.type === 'part' ? RARITY_INDEX[o.item.rarity] : o.type === 'charm' ? { color: CHARM_RARITIES[CHARM_INDEX[o.charm.id].rarity].color, rank: CHARM_RARITIES[CHARM_INDEX[o.charm.id].rarity].rank * 2 } : null;
    if (r && r.rank > rank) { rank = r.rank; best = r.color; }
  }
  return best || '#c6b8ff';
}

// Ask for a bag slot to free; resolves the dropped uid or null.
export async function chooseDrop(ui, run) {
  return ui.choose('Your bag is full', run.bag.map((x) => ({ label: `Drop ${baseOf(x)?.name}${x.forge ? ` +${x.forge}` : ''} (${RARITY_INDEX[x.rarity].name})`, value: x.uid })), { body: `The bag holds ${BAG_SIZE} parts. Drop one to make room, or go back.` });
}

// ---------------------------------------------------------------- reward picking

const KIND_TITLES = { spoils: 'Spoils', charm: 'Charm', boon: 'Boon', part: 'Part' };

export class RiftRewardScreen {
  static screenName = 'RiftRewardScreen';
  constructor(hub) { this.hub = hub; }
  get P() { return this.app.profile; }
  get run() { return riftState(this.P).active; }

  render() {
    const run = this.run;
    const step = run?.pending[0];
    if (!step) return h('div', { class: 'std-screen' }, h('h1', {}, 'Nothing to claim'));
    const cards = step.options.map((o, i) => {
      const b = btn(offerCard(this.P, run, o), () => this.pick(i), { class: 'loot-btn', id: 'loot-' + i, desc: 'Take this.' });
      b.style.animationDelay = `${0.08 + i * 0.09}s`;
      return b;
    });
    return h('div', { class: 'std-screen rift-reward', style: { '--chest': topColor(step) } },
      h('div', { class: 'screen-head' }, h('h1', {}, KIND_TITLES[step.kind] || 'Reward'), runStatus(this.P, run)),
      h('div', { class: 'reward-title' }, step.title, run.pending.length > 1 ? h('span', { class: 'muted' }, ` · ${run.pending.length - 1} more after this`) : null),
      h('div', { class: 'loot-row', 'data-wrap': '' }, cards),
      h('div', { class: 'row gap' }, btn(step.kind === 'boon' ? 'Skip' : `Skip (+${skipShards(run)} shards)`, () => this.pick(null), { id: 'loot-skip', desc: step.kind === 'boon' ? 'Take nothing.' : 'Take a few shards instead.' })));
  }

  onEnter() { this.app.audio.ui('loot'); }

  async pick(i) {
    const P = this.P, run = this.run;
    const step = run.pending[0];
    const o = i == null ? null : step.options[i];
    let r = pickReward(P, run, i);
    if (!r.ok && r.reason === 'bag-full') {
      const drop = await chooseDrop(this.ui, run);
      if (!drop) return;
      r = pickReward(P, run, i, { dropUid: drop });
    }
    if (!r.ok) { this.ui.toast(r.reason, 'bad'); this.app.audio.ui('error'); return; }
    const rare = o && ((o.type === 'part' && RARITY_INDEX[o.item.rarity].rank >= 4) || (o.type === 'charm' && CHARM_INDEX[o.charm.id].rarity === 'legendary'));
    this.app.audio.ui(rare ? 'levelup' : 'confirm');
    if (o?.type === 'part' && run.bag.some((x) => x.uid === o.item.uid) && fitsBuild(P, run, o.item)) {
      const cur = run.equipped[o.item.slot];
      const yes = await this.ui.confirm(`Equip ${baseOf(o.item)?.name} now?`, cur ? `Your ${baseOf(cur)?.name} goes into the bag. You can swap parts any time from the map.` : 'You can swap parts any time from the map.', { yes: 'Equip', no: 'Keep in bag' });
      if (yes) equipFromBag(run, o.item.uid, validator(P, run));
    } else if (r.skipped) this.ui.toast(r.shards ? `+${r.shards} shards` : 'Skipped.', 'info');
    await this.app.save('silent');
    this.ui.pop();
    this.hub.flow();
  }

  onBack() { return true; }
  prompts() { return [['confirm', 'Take'], ['back', '']]; }
}

// ---------------------------------------------------------------- parts & bag

export class RiftPartsScreen {
  static screenName = 'RiftPartsScreen';
  constructor() { this.sel = null; }
  get P() { return this.app.profile; }
  get run() { return riftState(this.P).active; }

  render() {
    const run = this.run;
    const all = [...SLOTS.map((s) => run.equipped[s]).filter(Boolean), ...run.bag];
    if (!this.sel || !all.some((x) => x.uid === this.sel)) this.sel = all[0]?.uid || null;
    const row = (it, where) => {
      const R = RARITY_INDEX[it.rarity];
      const b = btn(h('div', { class: 'rift-part-row' }, h('span', { class: 'slot-name' }, where === 'bag' ? 'Bag' : SLOT_NAMES[it.slot]), h('b', { style: { color: R.color } }, `${baseOf(it)?.name}${it.forge ? ` +${it.forge}` : ''}`), it.element ? h('span', { class: 'chip', style: { color: STATUSES[it.element].color, borderColor: STATUSES[it.element].color } }, STATUSES[it.element].name) : null, it.secured ? h('span', { class: 'chip good' }, 'Secured') : null),
        () => { this.sel = it.uid; this.ui.refresh(this); }, { class: 'tour-btn' + (this.sel === it.uid ? ' sel' : ''), id: 'part-' + it.uid });
      return b;
    };
    const sel = all.find((x) => x.uid === this.sel);
    const inBag = sel && run.bag.some((x) => x.uid === sel.uid);
    const detail = sel ? h('div', { class: 'col gap' }, partCard(this.P, run, sel),
      inBag ? h('div', { class: 'row gap' }, btn('Equip', () => this.equip(sel), { class: 'primary', id: 'part-equip', desc: 'Swap this part into its slot; the old one goes to the bag.' }),
        sel.secured ? btn('Send home', () => this.home(sel), { id: 'part-home', desc: 'Send this secured part to your Workshop now and free its bag slot. It leaves the run.' }) : null,
        btn('Drop', () => this.drop(sel), { class: 'danger', id: 'part-drop' }))
        : sel.slot === 'aux' ? btn('Take off', () => { if (unequipAux(run)) { this.app.save('silent'); this.ui.refresh(this); } else this.ui.toast('Your bag is full.', 'bad'); }, { id: 'part-unequip', desc: 'Remove the auxiliary module (it goes to the bag).' }) : h('div', { class: 'small muted' }, 'Equipped. Pick a part from your bag to swap it out.')) : h('div', { class: 'muted' }, 'No parts.');
    return h('div', { class: 'std-screen' },
      h('div', { class: 'screen-head' }, h('h1', {}, 'Your Top'), runStatus(this.P, run)),
      h('div', { class: 'ws-cols two-wide' },
        h('div', { class: 'panel scroll col gap', 'data-wrap': '' }, h('h3', {}, 'Equipped'), ...SLOTS.map((s) => run.equipped[s]).filter(Boolean).map((it) => row(it, 'eq')),
          h('h3', {}, `Bag ${run.bag.length}/${BAG_SIZE}`), ...(run.bag.length ? run.bag.map((it) => row(it, 'bag')) : [h('div', { class: 'small muted' }, 'Empty. Parts you pick up land here.')])),
        h('div', { class: 'panel scroll', 'data-scroll': 'rift-part' }, detail)));
  }

  async equip(it) {
    const r = equipFromBag(this.run, it.uid, validator(this.P, this.run));
    if (!r.ok) { this.ui.toast(r.reason, 'bad', 4000); return; }
    this.app.audio.ui('confirm');
    await this.app.save('silent');
    this.ui.refresh(this);
  }

  async home(it) {
    const r = sendHome(this.run, it.uid);
    if (!r.ok) { this.ui.toast(r.reason, 'bad'); return; }
    this.ui.toast(`${baseOf(it)?.name} is on its way home.`, 'good');
    await this.app.save('silent');
    this.ui.refresh(this);
  }

  async drop(it) {
    if (!(await this.ui.confirm(`Drop ${baseOf(it)?.name}?`, it.secured ? 'It is gone for the rest of the run and will not come home. Send it home instead to keep it.' : 'It is gone for the rest of the run.', { yes: 'Drop', danger: true }))) return;
    dropFromBag(this.run, it.uid);
    await this.app.save('silent');
    this.ui.refresh(this);
  }

  prompts() { return [['confirm', 'Select'], ['back', 'Back']]; }
}

// ---------------------------------------------------------------- end of run

const OUTCOME = { won: 'Rift Cleared', lost: 'Run Over', abandoned: 'Run Ended' };

// Highest rarity first, then forge level, then item level.
function bestFinds(parts, n) {
  const score = (x) => RARITY_INDEX[x.rarity].rank * 1000 + (x.forge || 0) * 100 + (x.level || 0);
  return [...parts].sort((a, b) => score(b) - score(a)).slice(0, n).map((x) => x.uid);
}

export class RiftSummaryScreen {
  static screenName = 'RiftSummaryScreen';
  constructor(hub) { this.hub = hub; this.keep = null; this.banked = null; }
  get P() { return this.app.profile; }

  render() {
    if (this.banked) return this.renderBanked();
    const run = riftState(this.P).active;
    if (!run) return h('div', { class: 'std-screen' }, h('h1', {}, 'No run'));
    const s = run.stats;
    const keepable = lockerChoices(run);
    const home = homeBound(run);
    const n = lockerSize(this.P);
    // the best unsecured finds start in the Locker, so nothing is lost by accident
    if (this.keep == null) this.keep = bestFinds(keepable, n);
    const homeRows = home.map((it) => h('div', { class: 'rift-part-row' }, h('span', { class: 'slot-name' }, 'HOME'), h('b', { style: { color: RARITY_INDEX[it.rarity].color } }, baseOf(it)?.name), rarityChip(it.rarity)));
    const parts = h('div', { class: 'col gap', 'data-wrap': '' }, keepable.length ? keepable.map((it) => {
      const on = this.keep.includes(it.uid);
      const R = RARITY_INDEX[it.rarity];
      return btn(h('div', { class: 'rift-part-row' }, h('span', { class: 'slot-name' }, on ? 'KEEP' : SLOT_NAMES[it.slot]), h('b', { style: { color: R.color } }, baseOf(it)?.name), rarityChip(it.rarity), h('span', { class: 'small muted' }, `${(it.traits || []).length} trait${(it.traits || []).length === 1 ? '' : 's'}`)),
        () => this.toggle(it.uid, n), { class: 'tour-btn' + (on ? ' sel' : ''), id: 'keep-' + it.uid, desc: 'Keep this part: it joins your Workshop inventory (rarity and traits stay; forge levels and elements stay in the Rift).' });
    }) : [h('div', { class: 'small muted' }, home.length ? 'Nothing else to keep.' : 'No found parts to keep.')]);
    return h('div', { class: 'std-screen rift-summary' },
      h('div', { class: 'results-head ' + (run.status === 'won' ? 'win' : 'lose') }, h('h1', {}, OUTCOME[run.status] || 'Run Over'), h('div', { class: 'res-score' }, `Depth ${run.depth} · reached ${RIFT_ACTS[Math.min(run.act, 3)].name}`)),
      h('div', { class: 'ws-cols two-wide' },
        h('div', { class: 'panel scroll' }, h('h3', {}, 'The run'),
          statRow('Battles won', `${s.wins} of ${s.battles}`), statRow('Elites beaten', s.elites), statRow('Bosses beaten', s.bosses), statRow('Vaults claimed', s.vaults),
          statRow('Ring outs / Shatters', `${s.ringOuts} / ${s.shatters}`), statRow('Shards earned', s.shardsEarned), statRow('Parts found', s.partsFound), statRow('Charms carried', run.charms.length),
          statRow('Essence', `${run.essence}${run.status === 'won' ? ' + clear bonus' : ''}`)),
        h('div', { class: 'panel scroll col gap' },
          h('h3', {}, run.status === 'won' ? 'Rift cleared: all your finds come home' : `Coming home: ${home.length} secured part${home.length === 1 ? '' : 's'}`),
          ...homeRows,
          keepable.length || run.status !== 'won' ? h('h3', {}, `Locker: keep up to ${n} more`) : null,
          run.status !== 'won' ? h('div', { class: 'small muted' }, `Parts join your Workshop for good; the rest stays in the Rift. ${keepable.length ? 'Your best unsecured find is already in the Locker: change it if you like.' : ''}`) : null,
          run.status !== 'won' ? parts : null,
          btn('Bank rewards', () => this.bank(), { class: 'primary big', id: 'rift-bank' }))));
  }

  toggle(uid, n) {
    if (this.keep.includes(uid)) this.keep = this.keep.filter((x) => x !== uid);
    else if (this.keep.length < n) this.keep.push(uid);
    else { this.ui.toast(`The Locker holds ${n}. Unselect one first.`, 'warn'); return; }
    this.ui.refresh(this);
  }

  async bank() {
    const run = riftState(this.P).active;
    if (!this.keep.length && lockerChoices(run).length && !(await this.ui.confirm('Leave every part behind?', 'The Locker is empty, so all the parts from this run stay in the Rift.', { yes: 'Bank anyway', no: 'Go back' }))) return;
    this.banked = finishRun(this.P, run, { keep: this.keep });
    this.app.telemetry?.event('riftEnd', { status: run.status, depth: run.depth, act: run.act, battles: run.stats?.battles, kept: this.keep.length, essence: this.banked.essence ?? null, charms: run.charms.map((c) => c.id), boons: { ...run.boons } });
    await this.app.save('silent');
    this.app.audio.ui(this.banked.career.levelUps ? 'levelup' : 'loot');
    this.ui.refresh(this);
  }

  renderBanked() {
    const b = this.banked, c = b.career;
    return h('div', { class: 'std-screen rift-summary' },
      h('div', { class: 'results-head win' }, h('h1', {}, 'Rewards Banked')),
      h('div', { class: 'panel col gap' },
        h('div', { class: 'reward-line gold' }, `+${b.essence} Essence (spend it on Rift Talents)`),
        h('div', { class: 'reward-line' }, `+${c.credits} credits · +${c.xp} player XP${c.levelUps ? ` · LEVEL UP ×${c.levelUps}` : ''}`),
        c.bond ? h('div', { class: 'reward-line' }, `${c.beastName}: +${c.bond} bond XP${c.bondLevelUp ? ' · bond level up!' : ''}`) : null,
        Object.values(c.materials).some((v) => v > 0) ? h('div', { class: 'reward-line' }, 'Materials: ' + Object.entries(c.materials).filter(([, v]) => v > 0).map(([k, v]) => `${k} +${v}`).join(', ')) : null,
        ...b.kept.map((it) => h('div', { class: 'reward-line gold' }, `Kept: ${baseOf(it)?.name} (${RARITY_INDEX[it.rarity].name})`)),
        btn('Back to the Rift', () => { this.ui.pop(); this.hub.flow(); }, { class: 'primary big', id: 'rift-done' })));
  }

  onBack() { if (this.banked) { this.ui.pop(); this.hub.flow(); } return true; }
  prompts() { return [['confirm', 'Select'], ['back', this.banked ? 'Continue' : '']]; }
}
