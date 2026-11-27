import * as THREE from 'three';
import type { Appearance } from '../../../shared/types';
import { box, merge } from './utils';

/**
 * A single-draw-call ambient shopper. Merging the whole blocky body into one
 * vertex-coloured mesh keeps the crowd cheap enough for laptops and phones.
 */
export class CrowdAvatar {
  readonly root = new THREE.Group();
  private mesh: THREE.Mesh;
  private geometry: THREE.BufferGeometry;
  private material: THREE.MeshLambertMaterial;
  private phase = Math.random() * Math.PI * 2;
  private umbrellaGroup: THREE.Group;
  private lean = 0;
  private leanTarget = 0;
  private storm = 0;
  private stormTarget = 0;

  constructor(appearance: Appearance, scale = 1) {
    const parts: THREE.BufferGeometry[] = [];
    const skin = appearance.skin;
    const shirt = appearance.shirt;
    const pants = appearance.pants;
    const hair = appearance.hair;

    // Legs and shoes.
    parts.push(box(0.23, 0.66, 0.25, pants, { x: -0.145, y: 0.37, z: 0 }));
    parts.push(box(0.23, 0.66, 0.25, pants, { x: 0.145, y: 0.37, z: 0 }));
    parts.push(box(0.26, 0.12, 0.32, '#22242a', { x: -0.145, y: 0.06, z: 0.03 }));
    parts.push(box(0.26, 0.12, 0.32, '#22242a', { x: 0.145, y: 0.06, z: 0.03 }));

    // Torso, collar and shirt hem.
    parts.push(box(0.52, 0.64, 0.3, shirt, { y: 1.02, z: 0 }));
    parts.push(box(0.54, 0.09, 0.32, shirt, { y: 0.72, z: 0 }));
    parts.push(box(0.2, 0.08, 0.31, skin, { y: 1.35, z: 0 }));

    // Arms with skin hands.
    parts.push(box(0.19, 0.55, 0.22, shirt, { x: -0.36, y: 1.06, z: 0 }));
    parts.push(box(0.19, 0.55, 0.22, shirt, { x: 0.36, y: 1.06, z: 0 }));
    parts.push(box(0.2, 0.14, 0.23, skin, { x: -0.36, y: 0.73, z: 0 }));
    parts.push(box(0.2, 0.14, 0.23, skin, { x: 0.36, y: 0.73, z: 0 }));

    // Head, hair and face.
    parts.push(box(0.4, 0.4, 0.38, skin, { y: 1.58, z: 0 }));
    parts.push(box(0.43, 0.14, 0.41, hair, { y: 1.78, z: -0.005 }));
    parts.push(box(0.42, 0.18, 0.08, hair, { y: 1.7, z: -0.17 }));
    parts.push(box(0.08, 0.09, 0.02, '#f8f2e5', { x: -0.1, y: 1.6, z: 0.195 }));
    parts.push(box(0.08, 0.09, 0.02, '#f8f2e5', { x: 0.1, y: 1.6, z: 0.195 }));
    parts.push(box(0.04, 0.06, 0.025, '#201814', { x: -0.1, y: 1.6, z: 0.207 }));
    parts.push(box(0.04, 0.06, 0.025, '#201814', { x: 0.1, y: 1.6, z: 0.207 }));
    parts.push(box(0.11, 0.02, 0.02, '#201814', { x: -0.1, y: 1.68, z: 0.198 }));
    parts.push(box(0.11, 0.02, 0.02, '#201814', { x: 0.1, y: 1.68, z: 0.198 }));
    parts.push(box(0.15, 0.035, 0.02, '#8b4f43', { y: 1.47, z: 0.198 }));
    parts.push(box(0.06, 0.06, 0.04, skin, { y: 1.54, z: 0.2 }));

    // Bag or basket carried at the hip.
    parts.push(box(0.22, 0.28, 0.34, '#7d5736', { x: 0.36, y: 0.93, z: 0 }));
    parts.push(box(0.03, 0.5, 0.03, '#57402a', { x: 0.3, y: 1.14, z: 0.14 }));

    this.geometry = merge(parts) ?? new THREE.BufferGeometry();
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.root.add(this.mesh);
    this.umbrellaGroup = this.buildUmbrella();
    this.root.add(this.umbrellaGroup);
    this.root.scale.setScalar(scale);
    this.phase = Math.random() * Math.PI * 2;
  }

