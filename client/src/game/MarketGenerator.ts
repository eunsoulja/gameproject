import * as THREE from 'three';
import { WORLD, zoneCategoryAt } from '../../../shared/layout';
import type { StallCategory } from '../../../shared/config';
import type { CollisionSystem } from './CollisionSystem';
import {
  MATERIALS,
  addMergedMesh,
  box,
  cylinder,
  makeGlowSprite,
  makeGlowTexture,
  makeLabelTexture,
  pick,
  range,
  sphere,
  type Random,
  makeRng,
} from './utils';

const CANOPY_COLORS = [
  ['#b8453b', '#f0dcc0'],
  ['#d08a2c', '#f4e6c8'],
  ['#3f728e', '#e7e2d3'],
  ['#4f7b52', '#e9e3cf'],
  ['#7c4f8f', '#eadfd3'],
  ['#c2653f', '#f2e2c9'],
  ['#3d8580', '#e7e4d6'],
];

const STALL_LABELS = [
  'DANGGIT',
  'SIBUYAS',
  'KAMATIS',
  'SAGING',
  'MANGO',
  'BBQ',
  'SIOMAI',
  'PUSO',
  'UKAY',
  'BAGOONG',
  'PASALUBONG',
  'KAPE',
  'ISDA',
  'TINAPAY',
  'HALO-HALO',
  'BUKO',
  'KALAMANSI',
  'LECHON',
];

const JEEPNEY_PAINT = ['#b7372f', '#e0a72f', '#2f6f9a', '#3f8055', '#9b4a7e'];

interface StallSpot {
  side: -1 | 1;
  z: number;
  depthRow: 0 | 1 | 2;
  label?: string;
  category?: StallCategory;
}

/** Fills the long street beyond the 16 player bays with a dense market. */
export class MarketGenerator {
  private scene: THREE.Scene;
  private collision: CollisionSystem;
  private rng: Random;
  private structural: THREE.BufferGeometry[] = [];
  private fabric: THREE.BufferGeometry[] = [];
  private glow: THREE.BufferGeometry[] = [];
  private metal: THREE.BufferGeometry[] = [];
  private signMeshes: THREE.Mesh[] = [];
  private signTextures = new Map<string, THREE.Texture>();
  private glowTexture: THREE.Texture;
  private lights: THREE.Sprite[] = [];
  private built = false;

  constructor(scene: THREE.Scene, collision: CollisionSystem) {
    this.scene = scene;
    this.collision = collision;
    this.rng = makeRng(51771);
    this.glowTexture = makeGlowTexture();
  }

  build(): void {
    if (this.built) return;
    this.built = true;
    this.buildStallRows();
    this.buildTianggeAlley();
    this.buildJeepneys();
    this.buildCarts();
    this.buildStreetClutter();
    this.buildAlleyDetails();

    addMergedMesh(this.scene, this.structural, MATERIALS.structure(), 'market-structure');
    addMergedMesh(this.scene, this.fabric, MATERIALS.fabric(), 'market-canopies');
    addMergedMesh(this.scene, this.glow, MATERIALS.glow(), 'market-glow');
    addMergedMesh(this.scene, this.metal, MATERIALS.metal(), 'market-metal');
    for (const sprite of this.lights) this.scene.add(sprite);
    for (const sign of this.signMeshes) this.scene.add(sign);
  }

  update(dt: number, elapsed: number): void {
    // Bulbs breathe a little, and the occasional sign flickers like an old fluorescent tube.
    const flicker = 0.8 + 0.2 * Math.sin(elapsed * 2.7);
    for (let i = 0; i < this.lights.length; i++) {
      const sprite = this.lights[i];
      const base = 1.1 + (i % 5) * 0.12;
      const pulse = 0.88 + 0.12 * Math.sin(elapsed * 1.4 + i * 2.1);
      sprite.scale.setScalar(base * pulse * flicker);
    }
    for (let i = 0; i < this.signMeshes.length; i++) {
      const material = this.signMeshes[i].material as THREE.MeshBasicMaterial;
      if (!material) continue;
      const dim = i % 9 === 0 && Math.sin(elapsed * 13 + i) > 0.92 ? 0.35 : 1;
      material.opacity = dim;
    }
  }

