// Translates player input (via the InputManager's action contexts) into
// launch setup operations and per-tick battle controls. Steering is
// camera-relative. The two bumpers pressed together trigger the ultimate.

import { Vec3, clamp } from '../core/math.js';
import { MAX_LEAN, LAUNCH_RING } from './launch.js';
import { TECHNIQUE_INDEX } from '../data/launchers.js';
import { emptyControls } from './ai.js';

const CHORD_WINDOW = 0.1;

export class HumanController {
  constructor(app, battle, index) {
    this.app = app;
    this.battle = battle;
    this.index = index;
    this.leanVec = { x: 0, z: 0 };
    this.autopilot = null; // { kind, t }
    this.bumperPending = null; // { which, t }
    this.wasCharging = false;
    this.controls = emptyControls();
  }

  initFromAim() {
    const L = this.battle.fighters[this.index].launch;
    if (!L) return;
    this.leanVec.x = Math.cos(L.aim.dir) * L.aim.lean;
    this.leanVec.z = Math.sin(L.aim.dir) * L.aim.lean;
  }

  get fighter() { return this.battle.fighters[this.index]; }

  basis() { return this.app.renderer?.rig.basis() || { fx: 0, fz: -1, rx: 1, rz: 0 }; }

  // ------------------------------------------------------------ launch phase

  updateLaunch(dt) {
    const input = this.app.input;
    const b = this.battle;
    const f = this.fighter;
    const L = f.launch;
    if (L.released) return;
    const ctx = 'launch';
    const { fx, fz, rx, rz } = this.basis();
    if (b.phase === 'setup' || b.phase === 'countdown') {
      // launcher position (camera-relative)
      const ax = input.value('aim_x', ctx), ay = input.value('aim_y', ctx);
      let { x, z } = L.aim;
      x += (rx * ax - fx * ay) * 0.09 * dt;
      z += (rz * ax - fz * ay) * 0.09 * dt;
      if (input.pressed('fine_up', ctx)) { x += fx * 0.004; z += fz * 0.004; }
      if (input.pressed('fine_down', ctx)) { x -= fx * 0.004; z -= fz * 0.004; }
      if (input.pressed('fine_left', ctx)) { x -= rx * 0.004; z -= rz * 0.004; }
      if (input.pressed('fine_right', ctx)) { x += rx * 0.004; z += rz * 0.004; }
      // lean vector (camera-relative)
      const lx = input.value('lean_x', ctx), ly = input.value('lean_y', ctx);
      this.leanVec.x += (rx * lx - fx * ly) * 0.35 * dt;
      this.leanVec.z += (rz * lx - fz * ly) * 0.35 * dt;
      let lm = Math.hypot(this.leanVec.x, this.leanVec.z);
      const step = Math.PI / 180;
      if (input.pressed('cycle_next', ctx) || input.pressed('cycle_prev', ctx)) {
        const dirSign = input.pressed('cycle_next', ctx) ? 1 : -1;
        const dir = lm > 1e-4 ? Math.atan2(this.leanVec.z, this.leanVec.x) : Math.atan2(-z, -x);
        lm = clamp(lm + dirSign * step, 0, MAX_LEAN);
        this.leanVec.x = Math.cos(dir) * lm; this.leanVec.z = Math.sin(dir) * lm;
      }
      if (lm > MAX_LEAN) { this.leanVec.x *= MAX_LEAN / lm; this.leanVec.z *= MAX_LEAN / lm; lm = MAX_LEAN; }
      const dir = lm > 1e-5 ? Math.atan2(this.leanVec.z, this.leanVec.x) : L.aim.dir;
      b.setAim(this.index, { x, z, lean: lm, dir });
      // technique & spin
      if (input.pressed('technique', ctx)) {
        const known = f.p.knownTechniques || ['normal'];
        const list = known.filter((t) => TECHNIQUE_INDEX[t]);
        const i = list.indexOf(L.technique);
        b.setTechnique(this.index, list[(i + 1) % list.length]);
        this.app.audio.ui('tab');
      }
      if (input.pressed('switch_config', ctx)) {
        const opts = L.spinOptions;
        if (opts.length > 1) { b.setSpin(this.index, opts[(opts.indexOf(L.spin) + 1) % opts.length]); this.app.audio.ui('tab'); }
        else { this.app.ui.toast('This launcher only launches ' + (opts[0] === 'R' ? 'right' : 'left') + ' spin.', 'warn'); this.app.audio.ui('error'); }
      }
    }
    if (b.phase === 'setup') {
      if (input.pressed('confirm', ctx) || input.pressed('charge', ctx) || input.pressed('confirm', 'menu')) {
        b.confirmSetup(this.index);
        this.app.audio.ui('confirm');
        this.chargeArmed = !input.held('charge', ctx); // must re-press charge after confirming with it
      }
      return;
    }
    if (b.phase === 'countdown') {
      const chargeVal = input.value('charge', ctx);
      const holding = chargeVal > 0.15;
      if (!holding) this.chargeArmed = true;
      const charging = holding && this.chargeArmed !== false;
      b.chargeInput(this.index, charging, chargeVal);
      const releaseOnUp = this.app.input.releaseOnChargeUp();
      if (input.pressed('release', ctx) && L.meter.charge > 0.05) b.release(this.index);
      else if (releaseOnUp && this.wasCharging && !charging && L.meter.charge > 0.15) b.release(this.index);
      this.wasCharging = charging;
    }
  }

