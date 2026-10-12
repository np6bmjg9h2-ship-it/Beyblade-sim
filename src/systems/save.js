// Save management. IndexedDB is the primary store (complex game data);
// localStorage is a fallback; an in-memory store is used headless (tests).
// Saves are versioned: migrate() upgrades older schemas step by step,
// validate() checks structure, and every successful save rotates the previous
// good copy into a backup key so a corrupted write can be recovered.

import { SCHEMA_VERSION, newProfile, normalizeProfile } from './profile.js';

const DB_NAME = 'chaos-spin-arena-zero';
const STORE = 'saves';
export const SLOTS = ['slot1', 'slot2', 'slot3'];
export const REPLAY_KEEP = 12;

class MemoryStore {
  constructor() { this.m = new Map(); }
  async get(k) { return this.m.has(k) ? structuredClone(this.m.get(k)) : null; }
  async set(k, v) { this.m.set(k, structuredClone(v)); }
  async del(k) { this.m.delete(k); }
  async keys() { return [...this.m.keys()]; }
}

class LocalStore {
  async get(k) { const s = localStorage.getItem(DB_NAME + ':' + k); return s ? JSON.parse(s) : null; }
  async set(k, v) { localStorage.setItem(DB_NAME + ':' + k, JSON.stringify(v)); }
  async del(k) { localStorage.removeItem(DB_NAME + ':' + k); }
  async keys() { return Object.keys(localStorage).filter((k) => k.startsWith(DB_NAME + ':')).map((k) => k.slice(DB_NAME.length + 1)); }
}

