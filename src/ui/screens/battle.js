// In-battle screen: owns a Battle, human controllers, the HUD (meters,
// stability, lock, spirit, abilities, timer, score), launch preparation UI,
// telemetry panel, pause menu, round results and hand-off to the match
// summary. All input in battle flows through here.

import { h, btn } from '../ui.js';
import { Battle, FINISH_NAMES } from '../../game/battle.js';
import { HumanController } from '../../game/humanController.js';
import { ARENA_INDEX } from '../../data/arenas.js';
import { TECHNIQUE_INDEX } from '../../data/launchers.js';
import { BEAST_INDEX } from '../../data/beasts.js';
import { TECHNIQUE_DEFS } from '../../game/abilities.js';
import { PERFECT_CENTER } from '../../game/launch.js';
import { TICK, LEDGER_KEYS } from '../../physics/simulation.js';
import { CAMERA_NAMES } from '../../render/camera.js';
import { beastImg, fmtTime, fmtRpm } from '../widgets.js';
import { ResultsScreen } from './results.js';
import { SettingsScreen } from './settings.js';

const LEDGER_NAMES = { tipFriction: 'Tip friction', floor: 'Landings', scrape: 'Body scrape', collision: 'Collisions', wall: 'Walls', drag: 'Air drag', control: 'Steering', ability: 'Abilities', damping: 'Wobble damping', numerical: 'Numerical' };

export class BattleScreen {
  static screenName = 'BattleScreen';
  constructor(session) {
    this.session = session;
    this.telemetry = false;
    this.notifs = [];
    this.hudT = 0;
  }

  // ------------------------------------------------------------ setup

  render() {
    const mk = (cls, ...c) => h('div', { class: cls }, ...c);
    this.refs = { f: [] };
    const panels = [0, 1].map((i) => {
      const r = {};
      r.root = mk('fighter-panel side-' + i,
        mk('fp-head', r.emb = mk('fp-emb'), mk('fp-names', r.name = mk('fp-name'), r.beast = mk('fp-beast'))),
        mk('fp-row', h('span', { class: 'fp-label' }, 'SPIN'), r.spinBar = mk('bar spin', r.spinFill = mk('bar-fill')), r.spinText = mk('fp-val')),
        mk('fp-row', h('span', { class: 'fp-label' }, 'STAB'), r.stab = mk('fp-stab')),
        mk('fp-row', h('span', { class: 'fp-label' }, 'LOCK'), r.lock = mk('fp-lock')),
        mk('fp-row', h('span', { class: 'fp-label' }, 'SPIRIT'), r.spiritBar = mk('bar spirit', r.spiritFill = mk('bar-fill')), r.spiritText = mk('fp-val')),
        r.status = mk('fp-status'));
      this.refs.f.push(r);
      return r.root;
    });
    const R = this.refs;
    R.timer = mk('hud-timer');
    R.round = mk('hud-round');
    R.score = mk('hud-score');
    R.notif = mk('hud-notifs');
    R.abilities = mk('hud-abilities');
    R.telemetry = mk('hud-telemetry');
    R.launch = mk('launch-ui');
    R.banner = mk('hud-banner');
    R.camera = mk('hud-camera');
    const el = mk('battle-hud', mk('hud-top', panels[0], mk('hud-center', R.round, R.timer, R.score), panels[1]), R.notif, R.launch, R.banner, R.abilities, R.telemetry, R.camera);
    return el;
  }

  onEnter() {
    const app = this.app;
    const s = this.session;
    app.stopShowcase();
    app.sceneMode = 'battle';
    app.renderer.rig.override = null;
    app.renderer.rig.mode = app.settings.gameplay.camera || 'broadcast';
    app.renderer.rig.setPlayerSide(0);
    app.renderer.rig.yawOff = 0; app.renderer.rig.pitchOff = 0; app.renderer.rig.zoomOff = 0;
    app.renderer.setArena(ARENA_INDEX[s.arenaId]);
    app.renderer.settings.debug = !!app.settings.graphics.debugOverlay;
    this.telemetry = !!app.settings.gameplay.telemetry;
    app.audio.playMusic('battle');
    app.audio.crowdAmbience(true);
    app.input.context = 'battle';
    this.startBattle();
  }

