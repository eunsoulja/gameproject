import * as THREE from 'three';
import { peso } from '../ui/format';

/**
 * Lightweight world-anchored popup text ("+₱120") rendered as DOM nodes.
 * Each popup is projected once at spawn and animated with CSS, so the cost
 * stays flat no matter how many sales happen.
 */
export class FloatingText {
  private root: HTMLElement;
  private camera: THREE.Camera;
  private pool: HTMLElement[] = [];

  constructor(root: HTMLElement, camera: THREE.Camera) {
    this.root = root;
    this.camera = camera;
  }

  /** Spawn a popup at a world position. `kind` picks the colour scheme. */
  spawn(worldPosition: THREE.Vector3, text: string, kind: 'gain' | 'loss' | 'info' = 'gain'): void {
    const el = this.pool.pop() ?? document.createElement('div');
    el.className = `float-text ${kind}`;
    el.textContent = text;
    el.style.display = '';
    this.positionAt(el, worldPosition);
    this.root.appendChild(el);
    el.classList.add('show');
    window.setTimeout(() => {
      el.classList.remove('show');
      window.setTimeout(() => {
        el.remove();
        if (this.pool.length < 24) {
          el.className = 'float-text';
          this.pool.push(el);
        }
      }, 450);
    }, 1500);
  }

  cash(amount: number, at: THREE.Vector3): void {
    if (amount > 0) this.spawn(at, `+${peso(amount)}`, 'gain');
    else if (amount < 0) this.spawn(at, `−${peso(Math.abs(amount))}`, 'loss');
  }

  private positionAt(el: HTMLElement, world: THREE.Vector3): void {
    const projected = world.clone().project(this.camera);
    if (projected.z > 1) {
      el.style.display = 'none';
      return;
    }
    const x = (projected.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-projected.y * 0.5 + 0.5) * window.innerHeight;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }

  clear(): void {
    this.root.innerHTML = '';
    this.pool = [];
  }
}
