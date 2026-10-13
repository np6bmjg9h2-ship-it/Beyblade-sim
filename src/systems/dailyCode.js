// Daily Seed replay codes: a whole run (day, picks, claimed score and every
// battle's recorded inputs) packed into one copyable line of text.
//   CS1z.<base64url>  deflate-compressed (browsers and Node 18+)
//   CS1r.<base64url>  uncompressed fallback
// Inside: a JSON header (per battle: seed, launch setup and countdown changes,
// release; or a forfeit), then per battle its steering/button changes as
// varints (steering is already quantised to 1/64 by the battle, so it packs
// into small integers). Decoding never trusts the score: verifyRun in
// systems/daily.js re-simulates the run.

import { GAME_VERSION } from '../version.js';

const MAGIC = 'CS1';

// ------------------------------------------------------------ bytes

class Writer {
  constructor() { this.buf = new Uint8Array(1024); this.n = 0; }
  byte(b) { if (this.n >= this.buf.length) { const nb = new Uint8Array(this.buf.length * 2); nb.set(this.buf); this.buf = nb; } this.buf[this.n++] = b; }
  uvar(v) { v = Math.floor(v); while (v >= 0x80) { this.byte((v & 0x7f) | 0x80); v = Math.floor(v / 128); } this.byte(v); }
  svar(v) { this.uvar(v < 0 ? -2 * v - 1 : 2 * v); }
  bytes(arr) { this.uvar(arr.length); for (const b of arr) this.byte(b); }
  done() { return this.buf.subarray(0, this.n); }
}
class Reader {
  constructor(buf) { this.buf = buf; this.i = 0; }
  byte() { if (this.i >= this.buf.length) throw new Error('code is cut short'); return this.buf[this.i++]; }
  uvar() { let v = 0, m = 1, b; do { b = this.byte(); v += (b & 0x7f) * m; m *= 128; } while (b & 0x80); return v; }
  svar() { const u = this.uvar(); return u % 2 ? -(u + 1) / 2 : u / 2; }
  bytes() { const n = this.uvar(); const out = this.buf.subarray(this.i, this.i + n); this.i += n; return out; }
}

const enc = new TextEncoder(), dec = new TextDecoder();

// ------------------------------------------------------------ base64url

function toB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64(s) {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

async function pipe(bytes, Stream, fmt) {
  const s = new Blob([bytes]).stream().pipeThrough(new Stream(fmt));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
const canZip = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function' && typeof Response === 'function';

// ------------------------------------------------------------ run <-> bytes

function packControls(w, controls) {
  w.uvar(controls.length);
  let pr = 0, pt = 0;
  for (const [round, tick, i, x, z, flags] of controls) {
    const dr = round - pr;
    w.uvar(dr);
    w.uvar(dr ? tick : tick - pt);
    w.uvar(i);
    w.svar(Math.round(x * 64));
    w.svar(Math.round(z * 64));
    w.uvar(flags);
    pr = round; pt = tick;
  }
}
function unpackControls(r) {
  const n = r.uvar();
  const out = new Array(n);
  let pr = 0, pt = 0;
  for (let k = 0; k < n; k++) {
    const dr = r.uvar();
    const round = pr + dr;
    const t = r.uvar();
    const tick = dr ? t : pt + t;
    out[k] = [round, tick, r.uvar(), r.svar() / 64, r.svar() / 64, r.uvar()];
    pr = round; pt = tick;
  }
  return out;
}

export function runToBytes(run) {
  const w = new Writer();
  const head = {
    v: 2, ver: GAME_VERSION, key: run.key, name: run.name || '', score: run.score ?? null, picks: run.picks || [],
    battles: run.battles.map((b) => (!b ? null : b.forfeit ? { forfeit: true } : { seed: b.seed, setups: b.rec.setups, launch: b.rec.launch || [], releases: b.rec.releases })),
  };
  w.bytes(enc.encode(JSON.stringify(head)));
  for (const b of run.battles) packControls(w, b?.rec?.controls || []);
  return w.done();
}

export function bytesToRun(bytes) {
  const r = new Reader(bytes);
  const head = JSON.parse(dec.decode(r.bytes()));
  if (head.v < 2) throw new Error('this code comes from an older test version of the Daily Seed');
  if (head.v !== 2) throw new Error('this code comes from a newer version of the game');
  if (!Array.isArray(head.battles)) throw new Error('the code has no battles');
  const battles = head.battles.map((b) => {
    const controls = unpackControls(r);
    if (!b) return null;
    if (b.forfeit) return { forfeit: true };
    return { seed: b.seed, rec: { v: 2, setups: b.setups || {}, launch: Array.isArray(b.launch) ? b.launch : [], releases: b.releases || {}, controls } };
  });
  return { key: head.key, name: head.name, score: head.score, picks: head.picks, ver: head.ver || null, battles };
}

// ------------------------------------------------------------ code text

export async function encodeRun(run) {
  const raw = runToBytes(run);
  if (canZip()) return `${MAGIC}z.${toB64(await pipe(raw, CompressionStream, 'deflate-raw'))}`;
  return `${MAGIC}r.${toB64(raw)}`;
}

// Limits: a real run is a few kilobytes; anything far larger is not a code.
const MAX_CODE = 200000, MAX_BYTES = 2000000;

export async function decodeRun(code) {
  const text = String(code || '').replace(/\s+/g, '');
  if (text.length > MAX_CODE) throw new Error('that code is too long');
  const m = /^CS1([zr])\.([A-Za-z0-9_-]+)$/.exec(text);
  if (!m) throw new Error('that is not a Daily Seed code');
  let bytes = fromB64(m[2]);
  if (m[1] === 'z') {
    if (!canZip()) throw new Error('this browser cannot read compressed codes');
    bytes = await pipe(bytes, DecompressionStream, 'deflate-raw');
  }
  if (bytes.length > MAX_BYTES) throw new Error('that code is too long');
  return bytesToRun(bytes);
}