  startBattle() {
    const app = this.app;
    const s = this.session;
    const testRound = typeof window !== 'undefined' && window.__testRoundTime;
    const battle = new Battle({
      arenaId: s.arenaId, format: s.format, roundTime: testRound || s.roundTime, seed: s.seed, mode: s.mode,
      participants: s.participants, rules: { slowmo: app.settings.gameplay.slowmo, ...(s.rules || {}) },
    });
    this.battle = battle;
    this.humans = battle.fighters.filter((f) => f.human).map((f) => new HumanController(app, battle, f.index));
    battle.on('roundStart', () => this.onRoundStart());
    battle.on('*', (type, e) => this.onEvent(type, e));
    battle.update(0);
    this.app.renderer.rig.snap();
  }

  onExit() {
    const app = this.app;
    app.audio.stopHums();
    app.audio.crowdAmbience(false);
    app.input.context = 'menu';
    app.renderer.settings.debug = false;
    app.renderer.clearFighters();
  }

  onRoundStart() {
    const app = this.app;
    const b = this.battle;
    app.renderer.setFighters(b.fighters);
    for (const hc of this.humans) hc.initFromAim();
    app.renderer.rig.override = 'launch';
    this.refs.banner.className = 'hud-banner';
    this.refs.banner.innerHTML = '';
    b.fighters.forEach((f, i) => {
      const r = this.refs.f[i];
      r.name.textContent = f.name;
      const bd = f.p.beast ? BEAST_INDEX[f.p.beast.id] : null;
      r.beast.textContent = bd ? `${bd.name} · ${f.p.beast.bondLevel ? 'Bond ' + f.p.beast.bondLevel : ''}${f.resonant ? ' · Resonant' : ''}` : 'No Bit-Beast';
      r.emb.innerHTML = '';
      if (bd) r.emb.append(beastImg(bd.id, 40));
      r.lock.innerHTML = '';
      for (let n = 0; n < f.top.spec.burst.notches; n++) r.lock.append(h('span', { class: 'pip' }));
      r.root.style.setProperty('--fc', f.p.color || f.assembly.parts.ring.color);
    });
    this.buildAbilityBar();
    this.notify(`ROUND ${b.round}`, 'round');
    this.ui.refreshPrompts();
  }

  buildAbilityBar() {
    const f = this.battle.fighters.find((x) => x.human);
    const bar = this.refs.abilities;
    bar.innerHTML = '';
    this.abilityRefs = [];
    if (!f) return;
    const add = (key, action, ctx, name, desc, getState) => {
      const el = h('div', { class: 'ab' }, h('kbd', {}, this.app.input.glyph(action, ctx)), h('div', { class: 'ab-name' }, name), h('div', { class: 'ab-cd' }));
      el.title = desc;
      bar.append(el);
      this.abilityRefs.push({ el, getState });
    };
    const A = f.ability;
    for (const [slot, action] of [['signature', 'ability1'], ['secondary', 'ability2'], ['ultimate', 'ultimate']]) {
      const d = A.beast?.abilities[slot];
      if (!d) continue;
      const def = A.slotDef(slot);
      const glyphAction = slot === 'ultimate' && this.app.input.lastDevice.type === 'gamepad' ? null : action;
      add(slot, glyphAction || 'tactical1', 'battle', `${d.name}${def ? ` (${Math.round(A.costOf(slot))})` : ''}`, d.desc, () => {
        if (!def) return { state: 'locked', text: slot === 'ultimate' ? 'Awaken' : `Bond ${d.bond}` };
        const c = A.canActivate(slot);
        return { state: c.ok ? 'ready' : 'wait', text: A.cool[slot] > 0 ? A.cool[slot].toFixed(1) + 's' : c.ok ? 'READY' : c.reason };
      });
      if (slot === 'ultimate' && this.app.input.lastDevice.type === 'gamepad') this.abilityRefs[this.abilityRefs.length - 1].el.querySelector('kbd').textContent = 'LB+RB';
    }
    add('dash', 'dash', 'battle', 'Dash', TECHNIQUE_DEFS.dash.desc, () => ({ state: A.cool.dash > 0 ? 'wait' : 'ready', text: A.cool.dash > 0 ? A.cool.dash.toFixed(1) + 's' : '' }));
    add('brace', 'brace', 'battle', 'Brace', TECHNIQUE_DEFS.brace.desc, () => ({ state: A.bracing ? 'active' : 'ready', text: A.bracing ? 'ON' : 'hold' }));
    add('counter', 'counter', 'battle', 'Counter', TECHNIQUE_DEFS.counter.desc, () => ({ state: A.counter ? 'active' : A.cool.counter > 0 ? 'wait' : 'ready', text: A.counter ? 'ARMED' : A.cool.counter > 0 ? A.cool.counter.toFixed(1) + 's' : '' }));
    add('guard', 'tactical1', 'battle', 'Spirit Guard (25)', TECHNIQUE_DEFS.guard.desc, () => ({ state: A.cool.guard > 0 || A.spirit < 25 ? 'wait' : 'ready', text: A.cool.guard > 0 ? A.cool.guard.toFixed(1) + 's' : '' }));
    add('surge', 'tactical2', 'battle', 'Spirit Surge (25)', TECHNIQUE_DEFS.surge.desc, () => ({ state: A.cool.surge > 0 || A.spirit < 25 ? 'wait' : 'ready', text: A.cool.surge > 0 ? A.cool.surge.toFixed(1) + 's' : '' }));
  }

