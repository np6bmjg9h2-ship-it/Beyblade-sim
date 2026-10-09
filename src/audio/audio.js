// Procedural audio engine. Every sound is synthesised at runtime (original,
// no samples): spin hums track each top's real spin rate and speed,
// collision clashes scale with impulse, the crowd reacts to big moments,
// and a small step sequencer plays original menu/battle music.

const ELEMENT_ROOT = { storm: 392, iron: 196, solar: 440, abyss: 220, thunder: 494, crystal: 523, phantom: 330, magma: 175, celestial: 587, void: 147, zero: 261.6 };

export class AudioEngine {
  constructor(settings = {}) {
    this.settings = { master: 0.8, sfx: 0.9, music: 0.5, ambience: 0.5, muted: false, ...settings };
    this.ctx = null;
    this.hums = new Map();
    this.music = null;
    this.crowd = null;
    this.unlocked = false;
  }

  ensure() {
    if (this.ctx) return this.ctx;
    const AC = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
    if (!AC) return null;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain();
    this.master.connect(c.destination);
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.ratio.value = 4;
    this.comp.connect(this.master);
    this.sfx = c.createGain(); this.sfx.connect(this.comp);
    this.mus = c.createGain(); this.mus.connect(this.comp);
    this.amb = c.createGain(); this.amb.connect(this.comp);
    // shared noise buffer
    const len = c.sampleRate * 2;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    return c;
  }

  unlock() {
    const c = this.ensure();
    if (c && c.state === 'suspended') c.resume();
    this.unlocked = true;
  }

