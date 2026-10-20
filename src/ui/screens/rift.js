// Rift Run hub: start a run, read the map, pick the next node, and the
// between-runs pages (Rift Talents and records). Battles hand back here;
// flow() then walks the player through any rewards still waiting.

import { discoverSynergies } from '../../systems/synergy.js';
import { h, btn, selector } from '../ui.js';
import { beastImg, statRow } from '../widgets.js';
import { RARITY_INDEX } from '../../data/rarity.js';
import { SLOTS, SLOT_NAMES } from '../../data/parts.js';
import { ARENA_INDEX } from '../../data/arenas.js';
import { CHARACTER_INDEX } from '../../data/characters.js';
import { CHARM_INDEX, CHARM_RARITIES, FAMILIES, RESONANCE_COUNT, charmDesc } from '../../data/riftCharms.js';
import { BOON_INDEX } from '../../data/riftBoons.js';
import { RIFT_ACTS, NODE_TYPES, FLOORS_PER_ACT, RIFT_DEPTHS, RIFT_TALENTS, AFFIX_INDEX, VAULT_INDEX, EVENT_INDEX, STATUSES, START_SHARDS, HEARTS_BASE, depthRules } from '../../data/rift.js';
import { baseOf } from '../../systems/items.js';
import { validateLoadout } from '../../systems/loadout.js';
import { updateStats } from '../../systems/progression.js';
import { markSeen } from '../../systems/rivals.js';
import { mixSeeds } from '../../core/rng.js';
import {
  riftState, startRun, canStart, currentChoices, nodeById, enterNode, completeNode, recordBattle, maxHearts, buyTalent, talentCost, BATTLE_NODES, homeBound,
} from '../../systems/rift.js';
import { riftParticipant, nodeOpponent, nodeRules, familyCounts } from '../../systems/riftBattle.js';
import { BattleScreen } from './battle.js';
import { RiftRewardScreen, RiftPartsScreen, RiftSummaryScreen, runStatus, heartsLine } from './riftReward.js';
import { RiftNodeScreen } from './riftNodes.js';

const TABS = [{ id: 'run', label: 'Run' }, { id: 'talents', label: 'Talents' }, { id: 'records', label: 'Records' }];

export class RiftScreen {
  static screenName = 'RiftScreen';
  constructor() { this.tab = 'run'; this.depth = null; this.loadoutIdx = null; }
  get P() { return this.app.profile; }
  get R() { return riftState(this.P); }
  get run() { return this.R.active; }

  onEnter() { this.app.audio.playMusic('tournament'); if (this.run) queueMicrotask(() => this.flow()); }
  onResume() { this.app.audio.playMusic('tournament'); this.ui.refresh(this); }

  render() {
    const R = this.R;
    const body = this.tab === 'talents' ? this.talents() : this.tab === 'records' ? this.records() : this.run ? this.map() : this.lobby();
    return h('div', { class: 'std-screen rift' },
      h('div', { class: 'screen-head' }, h('h1', {}, 'Rift Run'),
        h('div', { class: 'tabbar' }, h('kbd', {}, this.app.input.glyph('tab_prev')), TABS.map((t) => h('div', { class: 'tab' + (t.id === this.tab ? ' active' : ''), onclick: () => { this.tab = t.id; this.ui.refresh(this); } }, t.label)), h('kbd', {}, this.app.input.glyph('tab_next'))),
        h('span', { class: 'mats' }, `${R.essence} Essence · deepest unlocked: Depth ${R.depthUnlocked}`)),
      body);
  }

  onTab(d) { const i = TABS.findIndex((t) => t.id === this.tab); this.tab = TABS[(i + d + TABS.length) % TABS.length].id; this.ui.refresh(this); return true; }
  prompts() { return [['confirm', 'Select'], ['tab_prev', 'Tabs'], ['back', 'Back']]; }

  // ---------------------------------------------------------------- lobby

