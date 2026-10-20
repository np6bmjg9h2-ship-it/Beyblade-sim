// Rift Run battle effects: statuses inflicted by hits (Scorch, Static, Rust)
// and their fusions, sweet-spot hits, and Second Wind. A participant opts in
// with a `rift` block (built by systems/riftBattle.js):
//   status       { scorch, static, rust }   chance per hit
//   statusPower  { id: extra strength }     statusTime { id: extra seconds }
//   sweet        sweet-spot chance          sweetMul (lock stress, default 2)
//   sweetSpirit  spirit per sweet spot      secondWind (fraction of launch spin)
//   keystones    { id: params } rule-changing legendaries (data/riftCharms.js):
//     rustprophet { stacks, lock }  Rust stacks on one target; at full stacks the lock drops
//     tideturner  { below }         notice only (its drag flip is two modifier sources)
//     hollowcore  { spin, max }     every sweet spot restores spin (fraction of launch spin)
//     laststand   {}                notice only (its bonus is built from the run's hearts)
// Everything acts through what the game already simulates: timed modifier
// channels, the lock-stress multiplier the abilities use, the spirit meter,
// and the simulation's ability helpers (energy booked to the 'ability'
// ledger). Rolls come from a seeded Rng, so battles and replays repeat.

import { Rng, mixSeeds } from '../core/rng.js';
import { STATUSES, FUSIONS, fusionKey, SWEET_SPOT } from '../data/rift.js';

const MIN_IMPULSE = 0.008; // N·s: lighter touches never inflict a status
const FLASHOVER_IMPULSE = 0.035; // N·s
const FLASHOVER_RANGE = 0.25; // m
const BRITTLE_MAX = 3;
const BRITTLE_TIME = 6;
const WIND_BELOW = 0.2;

export function hasRiftEffects(participants) { return participants.some((p) => p && p.rift); }

export class RiftEffects {
  constructor(battle) {
    this.b = battle;
    this.rng = new Rng(mixSeeds(battle.seed, battle.round, 'rift'));
    this.state = battle.fighters.map(() => ({ until: {}, brittle: 0, rust: 0, hollow: 0, told: {}, armed: null, windUsed: false }));
    for (const f of battle.fighters) this.arm(f);
  }

  cfg(f) { return f.p.rift || null; }
  ks(f, id) { return this.cfg(f)?.keystones?.[id] || null; }

  // A keystone fired: one HUD notice (once per round unless `repeat`).
  tell(f, id, text, repeat = false, extra = {}) {
    const S = this.state[f.index];
    if (S.told[id] && !repeat) return;
    S.told[id] = true;
    this.b.emit('keystone', { fighter: f, id, name: this.ks(f, id)?.name || id, text, ...extra });
  }

  // Roll whether this fighter's next hit lands on the sweet spot.
  arm(f) {
    const S = this.state[f.index];
    const c = this.cfg(f);
    if (S.armed || !c?.sweet) return;
    if (this.rng.chance(Math.min(0.9, c.sweet))) {
      S.armed = { mul: c.sweetMul || SWEET_SPOT.stressMul, kind: 'sweet' };
      f.mods.addTimed('rift:sweet', 'Sweet Spot', SWEET_SPOT.deltas, 999, 'rift');
    }
  }

  // Every tick before the simulation: keep armed hits armed (abilities reset
  // the shared multiplier when their own windows end) and run Second Wind.
  preTick() {
    for (const f of this.b.fighters) {
      const S = this.state[f.index];
      const top = f.top;
      if (!top?.active) continue;
      if (S.armed) top.nextHitStressMul = Math.max(top.nextHitStressMul || 1, S.armed.mul);
      if (f.launch?.launched && this.b.phase === 'battle') {
        if (this.ks(f, 'laststand')) this.tell(f, 'laststand', 'LAST STAND');
        const tide = this.ks(f, 'tideturner');
        if (tide && top.spinFraction() < tide.below) this.tell(f, 'tideturner', 'THE TIDE TURNS');
      }
      const wind = this.cfg(f)?.secondWind;
      if (wind && !S.windUsed && f.launch?.launched && this.b.phase === 'battle' && top.spinFraction() < WIND_BELOW) {
        S.windUsed = true;
        const w = top.spinAbs, w2 = Math.min(top.maxSpinRate, w + wind * top.maxSpinRate);
        const e = this.b.sim.restoreSpin(top, 0.5 * top.I3 * (w2 * w2 - w * w));
        this.b.emit('secondWind', { fighter: f, energy: e });
      }
    }
  }

