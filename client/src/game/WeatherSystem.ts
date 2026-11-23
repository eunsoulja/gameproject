import { MARKET_EVENTS, type ActiveEventState, type EventVisual } from '../../../shared/config';
import type { PlayerProfile } from '../../../shared/types';

/**
 * DOM-side weather. The 3D sky/lighting lives in Environment; this adds the
 * rain sheet, storm tint and lightning flashes over the scene.
 */
export class WeatherSystem {
  private overlay: HTMLElement | null;
  private flash: HTMLElement | null;
  private condition: PlayerProfile['weather']['condition'] = 'clear';
  private visual: EventVisual = 'none';
  private event: ActiveEventState | null = null;
  private lightningTimer = 4;
  private flashTimeout = 0;
  private enabled = true;
  onLightning: (() => void) | null = null;

  constructor() {
    this.overlay = document.getElementById('weather-overlay');
    this.flash = document.getElementById('flash-overlay');
  }

  set(condition: PlayerProfile['weather']['condition'], event: ActiveEventState | null): void {
    this.condition = condition;
    this.event = event;
    this.visual = event ? MARKET_EVENTS[event.type]?.visual ?? 'none' : 'none';
    this.apply();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.apply();
  }

  private apply(): void {
    const overlay = this.overlay;
    if (!overlay) return;
    const rainy = this.enabled && (this.condition === 'rain' || this.visual === 'rain');
    const storm = this.enabled && this.visual === 'flood';
    overlay.classList.toggle('rainy', rainy && !storm);
    overlay.classList.toggle('typhoon', storm);
    if (!this.enabled) {
      overlay.classList.remove('rainy', 'typhoon');
    }
  }

  get isRainy(): boolean {
    return this.condition === 'rain' || this.visual === 'rain' || this.visual === 'flood';
  }

  get isStorm(): boolean {
    return this.visual === 'flood';
  }

  get isBlackout(): boolean {
    return this.visual === 'outage';
  }

  get crowdEvent(): boolean {
    return this.visual === 'crowd';
  }

  update(dt: number): void {
    if (!this.enabled) return;
    if (this.flashTimeout > 0) {
      this.flashTimeout -= dt;
      if (this.flashTimeout <= 0) this.flash?.classList.remove('flash');
    }
    if (!this.isRainy) return;
    this.lightningTimer -= dt;
    if (this.lightningTimer <= 0) {
      this.lightningTimer = this.isStorm ? 4 + Math.random() * 8 : 9 + Math.random() * 16;
      this.triggerLightning();
    }
  }

  private triggerLightning(): void {
    if (!this.flash) return;
    this.flash.classList.remove('flash');
    void this.flash.offsetWidth;
    this.flash.classList.add('flash');
    this.flashTimeout = 0.9;
    this.onLightning?.();
  }

  get activeEvent(): ActiveEventState | null {
    return this.event;
  }
}
