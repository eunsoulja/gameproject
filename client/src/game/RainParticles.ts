import * as THREE from 'three';

const DROP_COUNT = 900;
const BOX = { x: 46, y: 30, z: 46 };
const FALL_SPEED = 26;

/**
 * Instanced rain streaks that follow the camera. Each drop is a short
 * line segment; positions wrap inside a box centred on the camera so the
 * shower always surrounds the player without allocating per-frame.
 */
export class RainParticles {
  readonly object: THREE.LineSegments;
  private positions: Float32Array;
  private speeds: Float32Array;
  private geometry: THREE.BufferGeometry;
  private material: THREE.LineBasicMaterial;
  private intensity = 0;

  constructor() {
    this.geometry = new THREE.BufferGeometry();
    this.positions = new Float32Array(DROP_COUNT * 6);
    this.speeds = new Float32Array(DROP_COUNT);
    for (let i = 0; i < DROP_COUNT; i++) {
      this.positions[i * 6] = (Math.random() - 0.5) * BOX.x;
      this.positions[i * 6 + 1] = Math.random() * BOX.y;
      this.positions[i * 6 + 2] = (Math.random() - 0.5) * BOX.z;
      this.positions[i * 6 + 3] = this.positions[i * 6];
      this.positions[i * 6 + 4] = this.positions[i * 6 + 1] - 0.9;
      this.positions[i * 6 + 5] = this.positions[i * 6 + 2];
      this.speeds[i] = FALL_SPEED * (0.75 + Math.random() * 0.5);
    }
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.material = new THREE.LineBasicMaterial({
      color: new THREE.Color('#9db8d6'),
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    });
    this.object = new THREE.LineSegments(this.geometry, this.material);
    this.object.frustumCulled = false;
    this.object.visible = false;
    this.object.renderOrder = 5;
  }

  /** 0 = dry, 1 = full downpour. Storms read a touch heavier. */
  setIntensity(value: number): void {
    this.intensity = THREE.MathUtils.clamp(value, 0, 1);
    this.object.visible = this.intensity > 0.01;
    this.material.opacity = 0.16 + this.intensity * 0.3;
  }

  update(dt: number, center: THREE.Vector3): void {
    if (!this.object.visible) return;
    const active = Math.floor(DROP_COUNT * (0.35 + this.intensity * 0.65));
    const wind = -2.2; // slant with the typhoon breeze
    for (let i = 0; i < active; i++) {
      const o = i * 6;
      let y = this.positions[o + 1] - this.speeds[i] * dt;
      let x = this.positions[o] + wind * dt;
      if (y < -BOX.y * 0.4) {
        y += BOX.y;
        x = this.positions[o] - wind * dt * 0.5;
      }
      // Keep drops inside the follow box around the camera.
      const lx = THREE.MathUtils.clamp(x - center.x, -BOX.x / 2, BOX.x / 2);
      const lz = THREE.MathUtils.clamp(this.positions[o + 2] - center.z, -BOX.z / 2, BOX.z / 2);
      this.positions[o] = center.x + lx;
      this.positions[o + 1] = center.y + 6 + ((y % BOX.y) + BOX.y) % BOX.y - BOX.y * 0.2;
      this.positions[o + 2] = center.z + lz;
      this.positions[o + 3] = this.positions[o] + wind * 0.05;
      this.positions[o + 4] = this.positions[o + 1] - 0.9;
      this.positions[o + 5] = this.positions[o + 2];
    }
    // Hide unused drops far below.
    for (let i = active; i < DROP_COUNT; i++) {
      const o = i * 6;
      this.positions[o + 1] = -999;
      this.positions[o + 4] = -999;
    }
    this.geometry.attributes.position.needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
