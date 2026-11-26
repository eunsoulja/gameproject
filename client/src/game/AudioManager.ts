type AudioContextClass = typeof AudioContext;

function getAudioContextClass(): AudioContextClass | null {
  const w = window as unknown as { AudioContext?: AudioContextClass; webkitAudioContext?: AudioContextClass };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** Procedural night-market ambience and UI sounds — no external audio assets. */
export class AudioManager {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambienceBus: GainNode | null = null;
  private effectsBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private crowdGain: GainNode | null = null;
  private rainGain: GainNode | null = null;
  private rumbleGain: GainNode | null = null;
  private started = false;
  private crowdTarget = 0.5;
  private rainTarget = 0;
  private lastStep = 0;
  private chirpTimer = 2.5;
  private settings = { master: 0.8, ambience: 0.55, effects: 0.75 };

  get ready(): boolean {
    return this.started && !!this.context;
  }

  async start(): Promise<void> {
    if (!this.context) {
      const Ctor = getAudioContextClass();
      if (!Ctor) return;
      const context = new Ctor();
      this.context = context;
      this.master = context.createGain();
      this.master.gain.value = 0;
      this.master.connect(context.destination);
      this.ambienceBus = context.createGain();
      this.ambienceBus.gain.value = 0.55;
      this.ambienceBus.connect(this.master);
      this.effectsBus = context.createGain();
      this.effectsBus.gain.value = 0.75;
      this.effectsBus.connect(this.master);
      this.noise = this.createNoise(context, 2.5);
      this.buildAmbience(context);
      this.applyVolumes();
      this.started = true;
    }
    if (this.context.state === 'suspended') {
      try {
        await this.context.resume();
      } catch {
        /* Browsers can still refuse until the next gesture. */
      }
    }
  }

  private createNoise(context: AudioContext, seconds: number): AudioBuffer {
    const length = Math.floor(context.sampleRate * seconds);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      last = last * 0.94 + white * 0.06;
      data[i] = last * 3.2;
    }
    return buffer;
  }

  private buildAmbience(context: AudioContext): void {
    if (!this.noise || !this.ambienceBus) return;
    const crowdSource = context.createBufferSource();
    crowdSource.buffer = this.noise;
    crowdSource.loop = true;
    const crowdFilter = context.createBiquadFilter();
    crowdFilter.type = 'bandpass';
    crowdFilter.frequency.value = 380;
    crowdFilter.Q.value = 0.6;
    this.crowdGain = context.createGain();
    this.crowdGain.gain.value = 0.035;
    crowdSource.connect(crowdFilter).connect(this.crowdGain).connect(this.ambienceBus);
    crowdSource.start();

    const rumbleSource = context.createBufferSource();
    rumbleSource.buffer = this.noise;
    rumbleSource.loop = true;
    const rumbleFilter = context.createBiquadFilter();
    rumbleFilter.type = 'lowpass';
    rumbleFilter.frequency.value = 130;
    this.rumbleGain = context.createGain();
    this.rumbleGain.gain.value = 0.05;
    rumbleSource.connect(rumbleFilter).connect(this.rumbleGain).connect(this.ambienceBus);
    rumbleSource.start();

    const rainSource = context.createBufferSource();
    rainSource.buffer = this.noise;
    rainSource.loop = true;
    const rainFilter = context.createBiquadFilter();
    rainFilter.type = 'highpass';
    rainFilter.frequency.value = 1600;
    this.rainGain = context.createGain();
    this.rainGain.gain.value = 0;
    rainSource.connect(rainFilter).connect(this.rainGain).connect(this.ambienceBus);
    rainSource.start();
  }

  setVolumes(master: number, ambience: number, effects: number): void {
    this.settings = { master, ambience, effects };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.context || !this.master || !this.ambienceBus || !this.effectsBus) return;
    const now = this.context.currentTime;
    this.master.gain.setTargetAtTime(this.settings.master * 0.55, now, 0.12);
    this.ambienceBus.gain.setTargetAtTime(this.settings.ambience, now, 0.12);
    this.effectsBus.gain.setTargetAtTime(this.settings.effects, now, 0.12);
  }

  setEnvironment(crowd: number, rain: number, night: boolean, reduceMotion = false): void {
    this.crowdTarget = crowd;
    this.rainTarget = rain;
    if (!this.context) return;
    const now = this.context.currentTime;
    this.crowdGain?.gain.setTargetAtTime(0.018 + crowd * 0.04, now, 0.8);
    this.rainGain?.gain.setTargetAtTime(0.01 + rain * 0.09, now, 1.2);
    this.rumbleGain?.gain.setTargetAtTime(night ? 0.055 : 0.035, now, 1.5);
    if (reduceMotion) this.rainGain?.gain.setTargetAtTime(rain * 0.04, now, 0.8);
  }

  /** Sparse crickets and distant tricycle bells for night atmosphere. */
  update(dt: number, progress: number, raining: boolean): void {
    if (!this.context || !this.started) return;
    const night = progress > 0.72;
    if (!night || raining) return;
    this.chirpTimer -= dt;
    if (this.chirpTimer > 0) return;
    this.chirpTimer = 3.2 + Math.random() * 5.5;
    const now = this.context.currentTime;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = 'sine';
    const base = 3800 + Math.random() * 1200;
    osc.frequency.setValueAtTime(base, now);
    osc.frequency.exponentialRampToValueAtTime(base * 1.22, now + 0.05);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.008 + Math.random() * 0.006, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    osc.connect(gain).connect(this.ambienceBus!);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  footstep(running = false): void {
    if (!this.context || !this.started) return;
    const now = this.context.currentTime;
    if (now - this.lastStep < (running ? 0.12 : 0.2)) return;
    this.lastStep = now;
    const jitter = 0.85 + Math.random() * 0.3;
    this.noiseBurst(
      now,
      (running ? 0.075 : 0.055) * jitter,
      (running ? 900 : 620) * (0.9 + Math.random() * 0.25),
      (running ? 0.1 : 0.065) * (0.8 + Math.random() * 0.4),
      0,
    );
  }

  click(): void {
    if (!this.context || !this.started) return;
    const now = this.context.currentTime;
    this.tone(now, 520 + Math.random() * 70, 0.045, 0.035, 'triangle');
  }

  cash(): void {
    if (!this.context || !this.started) return;
    const now = this.context.currentTime;
    this.tone(now, 1180, 0.07, 0.06, 'sine');
    this.tone(now + 0.06, 1560, 0.09, 0.05, 'sine');
    this.noiseBurst(now, 0.04, 3200, 0.03, 1);
  }

  upgrade(): void {
    if (!this.context || !this.started) return;
    const now = this.context.currentTime;
    [523, 659, 784, 1047].forEach((freq, i) => {
      this.tone(now + i * 0.075, freq, 0.12, 0.055, 'triangle');
    });
  }

  notify(kind = 'info'): void {
    if (!this.context || !this.started) return;
    const now = this.context.currentTime;
    if (kind === 'danger' || kind === 'warning') {
      this.tone(now, 220, 0.12, 0.05, 'sawtooth');
      this.tone(now + 0.13, 176, 0.18, 0.045, 'sawtooth');
      return;
    }
    if (kind === 'event') {
      this.tone(now, 392, 0.1, 0.04, 'triangle');
      this.tone(now + 0.1, 523, 0.1, 0.04, 'triangle');
      this.tone(now + 0.2, 659, 0.2, 0.04, 'triangle');
      return;
    }
    this.tone(now, 880, 0.08, 0.05, 'sine');
    this.tone(now + 0.08, 1174, 0.14, 0.04, 'sine');
  }

  error(): void {
    if (!this.context || !this.started) return;
    const now = this.context.currentTime;
    this.tone(now, 180, 0.1, 0.055, 'square');
    this.tone(now + 0.09, 130, 0.18, 0.05, 'square');
  }

  thunder(strong = false): void {
    if (!this.context || !this.started) return;
    const now = this.context.currentTime;
    this.noiseBurst(now, strong ? 1.4 : 0.75, strong ? 280 : 420, strong ? 0.22 : 0.1, 2);
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(strong ? 52 : 68, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + (strong ? 1.2 : 0.6));
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(strong ? 0.14 : 0.06, now + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (strong ? 1.4 : 0.7));
    osc.connect(gain).connect(this.effectsBus!);
    osc.start(now);
    osc.stop(now + (strong ? 1.5 : 0.8));
  }

  private tone(time: number, frequency: number, duration: number, volume: number, type: OscillatorType): void {
    if (!this.context || !this.effectsBus) return;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, time);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), time + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    osc.connect(gain).connect(this.effectsBus);
    osc.start(time);
    osc.stop(time + duration + 0.02);
  }

  private noiseBurst(time: number, duration: number, filterFreq: number, volume: number, filterType: number): void {
    if (!this.context || !this.noise || !this.effectsBus) return;
    const source = this.context.createBufferSource();
    source.buffer = this.noise;
    const filter = this.context.createBiquadFilter();
    filter.type = filterType === 1 ? 'highpass' : filterType === 2 ? 'lowpass' : 'bandpass';
    filter.frequency.value = filterFreq;
    filter.Q.value = filterType === 2 ? 0.5 : 1;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(filter).connect(gain).connect(this.effectsBus);
    source.start(time);
    source.stop(time + duration + 0.02);
  }

  dispose(): void {
    this.started = false;
    void this.context?.close();
    this.context = null;
  }
}
