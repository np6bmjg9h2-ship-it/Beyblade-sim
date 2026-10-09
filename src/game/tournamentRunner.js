// Keeps the active tournament moving: every AI-vs-AI match that becomes
// ready is simulated in the background (real headless battles via
// MatchSimulator), recorded, and the save is updated. Screens listen for
// 'result' events to refresh brackets and standings.

import { Emitter } from '../core/events.js';
import { MatchSimulator } from './matchSim.js';
import { aiMatches, aiMatchJob, applyResult, matchById } from '../systems/tournament.js';

export class TournamentRunner extends Emitter {
  constructor(app) {
    super();
    this.app = app;
    this.sim = new MatchSimulator();
    // main-thread fallback never runs while the player is in a battle
    this.sim.pauseInline = () => app.ui?.current?.constructor?.screenName === 'BattleScreen';
    this.inflight = new Set();
    this.errors = 0;
    this.saveTimer = null;
  }

  get active() { return this.app.profile?.tournaments?.active || null; }
  // every tournament-engine event in progress (circuit/story slot and league season)
  get all() { const P = this.app.profile; return [P?.tournaments?.active, P?.league?.active].filter(Boolean); }
  find(id) { return this.all.find((t) => t.id === id) || null; }
  get pending() { return this.inflight.size; }
  get mode() { return this.sim.mode; }

  reset() {
    this.sim.cancel('');
    this.inflight.clear();
    this.kick();
  }

  kick() {
    for (const t of this.all) if (t.status === 'active') this.kickOne(t);
  }

  kickOne(t) {
    for (const m of aiMatches(t)) {
      const key = `${t.id}:${m.id}`;
      if (this.inflight.has(key)) continue;
      this.inflight.add(key);
      let job;
      try { job = aiMatchJob(t, m, this.app.profile); } catch (e) { console.error(e); this.inflight.delete(key); continue; }
      this.sim.run(key, job).then((res) => {
        this.inflight.delete(key);
        const cur = this.find(t.id);
        if (!cur) return;
        const mm = matchById(cur, m.id);
        if (!mm || mm.status === 'done') return;
        applyResult(cur, m.id, { ...res, simulated: true });
        this.scheduleSave();
        this.emit('result', { tournament: cur, match: mm, result: res });
        this.kick();
      }).catch((err) => {
        this.inflight.delete(key);
        if (err?.message === 'cancelled') return;
        console.error('Tournament simulation failed', err);
        this.errors++;
        this.emit('error', { error: err });
      });
    }
  }

  scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.app.save('silent'), 400);
  }
}
