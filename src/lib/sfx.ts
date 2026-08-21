import {
  onImpulse,
  trackPointer,
  type Impulse,
  type Material,
} from "@/lib/impulse";

export type SoundThemeId =
  "tactile" | "soft" | "signal" | "evangelion" | "ghost" | "orchestra" | "off";

export const SOUND_THEMES: ReadonlyArray<{
  id: SoundThemeId;
  label: string;
  description: string;
}> = [
  { id: "tactile", label: "Tactile", description: "Paper, wood, and glass" },
  { id: "soft", label: "Soft", description: "Lower and quieter" },
  { id: "signal", label: "Signal", description: "Bright and precise" },
  {
    id: "evangelion",
    label: "Evangelion",
    description: "Urgent alarms and mechanical force",
  },
  {
    id: "ghost",
    label: "Ghost in the Shell",
    description: "Glassy cybernetic pulses and data sweeps",
  },
  {
    id: "orchestra",
    label: "Humming Orchestra",
    description: "Warm strings, breath, and layered hum",
  },
  { id: "off", label: "Off", description: "No interface sound" },
];

type FrequencySweep = {
  inbound: [number, number];
  outbound: [number, number];
  gain: number;
  duration: number;
  q: number;
};

type SoundThemeConfig = {
  root: number;
  master: number;
  pitch: number;
  noise: number;
  decay: number;
  impact: {
    fundamental: OscillatorType;
    overtone: OscillatorType;
    gain: number;
    attack: number;
    noiseRatio: number;
    q: number;
  };
  friction: {
    gain: number;
    threshold: number;
    base: number;
    speedScale: number;
    q: number;
  };
  zoom: FrequencySweep & {
    wave: OscillatorType;
    noiseMix: number;
    toneMix: number;
    toneRatio: number;
  };
  whoosh: FrequencySweep;
  chord?: {
    ratios: number[];
    gain: number;
    attack: number;
    decay: number;
    wave: OscillatorType;
  };
};

