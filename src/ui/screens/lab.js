// Practice Lab: launch range (repeat launches with analysis), sparring
// targets with the physics debug overlay, and the Build Lab that compares
// two builds with a solo spin-decay test and AI head-to-head battles run
// in the simulation worker. Nothing here grants rewards or causes wear.

import { h, btn, selector } from '../ui.js';
import { statRow } from '../widgets.js';
import { barList, lineChart, SERIES } from '../charts.js';
import { ARENAS, ARENA_INDEX } from '../../data/arenas.js';
import { ARCHETYPES, ARCHETYPE_INDEX, participantFromDef } from '../../data/opponents.js';
import { AI_PROFILES } from '../../data/aiProfiles.js';
import { CHARACTERS, CHARACTER_INDEX } from '../../data/characters.js';
import { FINISH_NAMES } from '../../game/battle.js';
import { validateLoadout, buildParticipant } from '../../systems/loadout.js';
import { buildRole, ROLE_NAMES, rivalParticipant } from '../../systems/rivals.js';
import { MatchSimulator } from '../../game/matchSim.js';
import { BattleScreen } from './battle.js';

const TABS = [{ id: 'range', label: 'Launch Range' }, { id: 'spar', label: 'Sparring' }, { id: 'build', label: 'Build Lab' }];
const TARGETS = [
  { id: 'dummy', name: 'Training dummy', desc: 'A steady stamina top that never steers. Perfect for aiming practice.', make: () => participantFromDef({ ...ARCHETYPE_INDEX.drifter, beast: null }, { id: 'dummy', name: 'Training Dummy', ai: 'dummy' }) },
  { id: 'attacker', name: 'Attacker drill', desc: 'A gentle aggressive AI that charges at you — practise Counter and Brace.', make: () => participantFromDef({ ...ARCHETYPE_INDEX.striker, beast: null }, { id: 'drill', name: 'Attack Drill', difficulty: 0.55 }) },
  { id: 'wall', name: 'Defense wall', desc: 'A heavy defender that holds the centre — practise ring-out angles.', make: () => participantFromDef({ ...ARCHETYPE_INDEX.wall, beast: null }, { id: 'wall', name: 'Wall Drill', difficulty: 0.7 }) },
  { id: 'stamina', name: 'Stamina target', desc: 'An endurance AI that avoids contact — practise pressure and dashes.', make: () => participantFromDef({ ...ARCHETYPE_INDEX.drifter, beast: null }, { id: 'stam', name: 'Stamina Drill', difficulty: 0.75 }) },
];

let SIM = null;
const sim = () => (SIM = SIM || new MatchSimulator({ maxWorkers: 2 }));

export class PracticeLabScreen {
  static screenName = 'PracticeLabScreen';
  constructor() {
    this.tab = 'range';
    this.cfg = { arena: 'standard', target: 'dummy', abilities: true, debug: true, a: null, b: 'loadout:1', aiA: 'balanced', aiB: 'balanced', runs: 6 };
    this.results = null;
    this.running = false;
  }

  get P() { return this.app.profile; }

  onEnter() { this.app.audio.playMusic('lab'); }
  onResume() { this.app.audio.playMusic('lab'); this.ui.refresh(this); }

  render() {
    const P = this.P;
    if (this.cfg.a == null) this.cfg.a = 'loadout:' + P.activeLoadout;
    const body = this.tab === 'range' ? this.renderRange() : this.tab === 'spar' ? this.renderSpar() : this.renderBuild();
    return h('div', { class: 'std-screen lab' },
      h('div', { class: 'screen-head' }, h('h1', {}, 'Practice Lab'),
        h('div', { class: 'tabbar' }, h('kbd', {}, this.app.input.glyph('tab_prev')), TABS.map((t) => h('div', { class: 'tab' + (t.id === this.tab ? ' active' : ''), onclick: () => { this.tab = t.id; this.ui.refresh(this); } }, t.label)), h('kbd', {}, this.app.input.glyph('tab_next'))),
        h('span', { class: 'muted' }, 'No rewards, no wear — experiment freely.')),
      body);
  }