class IDBStore {
  constructor(db) { this.db = db; }
  static open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(new IDBStore(req.result));
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('IndexedDB blocked'));
    });
  }
  tx(mode, fn) {
    return new Promise((resolve, reject) => {
      const t = this.db.transaction(STORE, mode);
      const st = t.objectStore(STORE);
      const req = fn(st);
      t.oncomplete = () => resolve(req?.result ?? null);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }
  async get(k) { const v = await this.tx('readonly', (s) => s.get(k)); return v ?? null; }
  async set(k, v) { await this.tx('readwrite', (s) => s.put(v, k)); }
  async del(k) { await this.tx('readwrite', (s) => s.delete(k)); }
  async keys() { return (await this.tx('readonly', (s) => s.getAllKeys())) || []; }
}

// ------------------------------------------------------------ migrations

export const MIGRATIONS = {
  // v1 -> v2: settings split into categories; loadouts gained `technique`
  1: (d) => {
    if (d.settings && !d.settings.audio) {
      const old = d.settings;
      d.settings = { audio: { master: old.volume ?? 0.8 }, graphics: { quality: old.quality ?? 'high' }, gameplay: {}, input: {} };
    }
    for (const L of d.loadouts || []) if (!L.technique) L.technique = 'normal';
    d.version = 2;
    return d;
  },
  // v2 -> v3: discovery records and per-item upgrade history
  2: (d) => {
    d.discovery = d.discovery || { parts: {}, sets: {}, traits: {}, beasts: {} };
    for (const it of Object.values(d.inventory || {})) it.upgrades = it.upgrades || [];
    d.version = 3;
    return d;
  },
};

export function migrate(data) {
  let d = data;
  let v = d.version ?? 1;
  const applied = [];
  while (v < SCHEMA_VERSION) {
    const m = MIGRATIONS[v];
    if (!m) throw new Error(`No migration from save version ${v}`);
    d = m(d);
    applied.push(v);
    v = d.version;
  }
  // a save written by a newer version of the game: readable, but anything this
  // version does not know about may be dropped when it saves (audit #9)
  return { data: d, applied, newer: v > SCHEMA_VERSION ? v : null };
}

export function validate(d) {
  const problems = [];
  if (!d || typeof d !== 'object') return ['Save is not an object'];
  if (typeof d.version !== 'number') problems.push('Missing version');
  if (!d.player || typeof d.player !== 'object') problems.push('Missing player');
  if (!d.inventory || typeof d.inventory !== 'object') problems.push('Missing inventory');
  if (!Array.isArray(d.loadouts)) problems.push('Missing loadouts');
  if (!d.beasts || typeof d.beasts !== 'object') problems.push('Missing beasts');
  for (const [uid, it] of Object.entries(d.inventory || {})) {
    if (!it || it.uid !== uid || typeof it.base !== 'string') { problems.push(`Corrupt item ${uid}`); break; }
    if (!Number.isFinite(it.durability) || !Number.isFinite(it.maxDurability)) { problems.push(`Item ${uid} has invalid durability`); break; }
  }
  if (d.currency && (!Number.isFinite(d.currency.credits) || d.currency.credits < 0)) problems.push('Invalid currency');
  return problems;
}

// ------------------------------------------------------------ manager

export class SaveManager {
  constructor(store) { this.store = store; this.kind = store?.constructor?.name || 'memory'; }

  static async create({ memory = false } = {}) {
    if (memory || typeof window === 'undefined') return new SaveManager(new MemoryStore());
    try {
      if (window.indexedDB) {
        const s = await IDBStore.open();
        return new SaveManager(s);
      }
    } catch (e) { console.warn('IndexedDB unavailable, falling back to localStorage', e); }
    try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); return new SaveManager(new LocalStore()); } catch { /* none */ }
    return new SaveManager(new MemoryStore());
  }

  async meta() { return (await this.store.get('meta')) || { lastSlot: null, slots: {} }; }
  async setMeta(m) { await this.store.set('meta', m); }

  async listSlots() {
    const meta = await this.meta();
    const out = [];
    for (const s of SLOTS) {
      const d = await this.store.get(s);
      out.push(d ? { slot: s, exists: true, name: d.player?.name, level: d.player?.level, chapter: d.story?.chapter, updatedAt: d.updatedAt, playtime: d.playtime, version: d.version } : { slot: s, exists: false });
    }
    return { slots: out, lastSlot: meta.lastSlot };
  }

  // Load a slot, migrating and validating; falls back to the backup copy.
  async load(slot) {
    const tryParse = async (key) => {
      const raw = await this.store.get(key);
      if (!raw) return { ok: false, reason: 'empty' };
      try {
        const { data, applied, newer } = migrate(structuredClone(raw));
        const problems = validate(data);
        if (problems.length) return { ok: false, reason: problems.join('; ') };
        return { ok: true, data: normalizeProfile(data), migrated: applied, newer };
      } catch (e) { return { ok: false, reason: e.message }; }
    };
    const main = await tryParse(slot);
    if (main.ok) return { ...main, recovered: false };
    if (main.reason === 'empty') return { ok: false, reason: 'empty' };
    const backup = await tryParse(slot + '_backup');
    if (backup.ok) return { ...backup, recovered: true, reason: main.reason };
    return { ok: false, reason: main.reason, corrupt: true };
  }

  async save(slot, profile) {
    profile.updatedAt = Date.now();
    profile.version = SCHEMA_VERSION;
    const problems = validate(profile);
    if (problems.length) throw new Error('Refusing to write invalid save: ' + problems.join('; '));
    const prev = await this.store.get(slot);
    if (prev && !validate(prev).length) await this.store.set(slot + '_backup', prev);
    const clean = structuredClone(profile);
    clean.undo = [];
    await this.store.set(slot, clean);
    const meta = await this.meta();
    meta.lastSlot = slot;
    await this.setMeta(meta);
    return true;
  }

  // ---------------------------------------------------------- replays
  // Stored per slot under separate keys; the newest REPLAY_KEEP unpinned
  // replays are kept, pinned ones until deleted.
  async listReplays(slot) { return (await this.store.get('replays:' + slot)) || []; }

  async saveReplay(slot, rep, keep = REPLAY_KEEP) {
    const list = await this.listReplays(slot);
    const meta = { id: rep.id, date: rep.date, title: rep.title, mode: rep.mode, names: rep.names, score: rep.score, arenaId: rep.arenaId, winner: rep.summary.winner, pinned: false };
    await this.store.set(`replay:${slot}:${rep.id}`, rep);
    list.unshift(meta);
    const unpinned = list.filter((r) => !r.pinned);
    for (const old of unpinned.slice(keep)) { await this.store.del(`replay:${slot}:${old.id}`); list.splice(list.indexOf(old), 1); }
    await this.store.set('replays:' + slot, list);
    return meta;
  }

  async getReplay(slot, id) { return this.store.get(`replay:${slot}:${id}`); }

  async deleteReplay(slot, id) {
    const list = (await this.listReplays(slot)).filter((r) => r.id !== id);
    await this.store.del(`replay:${slot}:${id}`);
    await this.store.set('replays:' + slot, list);
  }

  async pinReplay(slot, id, pinned) {
    const list = await this.listReplays(slot);
    const r = list.find((x) => x.id === id);
    if (r) r.pinned = !!pinned;
    await this.store.set('replays:' + slot, list);
  }

  async remove(slot) {
    for (const r of await this.listReplays(slot)) await this.store.del(`replay:${slot}:${r.id}`);
    await this.store.del('replays:' + slot);
    await this.store.del(slot);
    await this.store.del(slot + '_backup');
    const meta = await this.meta();
    if (meta.lastSlot === slot) meta.lastSlot = null;
    await this.setMeta(meta);
  }

  async createNew(slot, seed) {
    const p = newProfile(seed);
    await this.save(slot, p);
    return p;
  }

  exportString(profile) { return JSON.stringify({ format: 'chaos-spin-save', exportedAt: Date.now(), data: profile }); }

  importString(text) {
    const obj = JSON.parse(text);
    const raw = obj.format === 'chaos-spin-save' ? obj.data : obj;
    const { data, newer } = migrate(raw);
    const problems = validate(data);
    if (problems.length) throw new Error(problems.join('; '));
    const profile = normalizeProfile(data);
    if (newer) Object.defineProperty(profile, 'importedFromNewer', { value: newer, enumerable: false });
    return profile;
  }

  // Global (pre-profile) settings so options apply on the title screen.
  async globalSettings() { return (await this.store.get('globalSettings')) || null; }
  async setGlobalSettings(s) { await this.store.set('globalSettings', s); }
}
