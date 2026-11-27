export type QualitySetting = 'low' | 'medium' | 'high';

export interface GameSettings {
  masterVolume: number;
  ambienceVolume: number;
  effectsVolume: number;
  sensitivity: number;
  touchSensitivity: number;
  quality: QualitySetting;
  showNames: boolean;
  reduceMotion: boolean;
  weatherEffects: boolean;
  invertDrag: boolean;
  cameraShake: boolean;
  showFps: boolean;
  awningColor: string;
  colorblindSafe: boolean;
}

const STORAGE_KEY = 'merkado.settings.v1';

const DEFAULTS: GameSettings = {
  masterVolume: 0.8,
  ambienceVolume: 0.55,
  effectsVolume: 0.75,
  sensitivity: 1,
  touchSensitivity: 1,
  quality: 'high',
  showNames: true,
  reduceMotion: false,
  weatherEffects: true,
  invertDrag: false,
  cameraShake: true,
  showFps: false,
  awningColor: '',
  colorblindSafe: false,
};

/** Small persisted settings store shared by the renderer, audio and camera. */
export class SettingsManager {
  private value: GameSettings;
  private listeners = new Set<(settings: GameSettings) => void>();

  constructor() {
    this.value = this.load();
  }

  get current(): GameSettings {
    return this.value;
  }

  set<K extends keyof GameSettings>(key: K, value: GameSettings[K]): void {
    if (this.value[key] === value) return;
    this.value = { ...this.value, [key]: value };
    this.persist();
    for (const listener of this.listeners) listener(this.value);
  }

  patch(patch: Partial<GameSettings>): void {
    let changed = false;
    for (const key of Object.keys(patch) as Array<keyof GameSettings>) {
      if (this.value[key] !== patch[key]) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    this.value = { ...this.value, ...patch };
    this.persist();
    for (const listener of this.listeners) listener(this.value);
  }

  onChange(listener: (settings: GameSettings) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private load(): GameSettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULTS };
      const parsed = JSON.parse(raw) as Partial<GameSettings>;
      const quality: QualitySetting =
        parsed.quality === 'low' || parsed.quality === 'medium' || parsed.quality === 'high'
          ? parsed.quality
          : DEFAULTS.quality;
      return {
        masterVolume: clamp01(parsed.masterVolume, DEFAULTS.masterVolume),
        ambienceVolume: clamp01(parsed.ambienceVolume, DEFAULTS.ambienceVolume),
        effectsVolume: clamp01(parsed.effectsVolume, DEFAULTS.effectsVolume),
        sensitivity: clampRange(parsed.sensitivity, 0.35, 2.2, DEFAULTS.sensitivity),
        touchSensitivity: clampRange(parsed.touchSensitivity, 0.5, 2, DEFAULTS.touchSensitivity),
        quality,
        showNames: typeof parsed.showNames === 'boolean' ? parsed.showNames : DEFAULTS.showNames,
        reduceMotion: typeof parsed.reduceMotion === 'boolean' ? parsed.reduceMotion : DEFAULTS.reduceMotion,
        weatherEffects:
          typeof parsed.weatherEffects === 'boolean' ? parsed.weatherEffects : DEFAULTS.weatherEffects,
        invertDrag: typeof parsed.invertDrag === 'boolean' ? parsed.invertDrag : DEFAULTS.invertDrag,
        cameraShake: typeof parsed.cameraShake === 'boolean' ? parsed.cameraShake : DEFAULTS.cameraShake,
        showFps: typeof parsed.showFps === 'boolean' ? parsed.showFps : DEFAULTS.showFps,
        awningColor: typeof parsed.awningColor === 'string' ? parsed.awningColor : DEFAULTS.awningColor,
        colorblindSafe: typeof parsed.colorblindSafe === 'boolean' ? parsed.colorblindSafe : DEFAULTS.colorblindSafe,
      };
    } catch {
      return { ...DEFAULTS };
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.value));
    } catch {
      /* Storage can be unavailable in private mode — keep the live settings. */
    }
  }
}

function clamp01(value: unknown, fallback: number): number {
  return clampRange(value, 0, 1, fallback);
}

function clampRange(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}
