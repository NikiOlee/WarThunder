import * as THREE from 'three';
import { settings, onSettings } from './settings';
import { ALL_VOICE_CUES, resolveVoiceAssetUrl, type VoiceCueId } from './voice';

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export interface BossMusicStepData {
  step32: number;
  phrase: number;
  isStop: boolean;
  bassMidi: number | null;
  bassAccent: boolean;
  kick: boolean;
  snare: boolean;
  stutterHat: boolean;
  stabMidi: number | null;
}

// D Phrygian / Locrian industrial metal chug & breakcore chop pattern (32 x 16th-note steps)
const BOSS_BASS_PATTERN: ReadonlyArray<number | null> = [
  38, 38, null, 38, 39, null, 38, 38,
  null, 38, 41, null, 38, null, 39, 38,
  38, null, 38, 38, null, 44, 38, null,
  39, 38, null, null, 41, 39, null, null, // bars end in choked stop (steps 30-31)
];
const BOSS_STAB_PATTERN: ReadonlyArray<number | null> = [
  62, null, null, null, null, null, 63, null,
  null, null, 68, null, null, null, null, null,
  62, null, null, 69, null, null, null, null,
  63, null, null, null, null, null, null, null,
];
const BOSS_KICK_STEPS = new Set([0, 3, 6, 7, 10, 12, 16, 18, 21, 22, 24, 28, 29]);
const BOSS_SNARE_STEPS = new Set([4, 11, 14, 20, 26, 27]);
const BOSS_STUTTER_STEPS = new Set([2, 5, 9, 13, 15, 19, 23, 25]);

export function getBossMusicStepData(step: number): BossMusicStepData {
  const step32 = ((step % 32) + 32) % 32;
  const phrase = Math.floor(step / 32) % 4;
  // Sudden dramatic choked pause on the tail of every 4th bar (steps 29-31) and bar 2 (steps 30-31)
  const isStop =
    step32 === 30 ||
    step32 === 31 ||
    (phrase === 3 && step32 >= 28) ||
    (phrase === 1 && (step32 === 15 || step32 === 27));

  let bassMidi = isStop ? null : BOSS_BASS_PATTERN[step32];
  if (bassMidi !== null && phrase === 2 && (step32 === 8 || step32 === 24)) {
    bassMidi += 1; // tritone / Phrygian tension lift on phrase 2
  }
  const bassAccent = bassMidi !== null && (step32 === 0 || step32 === 4 || step32 === 16 || step32 === 21);

  return {
    step32,
    phrase,
    isStop,
    bassMidi,
    bassAccent,
    kick: !isStop && BOSS_KICK_STEPS.has(step32),
    snare: !isStop && BOSS_SNARE_STEPS.has(step32),
    stutterHat: !isStop && BOSS_STUTTER_STEPS.has(step32),
    stabMidi: isStop ? null : BOSS_STAB_PATTERN[step32],
  };
}