  // ------------------------------------------------------------ events

  onEvent(type, e) {
    const app = this.app;
    const b = this.battle;
    app.renderer.onBattleEvent(type, e, b);
    const human = b.fighters.find((f) => f.human);
    const involvesHuman = (f) => f && f === human;
    switch (type) {
      case 'countdownStart': app.renderer.rig.override = 'launch'; this.ui.refreshPrompts(); break;
      case 'countdown': app.audio.countdown(e.n); this.bigText(String(e.n), 'count'); break;
      case 'ignite': app.audio.countdown(0); app.audio.ignite(); this.bigText('IGNITE!', 'ignite'); app.input.rumble(0.3, 0.6, 150); break;
      case 'release': if (involvesHuman(e.fighter)) app.input.rumble(0.2, 0.4, 120); break;
      case 'launch': {
        app.audio.launch(e.result.quality.label);
        const q = e.result.quality;
        if (involvesHuman(e.fighter)) {
          const label = q.label === 'Perfect' ? 'PERFECT LAUNCH!' : q.label === 'Good' ? 'Good launch' : q.label === 'Weak' ? 'Weak launch' : q.label === 'Overcharge' ? 'OVERCHARGED!' : q.label === 'Misfire' ? 'MISFIRE!' : q.label;
          this.notify(label, q.label === 'Perfect' ? 'gold' : q.label === 'Good' ? 'good' : 'bad');
          if (q.poorAngle) this.notify(`Poor angle (${q.tiltDeg.toFixed(0)}° tilt)`, 'bad');
          if (q.techniqueSuccess === true) this.notify(`${q.techniqueName} landed!`, 'gold');
          else if (q.techniqueSuccess === false) this.notify(`${q.techniqueName} failed`, 'bad');
          this.notify(`${fmtRpm(e.result.spin)} · ${e.result.energy.toFixed(2)} J`, 'info');
        }
        if (b.fighters.every((f) => f.launch.launched)) app.renderer.rig.override = null;
        break;
      }
      case 'battleStart': app.renderer.rig.override = null; this.ui.refreshPrompts(); break;
      case 'impact': {
        app.audio.impact(e.impulse, e.approach);
        if (involvesHuman(e.A) || involvesHuman(e.B)) app.input.rumble(Math.min(1, e.impulse * 10), Math.min(1, e.impulse * 14), 90 + e.impulse * 900);
        if (e.critical) this.notify('CRITICAL IMPACT', 'crit');
        break;
      }
      case 'grind': app.audio.grind(e.impulse * 30); break;
      case 'wall': app.audio.wall(e.impulse); if (involvesHuman(e.fighter)) app.input.rumble(0.2, Math.min(1, e.impulse * 8), 60); break;
      case 'lockClick': app.audio.lockClick(); this.notify(`${e.fighter.name}: LOCK SLIP ${Math.floor(e.notches)}/${e.max}`, involvesHuman(e.fighter) ? 'bad' : 'good'); if (involvesHuman(e.fighter)) app.input.rumble(0.7, 0.2, 140); break;
      case 'ability': {
        const el = BEAST_INDEX[e.fighter.p.beast?.id]?.element;
        app.audio.ability(el, e.slot);
        this.notify(`${e.fighter.name}: ${e.def.name}!`, e.slot === 'ultimate' ? 'gold' : 'ability');
        break;
      }
      case 'shockwave': app.audio.shockwave(); break;
      case 'abilityHit': this.notify(`${e.def.name} hit!`, 'crit'); break;
      case 'technique': if (e.name === 'dash') app.audio.dash(); break;
      case 'counter': app.audio.counter(); this.notify(`${e.fighter.name}: COUNTER!`, 'gold'); break;
      case 'counterWhiff': if (involvesHuman(e.fighter)) this.notify('Counter missed', 'info'); break;
      case 'interrupted': this.notify(`${e.name} interrupted!`, 'bad'); break;
      case 'restore': app.audio.heal(); this.notify(`${e.fighter.name} restored spin (+${e.energy.toFixed(2)} J)`, 'good'); break;
      case 'topFinished':
        if (e.how === 'burst') app.audio.burst();
        else if (e.how === 'out') app.audio.ringOut();
        this.bigText(e.how === 'burst' ? 'SHATTER!' : e.how === 'out' ? 'RING OUT!' : 'SPIN FINISH!', 'finish');
        if (involvesHuman(e.fighter)) app.input.rumble(1, 1, 400);
        break;
      case 'roundEnd': this.showRoundResult(e); this.ui.refreshPrompts(); break;
      case 'matchEnd': this.onMatchEnd(e); break;
      case 'physicsRecovered': console.warn('Physics recovery triggered', e); break;
      default:
    }
  }

