import type { WeaponId } from "./config";

/** Synthesized Web Audio effects — no external audio assets. */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  enabled = true;

  unlock() {
    try {
      if (!this.ctx) {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return;
        this.ctx = new Ctx();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        const comp = this.ctx.createDynamicsCompressor();
        this.master.connect(comp).connect(this.ctx.destination);
        const len = this.ctx.sampleRate;
        this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === "suspended") void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  private ok() {
    return this.enabled && this.ctx && this.master && this.ctx.state === "running";
  }

  private burst(dur: number, freq: number, gain: number, type: BiquadFilterType = "lowpass", delay = 0) {
    if (!this.ok()) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.25), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t, Math.random() * 0.5, dur + 0.05);
  }

  private tone(dur: number, f0: number, f1: number, gain: number, type: OscillatorType = "sine", delay = 0) {
    if (!this.ok()) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  shot(w: WeaponId) {
    if (w === "shotgun") {
      this.burst(0.45, 2400, 1.0);
      this.tone(0.25, 140, 40, 0.8, "triangle");
    } else if (w === "pistol") {
      this.burst(0.18, 4000, 0.7);
      this.tone(0.12, 220, 60, 0.5, "square");
    } else {
      this.burst(0.14, 3200, 0.55);
      this.tone(0.1, 180, 50, 0.45, "square");
    }
  }
  hit(head: boolean) {
    this.tone(0.06, head ? 1800 : 900, head ? 1200 : 500, 0.25, "square");
    if (head) this.tone(0.1, 2600, 2000, 0.15, "sine", 0.04);
  }
  impact() {
    this.burst(0.05, 5000, 0.12, "highpass");
  }
  reload() {
    this.burst(0.05, 3000, 0.3, "bandpass");
    this.burst(0.06, 2000, 0.35, "bandpass", 0.35);
    this.tone(0.04, 900, 700, 0.2, "square", 0.7);
  }
  empty() {
    this.tone(0.04, 1500, 1200, 0.2, "square");
  }
  pickup(gold: boolean) {
    this.tone(0.08, gold ? 1200 : 600, gold ? 1800 : 900, 0.25, "triangle");
    this.tone(0.1, gold ? 1800 : 900, gold ? 2400 : 1200, 0.2, "triangle", 0.07);
  }
  hurt() {
    this.tone(0.25, 160, 60, 0.5, "sawtooth");
    this.burst(0.15, 800, 0.3);
  }
  explode() {
    this.burst(1.0, 1200, 1.2);
    this.tone(0.7, 90, 25, 1.0, "sine");
  }
  groan() {
    this.tone(0.6, 110 + Math.random() * 40, 70, 0.12, "sawtooth");
  }
  sentry() {
    this.burst(0.08, 5000, 0.18);
  }
  buy() {
    this.tone(0.08, 700, 1100, 0.25, "triangle");
  }
  deny() {
    this.tone(0.15, 220, 160, 0.25, "square");
  }
  wave() {
    this.tone(0.6, 220, 110, 0.35, "sawtooth");
    this.tone(0.6, 330, 165, 0.25, "sawtooth", 0.1);
  }
  dispose() {
    try {
      void this.ctx?.close();
    } catch {
      /* noop */
    }
    this.ctx = null;
  }
}
