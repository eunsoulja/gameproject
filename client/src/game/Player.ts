import * as THREE from 'three';
import type { Appearance } from '../../../shared/types';
import { spawnForPlot } from '../../../shared/layout';
import { Avatar } from './Avatar';
import type { CollisionSystem } from './CollisionSystem';
import { clamp } from './utils';

export interface MovementIntent {
  x: number;
  y: number;
  sprint: boolean;
  jump: boolean;
}

export type PlayerAnim = 'idle' | 'walk' | 'run' | 'jump';

const WALK_SPEED = 3.5;
const RUN_SPEED = 6.4;
const ACCEL = 13;
const AIR_ACCEL = 5.5;
const JUMP_SPEED = 4.9;
const GRAVITY = 15.5;
const RADIUS = 0.38;
const COYOTE_TIME = 0.11;

export class Player {
  readonly avatar: Avatar;
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  yaw = 0;
  vertical = 0;
  grounded = true;
  speed = 0;
  anim: PlayerAnim = 'idle';
  private stepTimer = 0;
  private shadow: THREE.Mesh;
  private facingTarget = 0;
  private jumpBuffer = 0;
  private landingImpulse = 0;
  private coyoteTimer = 0;
  private bob = 0;
  onFootstep: (() => void) | null = null;

  constructor(scene: THREE.Scene, appearance: Appearance, name: string, plotIndex: number) {
    this.avatar = new Avatar({ appearance, shadows: true });
    scene.add(this.avatar.root);

    const shadowMaterial = new THREE.MeshBasicMaterial({
      color: '#05070a',
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
    });
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.46, 18), shadowMaterial);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.renderOrder = 1;
    scene.add(this.shadow);

    this.spawnAtPlot(plotIndex);
    this.avatar.root.userData.name = name;
  }

  spawnAtPlot(plotIndex: number): void {
    const spawn = spawnForPlot(plotIndex);
    this.position.set(spawn.x, 0, spawn.z);
    this.yaw = spawn.rot;
    this.facingTarget = spawn.rot;
    this.velocity.set(0, 0, 0);
    this.vertical = 0;
    this.grounded = true;
    this.syncVisual();
  }

  teleport(x: number, z: number, rot?: number): void {
    this.position.set(x, 0, z);
    if (rot !== undefined) {
      this.yaw = rot;
      this.facingTarget = rot;
    }
    this.velocity.set(0, 0, 0);
    this.vertical = 0;
    this.grounded = true;
    this.syncVisual();
  }

  setAppearance(appearance: Appearance): void {
    this.avatar.setAppearance(appearance);
  }

  setNameVisible(visible: boolean): void {
    this.avatar.setNameVisible(visible);
  }

  update(
    dt: number,
    elapsed: number,
    intent: MovementIntent,
    cameraYaw: number,
    collision: CollisionSystem,
  ): void {
    const inputLength = Math.hypot(intent.x, intent.y);
    const moving = inputLength > 0.04;
    const sprint = intent.sprint && moving;
    const maxSpeed = sprint ? RUN_SPEED : WALK_SPEED;

    let dirX = 0;
    let dirZ = 0;
    if (moving) {
      const nx = intent.x / Math.max(1, inputLength);
      const ny = intent.y / Math.max(1, inputLength);
      const forwardX = Math.sin(cameraYaw);
      const forwardZ = Math.cos(cameraYaw);
      const rightX = Math.cos(cameraYaw);
      const rightZ = -Math.sin(cameraYaw);
      dirX = forwardX * ny + rightX * nx;
      dirZ = forwardZ * ny + rightZ * nx;
      const len = Math.hypot(dirX, dirZ);
      if (len > 1e-5) {
        dirX /= len;
        dirZ /= len;
      }
    }

    const targetX = dirX * maxSpeed;
    const targetZ = dirZ * maxSpeed;
    const accel = this.grounded ? ACCEL : AIR_ACCEL;
    const blend = 1 - Math.exp(-accel * dt);
    this.velocity.x += (targetX - this.velocity.x) * blend;
    this.velocity.z += (targetZ - this.velocity.z) * blend;
    if (!moving && this.grounded) {
      const friction = 1 - Math.exp(-16 * dt);
      this.velocity.x += (0 - this.velocity.x) * friction;
      this.velocity.z += (0 - this.velocity.z) * friction;
    }

    if (this.grounded) this.coyoteTimer = COYOTE_TIME;
    else this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);

    if (intent.jump) this.jumpBuffer = 0.16;
    else this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);

    if (this.jumpBuffer > 0 && (this.grounded || this.coyoteTimer > 0)) {
      this.vertical = JUMP_SPEED;
      this.grounded = false;
      this.coyoteTimer = 0;
      this.jumpBuffer = 0;
    }

    this.vertical -= GRAVITY * dt;
    this.position.y += this.vertical * dt;
    if (this.position.y <= 0) {
      const impact = -this.vertical;
      if (impact > 4.5) this.landingImpulse = Math.min(1, (impact - 4.5) / 6);
      this.position.y = 0;
      this.vertical = 0;
      this.grounded = true;
    }

    const beforeX = this.position.x;
    const beforeZ = this.position.z;
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    collision.resolve(this.position, RADIUS);
    const actualDx = this.position.x - beforeX;
    const actualDz = this.position.z - beforeZ;
    // Stop "running in place" against counters and walls.
    if (dt > 0) {
      const actualSpeed = Math.hypot(actualDx, actualDz) / dt;
      const wantedSpeed = Math.hypot(this.velocity.x, this.velocity.z);
      if (wantedSpeed > 0.4 && actualSpeed < wantedSpeed * 0.28) {
        this.velocity.x *= 0.25;
        this.velocity.z *= 0.25;
      }
    }

    this.speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (moving || this.speed > 0.5) {
      const targetYaw = Math.atan2(this.velocity.x, this.velocity.z);
      this.facingTarget = targetYaw;
    }
    const turn = 1 - Math.exp(-16 * dt);
    let delta = this.facingTarget - this.yaw;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    this.yaw += delta * turn;

    if (!this.grounded) this.anim = 'jump';
    else if (this.speed > 4.4) this.anim = 'run';
    else if (this.speed > 0.35) this.anim = 'walk';
    else this.anim = 'idle';

    this.avatar.setAnim(this.anim);
    this.avatar.update(dt, elapsed, this.speed);
    this.syncVisual();

    // Footsteps.
    if (this.grounded && this.speed > 0.55) {
      this.stepTimer -= dt * (this.speed > 4.4 ? 1.75 : 1.15);
      if (this.stepTimer <= 0) {
        this.stepTimer = 0.42;
        this.onFootstep?.();
      }
    } else {
      this.stepTimer = 0.12;
    }

    // Soft bounce while idle so the vendor feels alive.
    this.bob += (this.speed > 0.1 ? 0 : Math.sin(elapsed * 1.6) * 0.012 - this.bob) * Math.min(1, dt * 3);
  }

  private syncVisual(): void {
    this.avatar.root.position.set(this.position.x, this.position.y + this.bob, this.position.z);
    this.avatar.root.rotation.y = this.yaw;
    this.shadow.position.set(this.position.x, 0.012, this.position.z);
    const height = clamp(1 - this.position.y * 0.22, 0.55, 1);
    this.shadow.scale.setScalar(height);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.32 * height;
  }

  get headPosition(): THREE.Vector3 {
    return new THREE.Vector3(this.position.x, this.position.y + 1.55, this.position.z);
  }

  get facing(): THREE.Vector3 {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  /** Returns and clears the landing impulse (0–1) from the last hard touchdown. */
  consumeLanding(): number {
    const value = this.landingImpulse;
    this.landingImpulse = 0;
    return value;
  }

  get positionPayload(): { x: number; y: number; z: number; rot: number; anim: PlayerAnim } {
    return {
      x: Math.round(this.position.x * 100) / 100,
      y: Math.round(this.position.y * 100) / 100,
      z: Math.round(this.position.z * 100) / 100,
      rot: Math.round(this.yaw * 100) / 100,
      anim: this.anim,
    };
  }

  setShadows(enabled: boolean): void {
    this.avatar.setShadows(enabled);
  }

  dispose(): void {
    this.avatar.dispose();
    this.shadow.removeFromParent();
    this.shadow.geometry.dispose();
    (this.shadow.material as THREE.Material).dispose();
  }
}