  // ------------------------------------------------------------ per frame

  update(dt) {
    const b = this.battle;
    if (!b || this.paused) return;
    const app = this.app;
    const controls = [];
    for (const hc of this.humans) {
      if (b.phase === 'setup' || b.phase === 'countdown') hc.updateLaunch(dt);
      controls[hc.index] = hc.battleControls(dt);
    }
    // test hook: accelerated simulation for automated browser tests
    const speed = (typeof window !== 'undefined' && window.__testSpeed) || 1;
    if (speed > 1) { for (let k = 0; k < speed; k++) b.update(dt, controls); }
    else b.update(dt, controls);
    const r = app.renderer;
    if (b.sim) {
      r.updateLaunch(b, this.humans.length ? null : []);
      const alpha = Math.min(1, b.acc / TICK);
      r.updateBattle(b, alpha, dt);
      const launchAim = b.fighters.find((f) => f.human)?.launch.aim || b.fighters[0].launch.aim;
      r.rig.update(dt, {
        tops: r.visuals.map((v) => (v.fighter.launch.launched ? v.root : null)), playerIndex: b.fighters.findIndex((f) => f.human),
        arenaRadius: b.arena.radius, launch: launchAim, victory: this.victoryPos,
      });
      for (const f of b.fighters) app.audio.setHum(f.id, f.top.spinAbs, Math.hypot(f.top.v.x, f.top.v.z), f.launch.launched && f.top.active);
    }
    this.updateHud(dt);
  }

  handleInput(input, dt) {
    if (this.paused) return false;
    const b = this.battle;
    if (input.pressed('pause', 'battle') || input.pressed('pause', 'launch') || input.pressed('pause', 'menu')) { this.pause(); return true; }
    if (b.phase === 'roundOver' || b.phase === 'matchOver') {
      if (this.refs.banner.classList.contains('show') && (input.pressed('confirm', 'menu') || input.pressed('dash', 'battle'))) { input.consumeAll(); this.continueRound(); }
      return true;
    }
    if (input.pressed('telemetry', 'battle')) { this.telemetry = !this.telemetry; }
    if (input.pressed('focus', 'battle') && b.phase !== 'setup' && b.phase !== 'countdown') {
      const m = this.app.renderer.rig.cycle();
      this.camText(CAMERA_NAMES[m]);
    }
    const cx = input.value('cam_x', 'battle'), cy = input.value('cam_y', 'battle');
    if (b.phase === 'battle' || b.phase === 'finishing') this.app.renderer.rig.input(cx, cy, dt);
    return true;
  }

  camText(t) {
    this.refs.camera.textContent = 'Camera: ' + t;
    this.refs.camera.classList.add('show');
    clearTimeout(this._camT);
    this._camT = setTimeout(() => this.refs.camera.classList.remove('show'), 1400);
  }

  // ------------------------------------------------------------ HUD

