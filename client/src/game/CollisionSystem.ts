import * as THREE from 'three';
import { WORLD } from '../../../shared/layout';

interface Collider {
  box: THREE.Box3;
  tag?: string;
}

/**
 * Cheap 2.5D collision world. Buildings, counters and props become boxes; the
 * player is a small circle on the pavement. The same boxes are used to keep the
 * third-person camera out of walls.
 */
export class CollisionSystem {
  private colliders: Collider[] = [];
  private tmpPoint = new THREE.Vector3();

  addBox(minX: number, maxX: number, minZ: number, maxZ: number, minY = 0, maxY = 16, tag?: string): void {
    this.colliders.push({
      box: new THREE.Box3(
        new THREE.Vector3(Math.min(minX, maxX), minY, Math.min(minZ, maxZ)),
        new THREE.Vector3(Math.max(minX, maxX), maxY, Math.max(minZ, maxZ)),
      ),
      tag,
    });
  }

  addBox3(box: THREE.Box3, tag?: string): void {
    this.colliders.push({ box: box.clone(), tag });
  }

  clear(): void {
    this.colliders.length = 0;
  }

  get count(): number {
    return this.colliders.length;
  }

  /** Push a vertical capsule/circle out of every collider it overlaps. */
  resolve(position: THREE.Vector3, radius: number): void {
    // Hidden world boundary — a soft clamp instead of a visible fence.
    position.x = THREE.MathUtils.clamp(position.x, -WORLD.playableHalfX + radius, WORLD.playableHalfX - radius);
    position.z = THREE.MathUtils.clamp(position.z, WORLD.playableMinZ + radius, WORLD.playableMaxZ - radius);

    for (let iteration = 0; iteration < 2; iteration++) {
      let moved = false;
      for (const collider of this.colliders) {
        const box = collider.box;
        if (position.y > box.max.y + 1.9 || position.y + 1.8 < box.min.y) continue;
        const nearestX = THREE.MathUtils.clamp(position.x, box.min.x, box.max.x);
        const nearestZ = THREE.MathUtils.clamp(position.z, box.min.z, box.max.z);
        let dx = position.x - nearestX;
        let dz = position.z - nearestZ;
        const distanceSq = dx * dx + dz * dz;
        if (distanceSq >= radius * radius) continue;
        moved = true;
        if (distanceSq > 1e-8) {
          const distance = Math.sqrt(distanceSq);
          const push = radius - distance;
          position.x += (dx / distance) * push;
          position.z += (dz / distance) * push;
        } else {
          // Centre is inside the box: escape through the closest face.
          const left = position.x - box.min.x;
          const right = box.max.x - position.x;
          const near = position.z - box.min.z;
          const far = box.max.z - position.z;
          const min = Math.min(left, right, near, far);
          if (min === left) position.x = box.min.x - radius;
          else if (min === right) position.x = box.max.x + radius;
          else if (min === near) position.z = box.min.z - radius;
          else position.z = box.max.z + radius;
        }
      }
      if (!moved) break;
    }

    position.x = THREE.MathUtils.clamp(position.x, -WORLD.playableHalfX + radius, WORLD.playableHalfX - radius);
    position.z = THREE.MathUtils.clamp(position.z, WORLD.playableMinZ + radius, WORLD.playableMaxZ - radius);
  }

  /** Distance from origin along a ray before it enters a collider, or Infinity. */
  rayDistance(ray: THREE.Ray, maxDistance: number): number {
    let closest = maxDistance;
    for (const collider of this.colliders) {
      const hit = ray.intersectBox(collider.box, this.tmpPoint);
      if (!hit) continue;
      const distance = hit.distanceTo(ray.origin);
      if (distance > 0.05 && distance < closest) closest = distance;
    }
    return closest;
  }
}