const THEME: Record<Exclude<SoundThemeId, "off">, SoundThemeConfig> = {
  tactile: {
    root: 196,
    master: 0.48,
    pitch: 1,
    noise: 1,
    decay: 1,
    impact: {
      fundamental: "sine",
      overtone: "triangle",
      gain: 1,
      attack: 0.004,
      noiseRatio: 1.8,
      q: 1,
    },
    friction: {
      gain: 0.065,
      threshold: 0.4,
      base: 280,
      speedScale: 42,
      q: 1.2,
    },
    zoom: {
      inbound: [520, 2400],
      outbound: [2100, 380],
      gain: 0.075,
      duration: 0.16,
      q: 0.8,
      wave: "sine",
      noiseMix: 1,
      toneMix: 0.08,
      toneRatio: 1,
    },
    whoosh: {
      inbound: [400, 2200],
      outbound: [1800, 280],
      gain: 0.18,
      duration: 0.22,
      q: 0.7,
    },
  },
  soft: {
    root: 148,
    master: 0.3,
    pitch: 0.82,
    noise: 0.48,
    decay: 1.25,
    impact: {
      fundamental: "sine",
      overtone: "sine",
      gain: 0.72,
      attack: 0.012,
      noiseRatio: 1.25,
      q: 0.58,
    },
    friction: {
      gain: 0.032,
      threshold: 0.7,
      base: 150,
      speedScale: 18,
      q: 0.55,
    },
    zoom: {
      inbound: [220, 780],
      outbound: [680, 160],
      gain: 0.042,
      duration: 0.28,
      q: 0.5,
      wave: "sine",
      noiseMix: 0.34,
      toneMix: 0.42,
      toneRatio: 0.72,
    },
    whoosh: {
      inbound: [180, 720],
      outbound: [620, 140],
      gain: 0.085,
      duration: 0.34,
      q: 0.5,
    },
  },
  signal: {
    root: 262,
    master: 0.38,
    pitch: 1.18,
    noise: 0.28,
    decay: 0.72,
    impact: {
      fundamental: "square",
      overtone: "sine",
      gain: 0.72,
      attack: 0.0015,
      noiseRatio: 2.8,
      q: 2.8,
    },
    friction: {
      gain: 0.042,
      threshold: 0.35,
      base: 920,
      speedScale: 96,
      q: 4.2,
    },
    zoom: {
      inbound: [980, 4200],
      outbound: [3900, 720],
      gain: 0.06,
      duration: 0.11,
      q: 4.8,
      wave: "square",
      noiseMix: 0.18,
      toneMix: 0.78,
      toneRatio: 1.8,
    },
    whoosh: {
      inbound: [1100, 5200],
      outbound: [4800, 780],
      gain: 0.12,
      duration: 0.14,
      q: 3.4,
    },
  },
  evangelion: {
    root: 110,
    master: 0.43,
    pitch: 1.05,
    noise: 0.56,
    decay: 0.82,
    impact: {
      fundamental: "sawtooth",
      overtone: "square",
      gain: 1.15,
      attack: 0.001,
      noiseRatio: 3.2,
      q: 3.6,
    },
    friction: {
      gain: 0.07,
      threshold: 0.25,
      base: 460,
      speedScale: 118,
      q: 5.5,
    },
    zoom: {
      inbound: [360, 3100],
      outbound: [2800, 240],
      gain: 0.095,
      duration: 0.19,
      q: 7,
      wave: "sawtooth",
      noiseMix: 0.34,
      toneMix: 0.9,
      toneRatio: 2,
    },
    whoosh: {
      inbound: [260, 3400],
      outbound: [3100, 190],
      gain: 0.24,
      duration: 0.26,
      q: 2.6,
    },
  },
  ghost: {
    root: 164.81,
    master: 0.36,
    pitch: 1.22,
    noise: 0.16,
    decay: 1.18,
    impact: {
      fundamental: "sine",
      overtone: "sine",
      gain: 0.8,
      attack: 0.0025,
      noiseRatio: 4.6,
      q: 7.5,
    },
    friction: {
      gain: 0.038,
      threshold: 0.3,
      base: 1320,
      speedScale: 132,
      q: 9,
    },
    zoom: {
      inbound: [1200, 7200],
      outbound: [6600, 860],
      gain: 0.052,
      duration: 0.24,
      q: 10,
      wave: "sine",
      noiseMix: 0.1,
      toneMix: 0.82,
      toneRatio: 2.6,
    },
    whoosh: {
      inbound: [900, 7600],
      outbound: [6900, 640],
      gain: 0.11,
      duration: 0.3,
      q: 8,
    },
  },
  orchestra: {
    root: 110,
    master: 0.36,
    pitch: 0.76,
    noise: 0.09,
    decay: 2.2,
    impact: {
      fundamental: "sine",
      overtone: "triangle",
      gain: 0.74,
      attack: 0.028,
      noiseRatio: 0.9,
      q: 1.6,
    },
    friction: {
      gain: 0.028,
      threshold: 0.2,
      base: 92,
      speedScale: 7,
      q: 1.1,
    },
    zoom: {
      inbound: [120, 520],
      outbound: [440, 90],
      gain: 0.052,
      duration: 0.62,
      q: 1.35,
      wave: "sine",
      noiseMix: 0.08,
      toneMix: 0.94,
      toneRatio: 0.5,
    },
    whoosh: {
      inbound: [100, 680],
      outbound: [560, 80],
      gain: 0.07,
      duration: 0.72,
      q: 1.15,
    },
    chord: {
      ratios: [1, 6 / 5, 3 / 2, 2],
      gain: 0.025,
      attack: 0.06,
      decay: 1.1,
      wave: "sine",
    },
  },
};

const SOUND_KEY = "fudge-explorer:sound-theme";
const DEFAULT_SOUND_THEME: Exclude<SoundThemeId, "off"> = "soft";

function soundThemeConfig(theme: SoundThemeId) {
  return theme === "off" ? THEME[DEFAULT_SOUND_THEME] : THEME[theme];
}

const MATERIAL: Record<
  Material,
  { modes: number[]; noise: number; decay: number }
> = {
  paper: { modes: [1, 2.31, 4.1], noise: 0.78, decay: 0.11 },
  wood: { modes: [1, 2.01, 3.17], noise: 0.5, decay: 0.18 },
  glass: { modes: [1, 2.76, 5.4], noise: 0.15, decay: 0.38 },
  string: { modes: [1, 2.52, 3.9], noise: 0.24, decay: 0.27 },
};