  private buildStallRows(): void {
    const spots: StallSpot[] = [];
    const ranges: Array<[number, number]> = [
      [WORLD.playableMinZ + 2, -34],
      [90, WORLD.playableMaxZ - 2],
    ];

    for (const side of [-1, 1] as Array<-1 | 1>) {
      for (const [start, end] of ranges) {
        let z = start + range(this.rng, 0, 2);
        while (z < end) {
          const width = range(this.rng, 3.9, 5.4);
          if (this.nearSideStreet(z, width / 2 + 2.5)) {
            z += 5;
            continue;
          }
          spots.push({
            side,
            z: z + width / 2,
            depthRow: 0,
            label: this.rng() > 0.34 ? pick(this.rng, STALL_LABELS) : undefined,
          });
          // A second, cheaper row of tarps leans against the shopfronts.
          if (this.rng() > 0.4) {
            spots.push({
              side,
              z: z + width / 2 + range(this.rng, -0.5, 0.5),
              depthRow: 1,
              label: this.rng() > 0.7 ? pick(this.rng, STALL_LABELS) : undefined,
            });
          }
          z += width + range(this.rng, 0.35, 1.3);
        }
      }
    }

    for (const spot of spots) {
      this.buildStall(spot);
    }
  }

  /** A deeper "suki alley" of small tarps tucked behind the main rows. */
  private buildTianggeAlley(): void {
    const spots: StallSpot[] = [];
    // Two pockets where the alley opens up — avoids the side streets.
    const ranges: Array<[number, number]> = [
      [WORLD.playableMinZ + 10, -60],
      [120, WORLD.playableMaxZ - 10],
    ];
    for (const side of [-1, 1] as Array<-1 | 1>) {
      for (const [start, end] of ranges) {
        let z = start + range(this.rng, 0, 3);
        while (z < end) {
          const width = range(this.rng, 3.0, 4.0);
          if (this.nearSideStreet(z, width / 2 + 3)) {
            z += 4;
            continue;
          }
          spots.push({
            side,
            z: z + width / 2,
            depthRow: 2,
            label: this.rng() > 0.5 ? 'ALLEY' : undefined,
          });
          z += width + range(this.rng, 0.8, 2.2);
        }
      }
    }
    for (const spot of spots) this.buildStall(spot);
  }

  private nearSideStreet(z: number, margin: number): boolean {
    return WORLD.sideStreets.some((street) => Math.abs(z - street) < WORLD.sideStreetHalfWidth + margin);
  }