  stability(f) {
    const t = f.top;
    if (!f.launch.launched) return ['—', ''];
    if (!t.active) return [t.state === 'out' ? 'OUT' : t.state === 'burst' ? 'SHATTERED' : 'DOWN', 'down'];
    const margin = t.spinAbs / Math.max(1, f.assembly.summary.critSpin);
    const tilt = t.tilt * 57.3;
    if (margin < 1.4 || tilt > 22 || t.scraping) return ['CRITICAL', 'crit'];
    if (margin < 2.5 || tilt > 9) return ['WOBBLING', 'warn'];
    return ['STABLE', 'ok'];
  }

  updateHud(dt) {
    const b = this.battle;
    const R = this.refs;
    this.hudT += dt;
    b.fighters.forEach((f, i) => {
      const r = R.f[i];
      const t = f.top;
      const frac = f.launch.launched ? t.spinFraction() : f.launch.meter?.charge || 0;
      r.spinFill.style.width = `${Math.min(1, frac) * 100}%`;
      r.spinFill.classList.toggle('low', frac < 0.3);
      r.spiritFill.style.width = `${f.ability.spirit}%`;
    });
    if (this.hudT > 0.08) {
      this.hudT = 0;
      b.fighters.forEach((f, i) => {
        const r = R.f[i];
        const t = f.top;
        r.spinText.textContent = f.launch.launched ? fmtRpm(t.spinAbs) : 'charging';
        const [st, cls] = this.stability(f);
        r.stab.textContent = st;
        r.stab.className = 'fp-stab ' + cls;
        const pips = r.lock.children;
        const n = t.burstNotches;
        for (let k = 0; k < pips.length; k++) {
          pips[k].className = 'pip' + (n >= k + 1 ? ' gone' : n > k ? ' partial' : '');
          if (n > k && n < k + 1) pips[k].style.setProperty('--p', `${(n - k) * 100}%`);
        }
        r.spiritText.textContent = Math.floor(f.ability.spirit);
        const tags = [];
        if (f.ability.bracing) tags.push('BRACE');
        if (f.ability.counter) tags.push('COUNTER');
        if (f.ability.channel) tags.push('CHANNEL ' + f.ability.channel.name);
        for (const tm of f.mods.timed) if (tm.origin === 'ability' && !tm.id.startsWith('counter')) tags.push(tm.name);
        r.status.textContent = [...new Set(tags)].join(' · ');
      });
      // timer & round
      const left = b.phase === 'battle' || b.phase === 'finishing' ? Math.max(0, b.roundTime - b.battleTime) : b.roundTime;
      R.timer.textContent = fmtTime(left);
      R.timer.classList.toggle('low', left < 15 && b.phase === 'battle');
      R.round.textContent = `${this.session.title || ''} · Round ${b.round} · ${b.format.name}`;
      const sc = b.fighters.map((f) => b.format.pointsToWin ? `${f.stats.points}` : `${f.stats.roundsWon}`);
      R.score.innerHTML = '';
      R.score.append(h('span', { class: 'sc' }, sc[0]), h('span', { class: 'sc-sep' }, b.format.pointsToWin ? `pts (to ${b.format.pointsToWin})` : 'rounds'), h('span', { class: 'sc' }, sc[1]));
      // abilities
      for (const a of this.abilityRefs || []) {
        const s = a.getState();
        a.el.className = 'ab ' + s.state;
        a.el.querySelector('.ab-cd').textContent = s.text || '';
      }
      this.updateLaunchUi();
      this.updateTelemetry();
    }
    // notifications lifetime
    const now = performance.now();
    for (const n of this.notifs) if (now - n.t > 2200) n.el.classList.add('fade');
    this.notifs = this.notifs.filter((n) => { if (now - n.t > 2700) { n.el.remove(); return false; } return true; });
  }