  // After both abilities have processed a top-on-top impact.
  onImpact(fa, fb, e) {
    const pairs = [[fa, fb], [fb, fa]];
    for (const [att] of pairs) {
      const S = this.state[att.index];
      if (!S.armed) continue;
      const { kind } = S.armed;
      S.armed = null;
      att.mods.removeTimed('rift:sweet');
      att.top.nextHitStressMul = 1;
      if (kind === 'meltdown') { this.b.emit('meltdownHit', { fighter: att }); continue; }
      this.b.emit('sweetSpot', { fighter: att });
      const sp = this.cfg(att)?.sweetSpirit;
      if (sp) att.ability.gain(sp);
      this.hollowCore(att);
    }
    if (e.impulse >= MIN_IMPULSE) {
      for (const [att, def] of pairs) {
        const c = this.cfg(att);
        if (!c?.status || !def.top.active) continue;
        for (const id of Object.keys(STATUSES)) {
          const p = c.status[id] || 0;
          if (p > 0 && this.rng.chance(Math.min(0.95, p))) this.inflict(att, def, id);
        }
      }
    }
    for (const f of [fa, fb]) this.arm(f);
  }

  // Hollow Core: a sweet spot restores a slice of the round's launch spin,
  // never above it and at most `max` times a round. The energy goes through
  // the simulation's restoreSpin, so it is booked to the 'ability' ledger.
  hollowCore(att) {
    const h = this.ks(att, 'hollowcore');
    const S = this.state[att.index];
    const top = att.top;
    if (!h || S.hollow >= h.max || !top?.active) return;
    const w = top.spinAbs, w2 = Math.min(top.maxSpinRate, w + h.spin * top.maxSpinRate);
    if (!(w2 > w)) return;
    S.hollow++;
    const e = this.b.sim.restoreSpin(top, 0.5 * top.I3 * (w2 * w2 - w * w));
    this.tell(att, 'hollowcore', 'HOLLOW CORE: SPIN BACK', true, { energy: e });
  }

  inflict(att, def, id) {
    const S = this.state[def.index];
    const t = this.b.battleTime;
    const other = Object.keys(S.until).find((k) => k !== id && S.until[k] > t);
    if (other) { this.fuse(att, def, id, other); return; }
    const c = this.cfg(att) || {};
    const st = STATUSES[id];
    const k = 1 + (c.statusPower?.[id] || 0);
    const dur = st.duration + (c.statusTime?.[id] || 0);
    const prophet = id === 'rust' ? this.ks(att, 'rustprophet') : null;
    if (prophet) {
      // Rust Prophet: Rust on a rusted target stacks; at full stacks the lock drops `lock`
      S.rust = S.until.rust > t ? Math.min(prophet.stacks, S.rust + 1) : 1;
      const full = S.rust >= prophet.stacks;
      const deltas = st.deltas.map(([ch, v]) => [ch, ch === 'burstThreshold' && full ? -prophet.lock : v * k]);
      const name = S.rust > 1 ? `${st.name} ×${S.rust}` : st.name;
      def.mods.removeTimed('rift:rust');
      def.mods.addTimed('rift:rust', name, deltas, dur, 'rift');
      S.until.rust = t + dur;
      this.b.emit('riftStatus', { fighter: def, by: att, status: id, name, color: st.color });
      if (full) this.tell(att, 'rustprophet', 'RUST PROPHECY', true);
      return;
    }
    def.mods.addTimed('rift:' + id, st.name, st.deltas.map(([ch, v]) => [ch, v * k]), dur, 'rift');
    S.until[id] = t + dur;
    this.b.emit('riftStatus', { fighter: def, by: att, status: id, name: st.name, color: st.color });
  }

  fuse(att, def, a, b) {
    const S = this.state[def.index];
    for (const id of [a, b]) { def.mods.removeTimed('rift:' + id); delete S.until[id]; }
    const fu = FUSIONS[fusionKey(a, b)];
    if (fu.id === 'meltdown') {
      // the next hit on the melted lock is a triple
      this.state[att.index].armed = { mul: 3, kind: 'meltdown' };
    } else if (fu.id === 'flashover') {
      this.b.sim.applyShockwave(att.top, def.top, FLASHOVER_IMPULSE, FLASHOVER_RANGE);
    } else if (fu.id === 'brittle') {
      if (!def.mods.hasTimed('rift:brittle')) S.brittle = 0;
      S.brittle = Math.min(BRITTLE_MAX, S.brittle + 1);
      def.mods.addTimed('rift:brittle', `Brittle ×${S.brittle}`, [['burstThreshold', -0.15 * S.brittle], ['tipSpinDrag', 0.1 * S.brittle]], BRITTLE_TIME, 'rift');
    }
    this.b.emit('riftFusion', { fighter: def, by: att, fusion: fu.id, name: fu.name, color: fu.color });
  }
}