  onTab(d) { const i = TABS.findIndex((t) => t.id === this.tab); this.tab = TABS[(i + d + TABS.length) % TABS.length].id; this.ui.refresh(this); return true; }
  prompts() { return [['confirm', 'Select'], ['tab_prev', 'Tabs'], ['back', 'Back']]; }

  arenaSel() {
    const P = this.P;
    const list = ARENAS.filter((a) => P.arenasUnlocked.includes(a.id));
    return selector('Stadium', list.map((a) => ({ value: a.id, label: a.name, desc: a.desc })), this.cfg.arena, (v) => { this.cfg.arena = v; }, { id: 'lab-arena' });
  }

  loadoutSel() {
    const P = this.P;
    return selector('Loadout', P.loadouts.map((x, i) => ({ value: i, label: x.name + (validateLoadout(P, x).ok ? '' : ' ⚠') })), P.activeLoadout, (v) => { P.activeLoadout = v; this.ui.refresh(this); }, { id: 'lab-loadout' });
  }

  // -------------------------------------------------------------- range & sparring

  renderRange() {
    return h('div', { class: 'two-col' },
      h('div', { class: 'panel col gap', 'data-wrap': '' },
        h('h3', {}, 'Launch Range'),
        h('div', { class: 'small' }, 'Launch as many times as you like. Every launch is analysed: energy, RPM, tilt, and how far your release was from the perfect point. Pause → Relaunch to go again instantly.'),
        this.loadoutSel(), this.arenaSel(),
        btn('Start launch practice', () => this.start('range'), { class: 'primary big', id: 'lab-range' })),
      h('div', { class: 'panel col gap' }, h('h3', {}, 'How launching works'),
        h('div', { class: 'small' }, 'Launch energy = launcher drive force × cord length × transfer efficiency × cord efficiency × charge. Your top\'s spin is then √(2E / I): heavier, rim-weighted tops spin slower off the same pull but carry more angular momentum.'),
        h('div', { class: 'small' }, 'Releasing inside the gold band (around 92% charge) is a Perfect launch: more energy and much less angle error. Charging past 100% overcharges — more energy, much more wobble — and past the misfire point the launch fails.'),
        h('div', { class: 'small' }, 'Lean tilts the top at launch: banked launches curve, upright launches settle in the centre.')));
  }

  renderSpar() {
    const t = TARGETS.find((x) => x.id === this.cfg.target);
    return h('div', { class: 'two-col' },
      h('div', { class: 'panel col gap', 'data-wrap': '' },
        h('h3', {}, 'Sparring'),
        this.loadoutSel(), this.arenaSel(),
        selector('Target', TARGETS.map((x) => ({ value: x.id, label: x.name, desc: x.desc })), this.cfg.target, (v) => { this.cfg.target = v; this.ui.refresh(this); }, { id: 'lab-target' }),
        selector('Spirit Chip abilities', [{ value: true, label: 'On' }, { value: false, label: 'Off' }], this.cfg.abilities, (v) => { this.cfg.abilities = v; }, { id: 'lab-abilities' }),
        selector('Physics debug overlay', [{ value: true, label: 'On' }, { value: false, label: 'Off' }], this.cfg.debug, (v) => { this.cfg.debug = v; }, { id: 'lab-debug', desc: 'Contact points, normals, velocity vectors, spin axis, angular momentum and centre of mass.' }),
        btn('Start sparring', () => this.start('spar'), { class: 'primary big', id: 'lab-spar' })),
      h('div', { class: 'panel col gap' }, h('h3', {}, t.name), h('div', { class: 'small' }, t.desc),
        h('div', { class: 'small muted' }, 'Telemetry shows the full energy ledger: where every joule of spin went (tip friction, air drag, collisions, walls, steering, abilities). Toggle it with the View/Tab button; the pause menu can slow the simulation to 0.5× or 0.25×.')));
  }