  updateLaunchUi() {
    const b = this.battle;
    const f = b.fighters.find((x) => x.human);
    const el = this.refs.launch;
    if (!f || !(b.phase === 'setup' || b.phase === 'countdown') || f.launch.released) { el.classList.remove('show'); return; }
    el.classList.add('show');
    const L = f.launch;
    const T = TECHNIQUE_INDEX[L.technique];
    const z = L.meter.zones();
    const g = (a, c = 'launch') => this.app.input.glyph(a, c);
    const charge = L.meter.charge;
    const scale = (v) => `${(v / (z.misfire + 0.05)) * 100}%`;
    el.innerHTML = '';
    el.append(
      h('div', { class: 'launch-head' }, b.phase === 'setup' ? 'LAUNCH SETUP' : 'CHARGE — RELEASE ON IGNITE'),
      h('div', { class: 'launch-grid' },
        h('div', {}, h('div', { class: 'muted' }, 'Technique'), h('b', {}, T.name), h('div', { class: 'small' }, T.desc)),
        h('div', {}, h('div', { class: 'muted' }, 'Spin'), h('b', {}, L.spin === 'R' ? 'Right ⟳' : 'Left ⟲'), h('div', { class: 'small' }, L.spinOptions.length > 1 ? 'Switchable' : 'Fixed by launcher')),
        h('div', {}, h('div', { class: 'muted' }, 'Lean'), h('b', {}, `${(L.aim.lean * 57.3).toFixed(1)}°`), h('div', { class: 'small' }, `Pos ${(Math.hypot(L.aim.x, L.aim.z) * 100).toFixed(1)} cm from centre`))),
      h('div', { class: 'charge-meter' },
        h('div', { class: 'cm-zone perfect', style: { left: scale(z.perfectLo), width: `calc(${scale(z.perfectHi)} - ${scale(z.perfectLo)})` } }),
        h('div', { class: 'cm-zone over', style: { left: scale(1), width: `calc(${scale(z.misfire)} - ${scale(1)})` } }),
        h('div', { class: 'cm-zone misfire', style: { left: scale(z.misfire), right: '0' } }),
        h('div', { class: 'cm-fill', style: { width: scale(Math.min(charge, z.misfire + 0.05)) } }),
        h('div', { class: 'cm-mark', style: { left: scale(PERFECT_CENTER) } }),
        b.phase === 'countdown' && L.meter.holding ? h('div', { class: 'cm-predict', style: { left: scale(Math.min(z.misfire + 0.04, charge + Math.max(0, 3 - b.phaseT) * f.gear.chargeRate * (charge > 1 ? 0.55 : 1))) }, title: 'Charge at IGNITE if you keep holding' }) : null),
      b.phase === 'countdown' ? h('div', { class: 'cm-timeline' }, `IGNITE in ${Math.max(0, 3 - b.phaseT).toFixed(1)} s · full charge takes ${(1 / f.gear.chargeRate).toFixed(1)} s — start charging early enough to reach the gold window at IGNITE`) : null,
      h('div', { class: 'launch-help' },
        b.phase === 'setup'
          ? [hint(g('aim_x'), 'move'), hint(g('lean_x'), 'lean'), hint(g('technique'), 'technique'), hint(g('switch_config'), 'spin'), hint(g('charge'), 'ready')]
          : [hint(g('charge'), 'hold to charge'), hint(this.app.input.releaseOnChargeUp() ? g('charge') : g('release'), this.app.input.releaseOnChargeUp() ? 'let go to release' : 'release'), h('span', { class: 'small' }, 'Release in the gold window, right at IGNITE.')]));
  }

