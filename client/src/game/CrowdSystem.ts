import * as THREE from 'three';
import { PLOT_SLOTS, WORLD } from '../../../shared/layout';
import type { EventVisual } from '../../../shared/config';
import type { QualitySetting } from '../systems/Settings';
import { CrowdAvatar } from './CrowdAvatar';
import { clamp, makeRng, pick, range, type Random } from './utils';

interface Customer {
  avatar: CrowdAvatar;
  x: number;
  z: number;
  targetX: number;
  targetZ: number;
  speed: number;
  state: 'walk' | 'browse' | 'scan';
  timer: number;
  faceYaw: number;
  active: boolean;
  bob: number;
  hasUmbrella: boolean;
  role: 'walker' | 'sleeper' | 'linger';
}

const SHIRTS = ['#d9534a', '#3f8ccc', '#f0b64c', '#63a56c', '#9a66c4', '#ef8a52', '#ede3cc', '#3d4a5e', '#c56c93', '#5fb3a8'];
const PANTS = ['#283449', '#1a1f2a', '#414f63', '#665d4d', '#53313a', '#2f433c'];
const SKINS = ['#f2d2b4', '#e4b58d', '#c99767', '#a66e45', '#7d4f2f'];
const HAIRS = ['#191210', '#2e1f18', '#53331e', '#7f4b28', '#c79a55', '#24222c'];

/** Ambient shoppers and browsers that make Colon feel alive. */
export class CrowdSystem {
  private scene: THREE.Scene;
  private rng: Random = makeRng(77123);
  private customers: Customer[] = [];
  private maxCount = 44;
  private targetCount = 26;
  private quality: QualitySetting = 'high';
  private ownX = 0;
  private ownZ = 0;
  private ownInward = 1;
  private ownConfigured = false;
  private eventVisual: EventVisual = 'none';
  private rainy = false;
  private progress = START_PROGRESS;
  private built = false;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  build(): void {
    if (this.built) return;
    this.built = true;
    for (let i = 0; i < this.maxCount; i++) {
      this.customers.push(this.createCustomer(i));
    }
    this.applyDensity();
  }

  setOwnStall(plotIndex: number): void {
    const slot = PLOT_SLOTS[plotIndex];
    if (!slot) return;
    this.ownX = slot.x;
    this.ownZ = slot.z;
    this.ownInward = slot.side === 'west' ? 1 : -1;
    this.ownConfigured = true;
  }

  setQuality(quality: QualitySetting): void {
    this.quality = quality;
    this.applyDensity();
  }

  /** Reveal hand umbrellas on roughly two-fifths of the crowd when it rains. */
  setRainy(on: boolean): void {
    if (this.rainy === on) return;
    this.rainy = on;
    for (const customer of this.customers) {
      customer.avatar.setUmbrella(on && customer.hasUmbrella);
    }
  }

  /** 0 = dry, ~0.5 = rain, 1 = typhoon — drives hunch, shuffle and umbrella tilt. */
  setStorm(level: number): void {
    for (const customer of this.customers) customer.avatar.setStorm(level);
  }

  setAtmosphere(progress: number, eventVisual: EventVisual, quality: QualitySetting): void {
    this.progress = progress;
    this.eventVisual = eventVisual;
    this.quality = quality;
    this.applyDensity();
  }

  private applyDensity(): void {
    let target = 24;
    if (this.progress >= 0.47 && this.progress < 0.82) target = 34;
    else if (this.progress >= 0.82) target = 27;
    else target = 18;
    if (this.eventVisual === 'crowd') target = 44;
    if (this.eventVisual === 'rain') target = Math.round(target * 0.62);
    if (this.eventVisual === 'flood') target = Math.round(target * 0.4);
    if (this.quality === 'low') target = Math.round(target * 0.55);
    else if (this.quality === 'medium') target = Math.round(target * 0.78);
    this.targetCount = clamp(target, 8, this.maxCount);
  }

  private createCustomer(index: number): Customer {
    const appearance = {
      shirt: pick(this.rng, SHIRTS),
      pants: pick(this.rng, PANTS),
      skin: pick(this.rng, SKINS),
      hair: pick(this.rng, HAIRS),
    };
    const avatar = new CrowdAvatar(appearance, range(this.rng, 0.88, 1.03));
    avatar.root.visible = false;
    this.scene.add(avatar.root);
    const x = range(this.rng, -7.5, 7.5);
    const z = range(this.rng, WORLD.playableMinZ + 6, WORLD.playableMaxZ - 6);
    avatar.root.position.set(x, 0, z);
    return {
      avatar,
      x,
      z,
      targetX: x,
      targetZ: z,
      speed: 0,
      state: 'scan',
      timer: range(this.rng, 0, 2),
      faceYaw: 0,
      active: false,
      bob: index * 0.13,
      hasUmbrella: index % 5 < 2,
      role: index % 9 === 0 ? 'sleeper' : index % 7 === 0 ? 'linger' : 'walker',
    };
  }

  update(dt: number, elapsed: number): void {
    if (!this.built) return;
    this.applyDensity();
    let active = 0;
    for (let i = 0; i < this.customers.length; i++) {
      const customer = this.customers[i];
      const shouldBeActive = i < this.targetCount;
      if (shouldBeActive && !customer.active) {
        this.activate(customer);
        customer.active = true;
      } else if (!shouldBeActive && customer.active) {
        customer.active = false;
        customer.avatar.root.visible = false;
        continue;
      }
      if (!customer.active) continue;
      active++;
      this.updateCustomer(customer, dt, elapsed);
    }
    if (active === 0) this.targetCount = Math.max(6, this.targetCount);
  }