  // ------------------------------------------------------------ battle phase

  battleControls(dt) {
    const input = this.app.input;
    const c = this.controls;
    c.dash = c.counter = c.ability1 = c.ability2 = c.ultimate = c.tactical1 = c.tactical2 = false;
    const ctx = 'battle';
    const { fx, fz, rx, rz } = this.basis();
    const sx = input.value('steer_x', ctx), sy = input.value('steer_y', ctx);
    c.steer.set(rx * sx - fx * sy, 0, rz * sx - fz * sy);
    const m = Math.hypot(c.steer.x, c.steer.z);
    if (m > 1) c.steer.scale(1 / m);
    // d-pad quick commands: short autopilot steering
    const cmds = { cmd_up: 'center', cmd_down: 'evade', cmd_left: 'circleL', cmd_right: 'circleR' };
    for (const [a, kind] of Object.entries(cmds)) if (input.pressed(a, ctx)) this.autopilot = { kind, t: 1.5 };
    if (this.autopilot && m < 0.2) {
      this.autopilot.t -= dt;
      this.autoSteer(c.steer, this.autopilot.kind);
      if (this.autopilot.t <= 0) this.autopilot = null;
    } else if (m >= 0.2) this.autopilot = null;
    c.brace = input.held('brace', ctx);
    if (input.pressed('dash', ctx)) c.dash = true;
    if (input.pressed('counter', ctx)) c.counter = true;
    if (input.pressed('ability1', ctx)) c.ability1 = true;
    if (input.pressed('ability2', ctx)) c.ability2 = true;
    if (input.pressed('ultimate', ctx)) c.ultimate = true;
    // bumper chord -> ultimate, else single tactical after a short window
    const p1 = input.pressed('tactical1', ctx), p2 = input.pressed('tactical2', ctx);
    if (p1 || p2) {
      const other = p1 ? 'tactical2' : 'tactical1';
      if ((p1 && p2) || input.held(other, ctx) || (this.bumperPending && this.bumperPending.which === other)) {
        c.ultimate = true; this.bumperPending = null;
      } else this.bumperPending = { which: p1 ? 'tactical1' : 'tactical2', t: CHORD_WINDOW };
    }
    if (this.bumperPending) {
      this.bumperPending.t -= dt;
      if (this.bumperPending.t <= 0) { c[this.bumperPending.which] = true; this.bumperPending = null; }
    }
    return c;
  }

  autoSteer(out, kind) {
    const f = this.fighter;
    const t = f.top;
    const opp = this.battle.fighters[1 - this.index].top;
    const v = new Vec3();
    if (kind === 'center') v.set(-t.p.x, 0, -t.p.z).scale(12);
    else if (kind === 'evade') { v.set(t.p.x - opp.p.x, 0, t.p.z - opp.p.z).normalize(); v.x -= t.p.x * 4; v.z -= t.p.z * 4; }
    else {
      const r = Math.max(1e-3, Math.hypot(t.p.x, t.p.z));
      const s = kind === 'circleL' ? 1 : -1;
      v.set((-t.p.z / r) * s, 0, (t.p.x / r) * s);
      v.x -= t.p.x * 2; v.z -= t.p.z * 2;
    }
    const m = Math.hypot(v.x, v.z);
    if (m > 1) v.scale(1 / m);
    out.copy(v);
  }
}