  lobby() {
    const P = this.P, R = this.R;
    if (this.loadoutIdx == null) this.loadoutIdx = P.activeLoadout;
    if (this.depth == null) this.depth = R.depthUnlocked;
    const ok = canStart(P, this.loadoutIdx);
    const D = depthRules(this.depth);
    const depthOpts = RIFT_DEPTHS.filter((d) => d.n <= R.depthUnlocked).map((d) => ({ value: d.n, label: `Depth ${d.n}`, desc: d.n ? `Adds: ${d.rule} Essence ×${(1 + 0.2 * d.n).toFixed(1)}.` : d.rule }));
    const T = R.talents;
    return h('div', { class: 'two-col' },
      h('div', { class: 'panel col gap', 'data-wrap': '' },
        h('h2', {}, 'Enter the Rift'),
        h('div', { class: 'small' }, 'Four Rifts, each three floors and a rival boss. Choose your path, grab the loot, and push as deep as you can. Charms and boons stay in the run; the parts you secure come home for your Workshop.'),
        selector('Bring loadout', P.loadouts.map((x, i) => ({ value: i, label: x.name + (validateLoadout(P, x).ok ? '' : ' ⚠') })), this.loadoutIdx, (v) => { this.loadoutIdx = v; this.ui.refresh(this); }, { id: 'rift-loadout', desc: 'Your starting top and Spirit Chip. Copies are used: nothing you own is worn or lost.' }),
        selector('Depth', depthOpts, this.depth, (v) => { this.depth = v; this.ui.refresh(this); }, { id: 'rift-depth', desc: 'Clear a run to unlock the next depth. Deeper runs are harder and pay more Essence.' }),
        h('div', { class: 'small muted' }, `You start with ${Math.max(1, HEARTS_BASE + (T.grit || 0) + D.heartsDelta)} hearts and ${START_SHARDS + 25 * (T.pockets || 0)} shards.`),
        !ok.ok ? h('div', { class: 'warn-box' }, ok.reason) : null,
        btn('Enter the Rift', () => this.begin(), { class: 'primary big', id: 'rift-start', disabled: !ok.ok })),
      h('div', { class: 'panel col gap' }, h('h3', {}, 'How a run works'),
        h('ul', { class: 'tactics' },
          h('li', {}, 'Each floor offers two or three stops: battles, elite battles, traders, forges, shrines, camps and unknown events.'),
          h('li', {}, 'Win a battle to open the spoils and pick one reward: a part, a charm or shards.'),
          h('li', {}, 'Charms are passive bonuses for this run. Three of one family resonate for an extra bonus. Cursed charms are strong with a price.'),
          h('li', {}, 'Elites and bosses grant boons: upgrades that grow with your Spirit Chip.'),
          h('li', {}, 'Hits can Scorch, put Static on, or Rust the other top. Two different statuses fuse into something worse.'),
          h('li', {}, 'Losing a battle costs a heart. At zero the run ends, and you still keep the Essence you earned.'),
          h('li', {}, 'Loot comes home: beat a Rift\'s boss and every part you found so far is secured. Clear all four Rifts and everything comes home. If a run ends early, the Locker still saves your best unsecured find.'),
          h('li', {}, 'Deeper runs and later Rifts drop rarer, higher-level parts. Spend Essence on Rift Talents to go further.'))));
  }

  async begin() {
    const ok = canStart(this.P, this.loadoutIdx);
    if (!ok.ok) { this.ui.toast(ok.reason, 'bad'); return; }
    startRun(this.P, { loadoutIndex: this.loadoutIdx, depth: this.depth });
    this.app.audio.ui('confirm');
    await this.app.save('silent');
    this.ui.refresh(this);
    this.flow();
  }

  // ---------------------------------------------------------------- map

