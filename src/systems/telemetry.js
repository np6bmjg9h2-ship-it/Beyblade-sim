// Opt-in play data for balancing. When the game runs as the shared claude.ai
// artifact, finished battles, Rift runs and errors are written to the
// artifact's own database (the `db` capability); Claude reads them back to
// tune traits, synergies and the economy from real play. Only viewers who
// may write to that database can send anything (in practice the artifact's
// owner: outside visitors by link never write), and only after they agree.
// Records hold gameplay numbers only: no names, no save data. Anywhere else
// (file://, another host) this does nothing.
//
// Storage: one document per session part, `telemetry/<session>-<part>`, each
// holding up to MAX_EVENTS events; one write at a time, debounced.

import { GAME_VERSION } from '../version.js';
import { SLOTS } from '../data/parts.js';

export const MAX_EVENTS = 80;
const MAX_ERRORS = 20;
const FLUSH_MS = 1500;

const r1 = (x) => Math.round(x * 10) / 10;
const r3 = (x) => Math.round(x * 1000) / 1000;

function itemRecord(it) {
  if (!it) return null;
  if (!it.base) return { base: it.id || null }; // a bare part definition (AI archetypes)
  return {
    base: it.base, rarity: it.rarity, level: it.level, gen: it.gen?.v || 1,
    traits: [...(it.traits || []), ...(it.special ? [it.special] : [])].map((t) => [t.id, r3(t.mag ?? 1)]),
    set: it.set || null, mastery: Math.round(it.xp || 0), cond: it.maxDurability ? Math.round((100 * it.durability) / it.maxDurability) : 100,
  };
}

function fighterRecord(f, detailed) {
  const p = f.p, st = f.stats;
  const build = {};
  for (const s of SLOTS) if (p.build?.[s]) build[s] = detailed ? itemRecord(p.build[s]) : (p.build[s].base || p.build[s].id);
  const sources = Object.entries(st.sources || {})
    .filter(([, x]) => x.origin !== 'ability' && (x.seconds > 0.05 || x.fired))
    .sort((a, b) => (b[1].fired * 2 + b[1].seconds) - (a[1].fired * 2 + a[1].seconds)).slice(0, 14)
    .map(([id, x]) => [id, r1(x.seconds), x.fired]);
  return {
    who: p.human ? 'player' : (p.rivalId || p.id || 'ai'), ai: p.human ? null : p.ai || null, difficulty: p.human ? null : r3(p.difficulty ?? 1),
    build, launcher: detailed ? itemRecord(p.launcher) : p.launcher?.base || p.launcher?.id || null, cable: detailed ? itemRecord(p.cable) : null,
    beast: p.beast?.id || null, spin: f.launch?.spin || p.spin || 'R', technique: p.technique || null, synergies: p.synergies || [],
    mass: r1(f.assembly?.summary?.massG || 0), freeSpin: Math.round(f.assembly?.summary?.estSpinTime || 0),
    stats: {
      impacts: st.impacts, maxHit: r3(st.impulseMax), walls: st.wallHits, dashes: st.dashes || 0, counters: st.counters || 0,
      abilities: st.abilitiesUsed || 0, slipsTaken: st.lockClicksTaken, slipsDealt: st.lockClicksDealt, spinTime: r1(st.spinTime),
      distance: r1(st.distance), perfect: st.perfectLaunches, launches: (st.launches || []).map((l) => l.label),
    },
    sources,
  };
}

// One finished battle as a plain record.
export function matchRecord(result, session, battle, rewards, extra = {}) {
  const hi = Math.max(0, result.fighters.findIndex((f) => f.human));
  const me = battle.fighters[hi], opp = battle.fighters[1 - hi];
  return {
    t: new Date().toISOString(), kind: 'match', mode: session.mode || battle.mode, arena: battle.arenaDef?.id, format: battle.format?.id,
    seed: battle.seed, won: result.winner === hi, draw: result.winner == null,
    rounds: result.rounds.map((r) => [r.winner === hi ? 'me' : r.winner == null ? 'draw' : 'opp', r.how, r1(r.time)]),
    me: fighterRecord(me, true), opp: fighterRecord(opp, false),
    rift: session.riftInfo || null,
    rewards: rewards ? { credits: rewards.credits || 0, xp: rewards.playerXp || 0, items: (rewards.items || []).map((i) => [i.base, i.rarity]), found: (rewards.unlocks || []).filter((u) => u.startsWith('Synergy')) } : null,
    ...extra,
  };
}