  private buildStall(spot: StallSpot): void {
    const { side, z, depthRow } = spot;
    const category: StallCategory = spot.category ?? zoneCategoryAt(z, this.rng);
    const [primary, secondary] = pick(this.rng, CANOPY_COLORS);
    const frontX = depthRow === 0 ? 9.9 : depthRow === 1 ? 14.1 : 18.8;
    const depth = depthRow === 0 ? range(this.rng, 2.8, 3.3) : range(this.rng, 2.1, 2.7);
    const centerX = side * (frontX + depth / 2);
    const width = depthRow === 0 ? range(this.rng, 4.2, 5.2) : range(this.rng, 3.2, 4.3);
    const counterY = depthRow === 0 ? 0.96 : depthRow === 1 ? 0.88 : 0.8;
    const roofY = depthRow === 0 ? range(this.rng, 2.55, 2.85) : depthRow === 1 ? range(this.rng, 2.25, 2.5) : range(this.rng, 2.05, 2.3);
    const wood = pick(this.rng, ['#6b4c33', '#77553a', '#5c412c', '#816044']);
    const legColor = '#403024';
    const front = side * frontX; // the edge facing the street

    // Counter and frame.
    this.structural.push(box(depth, 0.18, width, wood, { x: centerX, y: counterY, z }));
    this.structural.push(box(depth - 0.25, 0.75, width - 0.25, pick(this.rng, ['#4d3826', '#57402b', '#3f2e20']), {
      x: centerX,
      y: counterY - 0.47,
      z,
    }));
    for (const dx of [-depth / 2 + 0.16, depth / 2 - 0.16]) {
      for (const dz of [-width / 2 + 0.16, width / 2 - 0.16]) {
        this.structural.push(box(0.12, counterY, 0.12, legColor, { x: centerX + dx, y: counterY / 2, z: z + dz }));
      }
    }

    // Back shelf and stock below.
    this.structural.push(box(0.16, 1.55, width - 0.3, '#4a3726', {
      x: side * (frontX + depth - 0.25),
      y: 1.48,
      z,
    }));
    for (let shelf = 0; shelf < 3; shelf++) {
      this.structural.push(box(0.4, 0.07, width - 0.55, '#5b432e', {
        x: side * (frontX + depth - 0.42),
        y: 1.0 + shelf * 0.42,
        z,
      }));
      for (let item = 0; item < 3; item++) {
        this.structural.push(box(0.28, 0.28, 0.3, pick(this.rng, ['#bfa06a', '#a8794d', '#d3bb85', '#8f6a43']), {
          x: side * (frontX + depth - 0.42),
          y: 1.17 + shelf * 0.42,
          z: z - width / 2 + 0.45 + item * 0.42,
        }));
      }
    }
    // Crates and sacks under the counter.
    for (let i = 0; i < 3; i++) {
      const crateZ = z - width / 2 + 0.62 + i * (width / 3.2);
      this.structural.push(box(0.52, 0.34, 0.5, pick(this.rng, ['#8b6a43', '#a07c4d', '#6f5335']), {
        x: side * (frontX + 0.35 + (i % 2) * 0.4),
        y: 0.17,
        z: crateZ,
      }));
      this.structural.push(box(0.4, 0.16, 0.38, '#b5965d', {
        x: side * (frontX + 0.35 + (i % 2) * 0.4),
        y: 0.42,
        z: crateZ,
      }));
    }

    // Lean-to posts and a striped tarp roof.
    const postH = roofY + 0.55;
    for (const dx of [-depth / 2 + 0.08, depth / 2 - 0.08]) {
      for (const dz of [-width / 2 + 0.08, width / 2 - 0.08]) {
        this.metal.push(cylinder(0.035, 0.045, postH, 5, '#443b30', {
          x: centerX + dx,
          y: postH / 2,
          z: z + dz,
        }));
      }
    }
    const stripeCount = Math.max(5, Math.round(width / 0.72));
    for (let i = 0; i < stripeCount; i++) {
      const stripeW = width / stripeCount;
      this.fabric.push(box(depth + 0.5, 0.09, stripeW * 0.96, i % 2 ? primary : secondary, {
        x: centerX - side * 0.18,
        y: roofY,
        z: z - width / 2 + stripeW * (i + 0.5),
        rz: side * 0.09,
      }));
    }
    // Front valance.
    this.fabric.push(box(0.06, 0.36, width + 0.4, primary, {
      x: front - side * 0.1,
      y: roofY - 0.28,
      z,
    }));
    // Rope ties.
    this.metal.push(box(0.02, 0.55, 0.02, '#2b251e', {
      x: side * (frontX + depth - 0.2),
      y: roofY - 0.35,
      z: z - width / 2 + 0.3,
    }));
    this.metal.push(box(0.02, 0.55, 0.02, '#2b251e', {
      x: side * (frontX + depth - 0.2),
      y: roofY - 0.35,
      z: z + width / 2 - 0.3,
    }));

    this.addStallGoods(category, front, centerX, z, width, counterY, side);
    this.addStallLights(front, z, width, roofY, side);

    if (spot.label) this.addStallSign(spot.label, side, front, z, Math.min(width - 0.4, 3.6));

    // Collider includes the counter and the walk-in space under the tarp.
    const backX = side * (frontX + depth + 0.1);
    this.collision.addBox(
      Math.min(front - side * 0.15, backX),
      Math.max(front - side * 0.15, backX),
      z - width / 2 - 0.1,
      z + width / 2 + 0.1,
      0,
      roofY + 0.3,
      'stall',
    );
  }