  updateTelemetry() {
    const el = this.refs.telemetry;
    el.classList.toggle('show', this.telemetry);
    if (!this.telemetry) return;
    const b = this.battle;
    el.innerHTML = '';
    for (const f of b.fighters) {
      const t = f.top;
      const led = t.ledger || {};
      const rows = LEDGER_KEYS.map((k) => h('div', { class: 'tl-row' }, h('span', {}, LEDGER_NAMES[k]), h('span', { class: (led[k] || 0) < 0 ? 'neg' : 'pos' }, `${(led[k] || 0).toFixed(3)} J`)));
      const activeMods = [...f.mods.active].slice(0, 6).map((id) => id.split(':').slice(-1)[0]);
      el.append(h('div', { class: 'tl-block' },
        h('div', { class: 'tl-title' }, f.name),
        h('div', { class: 'tl-row' }, h('span', {}, 'Spin'), h('span', {}, `${t.spinAbs.toFixed(0)} rad/s (crit ${f.assembly.summary.critSpin.toFixed(0)})`)),
        h('div', { class: 'tl-row' }, h('span', {}, 'Tilt / speed'), h('span', {}, `${(t.tilt * 57.3).toFixed(1)}° / ${Math.hypot(t.v.x, t.v.z).toFixed(2)} m/s`)),
        h('div', { class: 'tl-row' }, h('span', {}, 'E rot / lin / pot'), h('span', {}, `${t.rotationalEnergy().toFixed(3)} / ${t.linearEnergy().toFixed(3)} / ${t.potentialEnergy().toFixed(3)} J`)),
        h('div', { class: 'tl-row' }, h('span', {}, 'Lock stress'), h('span', {}, `${t.burstNotches.toFixed(2)} / ${t.spec.burst.notches}`)),
        h('div', { class: 'tl-sub' }, 'Energy ledger (cumulative)'), ...rows,
        activeMods.length ? h('div', { class: 'tl-sub' }, 'Active: ' + activeMods.join(', ')) : null));
    }
    const li = b.lastImpact;
    if (li?.energy) {
      const [b0, b1] = li.energy.before, [a0, a1] = li.energy.after;
      el.append(h('div', { class: 'tl-block' }, h('div', { class: 'tl-title' }, `Last impact @ ${li.time.toFixed(2)} s — ${li.impulse.toFixed(3)} N·s`),
        h('div', { class: 'tl-row' }, h('span', {}, li.A.name), h('span', {}, `${b0.toFixed(3)} → ${a0.toFixed(3)} J`)),
        h('div', { class: 'tl-row' }, h('span', {}, li.B.name), h('span', {}, `${b1.toFixed(3)} → ${a1.toFixed(3)} J`)),
        h('div', { class: 'tl-row' }, h('span', {}, 'Dissipated'), h('span', { class: 'neg' }, `${(b0 + b1 - a0 - a1).toFixed(4)} J`))));
    }
    el.append(h('div', { class: 'tl-foot' }, `Sim t=${b.sim?.time.toFixed(2)} s · ${b.sim?.substeps}×${(TICK * 1000).toFixed(2)} ms ticks · ${this.app.renderer.fps().toFixed(0)} fps`));
  }

  notify(text, kind = 'info') {
    const el = h('div', { class: 'notif ' + kind }, text);
    this.refs.notif.prepend(el);
    this.notifs.push({ el, t: performance.now() });
    while (this.notifs.length > 6) this.notifs.shift().el.remove();
  }

  bigText(text, kind) {
    const el = h('div', { class: 'big-text ' + kind }, text);
    this.el.append(el);
    setTimeout(() => el.remove(), 1200);
  }

  // ------------------------------------------------------------ round / match

  showRoundResult(rr) {
    const b = this.battle;
    const winner = rr.winner != null ? b.fighters[rr.winner] : null;
    const bn = this.refs.banner;
    bn.innerHTML = '';
    bn.className = 'hud-banner show ' + (winner ? (winner.human ? 'win' : 'lose') : 'draw');
    bn.append(
      h('div', { class: 'bn-finish' }, FINISH_NAMES[rr.how] || rr.how),
      h('div', { class: 'bn-winner' }, winner ? `${winner.name} wins the round` : 'Draw'),
      h('div', { class: 'bn-expl' }, rr.explanation),
      ...(rr.adapt || []).filter((a) => !b.fighters[a.index].human).map((a) => h('div', { class: 'bn-adapt' }, `${a.name} adapts: ${a.note}.`)),
      h('div', { class: 'bn-cont' }, h('kbd', {}, this.app.input.glyph('confirm', 'menu')), b.phase === 'matchOver' ? ' Match summary' : ' Next round'));
    if (winner) {
      const v = this.app.renderer.visuals[winner.index];
      this.victoryPos = v.root.position.clone();
      this.app.renderer.rig.override = 'victory';
      this.app.renderer.effects.victory(v.root.position, winner.p.color || '#ffffff');
      if (winner.human) this.app.audio.victory(); else if (b.fighters.some((f) => f.human)) this.app.audio.defeat();
    }
  }

  continueRound() {
    const b = this.battle;
    this.refs.banner.className = 'hud-banner';
    this.app.renderer.rig.override = null;
    this.victoryPos = null;
    if (b.phase === 'matchOver' || b.result) { this.toResults(); return; }
    b.nextRound();
  }

  onMatchEnd(result) {
    this.matchResult = result;
    // results are shown when the player dismisses the round banner
  }