  applyVolumes() {
    if (!this.ctx) return;
    const s = this.settings;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.muted ? 0 : s.master, t, 0.05);
    this.sfx.gain.setTargetAtTime(s.sfx, t, 0.05);
    this.mus.gain.setTargetAtTime(s.music * 0.6, t, 0.05);
    this.amb.gain.setTargetAtTime(s.ambience * 0.5, t, 0.05);
  }

  setSettings(s) { Object.assign(this.settings, s); this.applyVolumes(); }

  get ok() { return !!this.ctx && this.ctx.state === 'running'; }

  // ------------------------------------------------------------ primitives

  noise(dur, { type = 'bandpass', freq = 1000, q = 1, gain = 0.5, attack = 0.002, sweepTo = null, dest = null } = {}) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(dest || this.sfx);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  tone(freq, dur, { type = 'sine', gain = 0.3, attack = 0.005, at = 0, slideTo = null, dest = null } = {}) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime + at;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.sfx);
    o.start(t); o.stop(t + dur + 0.05);
  }

  // ------------------------------------------------------------ UI

  ui(kind) {
    switch (kind) {
      case 'move': this.tone(880, 0.05, { gain: 0.06, type: 'triangle' }); break;
      case 'confirm': this.tone(660, 0.07, { gain: 0.1, type: 'triangle' }); this.tone(990, 0.1, { gain: 0.09, type: 'triangle', at: 0.06 }); break;
      case 'back': this.tone(520, 0.08, { gain: 0.08, type: 'triangle', slideTo: 360 }); break;
      case 'error': this.tone(180, 0.15, { gain: 0.12, type: 'square' }); break;
      case 'tab': this.tone(740, 0.05, { gain: 0.07, type: 'sine' }); break;
      case 'loot': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.25, { gain: 0.1, type: 'triangle', at: i * 0.07 })); break;
      case 'levelup': [392, 523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.3, { gain: 0.1, type: 'square', at: i * 0.06 })); break;
      default:
    }
  }

  // ------------------------------------------------------------ battle

  countdown(n) { this.tone(n > 0 ? 660 : 990, n > 0 ? 0.14 : 0.4, { type: 'square', gain: 0.14 }); }

  ignite() {
    this.noise(0.6, { type: 'bandpass', freq: 600, sweepTo: 5000, q: 0.8, gain: 0.35 });
    [262, 330, 392, 523].forEach((f, i) => this.tone(f, 0.6, { type: 'sawtooth', gain: 0.05, at: 0.02 * i }));
  }

  launch(quality) {
    // ripcord zip: rising filtered noise, then the top's whirr
    const perfect = quality === 'Perfect';
    this.noise(0.28, { type: 'bandpass', freq: 900, sweepTo: perfect ? 7000 : 4000, q: 2.5, gain: 0.45 });
    this.tone(perfect ? 1200 : 900, 0.25, { type: 'sine', gain: 0.08, slideTo: perfect ? 2400 : 1500, at: 0.05 });
    if (perfect) [784, 1175].forEach((f, i) => this.tone(f, 0.3, { type: 'triangle', gain: 0.07, at: 0.12 + i * 0.07 }));
    if (quality === 'Misfire') this.noise(0.3, { type: 'lowpass', freq: 300, gain: 0.4 });
  }

  impact(impulse, approach) {
    const k = Math.min(1, impulse / 0.1);
    // metallic inharmonic partials
    const base = 900 + Math.random() * 400;
    for (const [m, g] of [[1, 1], [2.76, 0.6], [5.4, 0.35], [8.93, 0.2]]) {
      this.tone(base * m, 0.12 + 0.25 * k, { type: 'sine', gain: 0.08 * g * (0.3 + k), attack: 0.001 });
    }
    this.noise(0.08 + 0.12 * k, { type: 'highpass', freq: 2500, gain: 0.25 * (0.3 + k) });
    if (k > 0.5) this.noise(0.25, { type: 'lowpass', freq: 220, gain: 0.35 * k });
    if (k > 0.6) this.cheer(k);
  }

  wall(impulse) {
    const k = Math.min(1, impulse / 0.08);
    this.noise(0.12, { type: 'lowpass', freq: 500, gain: 0.3 * (0.3 + k) });
    this.tone(120, 0.12, { type: 'sine', gain: 0.15 * k });
  }

  grind(intensity) {
    if (Math.random() > 0.35) return;
    this.noise(0.04, { type: 'bandpass', freq: 3000 + Math.random() * 2000, q: 3, gain: 0.05 + 0.1 * Math.min(1, intensity) });
  }

  lockClick() { this.tone(2200, 0.03, { type: 'square', gain: 0.12 }); this.tone(1400, 0.05, { type: 'square', gain: 0.08, at: 0.03 }); }

  burst() {
    this.noise(0.9, { type: 'lowpass', freq: 1800, sweepTo: 120, gain: 0.6 });
    this.tone(80, 0.6, { type: 'sine', gain: 0.4, slideTo: 40 });
    for (let i = 0; i < 6; i++) this.tone(2000 + Math.random() * 3000, 0.08, { type: 'triangle', gain: 0.05, at: 0.1 + i * 0.07 });
    this.cheer(1);
  }

  ringOut() {
    this.tone(600, 0.6, { type: 'sawtooth', gain: 0.08, slideTo: 120 });
    this.cheer(1);
  }

  ability(element, kind = 'signature') {
    const root = ELEMENT_ROOT[element] || 330;
    this.noise(0.5, { type: 'bandpass', freq: 400, sweepTo: 3000, q: 1, gain: 0.25 });
    const chord = kind === 'ultimate' ? [1, 1.26, 1.5, 2, 2.52] : [1, 1.5, 2];
    chord.forEach((m, i) => this.tone(root * m, kind === 'ultimate' ? 1.2 : 0.7, { type: 'triangle', gain: 0.08, at: i * 0.04 }));
  }

  shockwave() { this.tone(70, 0.5, { type: 'sine', gain: 0.45, slideTo: 35 }); this.noise(0.4, { type: 'lowpass', freq: 900, gain: 0.35 }); }

  dash() { this.noise(0.18, { type: 'bandpass', freq: 1500, sweepTo: 400, q: 1.5, gain: 0.2 }); }

  counter() { this.tone(1320, 0.15, { type: 'square', gain: 0.08 }); this.tone(1760, 0.2, { type: 'triangle', gain: 0.08, at: 0.05 }); }

  heal() { [523, 659, 784].forEach((f, i) => this.tone(f, 0.5, { type: 'sine', gain: 0.08, at: i * 0.1 })); }

  victory() {
    const seq = [523, 659, 784, 1047, 784, 1047, 1319];
    seq.forEach((f, i) => this.tone(f, 0.28, { type: 'square', gain: 0.07, at: i * 0.11 }));
    this.cheer(1);
  }

  defeat() { [440, 415, 392, 330].forEach((f, i) => this.tone(f, 0.4, { type: 'triangle', gain: 0.08, at: i * 0.18 })); }

  cheer(k) {
    if (!this.ok) return;
    this.noise(1.2 + k, { type: 'bandpass', freq: 1100, q: 0.6, gain: 0.12 * k, attack: 0.15, dest: this.amb });
  }

  // ------------------------------------------------------------ continuous

  // Per-top spin hum. spin in rad/s, speed in m/s, proximity 0..1.
  setHum(id, spin, speed, active) {
    if (!this.ok) return;
    let h = this.hums.get(id);
    const c = this.ctx;
    if (!h) {
      const o = c.createOscillator(); o.type = 'sawtooth';
      const o2 = c.createOscillator(); o2.type = 'triangle';
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 3;
      const g = c.createGain(); g.gain.value = 0;
      const n = c.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
      const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.Q.value = 1.2; nf.frequency.value = 2500;
      const ng = c.createGain(); ng.gain.value = 0;
      o.connect(f); o2.connect(f); f.connect(g); g.connect(this.sfx);
      n.connect(nf); nf.connect(ng); ng.connect(this.sfx);
      o.start(); o2.start(); n.start();
      h = { o, o2, f, g, n, nf, ng };
      this.hums.set(id, h);
    }
    const t = c.currentTime;
    const s = Math.abs(spin);
    const freq = 40 + s * 0.32;
    h.o.frequency.setTargetAtTime(freq, t, 0.05);
    h.o2.frequency.setTargetAtTime(freq * 2.01, t, 0.05);
    h.f.frequency.setTargetAtTime(300 + s * 3, t, 0.05);
    h.g.gain.setTargetAtTime(active ? Math.min(0.06, s / 9000) : 0, t, 0.08);
    h.ng.gain.setTargetAtTime(active ? Math.min(0.05, speed * 0.05 + s / 30000) : 0, t, 0.08);
    h.nf.frequency.setTargetAtTime(1500 + speed * 3000, t, 0.1);
  }

  stopHums() {
    for (const h of this.hums.values()) {
      try { h.o.stop(); h.o2.stop(); h.n.stop(); } catch { /* already stopped */ }
    }
    this.hums.clear();
  }

  crowdAmbience(on) {
    if (!this.ensure() || !this.ok) return;
    const c = this.ctx;
    if (on && !this.crowd) {
      const n = c.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 0.5;
      const g = c.createGain(); g.gain.value = 0.05;
      const lfo = c.createOscillator(); lfo.frequency.value = 0.15;
      const lg = c.createGain(); lg.gain.value = 0.02;
      lfo.connect(lg); lg.connect(g.gain);
      n.connect(f); f.connect(g); g.connect(this.amb);
      n.start(); lfo.start();
      this.crowd = { n, lfo };
    } else if (!on && this.crowd) {
      try { this.crowd.n.stop(); this.crowd.lfo.stop(); } catch { /* noop */ }
      this.crowd = null;
    }
  }

  // ------------------------------------------------------------ music

  playMusic(kind) {
    if (!this.ensure()) return;
    if (this.music?.kind === kind) return;
    this.stopMusic();
    if (!kind) return;
    const tracks = {
      menu: { bpm: 84, prog: [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]], arp: true, bass: true, lead: false },
      battle: { bpm: 132, prog: [[50, 53, 57], [46, 50, 53], [48, 52, 55], [45, 49, 52]], arp: true, bass: true, lead: true },
      story: { bpm: 72, prog: [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]], arp: true, bass: false, lead: false },
    };
    const tr = tracks[kind];
    if (!tr) return;
    this.music = { kind, tr, step: 0, next: this.ctx.currentTime + 0.1, timer: null };
    const tick = () => {
      if (!this.music || this.music.kind !== kind) return;
      const c = this.ctx;
      const spb = 60 / tr.bpm / 2; // eighth notes
      while (this.music.next < c.currentTime + 0.25) {
        this.scheduleStep(this.music.step, this.music.next, tr, spb);
        this.music.step++;
        this.music.next += spb;
      }
      this.music.timer = setTimeout(tick, 80);
    };
    tick();
  }

  scheduleStep(step, t, tr, spb) {
    if (!this.ok) return;
    const c = this.ctx;
    const bar = Math.floor(step / 8) % tr.prog.length;
    const chord = tr.prog[bar];
    const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const note = (midi, dur, type, gain) => {
      const o = c.createOscillator(); o.type = type; o.frequency.value = mtof(midi);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.mus); o.start(t); o.stop(t + dur + 0.02);
    };
    if (tr.arp) note(chord[step % 3] + 12, spb * 0.9, 'triangle', 0.05);
    if (tr.bass && step % 2 === 0) note(chord[0] - 12, spb * 1.8, 'sawtooth', 0.045);
    if (step % 8 === 0) for (const m of chord) note(m, spb * 7.5, 'sine', 0.025);
    if (tr.lead && step % 16 === 6) note(chord[2] + 24, spb * 3, 'square', 0.025);
    if (tr.bpm > 100 && step % 2 === 0) {
      // percussion: kick on beats, hat offbeats
      if (step % 4 === 0) { const o = c.createOscillator(); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12); const g = c.createGain(); g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15); o.connect(g); g.connect(this.mus); o.start(t); o.stop(t + 0.2); }
    }
  }

  stopMusic() {
    if (this.music?.timer) clearTimeout(this.music.timer);
    this.music = null;
  }
}
