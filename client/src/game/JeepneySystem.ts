import * as THREE from 'three';
import { WORLD } from '../../../shared/layout';
import { addMergedMesh, box, cylinder, MATERIALS } from './utils';

const LANE_X = [-5.2, 5.2];
const SPEED = 9.5;
const HALF_LEN = WORLD.maxZ - 8;

/**
 * A pair of chrome jeepneys running the length of Colon Street — one each
 * direction. During a jeepney strike they vanish, leaving the road empty.
 */
export class JeepneySystem {
  private group = new THREE.Group();
  private vehicles: Array<{ root: THREE.Group; z: number; dir: 1 | -1 }> = [];
  private visible = true;
  private elapsed = 0;

  constructor(private scene: THREE.Scene) {}

  build(): void {
    for (let i = 0; i < 2; i++) {
      const dir = i === 0 ? 1 : -1;
      const root = this.makeJeepney(dir);
      root.position.set(LANE_X[i], 0, dir === 1 ? -HALF_LEN : HALF_LEN);
      root.rotation.y = dir === 1 ? 0 : Math.PI;
      this.group.add(root);
      this.vehicles.push({ root, z: root.position.z, dir });
    }
    this.scene.add(this.group);
  }

  private makeJeepney(dir: 1 | -1): THREE.Group {
    const root = new THREE.Group();
    const body: THREE.BufferGeometry[] = [];
    const trim: THREE.BufferGeometry[] = [];
    const glow: THREE.BufferGeometry[] = [];

    // Cab + passenger body on a shared chassis.
    body.push(box(1.9, 1.5, 5.4, '#c23b2e', { x: 0, y: 1.35, z: -0.4 }));
    body.push(box(1.9, 0.7, 1.7, '#c23b2e', { x: 0, y: 1.0, z: 2.2 })); // hood
    body.push(box(1.7, 0.55, 0.25, '#8f2a20', { x: 0, y: 1.5, z: 3.05 })); // grille
    // Chrome side piping and window band.
    trim.push(box(0.06, 0.08, 5.2, '#d8d2c4', { x: -0.97, y: 1.75, z: -0.4 }));
    trim.push(box(0.06, 0.08, 5.2, '#d8d2c4', { x: 0.97, y: 1.75, z: -0.4 }));
    body.push(box(1.72, 0.62, 4.6, '#22303c', { x: 0, y: 1.85, z: -0.5 }));
    // Roof rack + destination sign.
    trim.push(box(1.6, 0.12, 3.4, '#3a3f45', { x: 0, y: 2.28, z: -0.7 }));
    glow.push(box(1.1, 0.3, 0.08, '#ffd98a', { x: 0, y: 1.55, z: 3.1 })); // headlight bar
    glow.push(box(1.1, 0.16, 0.08, '#ff5d4a', { x: 0, y: 1.35, z: -3.15 })); // tail bar

    // Wheels — dark rubber with hub caps.
    const wheelGeo: THREE.BufferGeometry[] = [];
    const hubGeo: THREE.BufferGeometry[] = [];
    for (const wx of [-0.85, 0.85]) {
      for (const wz of [-2.0, 1.4, 2.6]) {
        wheelGeo.push(cylinder(0.42, 0.42, 0.3, 10, '#15181c', { x: wx, y: 0.42, z: wz, rx: Math.PI / 2 }));
        hubGeo.push(cylinder(0.16, 0.16, 0.32, 8, '#c9c2b2', { x: wx, y: 0.42, z: wz, rx: Math.PI / 2 }));
      }
    }

    addMergedMesh(root, body, MATERIALS.fabric(), 'jeep-body');
    addMergedMesh(root, trim, MATERIALS.metal(), 'jeep-trim');
    addMergedMesh(root, glow, MATERIALS.glow(), 'jeep-glow');
    addMergedMesh(root, wheelGeo, new THREE.MeshLambertMaterial({ color: '#15181c' }), 'jeep-wheels');
    addMergedMesh(root, hubGeo, new THREE.MeshLambertMaterial({ color: '#c9c2b2' }), 'jeep-hubs');
    void dir;
    return root;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.group.visible = visible;
  }

  update(dt: number): void {
    this.elapsed += dt;
    if (!this.visible) return;
    for (const vehicle of this.vehicles) {
      vehicle.z += vehicle.dir * SPEED * dt;
      if (vehicle.z > HALF_LEN) vehicle.z = -HALF_LEN;
      if (vehicle.z < -HALF_LEN) vehicle.z = HALF_LEN;
      vehicle.root.position.z = vehicle.z;
      // Gentle suspension bob so it doesn't glide like a ghost.
      vehicle.root.position.y = Math.sin(this.elapsed * 9 + vehicle.z) * 0.015;
    }
  }

  dispose(): void {
    this.scene.remove(this.group);
    this.group.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry?.dispose();
        const material = mesh.material as THREE.Material | THREE.Material[];
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material?.dispose();
      }
    });
  }
}