  private addStallGoods(
    category: StallCategory,
    front: number,
    centerX: number,
    z: number,
    width: number,
    counterY: number,
    side: -1 | 1,
  ): void {
    const tableTop = counterY + 0.09;
    const startZ = z - width / 2 + 0.55;
    const step = (width - 1.0) / 3;

    if (category === 'fruit') {
      const colors = ['#f0b52e', '#e6d13c', '#d9473b', '#79a64c', '#e58b31', '#cf7ab0'];
      for (let pile = 0; pile < 4; pile++) {
        const pz = startZ + pile * step;
        const px = centerX - side * 0.1;
        const color = pick(this.rng, colors);
        this.structural.push(box(0.62, 0.1, 0.62, '#8a6a43', { x: px, y: tableTop, z: pz }));
        for (let i = 0; i < 3; i++) {
          this.structural.push(sphere(0.12, color, {
            x: px + range(this.rng, -0.16, 0.16),
            y: tableTop + 0.16 + (i === 2 ? 0.14 : 0),
            z: pz + range(this.rng, -0.16, 0.16),
          }, 7));
        }
        this.structural.push(box(0.28, 0.16, 0.02, '#f5e6c7', {
          x: px + side * 0.35,
          y: tableTop + 0.17,
          z: pz + 0.15,
        }));
      }
      // Hanging plastic bags and a bilao basket.
      this.structural.push(cylinder(0.33, 0.3, 0.08, 10, '#b18a54', {
        x: front - side * 0.45,
        y: 1.35,
        z: z + width * 0.3,
      }));
    } else if (category === 'streetFood') {
      // Grill with glowing coals and skewers.
      this.structural.push(box(0.72, 0.22, 1.25, '#3a3631', {
        x: centerX,
        y: tableTop + 0.08,
        z: z - width * 0.18,
      }));
      this.glow.push(box(0.5, 0.03, 0.95, '#ff7a2a', {
        x: centerX,
        y: tableTop + 0.21,
        z: z - width * 0.18,
      }));
      for (let i = 0; i < 6; i++) {
        this.metal.push(box(0.66, 0.012, 0.025, '#191818', {
          x: centerX,
          y: tableTop + 0.25,
          z: z - width * 0.18 - 0.45 + i * 0.18,
        }));
        this.structural.push(box(0.08, 0.08, 0.32, '#8f4b2f', {
          x: centerX + range(this.rng, -0.16, 0.16),
          y: tableTop + 0.25,
          z: z - width * 0.18 - 0.45 + i * 0.18,
        }));
      }
      // Steamer stack and puso basket.
      this.metal.push(cylinder(0.36, 0.36, 0.24, 12, '#9aa0a2', {
        x: centerX + side * 0.1,
        y: tableTop + 0.22,
        z: z + width * 0.22,
      }));
      this.structural.push(cylinder(0.28, 0.28, 0.32, 10, '#d3b878', {
        x: front - side * 0.45,
        y: tableTop + 0.18,
        z: z + width * 0.34,
      }));
      this.glow.push(cylinder(0.16, 0.16, 0.04, 8, '#ffb45e', {
        x: front - side * 0.45,
        y: tableTop + 0.36,
        z: z + width * 0.34,
      }));
      // Hanging skewers.
      for (let i = 0; i < 4; i++) {
        this.structural.push(box(0.03, 0.28, 0.09, '#804a2f', {
          x: front - side * 0.15,
          y: tableTop + 0.75,
          z: z - 0.2 + i * 0.14,
        }));
      }
    } else if (category === 'driedFish') {
      for (let tray = 0; tray < 4; tray++) {
        const pz = startZ + tray * step;
        this.structural.push(box(0.6, 0.07, 0.5, '#b7a781', { x: centerX, y: tableTop, z: pz }));
        for (let i = 0; i < 4; i++) {
          this.structural.push(box(0.1, 0.035, 0.25, pick(this.rng, ['#d9c19a', '#c4a478', '#b89368']), {
            x: centerX - 0.2 + i * 0.13,
            y: tableTop + 0.055,
            z: pz,
            ry: range(this.rng, -0.4, 0.4),
          }));
        }
        // Price card.
        this.structural.push(box(0.16, 0.12, 0.015, '#f4ecd8', {
          x: centerX + side * 0.42,
          y: tableTop + 0.12,
          z: pz + 0.2,
        }));
      }
      // Hanging strings of dried fish behind the counter.
      for (let i = 0; i < 5; i++) {
        this.structural.push(box(0.06, 0.4, 0.13, '#c9a879', {
          x: side * (front + 2.0),
          y: 2.05,
          z: z - width * 0.35 + i * (width * 0.16),
        }));
      }
    } else {
      // Ukay: a clothes rack and folded piles.
      this.metal.push(cylinder(0.035, 0.035, 1.85, 5, '#4a4640', {
        x: centerX,
        y: 1.35,
        z: z - width / 2 + 0.4,
      }));
      this.metal.push(cylinder(0.035, 0.035, 1.85, 5, '#4a4640', {
        x: centerX,
        y: 1.35,
        z: z + width / 2 - 0.4,
      }));
      this.metal.push(box(0.04, 0.04, width - 0.8, '#4a4640', {
        x: centerX,
        y: 2.25,
        z,
      }));
      const shirtColors = ['#b44c4b', '#4c74a8', '#5d8a5e', '#c49a3d', '#8b5a9e', '#d7d0bc', '#c4704a'];
      for (let i = 0; i < 8; i++) {
        this.fabric.push(box(0.5, 0.62, 0.045, pick(this.rng, shirtColors), {
          x: centerX,
          y: 1.92,
          z: z - width / 2 + 0.55 + i * ((width - 1.1) / 7),
          ry: range(this.rng, -0.14, 0.14),
        }));
      }
      for (let i = 0; i < 3; i++) {
        this.structural.push(box(0.5, 0.14, 0.5, pick(this.rng, shirtColors), {
          x: centerX,
          y: tableTop + 0.07 + i * 0.13,
          z: startZ + i * 0.7,
        }));
      }
    }

    // A glass jar of candies or a stack of canned goods is universal.
    if (this.rng() > 0.45) {
      this.structural.push(cylinder(0.16, 0.16, 0.36, 8, '#d8e2de', {
        x: front - side * 0.5,
        y: tableTop + 0.18,
        z: z + width * 0.44,
      }));
      this.glow.push(cylinder(0.13, 0.13, 0.03, 8, pick(this.rng, ['#ffd869', '#f08a7a', '#9bd4a2']), {
        x: front - side * 0.5,
        y: tableTop + 0.36,
        z: z + width * 0.44,
      }));
    }
  }

