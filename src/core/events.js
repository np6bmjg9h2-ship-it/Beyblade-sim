// Minimal synchronous event emitter used to decouple systems
// (simulation -> audio/vfx/stats, UI -> game state, etc).

export class Emitter {
  constructor() { this._h = new Map(); }
  on(type, fn) {
    if (!this._h.has(type)) this._h.set(type, new Set());
    this._h.get(type).add(fn);
    return () => this.off(type, fn);
  }
  once(type, fn) {
    const off = this.on(type, (...a) => { off(); fn(...a); });
    return off;
  }
  off(type, fn) { this._h.get(type)?.delete(fn); }
  emit(type, payload) {
    const set = this._h.get(type);
    if (set) for (const fn of [...set]) fn(payload);
    const any = this._h.get('*');
    if (any) for (const fn of [...any]) fn(type, payload);
  }
  clear() { this._h.clear(); }
}