export class Telemetry {
  constructor(app) {
    this.app = app;
    this.db = null;
    this.state = 'off'; // off | ready | denied
    this.events = [];
    this.errors = 0;
    this.part = 0;
    this.timer = null;
    this.writing = null;
    this.session = `${new Date().toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 8)}`;
    this.started = new Date().toISOString();
  }

  get settings() { return this.app.settings.gameplay; }
  get available() { return this.state === 'ready'; }
  get enabled() { return this.available && this.settings.shareData === true; }

  // Find the artifact database; resolves quietly to nothing elsewhere.
  async init() {
    if (typeof window === 'undefined' || !window.claude?.use) return false;
    let db = null;
    try { db = await window.claude.use('db'); } catch { db = null; }
    if (!db) return false;
    this.db = db;
    this.state = 'ready';
    window.addEventListener('error', (e) => this.error(e.message, e.error?.stack));
    window.addEventListener('unhandledrejection', (e) => this.error(String(e.reason?.message || e.reason), e.reason?.stack));
    return true;
  }

  // Ask once (the first time the database is reachable).
  async askConsent() {
    if (!this.available || this.settings.shareData != null) return;
    const yes = await this.app.ui.confirm('Help balance Chaos Spin?',
      'Share play data from this browser with the game\'s developer: battles, builds, results, frame rate and errors. No names and no save data. You can turn it off any time in Settings → Gameplay.',
      { yes: 'Share play data', no: 'No thanks' });
    this.settings.shareData = !!yes;
    await this.app.saveSettings?.();
  }

  match(result, session, battle, rewards) {
    if (!this.enabled) return;
    try {
      const R = this.app.renderer;
      const gfx = { style: this.app.settings.graphics.style || 'ink', quality: this.app.settings.graphics.quality, fps: Math.round(R?.fps?.() || 0) };
      this.push(matchRecord(result, session, battle, rewards, { gfx }));
    } catch (e) { console.warn('telemetry', e); }
  }

  event(kind, data) { if (this.enabled) this.push({ t: new Date().toISOString(), kind, ...data }); }

  error(message, stack) {
    if (!this.enabled || this.errors >= MAX_ERRORS) return;
    this.errors++;
    this.push({ t: new Date().toISOString(), kind: 'error', message: String(message || '').slice(0, 300), stack: String(stack || '').slice(0, 600), screen: this.app.ui?.current?.constructor?.screenName || null });
  }

  push(ev) {
    this.events.push(ev);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), FLUSH_MS);
  }

  sessionDoc(events) {
    const R = this.app.renderer;
    return {
      v: 1, version: GAME_VERSION, session: this.session, part: this.part, started: this.started, updated: new Date().toISOString(),
      screen: typeof window !== 'undefined' ? [window.innerWidth, window.innerHeight, window.devicePixelRatio || 1] : null,
      gpu: R?.gpuName?.() || null, settings: { ...this.app.settings.graphics }, events,
    };
  }

  // One write at a time; a part fills up to MAX_EVENTS events, then the next part starts.
  async flush() {
    if (!this.enabled || !this.events.length) return;
    if (this.writing) { await this.writing; return this.flush(); }
    const events = this.events.slice(0, MAX_EVENTS);
    const doc = this.db.doc(`telemetry/${this.session}-${this.part}`);
    this.writing = doc.set(this.sessionDoc(events)).then(() => {
      if (this.events.length >= MAX_EVENTS) { this.events = this.events.slice(MAX_EVENTS); this.part++; }
    }).catch((e) => {
      // a viewer who may not write (or a full database): stop quietly for this visit
      if (e?.code === 'invalid_argument' || e?.code === 'quota_exceeded' || e?.code === 'revoked' || e?.code === 'not_granted') this.state = 'denied';
    }).finally(() => { this.writing = null; });
    await this.writing;
  }
}