  start(kind) {
    const P = this.P;
    const L = P.loadouts[P.activeLoadout];
    const v = validateLoadout(P, L);
    if (!v.ok) { this.ui.toast(v.errors[0], 'bad'); return; }
    const me = buildParticipant(P, L, { id: 'player' });
    const opp = kind === 'range' ? TARGETS[0].make() : TARGETS.find((x) => x.id === this.cfg.target).make();
    this.ui.push(new BattleScreen({
      mode: 'lab', title: kind === 'range' ? 'Launch Range' : 'Sparring', arenaId: this.cfg.arena, format: 'endless', roundTime: 600,
      participants: [me, opp], noRewards: true, rules: { durability: false, loot: false, abilities: kind === 'range' ? true : this.cfg.abilities, decisionAtTime: false },
      labTools: true, telemetry: true, debugOverlay: kind === 'spar' && this.cfg.debug, allowRematch: false, forfeitLabel: 'Leave the lab', forfeitWarning: 'Nothing is lost in the lab.',
    }));
  }

  // -------------------------------------------------------------- build lab

  buildOptions() {
    const P = this.P;
    return [
      ...P.loadouts.map((x, i) => ({ value: 'loadout:' + i, label: `Your: ${x.name}` })),
      ...ARCHETYPES.map((a) => ({ value: 'arch:' + a.id, label: `Archetype: ${a.name}` })),
      ...CHARACTERS.filter((c) => P.rivals?.[c.id]?.met || P.rivals?.[c.id]?.seen).map((c) => ({ value: 'rival:' + c.id, label: `Rival: ${c.name}` })),
    ];
  }

  participantFor(key, ai, id) {
    const P = this.P;
    const [kind, val] = key.split(':');
    if (kind === 'loadout') {
      const L = P.loadouts[+val];
      if (!L || !validateLoadout(P, L).ok) return null;
      return { ...buildParticipant(P, L, { id, human: false }), human: false, ai, difficulty: 1, name: L.name };
    }
    if (kind === 'arch') return participantFromDef(ARCHETYPE_INDEX[val], { id, ai, difficulty: 1 });
    if (kind === 'rival') return { ...rivalParticipant(null, val, 3, { difficulty: 1, pid: id }), ai };
    return null;
  }

  label(key) { return this.buildOptions().find((o) => o.value === key)?.label.replace(/^(Your|Archetype|Rival): /, '') || key; }

  renderBuild() {
    const opts = this.buildOptions();
    const ais = Object.keys(AI_PROFILES).filter((k) => k !== 'dummy').map((k) => ({ value: k, label: AI_PROFILES[k].name }));
    const r = this.results;
    const left = h('div', { class: 'panel col gap', 'data-wrap': '' },
      h('h3', {}, 'Compare two builds'),
      selector('Build A', opts, this.cfg.a, (v) => { this.cfg.a = v; }, { id: 'lab-a' }),
      selector('Build B', opts, this.cfg.b, (v) => { this.cfg.b = v; }, { id: 'lab-b' }),
      selector('AI driving A', ais, this.cfg.aiA, (v) => { this.cfg.aiA = v; }, { id: 'lab-aia', desc: 'Head-to-head battles are driven by AI on both sides, so results reflect the builds plus that play style.' }),
      selector('AI driving B', ais, this.cfg.aiB, (v) => { this.cfg.aiB = v; }, { id: 'lab-aib' }),
      this.arenaSel(),
      selector('Head-to-head battles', [4, 6, 10, 16].map((n) => ({ value: n, label: String(n) })), this.cfg.runs, (v) => { this.cfg.runs = v; }, { id: 'lab-runs' }),
      btn(this.running ? 'Simulating…' : 'Run comparison', () => this.runCompare(), { class: 'primary big', id: 'lab-run', disabled: this.running }),
      h('div', { class: 'small muted' }, `Uses the same physics as battles${sim().mode === 'worker' ? ', in a background worker' : ''}. Sides alternate so launch position does not bias results.`));
    const right = h('div', { class: 'panel scroll col gap', 'data-scroll': 'lab' });
    if (!r) right.append(h('div', { class: 'muted' }, 'Run a comparison to see spin decay curves and head-to-head results.'));
    else {
      const [A, B] = r.spin;
      right.append(
        h('h3', {}, 'Solo spin test'),
        h('div', { class: 'small muted' }, 'Each build launched alone at perfect timing near the centre and left to spin down. Conditional traits that need an opponent are inactive here.'),
        lineChart([
          { name: 'A', color: SERIES[0], points: A.samples.map((s) => [s[0], s[1]]) },
          { name: 'B', color: SERIES[1], points: B.samples.map((s) => [s[0], s[1]]) },
        ], { width: 600, height: 220, xLabel: 'time (s)', yLabel: 'spin (RPM)', xFmt: (x) => `${x.toFixed(0)}s`, yFmt: (y) => `${Math.round(y)}` }),
        h('table', { class: 'standings' },
          h('tr', {}, ['', 'Build', 'Launch RPM', 'Spin time', 'Ended by', 'Mass'].map((x) => h('th', {}, x))),
          ...[['A', A, r.labels[0]], ['B', B, r.labels[1]]].map(([k, s, name]) => h('tr', {}, h('td', {}, h('span', { class: 'lc-swatch', style: { background: k === 'A' ? SERIES[0] : SERIES[1] } })), h('td', {}, name), h('td', {}, s.launchRpm.toLocaleString()), h('td', {}, `${s.time.toFixed(1)} s`), h('td', {}, s.how === 'stopped' ? 'spin out' : s.how), h('td', {}, `${s.massG.toFixed(1)} g`)))),
        h('h3', {}, `Head-to-head (${r.h2h.n} battles, best of 3)`),
        barList([{ label: `A — ${r.labels[0]}`, value: r.h2h.wins[0], color: SERIES[0] }, { label: `B — ${r.labels[1]}`, value: r.h2h.wins[1], color: SERIES[1] }, { label: 'Draws', value: r.h2h.draws, color: '#7d8aa3' }], { format: (v) => `${v} win${v === 1 ? '' : 's'}`, max: r.h2h.n }),
        h('div', { class: 'small' }, `Round finishes: ${Object.entries(r.h2h.finishes).map(([k, v]) => `${FINISH_NAMES[k] || k} ${v}`).join(' · ') || '—'} · average round ${r.h2h.avgRound.toFixed(1)} s`),
        h('div', { class: 'small muted' }, `Styles: A plays as ${ROLE_NAMES[r.roles[0]]}, B as ${ROLE_NAMES[r.roles[1]]}. Small samples are noisy — run more battles for firmer numbers.`));
    }
    return h('div', { class: 'ws-cols two-wide' }, left, right);
  }

