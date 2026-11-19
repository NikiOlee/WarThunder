import { settings, onSettings } from './settings.js';

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* 100% procedural audio: no sample files. Safe to import where Web Audio does not exist (ctx stays null). */
class AudioSys {
  constructor() {
    this.ctx = null; this.cam = null; this._engine = null; this._mt = null; this.musicMode = 'off';
    this.step = 0; this.nextT = 0;
    onSettings(() => this.applyVolumes());
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return true; }
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return false;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 18; comp.ratio.value = 6;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.musicBus = ctx.createGain(); this.sfxBus = ctx.createGain(); this.engineBus = ctx.createGain();
    this.musicBus.connect(this.master); this.sfxBus.connect(this.master); this.engineBus.connect(this.master);
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    this.applyVolumes();
    this._startWind();
    return true;
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(settings.master, t, 0.05);
    this.musicBus.gain.setTargetAtTime(settings.music * 0.9, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(settings.sfx, t, 0.05);
    this.engineBus.gain.setTargetAtTime(settings.engine, t, 0.05);
  }

  setListener(cam) { this.cam = cam; }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  /* ---------- helpers ---------- */
  _noise() { const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true; return s; }

  _tone(dst, type, f0, f1, t, dur, peak) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dst); o.start(t); o.stop(t + dur + 0.05);
  }

  _burst(dst, t, dur, peak, ftype, f0, f1, q = 0.7) {
    const ctx = this.ctx, n = this._noise(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = ftype; f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    f.Q.value = q;
    g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f); f.connect(g); g.connect(dst); n.start(t, Math.random()); n.stop(t + dur + 0.05);
  }

  /** Distance attenuation, low-pass for far sounds and stereo pan relative to the camera. */
  _route(pos, vol, own) {
    const ctx = this.ctx, g = ctx.createGain();
    let dist = 0, pan = 0, out = g;
    if (pos && this.cam && !own) {
      const c = this.cam.position, dx = pos.x - c.x, dy = pos.y - c.y, dz = pos.z - c.z;
      dist = Math.hypot(dx, dy, dz);
      const e = this.cam.matrixWorld.elements;
      pan = clamp((dx * e[0] + dy * e[1] + dz * e[2]) / Math.max(dist, 1), -1, 1) * 0.85;
    }
    g.gain.value = vol / (1 + dist / 70);
    if (dist > 40) {
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.max(500, 9000 / (1 + dist / 120));
      g.connect(lp); out = lp;
    }
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; out.connect(p); out = p; }
    out.connect(this.sfxBus);
    return g;
  }

  /** name: cannon | explosion | bigexplosion | ricochet | hitpen | nopen | track | barrel | snap */
  play(name, pos = null, vol = 1, own = false) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const dst = this._route(pos, vol, own), t = this.ctx.currentTime + 0.005;
    switch (name) {
      case 'cannon':
        this._tone(dst, 'sine', 120, 32, t, 0.32, 1.0);
        this._burst(dst, t, 0.7, 1.2, 'lowpass', 2400, 150);
        this._burst(dst, t, 0.05, 0.8, 'highpass', 3000, 3000);
        this._burst(dst, t + 0.05, 2.2, 0.3, 'lowpass', 500, 120);
        if (own) { this._tone(dst, 'sine', 3300, 3100, t + 0.6, 0.12, 0.15); this._tone(dst, 'sine', 4900, 4700, t + 0.63, 0.1, 0.1); }
        break;
      case 'explosion': this._explosion(dst, t, 1); break;
      case 'bigexplosion':
        this._explosion(dst, t, 2);
        this._burst(dst, t, 3, 1.5, 'lowpass', 300, 40);
        this._tone(dst, 'sine', 45, 20, t, 2.5, 1.0);
        break;
      case 'ricochet':
        this._tone(dst, 'sine', 2600, 2000, t, 0.6, 0.5); this._tone(dst, 'sine', 3500, 3000, t, 0.5, 0.3);
        this._burst(dst, t, 0.08, 0.6, 'bandpass', 3000, 3000, 2);
        break;
      case 'hitpen':
        this._tone(dst, 'triangle', 520, 400, t, 0.5, 0.5); this._tone(dst, 'sine', 780, 700, t, 0.4, 0.3);
        this._tone(dst, 'sine', 1240, 1100, t, 0.3, 0.2); this._tone(dst, 'sine', 90, 50, t, 0.3, 0.6);
        this._burst(dst, t, 0.15, 0.8, 'bandpass', 1500, 1500);
        break;
      case 'nopen':
        this._tone(dst, 'sine', 900, 700, t, 0.25, 0.5); this._tone(dst, 'sine', 1500, 1400, t, 0.2, 0.3);
        this._burst(dst, t, 0.06, 0.5, 'bandpass', 2000, 2000);
        break;
      case 'track':
        for (const o of [0, 0.06, 0.13]) this._burst(dst, t + o, 0.05, 0.7, 'bandpass', 900, 900, 3);
        this._tone(dst, 'square', 200, 120, t, 0.2, 0.2);
        break;
      case 'barrel':
        this._tone(dst, 'sine', 320, 300, t, 0.8, 0.5); this._tone(dst, 'sine', 480, 460, t, 0.6, 0.3);
        this._burst(dst, t, 0.06, 0.6, 'bandpass', 2500, 2500);
        break;
      case 'snap':
        this._burst(dst, t, 0.04, 0.6, 'highpass', 5000, 5000);
        break;
      default: break;
    }
  }

  _explosion(dst, t, size) {
    this._tone(dst, 'sine', 80, 28, t, 1.2 * size, 1.0);
    this._burst(dst, t, 1.8 * size, 1.3, 'lowpass', 1200, 90);
    this._burst(dst, t, 0.4, 0.5, 'bandpass', 600, 600);
    for (let i = 0; i < 4; i++) this._burst(dst, t + 0.2 + Math.random() * 0.8, 0.05, 0.25, 'highpass', 4000, 4000);
  }

  /** Non-positional UI sound: 'tick' (hit confirmation). */
  ui(name) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    if (name === 'tick') this._tone(this.sfxBus, 'square', 1600, 1500, t, 0.05, 0.22);
    else if (name === 'click') this._tone(this.sfxBus, 'square', 700, 500, t, 0.04, 0.18);
  }

  /* ---------- engine ---------- */
  _startEngine() {
    const ctx = this.ctx, e = {};
    e.lp = ctx.createBiquadFilter(); e.lp.type = 'lowpass'; e.lp.frequency.value = 400;
    e.g = ctx.createGain(); e.g.gain.value = 0;
    e.o1 = ctx.createOscillator(); e.o1.type = 'sawtooth'; e.o2 = ctx.createOscillator(); e.o2.type = 'square';
    e.o1.connect(e.lp); e.o2.connect(e.lp); e.lp.connect(e.g); e.g.connect(this.engineBus);
    e.n = this._noise(); e.nl = ctx.createBiquadFilter(); e.nl.type = 'lowpass'; e.nl.frequency.value = 220;
    e.ng = ctx.createGain(); e.ng.gain.value = 0.3; e.n.connect(e.nl); e.nl.connect(e.ng); e.ng.connect(this.engineBus);
    e.t = this._noise(); e.tb = ctx.createBiquadFilter(); e.tb.type = 'bandpass'; e.tb.frequency.value = 1300; e.tb.Q.value = 0.8;
    e.tg = ctx.createGain(); e.tg.gain.value = 0; e.t.connect(e.tb); e.tb.connect(e.tg); e.tg.connect(this.engineBus);
    e.o1.start(); e.o2.start(); e.n.start(); e.t.start();
    this._engine = e;
  }

  engineUpdate(speedN, throttle, alive) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    if (!this._engine) this._startEngine();
    const e = this._engine, t = this.ctx.currentTime;
    const rpm = alive ? 0.2 + 0.5 * clamp(speedN, 0, 1) + 0.25 * Math.abs(throttle) : 0;
    const f = 32 + rpm * 85;
    e.o1.frequency.setTargetAtTime(f, t, 0.12); e.o2.frequency.setTargetAtTime(f * 0.5, t, 0.12);
    e.lp.frequency.setTargetAtTime(250 + rpm * 1300, t, 0.12);
    e.g.gain.setTargetAtTime(alive ? 0.16 + 0.22 * rpm : 0, t, 0.2);
    e.ng.gain.setTargetAtTime(alive ? 0.25 : 0.02, t, 0.3);
    e.tg.gain.setTargetAtTime(alive ? clamp(speedN, 0, 1) * 0.2 : 0, t, 0.15);
  }
  engineSilence() { if (this._engine && this.ctx) this.engineUpdate(0, 0, false); }

  _startWind() {
    const ctx = this.ctx, n = this._noise(), lp = ctx.createBiquadFilter(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    lp.type = 'lowpass'; lp.frequency.value = 650; g.gain.value = 0.05; lfo.frequency.value = 0.12; lg.gain.value = 0.03;
    lfo.connect(lg); lg.connect(g.gain); n.connect(lp); lp.connect(g); g.connect(this.sfxBus);
    n.start(); lfo.start();
  }

  /* ---------- generative music (A minor, Am - F - C - G) ---------- */
  music(mode) {
    if (!this.ctx) return;
    this.musicMode = mode;
    if (mode === 'off') {
      if (this._mt) { clearInterval(this._mt); this._mt = null; }
      if (this.musicSess) { this.musicSess.disconnect(); this.musicSess = null; }        // cuts every ringing note at once
      return;
    }
    if (this._mt) return;
    this.musicSess = this.ctx.createGain(); this.musicSess.connect(this.musicBus);
    this.step = 0; this.nextT = this.ctx.currentTime + 0.15;
    this._mt = setInterval(() => this._sched(), 30);
  }

  _sched() {
    const ctx = this.ctx; if (!ctx) return;
    const bpm = this.musicMode === 'battle' ? 100 : 72, sd = 60 / bpm / 4;
    if (this.nextT < ctx.currentTime - 0.5) this.nextT = ctx.currentTime + 0.05;       // tab was suspended
    while (this.nextT < ctx.currentTime + 0.25) { this._musicStep(this.step, this.nextT, sd); this.nextT += sd; this.step++; }
  }

  _musicStep(step, t, sd) {
    const mb = this.musicSess, battle = this.musicMode === 'battle';
    if (!mb) return;
    const chords = [[57, 60, 64, 69], [53, 57, 60, 65], [60, 64, 67, 72], [55, 59, 62, 67]];
    const bar = Math.floor(step / 16) % 4, s = step % 16, ch = chords[bar];
    const ctx = this.ctx;
    if (s === 0) {
      const len = sd * 16;
      for (const m of ch.slice(0, 3)) {
        for (const det of [-6, 7]) {
          const o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
          o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = det; lp.type = 'lowpass'; lp.frequency.value = 900;
          g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(battle ? 0.035 : 0.05, t + 0.9);
          g.gain.setValueAtTime(battle ? 0.035 : 0.05, t + len - 0.6); g.gain.linearRampToValueAtTime(0.0001, t + len);
          o.connect(lp); lp.connect(g); g.connect(mb); o.start(t); o.stop(t + len + 0.05);
        }
      }
    }
    if (s === 0 || (battle && s === 8)) this._tone(mb, 'triangle', mtof(ch[0] - 12), mtof(ch[0] - 12), t, sd * (s === 0 ? 7 : 6), 0.22);
    if (s % 2 === 0) {
      const idx = [0, 2, 1, 3, 2, 3, 1, 2][(s / 2) % 8], n = ch[idx] + (battle ? 12 : 12);
      this._tone(mb, 'triangle', mtof(n), mtof(n), t, sd * 3, battle ? 0.05 : 0.07);
    }
    if (battle) {
      if (s === 0 || s === 6 || s === 10) { this._tone(mb, 'sine', 140, 40, t, 0.2, 0.7); }
      if (s === 4 || s === 12) { this._burst(mb, t, 0.16, 0.35, 'bandpass', 1900, 1500, 0.8); this._tone(mb, 'triangle', 220, 140, t, 0.1, 0.18); }
      if ((bar === 3 && (s === 14 || s === 15)) || s === 15) this._burst(mb, t, 0.06, 0.15, 'bandpass', 2200, 2200, 0.8);
      if (s % 2 === 0) this._burst(mb, t, 0.03, 0.07, 'highpass', 7000, 7000);
      if (s === 0 || s === 3 || s === 8 || s === 11) {
        const n = ch[[0, 2, 1, 3][(s / 3) | 0] || 0] + 12;
        const o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.value = mtof(n); lp.type = 'lowpass'; lp.frequency.value = 1500;
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.045, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
        o.connect(lp); lp.connect(g); g.connect(mb); o.start(t); o.stop(t + 0.5);
      }
    }
  }
}

export const audio = new AudioSys();
