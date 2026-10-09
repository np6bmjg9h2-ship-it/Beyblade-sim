// Deterministic, seedable pseudo-random number generation. Every random
// decision in the game (loot rolls, AI choices, launch variance) flows through
// an Rng instance so results can be reproduced from a seed for debugging.

export function hashString(str) {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function mixSeeds(...parts) {
  let h = 0x9e3779b9;
  for (const p of parts) {
    const v = typeof p === 'number' ? p >>> 0 : hashString(String(p));
    h ^= v + 0x9e3779b9 + (h << 6) + (h >>> 2);
    h >>>= 0;
  }
  return h >>> 0;
}

export class Rng {
  constructor(seed = 1) { this.setSeed(seed); }
  setSeed(seed) {
    // sfc32 state initialised via splitmix32
    let s = (typeof seed === 'number' ? seed : hashString(String(seed))) >>> 0;
    const sm = () => {
      s = (s + 0x9e3779b9) >>> 0;
      let z = s;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
      return (z ^ (z >>> 16)) >>> 0;
    };
    this.a = sm(); this.b = sm(); this.c = sm(); this.d = sm();
    this.seed = seed;
    for (let i = 0; i < 12; i++) this.nextU32();
    return this;
  }
  nextU32() {
    let { a, b, c, d } = this;
    const t = (((a + b) >>> 0) + d) >>> 0;
    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) >>> 0;
    this.a = a; this.b = b; this.c = c; this.d = d;
    return t >>> 0;
  }
  next() { return this.nextU32() / 4294967296; }
  range(lo, hi) { return lo + (hi - lo) * this.next(); }
  int(lo, hi) { return lo + Math.floor(this.next() * (hi - lo + 1)); }
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  gauss(mean = 0, sd = 1) {
    let u = 0, v = 0;
    while (u === 0) u = this.next();
    while (v === 0) v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  weighted(entries, weightKey = 'weight') {
    let total = 0;
    for (const e of entries) total += Math.max(0, e[weightKey] ?? 0);
    if (total <= 0) return entries[0];
    let r = this.next() * total;
    for (const e of entries) {
      r -= Math.max(0, e[weightKey] ?? 0);
      if (r <= 0) return e;
    }
    return entries[entries.length - 1];
  }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  fork(label) { return new Rng(mixSeeds(this.nextU32(), label)); }
  getState() { return [this.a, this.b, this.c, this.d]; }
  setState(s) { [this.a, this.b, this.c, this.d] = s; return this; }
}