  private addStallLights(front: number, z: number, width: number, roofY: number, side: -1 | 1): void {
    const count = Math.max(2, Math.round(width / 1.6));
    for (let i = 0; i < count; i++) {
      const lz = z - width / 2 + (width * (i + 0.5)) / count;
      this.glow.push(sphere(0.065, '#ffd18a', {
        x: front - side * 0.35,
        y: roofY - 0.2,
        z: lz,
      }, 6));
      if (i % 2 === 0) {
        const sprite = makeGlowSprite(this.glowTexture, '#ffbd73', range(this.rng, 0.9, 1.45));
        sprite.position.set(front - side * 0.35, roofY - 0.18, lz);
        this.lights.push(sprite);
      }
    }
  }

  private addStallSign(text: string, side: -1 | 1, front: number, z: number, width: number): void {
    let texture = this.signTextures.get(text);
    if (!texture) {
      texture = makeLabelTexture(text, '#ffe3ae', 'rgba(20,13,8,0.9)');
      this.signTextures.set(text, texture);
    }
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width * 0.31), material);
    mesh.position.set(front - side * 0.22, 2.18, z);
    mesh.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    mesh.renderOrder = 2;
    this.signMeshes.push(mesh);
  }

  private buildJeepneys(): void {
    const spots: Array<{ side: -1 | 1; z: number }> = [
      { side: -1, z: -196 },
      { side: 1, z: -148 },
      { side: -1, z: -104 },
      { side: 1, z: 140 },
      { side: -1, z: 172 },
      { side: 1, z: 214 },
    ];
    for (const spot of spots) {
      this.buildJeepney(spot.side, spot.z);
    }
  }

  private buildJeepney(side: -1 | 1, z: number): void {
    const paint = pick(this.rng, JEEPNEY_PAINT);
    const x = side * 13.1;
    const w = 1.95;
    const l = 5.3;
    const bodyY = 0.95;

    this.structural.push(box(w, 0.9, l, paint, { x, y: bodyY, z }));
    this.structural.push(box(w + 0.06, 0.18, l + 0.1, '#d8d2c4', { x, y: bodyY + 0.52, z }));
    this.structural.push(box(w - 0.1, 0.07, l - 0.5, '#2b2b2b', { x, y: bodyY - 0.3, z }));
    this.structural.push(box(w + 0.14, 0.16, l + 0.26, '#e8e2d5', { x, y: 0.58, z }));
    this.metal.push(box(w + 0.2, 0.12, 0.26, '#c8ccd0', { x, y: 0.44, z: z - l / 2 - 0.04 }));
    this.metal.push(box(w + 0.2, 0.12, 0.26, '#c8ccd0', { x, y: 0.44, z: z + l / 2 + 0.04 }));
    // Roof with the classic raised center.
    this.structural.push(box(w + 0.16, 0.12, l - 0.3, '#ece3cf', { x, y: 1.58, z }));
    this.structural.push(box(w - 0.3, 0.12, l - 0.9, paint, { x, y: 1.7, z }));
    this.structural.push(box(0.1, 0.18, l - 1.0, '#b9b1a1', { x: x - w / 2 + 0.08, y: 1.6, z }));
    this.structural.push(box(0.1, 0.18, l - 1.0, '#b9b1a1', { x: x + w / 2 - 0.08, y: 1.6, z }));

    // Side windows and open passenger side.
    for (let i = 0; i < 4; i++) {
      const wz = z - l / 2 + 0.8 + i * 1.05;
      this.structural.push(box(0.04, 0.52, 0.8, '#7fa3af', { x: x - w / 2 - 0.02, y: 1.1, z: wz }));
      this.structural.push(box(0.04, 0.52, 0.8, '#7fa3af', { x: x + w / 2 + 0.02, y: 1.1, z: wz }));
      this.metal.push(box(0.05, 0.53, 0.05, '#dfe3e5', { x: x - w / 2 - 0.03, y: 1.1, z: wz - 0.42 }));
      this.metal.push(box(0.05, 0.53, 0.05, '#dfe3e5', { x: x - w / 2 - 0.03, y: 1.1, z: wz + 0.42 }));
    }
    // Destination board and headlights.
    this.glow.push(box(w * 0.7, 0.24, 0.05, '#ffd17d', {
      x,
      y: 1.48,
      z: z - l / 2 - 0.01,
    }));
    this.glow.push(box(0.3, 0.18, 0.05, '#fff0c2', { x: x - 0.6, y: 0.96, z: z - l / 2 - 0.06 }));
    this.glow.push(box(0.3, 0.18, 0.05, '#fff0c2', { x: x + 0.6, y: 0.96, z: z - l / 2 - 0.06 }));
    this.glow.push(box(0.24, 0.12, 0.05, '#e84a3c', { x: x - 0.6, y: 0.9, z: z + l / 2 + 0.03 }));
    this.glow.push(box(0.24, 0.12, 0.05, '#e84a3c', { x: x + 0.6, y: 0.9, z: z + l / 2 + 0.03 }));

    // Wheels.
    for (const wz of [z - 1.7, z + 1.7]) {
      for (const wx of [x - w / 2 - 0.03, x + w / 2 + 0.03]) {
        this.metal.push(cylinder(0.4, 0.4, 0.2, 12, '#17181a', {
          x: wx,
          y: 0.42,
          z: wz,
          rz: Math.PI / 2,
        }));
        this.metal.push(cylinder(0.18, 0.18, 0.22, 10, '#aeb4b6', {
          x: wx,
          y: 0.42,
          z: wz,
          rz: Math.PI / 2,
        }));
      }
    }

    // Roof rack with cargo.
    this.metal.push(box(w - 0.2, 0.06, l - 1.0, '#4b4a45', { x, y: 1.8, z }));
    this.structural.push(box(0.8, 0.4, 1.0, '#7f694c', { x: x + range(this.rng, -0.3, 0.3), y: 2.0, z: z + l * 0.2 }));
    this.structural.push(box(0.55, 0.35, 0.7, '#986a44', { x: x + range(this.rng, -0.3, 0.3), y: 1.98, z: z - l * 0.15 }));

    this.collision.addBox(
      Math.min(x - w / 2 - 0.2, x + w / 2 + 0.2),
      Math.max(x - w / 2 - 0.2, x + w / 2 + 0.2),
      z - l / 2 - 0.3,
      z + l / 2 + 0.3,
      0,
      2.1,
      'jeepney',
    );
  }

  private buildCarts(): void {
    this.buildFoodCart(-1, -82, '#c74f3b', 'BALUT');
    this.buildFoodCart(1, -121, '#3f7d8b', 'TAHO');
    this.buildFoodCart(-1, 128, '#d39a35', 'FISHBALL');
    this.buildFoodCart(1, 186, '#8b5b9d', 'HALO-HALO');
  }

  private buildFoodCart(side: -1 | 1, z: number, color: string, label: string): void {
    const x = side * 7.4;
    this.structural.push(box(1.2, 0.8, 2.1, color, { x, y: 0.78, z }));
    this.structural.push(box(1.35, 0.1, 2.25, '#e7ddc8', { x, y: 1.23, z }));
    this.metal.push(box(1.3, 0.1, 0.1, '#c9cdd0', { x, y: 1.05, z: z - 1.12 }));
    this.metal.push(box(1.3, 0.1, 0.1, '#c9cdd0', { x, y: 1.05, z: z + 1.12 }));
    for (const wz of [z - 0.7, z + 0.7]) {
      this.metal.push(cylinder(0.3, 0.3, 0.14, 10, '#2a2a2a', {
        x: x + side * 0.55,
        y: 0.3,
        z: wz,
        rz: Math.PI / 2,
      }));
    }
    // Big vendor umbrella.
    this.metal.push(cylinder(0.035, 0.035, 2.6, 6, '#5d5142', { x, y: 1.3, z }));
    const umbrella = pick(this.rng, CANOPY_COLORS);
    this.fabric.push(cylinder(0.02, 1.65, 0.55, 8, umbrella[0], { x, y: 2.45, z }, true));
    this.fabric.push(cylinder(0.02, 1.5, 0.06, 8, umbrella[1], { x, y: 2.18, z }, true));
    this.glow.push(sphere(0.08, '#ffd38a', { x, y: 1.9, z: z + 0.8 }, 6));
    this.structural.push(box(0.4, 0.4, 0.4, '#e7dcc4', { x, y: 1.49, z: z - 0.5 }));
    this.structural.push(cylinder(0.18, 0.18, 0.3, 8, '#d9e8e6', { x, y: 1.54, z: z + 0.2 }));

    const texture = this.signTextures.get(label) ?? makeLabelTexture(label, '#fff0c9', 'rgba(24,13,8,0.92)');
    this.signTextures.set(label, texture);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 0.46),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false }),
    );
    mesh.position.set(x - side * 0.62, 1.0, z);
    mesh.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    this.signMeshes.push(mesh);

    this.collision.addBox(x - 0.8, x + 0.8, z - 1.2, z + 1.2, 0, 2.2, 'cart');
  }

  private buildStreetClutter(): void {
    // Sacks and crates outside shops.
    for (let i = 0; i < 34; i++) {
      const side = this.rng() > 0.5 ? 1 : -1;
      const z = range(this.rng, WORLD.playableMinZ + 4, WORLD.playableMaxZ - 4);
      if (this.nearSideStreet(z, 3.5)) continue;
      // Keep the player plot band readable.
      if (z > -22 && z < 88) continue;
      const x = side * range(this.rng, 16.4, 18.6);
      const color = pick(this.rng, ['#a68a5d', '#8c744f', '#b49767', '#7d6545']);
      this.structural.push(sphere(0.3, color, { x, y: 0.28, z }, 7));
      this.structural.push(sphere(0.26, color, { x: x + range(this.rng, -0.3, 0.3), y: 0.22, z: z + range(this.rng, -0.3, 0.3) }, 7));
      if (this.rng() > 0.5) {
        this.structural.push(box(0.75, 0.5, 0.75, pick(this.rng, ['#82663f', '#95764a', '#6d5536']), {
          x,
          y: 0.26,
          z: z + 0.8,
        }));
      }
    }

    // Trash bins and pails near lamp posts.
    for (let i = 0; i < 18; i++) {
      const side = this.rng() > 0.5 ? 1 : -1;
      const z = range(this.rng, WORLD.playableMinZ + 8, WORLD.playableMaxZ - 8);
      if (this.nearSideStreet(z, 3)) continue;
      const x = side * range(this.rng, 17.2, 18.4);
      this.metal.push(cylinder(0.26, 0.24, 0.7, 9, '#42504a', { x, y: 0.35, z }));
      this.metal.push(cylinder(0.28, 0.28, 0.06, 9, '#5d6c65', { x, y: 0.72, z }));
    }

    // Banana trunks and potted plants for a lived-in edge.
    for (let i = 0; i < 20; i++) {
      const side = this.rng() > 0.5 ? 1 : -1;
      const z = range(this.rng, WORLD.playableMinZ + 6, WORLD.playableMaxZ - 6);
      if (this.nearSideStreet(z, 3.5)) continue;
      if (z > -20 && z < 90) continue;
      const x = side * range(this.rng, 16.8, 18.2);
      this.structural.push(cylinder(0.3, 0.36, 0.55, 8, '#7a5a3a', { x, y: 0.28, z }));
      this.fabric.push(sphere(0.55, '#3f6e3d', { x, y: 0.95, z }, 7));
      this.fabric.push(sphere(0.4, '#4c7c44', { x: x + 0.25, y: 1.25, z: z + 0.2 }, 6));
    }

    // Hanging bulbs across the narrower far ends of the street.
    for (let i = 0; i < 7; i++) {
      const z = range(this.rng, WORLD.playableMinZ + 10, -50);
      for (let j = 0; j < 9; j++) {
        const t = j / 8;
        const x = -10 + t * 20;
        const sag = Math.sin(t * Math.PI) * 1.2;
        this.glow.push(sphere(0.055, '#ffd693', { x, y: 4.4 - sag, z }, 5));
      }
    }
  }

  private buildAlleyDetails(): void {
    // Low steps, stacked goods and tarps around the side-street mouths.
    for (const street of WORLD.sideStreets) {
      for (const side of [-1, 1] as Array<-1 | 1>) {
        const x = side * 16.2;
        for (let i = 0; i < 4; i++) {
          const z = street - WORLD.sideStreetHalfWidth + 1.5 + i * 3.2;
          if (this.rng() > 0.55) continue;
          const crateColor = pick(this.rng, ['#74593a', '#8e6a43', '#5f4a31']);
          this.structural.push(box(0.9, 0.45, 0.9, crateColor, { x, y: 0.24, z }));
          this.structural.push(box(0.7, 0.35, 0.7, '#9a784c', { x, y: 0.64, z }));
        }
        // A tarp lean-to at the corner.
        this.fabric.push(box(2.4, 0.08, 3.0, '#4b6470', {
          x: side * 17.2,
          y: 2.5,
          z: street + (side > 0 ? WORLD.sideStreetHalfWidth - 1.6 : -WORLD.sideStreetHalfWidth + 1.6),
          rz: side * 0.13,
        }));
        this.metal.push(cylinder(0.04, 0.04, 2.5, 5, '#3e372e', {
          x: side * 15.9,
          y: 1.25,
          z: street + (side > 0 ? WORLD.sideStreetHalfWidth - 3 : -WORLD.sideStreetHalfWidth + 3),
        }));
      }
    }
  }
}