function makeDistortionCurve(amount = 42): Float32Array<ArrayBuffer> {
  const samples = 1024;
  const buf = new ArrayBuffer(samples * 4);
  const curve = new Float32Array(buf);
  const deg = Math.PI / 180;
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

interface EngineNodes {
  lp: BiquadFilterNode;
  g: GainNode;
  o1: OscillatorNode;
  o2: OscillatorNode;
  n: AudioBufferSourceNode;
  nl: BiquadFilterNode;
  ng: GainNode;
  t: AudioBufferSourceNode;
  tb: BiquadFilterNode;
  tg: GainNode;
  turb1: OscillatorNode;
  turb2: OscillatorNode;
  turbBp: BiquadFilterNode;
  turbGain: GainNode;
  airSrc: AudioBufferSourceNode;
  airBp: BiquadFilterNode;
  airGain: GainNode;
}

class AudioSys {
  ctx: AudioContext | null = null;
  cam: THREE.Camera | null = null;
  private _engine: EngineNodes | null = null;
  private _mt: ReturnType<typeof setInterval> | null = null;
  private _fadeTimer: ReturnType<typeof setTimeout> | null = null;
  musicMode: 'off' | 'menu' | 'battle' | 'boss' = 'off';
  step = 0;
  nextT = 0;

  master!: GainNode;
  musicBus!: GainNode;
  sfxBus!: GainNode;
  engineBus!: GainNode;
  musicSess: GainNode | null = null;
  private bossDistNode: WaveShaperNode | null = null;
  private bossDriveGain: GainNode | null = null;
  noiseBuf!: AudioBuffer;
  private voiceBuffers = new Map<VoiceCueId, AudioBuffer>();
  private voiceLoads = new Map<VoiceCueId, Promise<AudioBuffer | null>>();
  private activeVoiceSource: AudioBufferSourceNode | null = null;
  private activeVoiceGain: GainNode | null = null;
  private voiceToken = 0;

  constructor() {
    onSettings(() => this.applyVolumes());
  }

  init(): boolean {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }
    const AC =
      typeof window !== 'undefined' &&
      (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    if (!AC) return false;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 18;
    comp.ratio.value = 6;
    this.master.connect(comp);
    comp.connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.engineBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.engineBus.connect(this.master);
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    this.applyVolumes();
    this._startWind();
    this.preloadVoices();
    return true;
  }

  applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(settings.master, t, 0.05);
    this.musicBus.gain.setTargetAtTime(settings.music * 0.85, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(settings.sfx, t, 0.05);
    // Keep engine warm and unobtrusive relative to cannon/flamethrower/music
    this.engineBus.gain.setTargetAtTime(settings.engine * 0.72, t, 0.05);
  }

  setListener(cam: THREE.Camera): void {
    this.cam = cam;
  }
  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
  }
  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  private _noise(): AudioBufferSourceNode {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    return s;
  }

  private _tone(dst: AudioNode, type: OscillatorType, f0: number, f1: number, t: number, dur: number, peak: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dst);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private _burst(dst: AudioNode, t: number, dur: number, peak: number, ftype: BiquadFilterType, f0: number, f1: number, q = 0.7): void {
    const ctx = this.ctx!;
    const n = this._noise();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    f.type = ftype;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    f.Q.value = q;
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f);
    f.connect(g);
    g.connect(dst);
    n.start(t, Math.random());
    n.stop(t + dur + 0.05);
  }

  private _route(pos: THREE.Vector3 | null, vol: number, own: boolean): GainNode {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    let dist = 0;
    let pan = 0;
    let out: AudioNode = g;
    if (pos && this.cam && !own) {
      const c = this.cam.position;
      const dx = pos.x - c.x;
      const dy = pos.y - c.y;
      const dz = pos.z - c.z;
      dist = Math.hypot(dx, dy, dz);
      const e = this.cam.matrixWorld.elements;
      pan = clamp((dx * e[0] + dy * e[1] + dz * e[2]) / Math.max(dist, 1), -1, 1) * 0.85;
    }
    g.gain.value = vol / (1 + dist / 70);
    if (dist > 40) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = Math.max(500, 9000 / (1 + dist / 120));
      g.connect(lp);
      out = lp;
    }
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      out.connect(p);
      out = p;
    }
    out.connect(this.sfxBus);
    return g;
  }

  play(name: string, pos: THREE.Vector3 | null = null, vol = 1, own = false): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const dst = this._route(pos, vol, own);
    const t = this.ctx.currentTime + 0.005;
    switch (name) {
      case 'cannon':
        this._tone(dst, 'sine', 120, 32, t, 0.32, 1.0);
        this._burst(dst, t, 0.7, 1.2, 'lowpass', 2400, 150);
        this._burst(dst, t, 0.05, 0.8, 'highpass', 3000, 3000);
        this._burst(dst, t + 0.05, 2.2, 0.3, 'lowpass', 500, 120);
        if (own) {
          this._tone(dst, 'sine', 3300, 3100, t + 0.6, 0.12, 0.15);
          this._tone(dst, 'sine', 4900, 4700, t + 0.63, 0.1, 0.1);
        }
        break;
      case 'explosion':
        this._explosion(dst, t, 1);
        break;
      case 'bigexplosion':
        this._explosion(dst, t, 2);
        this._burst(dst, t, 3, 1.5, 'lowpass', 300, 40);
        this._tone(dst, 'sine', 45, 20, t, 2.5, 1.0);
        break;
      case 'fuelExplosion':
        this._explosion(dst, t, 2.3);
        this._tone(dst, 'sawtooth', 160, 26, t, 0.9, 0.8);
        this._tone(dst, 'sine', 52, 18, t, 2.8, 1.2);
        this._burst(dst, t + 0.04, 2.4, 1.4, 'bandpass', 720, 140, 0.8);
        this._burst(dst, t + 0.15, 3.2, 1.1, 'lowpass', 420, 60);
        break;
      case 'ricochet':
        this._tone(dst, 'sine', 2600, 2000, t, 0.6, 0.5);
        this._tone(dst, 'sine', 3500, 3000, t, 0.5, 0.3);
        this._burst(dst, t, 0.08, 0.6, 'bandpass', 3000, 3000, 2);
        break;
      case 'hitpen':
        this._tone(dst, 'triangle', 520, 400, t, 0.5, 0.5);
        this._tone(dst, 'sine', 780, 700, t, 0.4, 0.3);
        this._tone(dst, 'sine', 1240, 1100, t, 0.3, 0.2);
        this._tone(dst, 'sine', 90, 50, t, 0.3, 0.6);
        this._burst(dst, t, 0.15, 0.8, 'bandpass', 1500, 1500);
        break;
      case 'nopen':
        this._tone(dst, 'sine', 900, 700, t, 0.25, 0.5);
        this._tone(dst, 'sine', 1500, 1400, t, 0.2, 0.3);
        this._burst(dst, t, 0.06, 0.5, 'bandpass', 2000, 2000);
        break;
      case 'track':
        for (const o of [0, 0.06, 0.13]) this._burst(dst, t + o, 0.05, 0.7, 'bandpass', 900, 900, 3);
        this._tone(dst, 'square', 200, 120, t, 0.2, 0.2);
        break;
      case 'barrel':
        this._tone(dst, 'sine', 320, 300, t, 0.8, 0.5);
        this._tone(dst, 'sine', 480, 460, t, 0.6, 0.3);
        this._burst(dst, t, 0.06, 0.6, 'bandpass', 2500, 2500);
        break;
      case 'snap':
        this._burst(dst, t, 0.04, 0.6, 'highpass', 5000, 5000);
        break;
      case 'flame':
        this._burst(dst, t, 0.34, 0.5, 'bandpass', 540, 260, 0.6);
        this._burst(dst, t, 0.28, 0.28, 'lowpass', 1400, 480);
        break;
      case 'galix':
        // Pneumatic GALIX grenade thump + turbine overdrive spool + dense smoke hiss
        this._tone(dst, 'sine', 165, 58, t, 0.14, 0.65);
        this._burst(dst, t, 0.09, 0.7, 'bandpass', 1450, 480, 1.1);
        this._burst(dst, t + 0.05, 0.75, 0.45, 'highpass', 1900, 900);
        this._tone(dst, 'sawtooth', 190, 420, t + 0.04, 0.45, 0.22);
        break;
      case 'dm63':
        // High-energy sabot prime / hyper-velocity crack
        this._tone(dst, 'triangle', 980, 1620, t, 0.09, 0.28);
        this._burst(dst, t, 0.045, 0.5, 'bandpass', 2800, 1200, 1.4);
        break;
      case 'mg': {
        const j = 0.94 + Math.random() * 0.12;
        // Dry low-end mechanical punch (no hollow triangle sweep)
        this._tone(dst, 'sine', 118 * j, 46, t, 0.036, 0.55);
        // Wide propellant crack & gun-body bark
        this._burst(dst, t, 0.068, 0.72, 'lowpass', 5200 * j, 520, 0.45);
        // Sharp breech/muzzle transient + subtle steel bolt clack
        this._burst(dst, t, 0.016, 0.42, 'highpass', 2400 * j, 2400, 0.5);
        this._tone(dst, 'sawtooth', 1420 * j, 820, t, 0.012, 0.09);
        // Short outdoor tail
        this._burst(dst, t + 0.02, 0.09, 0.18, 'lowpass', 850, 220, 0.4);
        break;
      }
      case 'mgHit': {
        const j = 0.92 + Math.random() * 0.16;
        this._tone(dst, 'sine', 1240 * j, 860, t, 0.035, 0.15);
        this._burst(dst, t, 0.025, 0.24, 'highpass', 2400, 2400, 0.7);
        break;
      }
      case 'trophy': {
        // Radar lock chirp + directional mid-air countermeasure blast
        this._tone(dst, 'triangle', 2200, 3100, t, 0.04, 0.28);
        this._tone(dst, 'sine', 190, 52, t + 0.02, 0.24, 0.85);
        this._burst(dst, t + 0.015, 0.18, 0.95, 'bandpass', 2600, 620, 0.7);
        this._burst(dst, t + 0.02, 0.06, 0.65, 'highpass', 3600, 3600);
        break;
      }
      case 'rockhit': {
        // Heavy stone/hull thud + scrape
        this._tone(dst, 'sine', 110, 36, t, 0.22, 0.78);
        this._tone(dst, 'triangle', 240, 82, t, 0.12, 0.36);
        this._burst(dst, t, 0.16, 0.55, 'lowpass', 950, 180, 0.6);
        break;
      }
      case 'treefall': {
        // Timber snap + foliage rustle swoosh
        const j = 0.9 + Math.random() * 0.2;
        this._tone(dst, 'sawtooth', 190 * j, 68, t, 0.09, 0.34);
        this._burst(dst, t, 0.06, 0.42, 'bandpass', 1400 * j, 620, 0.9);
        this._burst(dst, t + 0.05, 0.38, 0.28, 'bandpass', 900, 260, 0.5);
        break;
      }
      case 'thermal': {
        // Crisp FLIR electro-optical power-up hum & dual confirmation beep
        this._tone(dst, 'sine', 620, 1280, t, 0.14, 0.22);
        this._tone(dst, 'triangle', 1760, 2080, t + 0.09, 0.12, 0.16);
        this._burst(dst, t, 0.18, 0.14, 'bandpass', 2400, 1100, 1.4);
        break;
      }
      case 'barrage': {
        // Pneumatic loader boost & breech lock clack
        this._tone(dst, 'sawtooth', 260, 640, t, 0.16, 0.26);
        this._tone(dst, 'triangle', 880, 1320, t + 0.05, 0.12, 0.2);
        this._burst(dst, t, 0.1, 0.45, 'bandpass', 1800, 750, 1.2);
        break;
      }
      case 'kstamLockTick': {
        this._tone(dst, 'sine', 960, 1020, t, 0.05, 0.18);
        break;
      }
      case 'kstamLocked': {
        this._tone(dst, 'triangle', 1480, 1980, t, 0.08, 0.28);
        this._tone(dst, 'sine', 2240, 2240, t + 0.08, 0.11, 0.24);
        break;
      }
      case 'kstamLaunch': {
        // High-loft mortar boost thump + rocket sustainer hiss
        this._tone(dst, 'sine', 155, 52, t, 0.24, 0.8);
        this._burst(dst, t, 0.48, 0.68, 'bandpass', 1900, 680, 0.8);
        this._tone(dst, 'sawtooth', 240, 560, t + 0.04, 0.35, 0.22);
        break;
      }
      case 'kstamHit': {
        this._explosion(dst, t, 2.2);
        this._tone(dst, 'sawtooth', 190, 32, t, 0.65, 0.72);
        this._burst(dst, t + 0.03, 1.4, 1.0, 'bandpass', 960, 180, 0.7);
        break;
      }
      case 'bomberFlyover': {
        // Heavy twin-engine WWII propeller drone sweeping overhead
        for (const base of [44, 52.5, 88, 105.6]) {
          const o = this.ctx!.createOscillator();
          const lp = this.ctx!.createBiquadFilter();
          const g = this.ctx!.createGain();
          o.type = base < 65 ? 'sawtooth' : 'triangle';
          o.frequency.setValueAtTime(base * 0.92, t);
          o.frequency.linearRampToValueAtTime(base * 1.12, t + 2.3);
          o.frequency.linearRampToValueAtTime(base * 0.8, t + 5.8);
          lp.type = 'lowpass';
          lp.frequency.setValueAtTime(190, t);
          lp.frequency.linearRampToValueAtTime(420, t + 2.4);
          lp.frequency.linearRampToValueAtTime(140, t + 5.8);
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(base < 65 ? 0.22 : 0.14, t + 1.9);
          g.gain.setValueAtTime(base < 65 ? 0.2 : 0.12, t + 3.4);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 6.0);
          o.connect(lp);
          lp.connect(g);
          g.connect(dst);
          o.start(t);
          o.stop(t + 6.1);
        }
        this._burst(dst, t + 0.3, 5.2, 0.26, 'bandpass', 240, 130, 0.65);
        break;
      }
      case 'bombWhistle': {
        // Descending whistling drop of a WWII SC250/SC500 aerial bomb
        this._tone(dst, 'sine', 1650, 380, t, 1.15, 0.14);
        this._tone(dst, 'triangle', 1120, 290, t + 0.04, 1.1, 0.06);
        this._burst(dst, t, 0.9, 0.09, 'bandpass', 1400, 420, 1.2);
        break;
      }
      case 'airBomb': {
        // Heavy aerial bomb detonation with concussive blast wave + debris rumble
        this._explosion(dst, t, 2.5);
        this._tone(dst, 'sine', 64, 20, t, 2.2, 1.1);
        this._burst(dst, t, 2.8, 1.35, 'lowpass', 360, 48);
        break;
      }
      default:
        break;
    }
  }

  private _explosion(dst: AudioNode, t: number, size: number): void {
    this._tone(dst, 'sine', 80, 28, t, 1.2 * size, 1.0);
    this._burst(dst, t, 1.8 * size, 1.3, 'lowpass', 1200, 90);
    this._burst(dst, t, 0.4, 0.5, 'bandpass', 600, 600);
    for (let i = 0; i < 4; i++) this._burst(dst, t + 0.2 + Math.random() * 0.8, 0.05, 0.25, 'highpass', 4000, 4000);
  }

  ui(name: 'tick' | 'click' | 'fuelCrit' | 'silver' | 'victory'): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    if (name === 'tick') {
      this._tone(this.sfxBus, 'square', 1600, 1500, t, 0.05, 0.22);
    } else if (name === 'click') {
      this._tone(this.sfxBus, 'square', 700, 500, t, 0.04, 0.18);
    } else if (name === 'fuelCrit') {
      this._tone(this.sfxBus, 'triangle', 1480, 1860, t, 0.09, 0.32);
      this._tone(this.sfxBus, 'triangle', 1980, 2400, t + 0.08, 0.14, 0.3);
      this._tone(this.sfxBus, 'sine', 160, 55, t, 0.28, 0.35);
      this._burst(this.sfxBus, t, 0.12, 0.25, 'bandpass', 2600, 1200);
    } else if (name === 'silver') {
      this._tone(this.sfxBus, 'triangle', 1320, 1760, t, 0.08, 0.18);
      this._tone(this.sfxBus, 'sine', 1980, 2200, t + 0.06, 0.12, 0.14);
    } else if (name === 'victory') {
      this._tone(this.sfxBus, 'triangle', 523.25, 523.25, t, 0.16, 0.22);
      this._tone(this.sfxBus, 'triangle', 659.25, 659.25, t + 0.12, 0.18, 0.24);
      this._tone(this.sfxBus, 'triangle', 783.99, 783.99, t + 0.24, 0.28, 0.26);
      this._tone(this.sfxBus, 'triangle', 1046.5, 1046.5, t + 0.36, 0.45, 0.28);
    }
  }

  preloadVoices(): void {
    if (!this.ctx || typeof fetch !== 'function') return;
    for (const cue of ALL_VOICE_CUES) {
      void this._loadVoice(cue);
    }
  }

  private _loadVoice(cue: VoiceCueId): Promise<AudioBuffer | null> {
    const cached = this.voiceBuffers.get(cue);
    if (cached) return Promise.resolve(cached);
    const pending = this.voiceLoads.get(cue);
    if (pending) return pending;
    const ctx = this.ctx;
    if (!ctx || typeof fetch !== 'function') return Promise.resolve(null);

    const req = fetch(resolveVoiceAssetUrl(cue))
      .then((res) => {
        if (!res.ok) throw new Error(`Voice HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then((buf) => ctx.decodeAudioData(buf))
      .then((decoded) => {
        this.voiceBuffers.set(cue, decoded);
        return decoded;
      })
      .catch(() => {
        this.voiceLoads.delete(cue);
        return null;
      });
    this.voiceLoads.set(cue, req);
    return req;
  }

  stopVoice(): void {
    this.voiceToken++;
    if (this.activeVoiceSource) {
      try {
        this.activeVoiceSource.onended = null;
        this.activeVoiceSource.stop();
      } catch {
        // already stopped
      }
      try {
        this.activeVoiceSource.disconnect();
      } catch {
        // ignore
      }
      this.activeVoiceSource = null;
    }
    if (this.activeVoiceGain) {
      try {
        this.activeVoiceGain.disconnect();
      } catch {
        // ignore
      }
      this.activeVoiceGain = null;
    }
  }

  playVoice(cue: VoiceCueId, vol = 1.05): void {
    if (!this.ctx && !this.init()) return;
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
    this.stopVoice();
    const token = this.voiceToken;
    const startBuffer = (buffer: AudioBuffer | null) => {
      if (!buffer || token !== this.voiceToken || !this.ctx || this.ctx.state !== 'running') return;
      const src = this.ctx.createBufferSource();
      const g = this.ctx.createGain();
      src.buffer = buffer;
      g.gain.value = clamp(vol, 0, 2);
      src.connect(g);
      g.connect(this.sfxBus);
      src.onended = () => {
        if (this.activeVoiceSource === src) {
          this.activeVoiceSource = null;
          this.activeVoiceGain = null;
        }
        try {
          src.disconnect();
          g.disconnect();
        } catch {
          // ignore
        }
      };
      this.activeVoiceSource = src;
      this.activeVoiceGain = g;
      src.start(this.ctx.currentTime + 0.01);
    };

    const cached = this.voiceBuffers.get(cue);
    if (cached) {
      startBuffer(cached);
    } else {
      void this._loadVoice(cue).then(startBuffer);
    }
  }

  private _startEngine(): void {
    const ctx = this.ctx!;
    // Warm muffled diesel rumble: triangle sub + softly lowpassed sawtooth, zero square harshness
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 180;
    lp.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.value = 0;
    const o1 = ctx.createOscillator();
    o1.type = 'sawtooth';
    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o1.connect(lp);
    o2.connect(lp);
    lp.connect(g);
    g.connect(this.engineBus);

    const n = this._noise();
    const nl = ctx.createBiquadFilter();
    nl.type = 'lowpass';
    nl.frequency.value = 145;
    const ng = ctx.createGain();
    ng.gain.value = 0.08;
    n.connect(nl);
    nl.connect(ng);
    ng.connect(this.engineBus);

    const t = this._noise();
    const tb = ctx.createBiquadFilter();
    tb.type = 'bandpass';
    tb.frequency.value = 420;
    tb.Q.value = 0.6;
    const tg = ctx.createGain();
    tg.gain.value = 0;
    t.connect(tb);
    tb.connect(tg);
    tg.connect(this.engineBus);

    const turbBp = ctx.createBiquadFilter();
    turbBp.type = 'bandpass';
    turbBp.frequency.value = 1850;
    turbBp.Q.value = 1.6;
    const turbGain = ctx.createGain();
    turbGain.gain.value = 0;
    const turb1 = ctx.createOscillator();
    turb1.type = 'sine';
    turb1.frequency.value = 1520;
    const turb2 = ctx.createOscillator();
    turb2.type = 'triangle';
    turb2.frequency.value = 3040;
    turb1.connect(turbBp);
    turb2.connect(turbBp);
    turbBp.connect(turbGain);
    turbGain.connect(this.engineBus);

    const airSrc = this._noise();
    const airBp = ctx.createBiquadFilter();
    airBp.type = 'bandpass';
    airBp.frequency.value = 2100;
    airBp.Q.value = 0.75;
    const airGain = ctx.createGain();
    airGain.gain.value = 0;
    airSrc.connect(airBp);
    airBp.connect(airGain);
    airGain.connect(this.engineBus);

    o1.start();
    o2.start();
    n.start();
    t.start();
    turb1.start();
    turb2.start();
    airSrc.start();
    this._engine = { lp, g, o1, o2, n, nl, ng, t, tb, tg, turb1, turb2, turbBp, turbGain, airSrc, airBp, airGain };
  }

  engineUpdate(speedN: number, throttle: number, alive: boolean, engineType: 'diesel' | 'turbine' = 'diesel'): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    if (!this._engine) this._startEngine();
    const e = this._engine!;
    const t = this.ctx.currentTime;
    const rpm = alive ? 0.18 + 0.52 * clamp(speedN, 0, 1) + 0.22 * Math.abs(throttle) : 0;
    const isTurbine = engineType === 'turbine';
    const f = 24 + rpm * 46;
    e.o1.frequency.setTargetAtTime(f, t, 0.14);
    e.o2.frequency.setTargetAtTime(f * 0.5, t, 0.14);
    e.lp.frequency.setTargetAtTime(120 + rpm * 240, t, 0.14);
    e.g.gain.setTargetAtTime(alive ? (isTurbine ? 0.025 + 0.03 * rpm : 0.08 + 0.1 * rpm) : 0, t, 0.22);
    e.ng.gain.setTargetAtTime(alive ? (isTurbine ? 0.035 + 0.02 * rpm : 0.07 + 0.04 * rpm) : 0.01, t, 0.3);
    e.tg.gain.setTargetAtTime(alive ? clamp(speedN, 0, 1) * 0.055 : 0, t, 0.18);

    const tFreq = 1380 + rpm * 1550;
    e.turb1.frequency.setTargetAtTime(tFreq, t, 0.12);
    e.turb2.frequency.setTargetAtTime(tFreq * 1.92, t, 0.12);
    e.turbBp.frequency.setTargetAtTime(tFreq * 1.15, t, 0.14);
    e.turbGain.gain.setTargetAtTime(alive && isTurbine ? 0.045 + 0.075 * rpm : 0, t, 0.16);
    e.airBp.frequency.setTargetAtTime(1750 + rpm * 2200, t, 0.16);
    e.airGain.gain.setTargetAtTime(alive && isTurbine ? 0.03 + 0.055 * rpm : 0, t, 0.2);
  }

  engineSilence(): void {
    if (this._engine && this.ctx) this.engineUpdate(0, 0, false);
  }

  private _startWind(): void {
    const ctx = this.ctx!;
    const n = this._noise();
    const lp = ctx.createBiquadFilter();
    const g = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lp.type = 'lowpass';
    lp.frequency.value = 650;
    g.gain.value = 0.05;
    lfo.frequency.value = 0.12;
    lg.gain.value = 0.03;
    lfo.connect(lg);
    lg.connect(g.gain);
    n.connect(lp);
    lp.connect(g);
    g.connect(this.sfxBus);
    n.start();
    lfo.start();
  }

  private _clearMusicLoop(): void {
    if (this._fadeTimer) {
      clearTimeout(this._fadeTimer);
      this._fadeTimer = null;
    }
    if (this._mt) {
      clearInterval(this._mt);
      this._mt = null;
    }
    if (this.musicSess) {
      this.musicSess.disconnect();
      this.musicSess = null;
    }
    this.bossDistNode = null;
    this.bossDriveGain = null;
  }

  music(mode: 'off' | 'menu' | 'battle' | 'boss'): void {
    if (!this.ctx) {
      this.musicMode = mode;
      return;
    }
    if (this.musicMode === mode && (mode === 'off' || this._mt)) return;
    this._clearMusicLoop();
    this.musicMode = mode;
    if (mode === 'off') return;

    const sess = this.ctx.createGain();
    sess.gain.value = mode === 'boss' ? 0.42 : 1.0;
    sess.connect(this.musicBus);
    this.musicSess = sess;

    if (mode === 'boss') {
      const shaper = this.ctx.createWaveShaper();
      shaper.curve = makeDistortionCurve(44);
      shaper.oversample = '2x';
      const postLp = this.ctx.createBiquadFilter();
      postLp.type = 'lowpass';
      postLp.frequency.value = 1750;
      const driveGain = this.ctx.createGain();
      driveGain.gain.value = 0.58;
      driveGain.connect(shaper);
      shaper.connect(postLp);
      postLp.connect(sess);
      this.bossDistNode = shaper;
      this.bossDriveGain = driveGain;
    }

    this.step = 0;
    this.nextT = this.ctx.currentTime + 0.08;
    this._mt = setInterval(() => this._sched(), 25);
  }

  musicFadeOut(durSec = 0.45): void {
    this.musicMode = 'off';
    if (this._mt) {
      clearInterval(this._mt);
      this._mt = null;
    }
    if (this._fadeTimer) {
      clearTimeout(this._fadeTimer);
      this._fadeTimer = null;
    }
    const sess = this.musicSess;
    if (!sess || !this.ctx) return;
    const t = this.ctx.currentTime;
    sess.gain.cancelScheduledValues(t);
    sess.gain.setValueAtTime(Math.max(0.0001, sess.gain.value), t);
    sess.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.08, durSec));
    this._fadeTimer = setTimeout(() => {
      if (this.musicSess === sess) {
        sess.disconnect();
        this.musicSess = null;
        this.bossDistNode = null;
        this.bossDriveGain = null;
      }
      this._fadeTimer = null;
    }, Math.ceil((durSec + 0.08) * 1000));
  }

  private _sched(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const bpm = this.musicMode === 'boss' ? 156 : this.musicMode === 'battle' ? 100 : 72;
    const sd = 60 / bpm / 4;
    if (this.nextT < ctx.currentTime - 0.5) this.nextT = ctx.currentTime + 0.04;
    while (this.nextT < ctx.currentTime + 0.22) {
      if (this.musicMode === 'boss') {
        this._bossStep(this.step, this.nextT, sd);
      } else {
        this._musicStep(this.step, this.nextT, sd);
      }
      this.nextT += sd;
      this.step++;
    }
  }

  private _bossStep(step: number, t: number, sd: number): void {
    const mb = this.musicSess;
    const ctx = this.ctx;
    if (!mb || !ctx) return;
    const d = getBossMusicStepData(step);
    if (d.isStop) return;

    // 1. Heavy distorted industrial djent bass / octave growl
    if (d.bassMidi !== null && this.bossDriveGain) {
      const f = mtof(d.bassMidi);
      const dur = d.bassAccent ? sd * 1.45 : sd * 0.78;
      this._tone(this.bossDriveGain, 'sawtooth', f, f * 0.985, t, dur, d.bassAccent ? 0.52 : 0.38);
      this._tone(mb, 'triangle', f * 0.5, f * 0.5, t, dur, d.bassAccent ? 0.34 : 0.24);
    }

    // 2. Breakcore punchy kick (clipped sub + crisp transient click)
    if (d.kick) {
      this._tone(mb, 'sine', 165, 36, t, 0.14, 0.62);
      this._burst(mb, t, 0.025, 0.24, 'bandpass', 2400, 1200, 1.1);
    }

    // 3. Industrial metallic snare & choppy stutters
    if (d.snare) {
      this._burst(mb, t, 0.11, 0.36, 'bandpass', 1850, 950, 0.9);
      this._tone(mb, 'square', 280, 125, t, 0.075, 0.18);
    }
    if (d.stutterHat) {
      this._burst(mb, t, 0.032, 0.11, 'highpass', 5800, 5800);
    }

    // 4. Dark-synth alarm stabs (sawtooth detuned fifth / minor second bite)
    if (d.stabMidi !== null) {
      const f = mtof(d.stabMidi);
      const len = sd * 1.9;
      for (const ratio of [1, 1.498]) {
        const o = ctx.createOscillator();
        const bp = ctx.createBiquadFilter();
        const g = ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f * ratio, t);
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(1600, t);
        bp.frequency.exponentialRampToValueAtTime(700, t + len);
        bp.Q.value = 1.6;
        g.gain.setValueAtTime(0.14, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + len);
        o.connect(bp);
        bp.connect(g);
        g.connect(mb);
        o.start(t);
        o.stop(t + len + 0.04);
      }
    }
  }

  private _musicStep(step: number, t: number, sd: number): void {
    const mb = this.musicSess;
    const battle = this.musicMode === 'battle';
    if (!mb) return;
    const chords = [
      [57, 60, 64, 69],
      [53, 57, 60, 65],
      [60, 64, 67, 72],
      [55, 59, 62, 67],
    ];
    const bar = Math.floor(step / 16) % 4;
    const s = step % 16;
    const ch = chords[bar];
    const ctx = this.ctx!;
    if (s === 0) {
      const len = sd * 16;
      for (const m of ch.slice(0, 3)) {
        for (const det of [-6, 7]) {
          const o = ctx.createOscillator();
          const lp = ctx.createBiquadFilter();
          const g = ctx.createGain();
          o.type = 'sawtooth';
          o.frequency.value = mtof(m);
          o.detune.value = det;
          lp.type = 'lowpass';
          lp.frequency.value = 900;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(battle ? 0.035 : 0.05, t + 0.9);
          g.gain.setValueAtTime(battle ? 0.035 : 0.05, t + len - 0.6);
          g.gain.linearRampToValueAtTime(0.0001, t + len);
          o.connect(lp);
          lp.connect(g);
          g.connect(mb);
          o.start(t);
          o.stop(t + len + 0.05);
        }
      }
    }
    if (s === 0 || (battle && s === 8)) this._tone(mb, 'triangle', mtof(ch[0] - 12), mtof(ch[0] - 12), t, sd * (s === 0 ? 7 : 6), 0.22);
    if (s % 2 === 0) {
      const idx = [0, 2, 1, 3, 2, 3, 1, 2][(s / 2) % 8];
      const n = ch[idx] + 12;
      this._tone(mb, 'triangle', mtof(n), mtof(n), t, sd * 3, battle ? 0.05 : 0.07);
    }
    if (battle) {
      if (s === 0 || s === 6 || s === 10) this._tone(mb, 'sine', 140, 40, t, 0.2, 0.7);
      if (s === 4 || s === 12) {
        this._burst(mb, t, 0.16, 0.35, 'bandpass', 1900, 1500, 0.8);
        this._tone(mb, 'triangle', 220, 140, t, 0.1, 0.18);
      }
      if ((bar === 3 && (s === 14 || s === 15)) || s === 15) this._burst(mb, t, 0.06, 0.15, 'bandpass', 2200, 2200, 0.8);
      if (s % 2 === 0) this._burst(mb, t, 0.03, 0.07, 'highpass', 7000, 7000);
      if (s === 0 || s === 3 || s === 8 || s === 11) {
        const n = ch[[0, 2, 1, 3][(s / 3) | 0] || 0] + 12;
        const o = ctx.createOscillator();
        const lp = ctx.createBiquadFilter();
        const g = ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.value = mtof(n);
        lp.type = 'lowpass';
        lp.frequency.value = 1500;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.045, t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
        o.connect(lp);
        lp.connect(g);
        g.connect(mb);
        o.start(t);
        o.stop(t + 0.5);
      }
    }
  }
}

export const audio = new AudioSys();