  map() {
    const P = this.P, run = this.run;
    if (run.status !== 'active') {
      return h('div', { class: 'panel col gap' }, h('h2', {}, run.status === 'won' ? 'The Rift is cleared!' : 'The run is over'), btn('See the results', () => this.ui.push(new RiftSummaryScreen(this)), { class: 'primary big', id: 'rift-results' }));
    }
    const A = run.map[run.act];
    const choices = new Set(currentChoices(run).map((n) => n.id));
    const visited = new Set(run.path);
    const floorRow = (nodes, f) => h('div', { class: 'rift-floor' + (f === run.floor ? ' now' : f < run.floor ? ' past' : '') },
      h('div', { class: 'rift-floor-label' }, f < FLOORS_PER_ACT ? `Floor ${f + 1}` : 'Boss'),
      h('div', { class: 'rift-nodes' }, nodes.map((n) => this.nodeButton(n, choices.has(n.id), visited.has(n.id)))));
    const left = h('div', { class: 'panel scroll col gap', 'data-scroll': 'rift-left' },
      h('div', { class: 'row gap' }, run.beast ? beastImg(run.beast.id, 44) : null, h('div', {}, h('b', {}, run.loadoutName), h('div', { class: 'small muted' }, `Depth ${run.depth} · ${run.stats.wins} wins`))),
      ...SLOTS.map((s) => run.equipped[s]).filter(Boolean).map((it) => h('div', { class: 'rift-eq' }, h('span', { class: 'slot-name' }, SLOT_NAMES[it.slot]), h('b', { style: { color: RARITY_INDEX[it.rarity].color } }, `${baseOf(it)?.name}${it.forge ? ` +${it.forge}` : ''}`), it.element ? h('span', { class: 'chip', style: { color: STATUSES[it.element].color, borderColor: STATUSES[it.element].color } }, STATUSES[it.element].name) : null)),
      btn(`Parts and bag (${run.bag.length})`, () => this.ui.push(new RiftPartsScreen()), { id: 'rift-parts', desc: 'Swap parts between your top and your bag, or send secured parts home.' }),
      h('div', { class: 'small muted' }, homeBound(run).length ? `${homeBound(run).length} found part${homeBound(run).length > 1 ? 's' : ''} secured for home.` : 'Beat this Rift\'s boss to secure the parts you find.'),
      h('h3', {}, `Charms (${run.charms.length})`), this.charmList(),
      h('h3', {}, 'Boons'), this.boonList(),
      btn('Abandon run', () => this.abandon(), { class: 'danger', id: 'rift-abandon', desc: 'End the run now. You keep the Essence earned so far.' }));
    const right = h('div', { class: 'panel scroll col gap rift-map', 'data-scroll': 'rift-map', style: { '--ac': RIFT_ACTS[run.act].color } },
      h('div', { class: 'rift-act' }, h('span', { class: 'rift-act-n' }, `Rift ${run.act + 1} of ${RIFT_ACTS.length}`), h('h2', {}, RIFT_ACTS[run.act].name)),
      run.pending.length ? btn(`Claim rewards (${run.pending.length})`, () => this.flow(), { class: 'primary big', id: 'rift-claim' }) : null,
      ...A.floors.map((nodes, f) => floorRow(nodes, f)), floorRow([A.boss], FLOORS_PER_ACT));
    return h('div', { class: 'col gap rift-run' }, runStatus(P, run), h('div', { class: 'ws-cols two-wide rift-cols' }, left, right));
  }

  nodeButton(n, open, done) {
    const T = NODE_TYPES[n.type];
    const lines = [];
    if (n.arena) lines.push(ARENA_INDEX[n.arena]?.name);
    if (n.type === 'boss') lines.push(CHARACTER_INDEX[n.rival]?.name || 'A rival');
    if (n.affixes?.length && n.type !== 'vault') lines.push(n.affixes.map((a) => AFFIX_INDEX[a]?.name).join(', '));
    if (n.vault) lines.push(VAULT_INDEX[n.vault]?.name);
    const desc = `${T.desc}${n.vault ? ` ${VAULT_INDEX[n.vault].desc}` : ''}${n.affixes?.length && n.type !== 'vault' ? ` Elite trait: ${n.affixes.map((a) => `${AFFIX_INDEX[a].name} (${AFFIX_INDEX[a].desc})`).join(' ')}` : ''}${n.event ? ' What waits here is unknown until you arrive.' : ''}`;
    const b = btn(h('div', { class: 'rift-node-in' }, h('div', { class: 'rn-type' }, T.name), ...lines.map((l) => h('div', { class: 'rn-sub' }, l))),
      () => this.choose(n), { class: 'rift-node type-' + n.type + (open ? ' open' : '') + (done ? ' done' : ''), id: 'node-' + n.id, disabled: !open, desc });
    b.style.setProperty('--nc', T.color);
    return b;
  }

  charmList() {
    const run = this.run;
    if (!run.charms.length) return h('div', { class: 'small muted' }, 'None yet. Win battles to find charms.');
    const fam = familyCounts(run);
    return h('div', { class: 'col' }, run.charms.map((hd) => {
      const c = CHARM_INDEX[hd.id];
      const R = CHARM_RARITIES[c.rarity];
      return h('div', { class: 'rift-charm', title: charmDesc(hd) },
        h('span', { class: 'rc-dot', style: { background: FAMILIES[c.family].color } }),
        h('b', { style: { color: R.color } }, `${c.name}${hd.enhanced ? '+' : ''}`),
        h('span', { class: 'small muted' }, ` ${charmDesc(hd)}`));
    }), h('div', { class: 'small muted' }, Object.entries(fam).map(([f, n]) => `${FAMILIES[f].name} ${n}/${RESONANCE_COUNT}${n >= RESONANCE_COUNT ? ' (resonating)' : ''}`).join(' · ')));
  }