  async toResults() {
    const app = this.app;
    const res = this.matchResult || this.battle.result;
    let rewards = null;
    if (app.processMatch) rewards = await app.processMatch(res, this.session, this.battle);
    if (this.session.onFinish) {
      const handled = await this.session.onFinish(res, rewards, this);
      if (handled) return;
    }
    this.ui.push(new ResultsScreen({ result: res, rewards, session: this.session, battle: this.battle, onRematch: this.session.allowRematch === false ? null : () => this.rematch(), onExit: () => this.exit() }));
  }

  rematch() {
    // pop results, restart a fresh battle with the same session
    this.ui.pop();
    if (this.session.rebuild) this.session.participants = this.session.rebuild();
    this.app.renderer.clearFighters();
    this.startBattle();
  }

  exit() {
    // leave results + battle
    while (this.ui.current !== this && this.ui.stack.length > 1) this.ui.pop();
    if (this.ui.current === this) this.ui.pop();
    this.session.onExit?.();
  }

  // ------------------------------------------------------------ pause

  pause() {
    if (this.paused) return;
    this.paused = true;
    this.battle.paused = true;
    this.app.audio.stopHums();
    this.ui.push(new PauseOverlay(this));
  }

  resume() {
    this.paused = false;
    this.battle.paused = false;
    this.app.input.consumeAll();
  }

  onControllerLost() { if (this.battle.phase !== 'roundOver') this.pause(); }

  prompts() {
    const b = this.battle;
    if (!b) return [];
    if (b.phase === 'roundOver' || b.phase === 'matchOver') return [['confirm', 'Continue'], ['pause', 'Pause', 'battle']];
    if (b.phase === 'setup') return [['charge', 'Ready', 'launch'], ['technique', 'Technique', 'launch'], ['pause', 'Pause', 'launch']];
    return [['steer_x', 'Steer', 'battle'], ['dash', 'Dash', 'battle'], ['ability1', 'Ability', 'battle'], ['focus', 'Camera', 'battle'], ['telemetry', 'Telemetry', 'battle'], ['pause', 'Pause', 'battle']];
  }
}

function hint(g, label) { return h('span', { class: 'hint' }, h('kbd', {}, g), ' ', label); }

class PauseOverlay {
  static screenName = 'PauseOverlay';
  constructor(screen) { this.screen = screen; this.overlay = true; }
  render() {
    const s = this.screen;
    const items = h('div', { class: 'col gap', 'data-wrap': '' },
      btn('Resume', () => this.close(), { class: 'primary' }),
      btn(s.telemetry ? 'Hide telemetry' : 'Show telemetry', () => { s.telemetry = !s.telemetry; this.ui.refresh(this); }, { desc: 'Advanced physics readout: energy ledger, tilt, speeds, lock stress.' }),
      btn(`Camera: ${CAMERA_NAMES[this.app.renderer.rig.mode]}`, () => { this.app.renderer.rig.cycle(); this.ui.refresh(this); }),
      btn(this.app.renderer.settings.debug ? 'Hide physics debug overlay' : 'Show physics debug overlay', () => { this.app.renderer.settings.debug = !this.app.renderer.settings.debug; if (!this.app.renderer.settings.debug && s.battle.sim) s.battle.sim.debug.enabled = false; this.ui.refresh(this); }, { desc: 'Contact points, collision normals, velocity vectors, spin axis, angular momentum and centre of mass.' }),
      btn('Settings', () => this.ui.push(new SettingsScreen())),
      s.session.allowRestart === false ? null : btn('Restart match', async () => { if (await this.ui.confirm('Restart match?', 'The current match will be abandoned without rewards.')) { this.ui.pop(); s.resume(); s.app.renderer.clearFighters(); s.startBattle(); } }),
      btn(s.session.forfeitLabel || 'Quit match', async () => { if (await this.ui.confirm('Quit match?', s.session.forfeitWarning || 'You will leave without rewards. Equipment wear from completed rounds is kept.', { danger: true, yes: 'Quit' })) { this.ui.pop(); s.resume(); s.forfeit(); } }, { class: 'danger' }));
    return h('div', { class: 'pause-overlay' }, h('div', { class: 'panel pause-panel' }, h('h1', {}, 'Paused'), items));
  }
  close() { this.ui.pop(); this.screen.resume(); }
  onBack() { this.close(); return true; }
  handleInput(input) { if (input.pressed('pause', 'menu') || input.pressed('pause', 'battle')) { this.close(); return true; } return false; }
}

BattleScreen.prototype.forfeit = function forfeit() {
  this.session.onForfeit?.(this);
  this.ui.pop();
};