  /** A compact hand umbrella held above the head — revealed when it rains. */
  private buildUmbrella(): THREE.Group {
    const group = new THREE.Group();
    const canopyColors = ['#d9534a', '#3f8ccc', '#f0b64c', '#63a56c', '#9a66c4'];
    const color = canopyColors[Math.floor(Math.random() * canopyColors.length)];
    const canopy = new THREE.Mesh(
      new THREE.ConeGeometry(0.52, 0.3, 8),
      new THREE.MeshLambertMaterial({ color }),
    );
    canopy.position.y = 2.28;
    const tip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 0.85, 5),
      new THREE.MeshLambertMaterial({ color: '#3a3f45' }),
    );
    tip.position.y = 1.85;
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.4, 5),
      new THREE.MeshLambertMaterial({ color: '#57402a' }),
    );
    handle.position.set(0.18, 1.62, 0.1);
    handle.rotation.z = 0.25;
    group.add(canopy, tip, handle);
    group.visible = false;
    return group;
  }

  setUmbrella(on: boolean): void {
    this.umbrellaGroup.visible = on;
  }

  /** Forward hunch (radians) — used when browsing a stall. */
  setLean(value: number): void {
    this.leanTarget = value;
  }

  /** 0 = dry, 1 = typhoon. Drives the storm hunch and umbrella tilt. */
  setStorm(value: number): void {
    this.stormTarget = value;
  }

  get position(): THREE.Vector3 {
    return this.root.position;
  }

  update(dt: number, elapsed: number, speed: number): void {
    this.lean += (this.leanTarget - this.lean) * Math.min(1, dt * 6);
    this.storm += (this.stormTarget - this.storm) * Math.min(1, dt * 2.5);
    const storm = this.storm;
    const idle = speed <= 0.08 ? 1 : 0;
    const browse = Math.min(1, this.lean / 0.12);

    if (speed > 0.08) {
      // Faster feet in a storm — hurried shuffle, deeper bob.
      const hurry = 1 + storm * 0.55;
      this.phase += dt * (4.8 + Math.min(3, speed * 1.5)) * hurry;
      const bobAmp = 0.035 + storm * 0.02;
      this.mesh.position.y = Math.abs(Math.sin(this.phase)) * bobAmp;
      // Body roll into the stride plus a speed-scaled forward hunch.
      this.mesh.rotation.z = Math.sin(this.phase) * (0.022 + storm * 0.012);
      this.mesh.rotation.x = 0.03 + Math.min(0.05, speed * 0.022) + storm * 0.12 + this.lean;
      // Shopping bag swings a touch livelier.
      this.mesh.position.x = Math.sin(this.phase * 0.5) * 0.008;
      this.mesh.rotation.y += (0 - this.mesh.rotation.y) * Math.min(1, dt * 5);
    } else {
      // Idle: breathing, weight shift and a slow look-around.
      this.mesh.position.y = Math.sin(elapsed * 1.3 + this.phase) * (0.006 + storm * 0.002);
      this.mesh.position.x = Math.sin(elapsed * 0.9 + this.phase * 1.7) * 0.016;
      this.mesh.rotation.z += (0 - this.mesh.rotation.z) * Math.min(1, dt * 4);
      this.mesh.rotation.x += (this.lean + storm * 0.14 - this.mesh.rotation.x) * Math.min(1, dt * 4);
      this.mesh.rotation.y = Math.sin(elapsed * 0.45 + this.phase) * 0.3 * idle;
    }
    // Browsers reach toward the goods — a small forward pulse on top of the lean.
    if (browse > 0.05) {
      this.mesh.position.z = Math.abs(Math.sin(elapsed * 2.6 + this.phase)) * 0.045 * browse;
    } else {
      this.mesh.position.z += (0 - this.mesh.position.z) * Math.min(1, dt * 6);
    }
    // Storm crouch — shoppers hunch low against the wind.
    const crouch = 1 - storm * 0.16;
    this.mesh.scale.y += (crouch - this.mesh.scale.y) * Math.min(1, dt * 3);
    // Umbrella leans into the gusts.
    if (this.umbrellaGroup.visible) {
      this.umbrellaGroup.rotation.z = storm * (0.38 + Math.sin(elapsed * 6.5 + this.phase) * 0.07);
      this.umbrellaGroup.rotation.x = storm * 0.1;
    } else {
      this.umbrellaGroup.rotation.z *= 0.9;
      this.umbrellaGroup.rotation.x *= 0.9;
    }
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.umbrellaGroup.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
    });
    this.root.removeFromParent();
  }
}