  boonList() {
    const run = this.run;
    const ids = Object.keys(run.boons).filter((k) => run.boons[k] > 0);
    if (!ids.length) return h('div', { class: 'small muted' }, 'None yet. Beat elites and bosses to earn boons.');
    return h('div', { class: 'col' }, ids.map((id) => h('div', { class: 'small' }, h('b', {}, `${BOON_INDEX[id].name(run.beast)} ${'I'.repeat(run.boons[id])}`), ` · ${BOON_INDEX[id].desc(run.boons[id], run.beast)}`)));
  }

  // ---------------------------------------------------------------- flow

  // Walk through pending rewards, close finished battle nodes, show results.
  async flow() {
    const run = this.run;
    if (!run) { if (this.ui.current === this) this.ui.refresh(this); return; }
    if (run.inBattle) { run.inBattle = null; run.current = null; } // a battle left unfinished (reload): fight it again
    if (run.status !== 'active' && !run.pending.length) { this.ui.push(new RiftSummaryScreen(this)); return; }
    if (run.pending.length) { this.ui.push(new RiftRewardScreen(this)); return; }
    const node = run.current ? nodeById(run, run.current) : null;
    if (node && BATTLE_NODES.includes(node.type)) {
      completeNode(this.P, run);
      await this.app.save('silent');
      if (run.status === 'won') { this.ui.push(new RiftSummaryScreen(this)); return; }
      if (node.type === 'boss') this.ui.toast(`${RIFT_ACTS[node.act].name} cleared!${run.lastSecured ? ` ${run.lastSecured} part${run.lastSecured > 1 ? 's' : ''} secured: they come home whatever happens.` : ''}`, 'good', 4500);
    }
    this.ui.refresh(this);
  }

  async choose(node) {
    const run = this.run;
    if (!currentChoices(run).some((n) => n.id === node.id)) return;
    enterNode(run, node);
    // an unfinished battle (closed tab, reload) is offered again, never skipped
    if (BATTLE_NODES.includes(node.type)) run.inBattle = node.id;
    await this.app.save('silent');
    if (BATTLE_NODES.includes(node.type)) { this.fight(node); return; }
    this.ui.push(new RiftNodeScreen(this, node));
  }

  async leaveNode() {
    completeNode(this.P, this.run);
    await this.app.save('silent');
    this.flow();
  }

  fight(node) {
    const P = this.P, run = this.run;
    const me = riftParticipant(P, run);
    const opp = nodeOpponent(P, run, node);
    if (node.rival) markSeen(P, node.rival);
    const session = {
      mode: 'rift', title: `${RIFT_ACTS[node.act].name} · ${NODE_TYPES[node.type].name}`, arenaId: node.arena,
      format: node.type === 'boss' ? 'bo3' : 'single', seed: mixSeeds(node.seed, run.stats.battles),
      participants: [me, opp], difficulty: opp.difficulty, noRewards: true, rules: nodeRules(node),
      riftInfo: { act: node.act, depth: run.depth, node: node.type, hearts: run.hearts, charms: run.charms.map((c) => c.id + (c.enhanced ? '+' : '')), boons: { ...run.boons }, affixes: node.affixes || [] },
      allowRematch: false, allowRestart: false, forfeitLabel: 'Retreat', forfeitWarning: 'Retreating counts as a loss: you lose a heart.',
      onForfeit: () => queueMicrotask(() => this.afterBattle(node, { won: false, forfeit: true })),
      onFinish: (res, rw, screen) => {
        try { updateStats(P, res, 0, session, screen.battle); } catch (e) { console.warn(e); }
        const won = res.winner === 0;
        const how = won ? [...res.rounds].reverse().find((r) => r.winner === 0)?.how : null;
        const synergies = screen.battle?.fighters?.[0]?.p?.synergies || [];
        screen.exit();
        queueMicrotask(() => this.afterBattle(node, { won, how, synergies }));
        return true;
      },
    };
    this.ui.push(new BattleScreen(session));
  }

