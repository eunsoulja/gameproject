import * as THREE from 'three';
import type { HUD } from '../ui/HUD';

export interface Interactable {
  id: string;
  position: THREE.Vector3;
  radius: number;
  title: string;
  subtitle?: string;
  price?: string;
  action: () => void;
  enabled?: () => boolean;
  priority?: number;
}

/**
 * Chooses the nearest usable counter/pad and drives the single HUD prompt.
 */
export class InteractionSystem {
  private hud: HUD;
  private items: Interactable[] = [];
  private current: Interactable | null = null;
  private active = true;

  constructor(hud: HUD) {
    this.hud = hud;
  }

  setItems(items: Interactable[]): void {
    this.items = items;
    if (this.current && !items.includes(this.current)) {
      this.current = null;
      this.hud.hidePrompt();
    }
  }

  setActive(active: boolean): void {
    this.active = active;
    if (!active) this.hud.hidePrompt();
  }

  update(playerPosition: THREE.Vector3): Interactable | null {
    if (!this.active || this.items.length === 0) {
      if (this.current) {
        this.current = null;
        this.hud.hidePrompt();
      }
      return null;
    }

    let best: Interactable | null = null;
    let bestScore = Infinity;
    for (const item of this.items) {
      if (item.enabled && !item.enabled()) continue;
      const dx = playerPosition.x - item.position.x;
      const dz = playerPosition.z - item.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance > item.radius) continue;
      const score = distance / item.radius - (item.priority ?? 0) * 0.25;
      if (score < bestScore) {
        bestScore = score;
        best = item;
      }
    }

    if (best !== this.current) {
      this.current = best;
      if (best) {
        this.hud.showPrompt({
          key: 'E',
          title: best.title,
          subtitle: best.subtitle,
          price: best.price,
        });
      } else {
        this.hud.hidePrompt();
      }
    } else if (best) {
      // Keep changing prices / tier labels fresh.
      this.hud.showPrompt({
        key: 'E',
        title: best.title,
        subtitle: best.subtitle,
        price: best.price,
      });
    }
    return best;
  }

  trigger(): boolean {
    if (!this.active || !this.current) return false;
    const item = this.current;
    if (item.enabled && !item.enabled()) return false;
    item.action();
    return true;
  }

  get currentItem(): Interactable | null {
    return this.current;
  }

  clear(): void {
    this.items = [];
    this.current = null;
    this.hud.hidePrompt();
  }
}