  async runCompare() {
    if (this.running) return;
    const pa = this.participantFor(this.cfg.a, this.cfg.aiA, 'A');
    const pb = this.participantFor(this.cfg.b, this.cfg.aiB, 'B');
    if (!pa || !pb) { this.ui.toast('Pick two valid builds (invalid loadouts cannot be tested).', 'bad'); return; }
    this.running = true;
    this.ui.refresh(this);
    const S = sim();
    const stamp = Date.now();
    try {
      const spinJobs = [pa, pb].map((p, i) => S.run(`lab:${stamp}:spin${i}`, { kind: 'spin', participant: p, arenaId: this.cfg.arena, seed: 7 + i }));
      const n = this.cfg.runs;
      const battles = [];
      for (let i = 0; i < n; i++) {
        const swap = i % 2 === 1;
        battles.push(S.run(`lab:${stamp}:m${i}`, { arenaId: this.cfg.arena, format: 'bo3', seed: (stamp + i * 7919) >>> 0, participants: swap ? [pb, pa] : [pa, pb] }).then((res) => ({ res, swap })));
      }
      const spin = await Promise.all(spinJobs);
      const done = await Promise.all(battles);
      const h2h = { n, wins: [0, 0], draws: 0, finishes: {}, avgRound: 0 };
      let rounds = 0;
      for (const { res, swap } of done) {
        if (res.winnerSide == null) h2h.draws++;
        else h2h.wins[(res.winnerSide === 1) !== swap ? 1 : 0]++;
        for (const rr of res.rounds) { h2h.finishes[rr.how] = (h2h.finishes[rr.how] || 0) + 1; h2h.avgRound += rr.time; rounds++; }
      }
      h2h.avgRound /= Math.max(1, rounds);
      this.results = { spin, h2h, labels: [this.label(this.cfg.a), this.label(this.cfg.b)], roles: [buildRole(pa.build), buildRole(pb.build)] };
    } catch (e) {
      console.error(e);
      this.ui.toast('Simulation failed: ' + e.message, 'bad');
    } finally {
      this.running = false;
      if (this.ui.current === this) this.ui.refresh(this);
    }
  }
}