  async afterBattle(node, outcome) {
    const run = this.run;
    if (!run) return;
    run.inBattle = null;
    const r = recordBattle(this.P, run, node, outcome);
    const found = discoverSynergies(this.P, outcome.synergies);
    await this.app.save('silent');
    for (const name of found) this.ui.toast(`Synergy discovered: ${name}`, 'good', 4000);
    if (r.won) {
      this.ui.toast(`Victory! +${r.shards} shards · +${r.essence} Essence${r.met ? '' : ' · vault rule not met'}`, 'good', 3500);
    } else if (r.heart === 'revived') this.ui.toast('Second Wind! You fight on with one heart.', 'warn', 4000);
    else if (r.heart === 'hurt') this.ui.toast(`Defeat: you lose a heart (${run.hearts} left).${r.shards ? ` Consolation: +${r.shards} shards.` : ''}`, 'bad', 3500);
    this.flow();
  }

  async abandon() {
    const ok = await this.ui.confirm('Abandon this run?', 'The run ends now. You keep the Essence earned so far and can still use the Locker.', { yes: 'Abandon', danger: true });
    if (!ok) return;
    this.run.status = 'abandoned';
    this.run.pending = [];
    await this.app.save('silent');
    this.ui.push(new RiftSummaryScreen(this));
  }

  // ---------------------------------------------------------------- talents & records

  talents() {
    const R = this.R;
    return h('div', { class: 'panel scroll col gap', 'data-wrap': '', 'data-scroll': 'rift-talents' },
      h('div', { class: 'small muted' }, `Essence comes from every battle you win in the Rift, win or lose the run. You have ${R.essence}.`),
      h('div', { class: 'talent-grid' }, RIFT_TALENTS.map((t) => {
        const r = R.talents[t.id] || 0;
        const cost = talentCost(this.P, t.id);
        return btn(h('div', { class: 'talent' }, h('div', { class: 'sk-head' }, h('b', {}, t.name), h('span', { class: 'sk-rank' }, `${r}/${t.max}`)),
          h('div', { class: 'small' }, t.desc(Math.max(1, r))), r < t.max && r > 0 ? h('div', { class: 'small muted' }, `Next: ${t.desc(r + 1)}`) : null,
          h('div', { class: 'small ' + (cost == null ? 'good' : R.essence >= cost ? 'gold' : 'muted') }, cost == null ? 'Maxed' : `${cost} Essence`)),
        () => this.buy(t.id), { class: 'skill-btn' + (r >= t.max ? ' maxed' : r > 0 ? ' learned' : '') + (cost != null && R.essence >= cost ? ' can' : ''), id: 'talent-' + t.id, disabled: cost == null });
      })));
  }

  async buy(id) {
    const r = buyTalent(this.P, id);
    if (!r.ok) { this.ui.toast(r.reason, 'bad'); this.app.audio.ui('error'); return; }
    this.app.audio.ui('levelup');
    await this.app.save('silent');
    this.ui.refresh(this);
  }

  records() {
    const R = this.R;
    return h('div', { class: 'ws-cols two-wide' },
      h('div', { class: 'panel' }, h('h3', {}, 'Records'),
        statRow('Runs started', R.runs), statRow('Rifts cleared', R.clears), statRow('Deepest clear', R.bestDepth >= 0 ? `Depth ${R.bestDepth}` : '—'),
        statRow('Furthest reached', R.bestAct ? RIFT_ACTS[Math.min(R.bestAct, RIFT_ACTS.length) - 1].name : '—'), statRow('Essence earned', R.essenceEarned)),
      h('div', { class: 'panel scroll' }, h('h3', {}, 'Recent runs'),
        R.history.length ? R.history.map((x) => h('div', { class: 'hist-row' }, h('span', { class: 'hr-place ' + (x.outcome === 'won' ? 'good' : 'bad') }, x.outcome === 'won' ? 'WIN' : `R${x.act}`),
          h('span', { class: 'hr-name' }, `Depth ${x.depth} · ${x.wins} wins · ${x.bosses} bosses`), h('span', { class: 'muted small' }, `+${x.essence} Essence · ${new Date(x.date).toLocaleDateString()}`))) : h('div', { class: 'muted' }, 'No runs yet.')));
  }
}

export { heartsLine };
