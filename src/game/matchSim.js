// Background match simulation. Uses Web Workers (created from an embedded
// Blob URL, so it also works when index.html is opened from disk) and falls
// back to time-sliced simulation on the main thread when workers are
// unavailable. Results come from real headless battles either way.

import { createJobBattle, stepJobBattle, summarizeResult, runMatchJob } from './matchJob.js';

/* global __SIM_WORKER_SRC__ */
const WORKER_SRC = typeof __SIM_WORKER_SRC__ !== 'undefined' ? __SIM_WORKER_SRC__ : null;

export class MatchSimulator {
  constructor({ maxWorkers = 2, inlineBudgetMs = 5 } = {}) {
    this.entries = new Map(); // key -> { job, resolve, reject, promise, state }
    this.queue = [];
    this.workers = [];
    this.inline = null;
    this.inlineBudgetMs = inlineBudgetMs;
    this.pauseInline = () => false;
    this.mode = 'inline';
    this.completed = 0;
    if (WORKER_SRC && typeof Worker !== 'undefined' && typeof Blob !== 'undefined') {
      try {
        const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
        const hc = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 2;
        const n = Math.max(1, Math.min(maxWorkers, hc - 1));
        for (let i = 0; i < n; i++) {
          const w = new Worker(url);
          w.busy = null;
          w.onmessage = (e) => this.onWorkerMessage(w, e.data);
          w.onerror = (e) => this.onWorkerError(w, e);
          this.workers.push(w);
        }
        this.mode = 'worker';
      } catch (e) {
        console.warn('Simulation workers unavailable; using main-thread simulation.', e);
        this.workers = [];
      }
    }
  }

  get pending() { return this.queue.length + this.workers.filter((w) => w.busy).length + (this.inline ? 1 : 0); }

  run(key, job) {
    const ex = this.entries.get(key);
    if (ex) return ex.promise;
    const entry = { key, job, state: 'queued' };
    entry.promise = new Promise((resolve, reject) => { entry.resolve = resolve; entry.reject = reject; });
    this.entries.set(key, entry);
    this.queue.push(key);
    this.pump();
    return entry.promise;
  }

  // Synchronous run (tests / tools).
  runNow(job) { return runMatchJob(job); }

  cancel(prefix = '') {
    for (const key of [...this.queue]) {
      if (!key.startsWith(prefix)) continue;
      this.queue.splice(this.queue.indexOf(key), 1);
      const e = this.entries.get(key);
      this.entries.delete(key);
      e?.reject(new Error('cancelled'));
    }
    for (const [key, e] of this.entries) if (key.startsWith(prefix)) e.cancelled = true;
    if (this.inline && this.inline.key.startsWith(prefix)) { this.entries.delete(this.inline.key); this.inline = null; this.pump(); }
  }

  pump() {
    if (this.mode === 'worker') {
      for (const w of this.workers) {
        if (w.busy || !this.queue.length) continue;
        const key = this.queue.shift();
        const e = this.entries.get(key);
        if (!e) continue;
        w.busy = key;
        e.state = 'running';
        w.postMessage({ id: key, job: e.job });
      }
      return;
    }
    if (this.inline || !this.queue.length) return;
    const key = this.queue.shift();
    const e = this.entries.get(key);
    if (!e) { this.pump(); return; }
    e.state = 'running';
    try {
      this.inline = { key, battle: createJobBattle(e.job) };
    } catch (err) { this.entries.delete(key); e.reject(err); this.pump(); return; }
    setTimeout(() => this.stepInline(), 0);
  }

  stepInline() {
    const cur = this.inline;
    if (!cur) return;
    if (this.pauseInline()) { setTimeout(() => this.stepInline(), 150); return; }
    const t0 = performance.now();
    let done = false;
    try {
      while (!done && performance.now() - t0 < this.inlineBudgetMs) done = stepJobBattle(cur.battle, 20);
    } catch (err) {
      const e = this.entries.get(cur.key);
      this.entries.delete(cur.key);
      this.inline = null;
      e?.reject(err);
      this.pump();
      return;
    }
    if (!done) { setTimeout(() => this.stepInline(), 0); return; }
    const e = this.entries.get(cur.key);
    this.entries.delete(cur.key);
    this.inline = null;
    this.completed++;
    if (e && !e.cancelled) e.resolve(summarizeResult(cur.battle.result));
    this.pump();
  }

  onWorkerMessage(w, msg) {
    w.busy = null;
    const e = this.entries.get(msg.id);
    this.entries.delete(msg.id);
    this.completed++;
    if (e && !e.cancelled) { if (msg.error) e.reject(new Error(msg.error)); else e.resolve(msg.result); }
    this.pump();
  }

  onWorkerError(w, err) {
    // a worker failed to start or crashed: fall back to main-thread simulation
    console.warn('Simulation worker error; switching to main-thread simulation.', err?.message || err);
    for (const x of this.workers) { if (x.busy) this.queue.unshift(x.busy); x.terminate(); }
    this.workers = [];
    this.mode = 'inline';
    this.pump();
  }
}
