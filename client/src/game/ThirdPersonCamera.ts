import * as THREE from 'three';
import type { CollisionSystem } from './CollisionSystem';
import { clamp } from './utils';

/**
 * Smoothed third-person orbit camera with drag-look, wheel zoom and wall
 * avoidance. Yaw is the horizontal direction the camera looks toward.
 */
export class ThirdPersonCamera {
  readonly camera: THREE.PerspectiveCamera;
  yaw: number;
  pitch = 0.22;
  distance = 5.6;
  private currentDistance = 5.6;
  private target = new THREE.Vector3();
  private desired = new THREE.Vector3();
  private lookAt = new THREE.Vector3();
  private shakeAmount = 0;
  private shakeTime = 0;
  private fovBoost = 0;
  private baseFov = 62;
  private fov = 62;
  private ray = new THREE.Ray();
  private direction = new THREE.Vector3();

  constructor(camera: THREE.PerspectiveCamera, yaw = 0) {
    this.camera = camera;
    this.yaw = yaw;
    this.pitch = 0.22;
  }

  setYaw(yaw: number): void {
    this.yaw = yaw;
  }

  rotate(dx: number, dy: number, sensitivity = 1, invert = false): void {
    const sign = invert ? -1 : 1;
    this.yaw -= dx * 0.0026 * sensitivity * sign;
    this.pitch = clamp(this.pitch + dy * 0.0022 * sensitivity * sign, -0.12, 1.12);
  }

  zoom(delta: number): void {
    this.distance = clamp(this.distance + delta * 0.0045, 2.3, 10.5);
  }

  shake(amount: number, duration = 0.5): void {
    if (!this.shakeEnabled) return;
    this.shakeAmount = Math.max(this.shakeAmount, amount);
    this.shakeTime = Math.max(this.shakeTime, duration);
  }

  /** Settings toggle — when off, impact shakes are ignored. */
  shakeEnabled = true;

  /** Brief FOV punch for big moments — sales, upgrades, quest completes. */
  pulseFov(amount = 5): void {
    this.fovBoost = Math.max(this.fovBoost, amount);
  }

  update(dt: number, focus: THREE.Vector3, collision: CollisionSystem, speed = 0, reduceMotion = false): void {
    const follow = 1 - Math.exp(-14 * dt);
    this.target.x += (focus.x - this.target.x) * follow;
    this.target.y += (focus.y + 1.45 - this.target.y) * follow;
    this.target.z += (focus.z - this.target.z) * follow;

    const cosPitch = Math.cos(this.pitch);
    const sinPitch = Math.sin(this.pitch);
    this.direction.set(Math.sin(this.yaw) * cosPitch, -sinPitch, Math.cos(this.yaw) * cosPitch);
    this.desired.copy(this.target).addScaledVector(this.direction, -this.distance);

    // Keep the camera out of buildings, stalls and parked jeepneys.
    this.ray.origin.copy(this.target);
    this.ray.direction.copy(this.desired).sub(this.target);
    const wanted = this.ray.direction.length();
    this.ray.direction.normalize();
    const hit = collision.rayDistance(this.ray, wanted);
    const allowed = Math.max(1.25, Math.min(wanted, hit - 0.3));
    const zoomSpeed = allowed < this.currentDistance ? 24 : 9;
    this.currentDistance += (allowed - this.currentDistance) * Math.min(1, dt * zoomSpeed);

    this.desired.copy(this.target).addScaledVector(this.direction, -this.currentDistance);

    const targetFov =
      62 + clamp((speed - 3.5) * 1.4, 0, 6) + (this.currentDistance < 3 ? 2 : 0) + this.fovBoost;
    this.fovBoost *= Math.pow(0.02, dt);
    const fovSpeed = reduceMotion ? 4 : 7;
    this.fov += (targetFov - this.fov) * Math.min(1, dt * fovSpeed);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }

    this.camera.position.copy(this.desired);
    if (this.shakeTime > 0 && !reduceMotion) {
      this.shakeTime = Math.max(0, this.shakeTime - dt);
      const strength = this.shakeAmount * (this.shakeTime > 0 ? 1 : 0);
      this.camera.position.x += (Math.random() - 0.5) * strength;
      this.camera.position.y += (Math.random() - 0.5) * strength * 0.7;
      this.camera.position.z += (Math.random() - 0.5) * strength;
      this.shakeAmount *= Math.pow(0.02, dt);
    }

    this.lookAt.copy(this.target);
    this.lookAt.y += 0.18;
    this.camera.lookAt(this.lookAt);
  }

  snap(focus: THREE.Vector3, collision: CollisionSystem): void {
    this.target.set(focus.x, focus.y + 1.45, focus.z);
    const cosPitch = Math.cos(this.pitch);
    const sinPitch = Math.sin(this.pitch);
    this.direction.set(Math.sin(this.yaw) * cosPitch, -sinPitch, Math.cos(this.yaw) * cosPitch);
    this.ray.origin.copy(this.target);
    this.ray.direction.copy(this.direction).multiplyScalar(-1);
    const hit = collision.rayDistance(this.ray, this.distance);
    this.currentDistance = Math.max(1.4, Math.min(this.distance, hit - 0.3));
    this.camera.position.copy(this.target).addScaledVector(this.direction, -this.currentDistance);
    this.camera.lookAt(this.target);
  }

  setBaseFov(fov: number): void {
    this.baseFov = fov;
  }

  get forward(): THREE.Vector3 {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  get right(): THREE.Vector3 {
    return new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  get flattenedDistance(): number {
    return this.currentDistance;
  }
}