function readSoundTheme(): SoundThemeId {
  if (typeof window === "undefined") return DEFAULT_SOUND_THEME;
  try {
    const value = window.localStorage.getItem(SOUND_KEY);
    return SOUND_THEMES.some((theme) => theme.id === value)
      ? (value as SoundThemeId)
      : DEFAULT_SOUND_THEME;
  } catch {
    return DEFAULT_SOUND_THEME;
  }
}

class PhysicsSfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private last: Record<string, number> = {};
  private frictionGain: GainNode | null = null;
  private frictionFilter: BiquadFilterNode | null = null;
  private zoomGain: GainNode | null = null;
  private zoomFilter: BiquadFilterNode | null = null;
  private zoomTone: OscillatorNode | null = null;
  private zoomToneGain: GainNode | null = null;
  private wired = false;
  private theme: SoundThemeId = readSoundTheme();
  private themeListeners = new Set<(theme: SoundThemeId) => void>();

  private ensure() {
    if (this.theme === "off") return null;
    const theme = soundThemeConfig(this.theme);
    if (!this.ctx) {
      const ctx = new AudioContext();
      const master = ctx.createGain();
      const compressor = ctx.createDynamicsCompressor();
      master.gain.value = theme.master;
      compressor.threshold.value = -18;
      compressor.knee.value = 12;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.14;
      master.connect(compressor);
      compressor.connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;
    }
    return this.ctx;
  }

  private noiseBuf(ctx: AudioContext) {
    if (!this.noise) {
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noise = buf;
    }
    return this.noise;
  }

  private gate(key: string, ms: number) {
    const now = performance.now();
    if (now - (this.last[key] ?? 0) < ms) return false;
    this.last[key] = now;
    return true;
  }

  getTheme() {
    return this.theme;
  }

  subscribeTheme(listener: (theme: SoundThemeId) => void) {
    this.themeListeners.add(listener);
    return () => {
      this.themeListeners.delete(listener);
    };
  }

  setTheme(theme: SoundThemeId) {
    this.theme = theme;
    try {
      window.localStorage.setItem(SOUND_KEY, theme);
    } catch {
      // The control still works when storage is unavailable.
    }
    if (this.master && this.ctx) {
      const level = theme === "off" ? 0 : soundThemeConfig(theme).master;
      this.master.gain.setTargetAtTime(level, this.ctx.currentTime, 0.025);
    }
    for (const listener of this.themeListeners) listener(theme);
  }

  preview() {
    if (this.theme === "off") return;
    this.last.press = 0;
    this.last.zoom = 0;
    this.press("glass");
    window.setTimeout(() => this.zoom(-5), 65);
  }

  unlock() {
    trackPointer();
    if (!this.wired) {
      this.wired = true;
      onImpulse((impulse) => this.play(impulse));
    }
    const ctx = this.ensure();
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume();
  }

  contact(material: Material = "paper") {
    if (this.theme === "off") return;
    if (!this.gate("contact", 100)) return;
    this.impact({ mass: 0.2, velocity: 0.32, material, pitch: 3.2 });
  }

  press(material: Material = "wood") {
    if (this.theme === "off") return;
    if (!this.gate("press", 40)) return;
    this.impact({ mass: 0.48, velocity: 0.78, material, pitch: 1.75 });
  }

  friction(speed: number) {
    if (this.theme === "off") return;
    const ctx = this.ensure();
    if (!ctx) return;
    if (!this.frictionGain || !this.frictionFilter) this.makeFriction(ctx);
    const theme = soundThemeConfig(this.theme);
    const spec = theme.friction;
    const t = ctx.currentTime;
    const energy = Math.max(
      0,
      Math.min(1, (speed - spec.threshold) / Math.max(1, 18 - spec.threshold)),
    );
    const amp = spec.gain * energy * theme.noise;
    this.frictionGain!.gain.setTargetAtTime(amp, t, 0.05);
    this.frictionFilter!.Q.setTargetAtTime(spec.q, t, 0.04);
    this.frictionFilter!.frequency.setTargetAtTime(
      spec.base + Math.min(speed, 40) * spec.speedScale,
      t,
      0.06,
    );
  }

  zoom(delta: number) {
    if (this.theme === "off") return;
    if (!this.gate("zoom", 70)) return;
    const ctx = this.ensure();
    if (!ctx) return;
    this.unlock();
    const theme = soundThemeConfig(this.theme);
    const spec = theme.zoom;
    const t = ctx.currentTime;
    const inbound = delta < 0;
    const energy = Math.min(1, Math.abs(delta) / 18);
    if (
      !this.zoomGain ||
      !this.zoomFilter ||
      !this.zoomTone ||
      !this.zoomToneGain
    ) {
      this.makeZoom(ctx);
    }
    const noiseGain = this.zoomGain!;
    const toneGain = this.zoomToneGain!;
    const filter = this.zoomFilter!;
    const tone = this.zoomTone!;
    const [from, to] = inbound ? spec.inbound : spec.outbound;
    const amp = spec.gain * (0.35 + energy * 0.65);

    noiseGain.gain.cancelScheduledValues(t);
    noiseGain.gain.setValueAtTime(
      Math.max(0.0001, noiseGain.gain.value, amp * spec.noiseMix * theme.noise),
      t,
    );
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + spec.duration);
    toneGain.gain.cancelScheduledValues(t);
    toneGain.gain.setValueAtTime(
      Math.max(0.0001, toneGain.gain.value, amp * spec.toneMix),
      t,
    );
    toneGain.gain.exponentialRampToValueAtTime(0.0001, t + spec.duration);

    filter.Q.setValueAtTime(spec.q, t);
    filter.frequency.cancelScheduledValues(t);
    filter.frequency.setValueAtTime(from, t);
    filter.frequency.exponentialRampToValueAtTime(to, t + spec.duration);
    tone.type = spec.wave;
    tone.frequency.cancelScheduledValues(t);
    tone.frequency.setValueAtTime(Math.max(20, from * spec.toneRatio), t);
    tone.frequency.exponentialRampToValueAtTime(
      Math.max(20, to * spec.toneRatio),
      t + spec.duration,
    );

    if (theme.chord && this.gate("zoom-chord", 240)) {
      this.playChord(
        ctx,
        t,
        theme.root * theme.pitch,
        0.35 + energy * 0.45,
        spec.duration,
        to / from,
      );
    }
  }

  private play(impulse: Impulse) {
    if (this.theme === "off") return;
    const energy = Math.min(1.6, impulse.v * Math.max(0.15, impulse.d));
    if (!impulse.transmit) {
      this.impact({
        mass: 0.9,
        velocity: 0.35 + impulse.v * 0.15,
        material: impulse.material,
        pitch: 0.75,
      });
      return;
    }
    if (impulse.d >= 0.45) {
      this.whoosh({ inbound: impulse.inbound, energy: 0.35 + energy * 0.4 });
    }
    this.impact({
      mass: 0.35 + energy * 0.4,
      velocity: 0.4 + energy * 0.3,
      material: impulse.material,
      pitch: impulse.inbound ? 2.1 : 1.2,
    });
    const n = Math.min(8, impulse.enter);
    for (let i = 0; i < n; i++) {
      const delay = i * (14 + 160 / Math.max(6, impulse.enter));
      window.setTimeout(() => {
        this.impact({
          mass: 0.16 + i * 0.02,
          velocity: 0.28,
          material: impulse.material,
          pitch: 2.5 + i * 0.1,
        });
      }, delay);
    }
  }

  private impact({
    mass,
    velocity,
    material,
    pitch,
  }: {
    mass: number;
    velocity: number;
    material: Material;
    pitch: number;
  }) {
    const ctx = this.ensure();
    if (!ctx) return;
    this.unlock();
    const theme = soundThemeConfig(this.theme);
    const t = ctx.currentTime;
    const spec = MATERIAL[material];
    const kinetic = velocity * velocity;
    const f0 = theme.root * theme.pitch * pitch * (0.85 / Math.max(0.18, mass));
    const amp = 0.16 * kinetic * Math.sqrt(mass) * theme.impact.gain;
    const decay = spec.decay * theme.decay * (0.75 + mass * 0.55);

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuf(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = f0 * theme.impact.noiseRatio;
    bp.Q.value = (material === "paper" ? 0.7 : 2.4) * theme.impact.q;
    const ng = ctx.createGain();
    const noiseDecay = 0.045 + decay * 0.28;
    ng.gain.setValueAtTime(amp * spec.noise * theme.noise, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + noiseDecay);
    noise.connect(bp);
    bp.connect(ng);
    ng.connect(this.master!);
    noise.start(t);
    noise.stop(t + Math.max(0.08, noiseDecay + 0.02));

    spec.modes.forEach((mode, index) => {
      const osc = ctx.createOscillator();
      osc.type = index === 0 ? theme.impact.fundamental : theme.impact.overtone;
      osc.frequency.value = f0 * mode;
      const g = ctx.createGain();
      const peak = amp * (index === 0 ? 1 : 0.28 / mode);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + theme.impact.attack);
      g.gain.exponentialRampToValueAtTime(
        0.0001,
        t + decay * (1 + index * 0.2),
      );
      osc.connect(g);
      g.connect(this.master!);
      osc.start(t);
      osc.stop(t + decay + 0.08);
    });
    if (theme.chord && mass >= 0.35) {
      this.playChord(ctx, t, f0 * 0.5, kinetic, decay, 1);
    }
  }

  private whoosh({ inbound, energy }: { inbound: boolean; energy: number }) {
    const ctx = this.ensure();
    if (!ctx) return;
    this.unlock();
    const theme = soundThemeConfig(this.theme);
    const spec = theme.whoosh;
    const [from, to] = inbound ? spec.inbound : spec.outbound;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf(ctx);
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = spec.q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(spec.gain * energy * theme.noise, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + spec.duration);
    filter.frequency.setValueAtTime(from, t);
    filter.frequency.exponentialRampToValueAtTime(to, t + spec.duration * 0.86);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master!);
    src.start(t);
    src.stop(t + spec.duration + 0.03);
    if (theme.chord) {
      this.playChord(
        ctx,
        t,
        theme.root * theme.pitch,
        energy,
        spec.duration,
        to / from,
      );
    }
  }

  private playChord(
    ctx: AudioContext,
    t: number,
    base: number,
    energy: number,
    duration: number,
    endRatio: number,
  ) {
    const chord = soundThemeConfig(this.theme).chord;
    if (!chord) return;
    const release = Math.max(duration, chord.decay);
    chord.ratios.forEach((ratio, index) => {
      const osc = ctx.createOscillator();
      osc.type = chord.wave;
      osc.frequency.setValueAtTime(Math.max(20, base * ratio), t);
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(20, base * ratio * endRatio),
        t + release,
      );
      const gain = ctx.createGain();
      const peak = (chord.gain * Math.min(1, energy)) / (1 + index * 0.38);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(
        Math.max(0.0001, peak),
        t + chord.attack,
      );
      gain.gain.exponentialRampToValueAtTime(0.0001, t + release);
      osc.connect(gain);
      gain.connect(this.master!);
      osc.start(t);
      osc.stop(t + release + 0.04);
    });
  }

  private makeFriction(ctx: AudioContext) {
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf(ctx);
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = soundThemeConfig(this.theme).friction.q;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master!);
    src.start();
    this.frictionGain = g;
    this.frictionFilter = filter;
  }

  private makeZoom(ctx: AudioContext) {
    const theme = soundThemeConfig(this.theme);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf(ctx);
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = theme.zoom.q;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0;
    src.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.master!);
    src.start();

    const tone = ctx.createOscillator();
    tone.type = theme.zoom.wave;
    tone.frequency.value = theme.root * theme.zoom.toneRatio;
    const toneGain = ctx.createGain();
    toneGain.gain.value = 0;
    tone.connect(toneGain);
    toneGain.connect(this.master!);
    tone.start();

    this.zoomGain = noiseGain;
    this.zoomFilter = filter;
    this.zoomTone = tone;
    this.zoomToneGain = toneGain;
  }
}

export const sfx = new PhysicsSfx();