  private activate(customer: Customer): void {
    const x = range(this.rng, -7.6, 7.6);
    const z = range(this.rng, WORLD.playableMinZ + 8, WORLD.playableMaxZ - 8);
    customer.x = x;
    customer.z = z;
    customer.avatar.root.position.set(x, 0, z);
    customer.avatar.root.visible = true;
    customer.state = 'scan';
    customer.timer = range(this.rng, 0.2, 2.5);
    customer.speed = 0;
  }

  private updateCustomer(customer: Customer, dt: number, elapsed: number): void {
    // Sleepers doze on the walkway — they mostly stand still, shifting weight.
    if (customer.role === 'sleeper') {
      customer.timer -= dt;
      customer.speed += (0 - customer.speed) * Math.min(1, dt * 3);
      if (customer.timer <= 0) {
        customer.timer = range(this.rng, 14, 30);
        customer.x += range(this.rng, -0.5, 0.5);
        customer.z += range(this.rng, -0.5, 0.5);
        customer.faceYaw = range(this.rng, -0.6, 0.6) + (customer.x < 0 ? Math.PI / 2 : -Math.PI / 2);
      }
      customer.avatar.root.position.set(customer.x, 0, customer.z);
      customer.avatar.setLean(0.05);
      customer.avatar.root.rotation.y += (customer.faceYaw - customer.avatar.root.rotation.y) * Math.min(1, dt * 2);
      customer.avatar.update(dt, elapsed + customer.bob, 0.001);
      return;
    }
    customer.timer -= dt;
    if (customer.state === 'scan') {
      if (customer.timer <= 0) {
        this.chooseTarget(customer);
        customer.state = 'walk';
      }
      customer.speed += (0 - customer.speed) * Math.min(1, dt * 5);
    } else if (customer.state === 'walk') {
      const dx = customer.targetX - customer.x;
      const dz = customer.targetZ - customer.z;
      const distance = Math.hypot(dx, dz);
      const targetSpeed = customer.speed > 0.1 ? customer.speed : range(this.rng, 1.15, 1.75);
      if (distance < 0.42) {
        customer.state = 'browse';
        customer.timer =
          range(this.rng, 1.8, 5.6) *
          (this.eventVisual === 'crowd' ? 1.35 : 1) *
          (customer.role === 'linger' ? 2.4 : 1);
        if (this.eventVisual === 'crowd') customer.timer += 1.2;
        customer.faceYaw = this.browseYaw(customer);
      } else {
        const nx = dx / distance;
        const nz = dz / distance;
        const step = Math.min(distance, targetSpeed * dt);
        customer.x += nx * step;
        customer.z += nz * step;
        customer.speed += (targetSpeed - customer.speed) * Math.min(1, dt * 4);
        customer.faceYaw = Math.atan2(nx, nz);
      }
    } else {
      customer.speed += (0 - customer.speed) * Math.min(1, dt * 7);
      if (customer.timer <= 0) {
        this.chooseTarget(customer);
        customer.state = 'walk';
      }
    }

    customer.avatar.root.position.set(customer.x, 0, customer.z);
    // Browsers lean in toward the stall — a tiny posture cue that sells the stall visit.
    customer.avatar.setLean(customer.state === 'browse' ? 0.12 : 0);
    const current = customer.avatar.root.rotation.y;
    let delta = customer.faceYaw - current;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    customer.avatar.root.rotation.y = current + delta * Math.min(1, dt * 7);
    customer.avatar.update(dt, elapsed + customer.bob, customer.state === 'walk' ? customer.speed : 0.001);
  }

  private browseYaw(customer: Customer): number {
    // Face the nearest side of the street (where the stalls are).
    const side = customer.x < -3 ? -1 : customer.x > 3 ? 1 : this.rng() > 0.5 ? 1 : -1;
    return side > 0 ? -Math.PI / 2 : Math.PI / 2;
  }

  private chooseTarget(customer: Customer): void {
    const roll = this.rng();
    if (this.ownConfigured && roll < 0.38) {
      // Walk up to the player's counter.
      customer.targetX = this.ownX + this.ownInward * range(this.rng, 1.0, 2.0);
      customer.targetZ = this.ownZ + range(this.rng, -2.2, 2.2);
      return;
    }
    if (roll < 0.74) {
      // Browse one of the long rows of NPC stalls.
      const side = this.rng() > 0.5 ? 1 : -1;
      let z = range(this.rng, WORLD.playableMinZ + 8, WORLD.playableMaxZ - 8);
      if (z > -30 && z < 88) {
        z = this.rng() > 0.5 ? range(this.rng, 94, 214) : range(this.rng, -214, -38);
      }
      customer.targetX = side * range(this.rng, 7.2, 8.6);
      customer.targetZ = z;
      return;
    }
    // Stroll along the middle of Colon.
    const direction = this.rng() > 0.5 ? 1 : -1;
    const distance = range(this.rng, 14, 48);
    customer.targetX = clamp(customer.x + range(this.rng, -6, 6), -8.2, 8.2);
    customer.targetZ = clamp(customer.z + direction * distance, WORLD.playableMinZ + 6, WORLD.playableMaxZ - 6);
  }

  get activeCount(): number {
    return this.customers.filter((c) => c.active).length;
  }

  setShadows(_enabled: boolean): void {
    // Crowd meshes are intentionally unshadowed to keep draw cost down.
  }

  dispose(): void {
    for (const customer of this.customers) customer.avatar.dispose();
    this.customers = [];
  }
}

const START_PROGRESS = 0.52;
