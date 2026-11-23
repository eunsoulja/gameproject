import * as THREE from 'three';
import { WORLD } from '../../../shared/layout';
import type { CollisionSystem } from './CollisionSystem';
import {
  MATERIALS,
  addMergedMesh,
  box,
  cylinder,
  jitterColor,
  makeRng,
  makeSignTexture,
  pick,
  range,
  type Random,
} from './utils';

interface WindowPlacement {
  x: number;
  y: number;
  z: number;
  color: string;
}

const BUILDING_COLORS = [
  '#6d5e4d',
  '#7c6b54',
  '#5a5148',
  '#8b7962',
  '#6b5849',
  '#7d665c',
  '#877866',
  '#625f58',
  '#7a5c4b',
  '#696456',
  '#8a7c6c',
  '#60544a',
];

const AWNING_COLORS = [
  ['#b2483e', '#e7d7b5'],
  ['#c78a2b', '#f2e5c8'],
  ['#3f6f8c', '#e5dfcd'],
  ['#4b7a54', '#e6e1ce'],
  ['#805643', '#e6d8bd'],
  ['#83527e', '#eadfd0'],
];

const SHOP_NAMES: Array<[string, string, string]> = [
  ['COLONADE', 'heritage finds', '#e0ad5e'],
  ['SARI-SARI NI NENA', 'open all night', '#71c69b'],
  ['BISAYA BAKERY', 'hot pan de sal', '#f0c36b'],
  ['MANGO AVENUE', 'sweet cebu harvest', '#f4c84a'],
  ['PUSO NI INDAY', 'hanging rice', '#d7b079'],
  ['SIOMAI SA TISA', 'steamed & fried', '#e8854f'],
  ['UKAY NI ATE VI', 'pre-loved treasures', '#b786db'],
  ['CEBU PASALUBONG', 'danggit & dried fish', '#e0a75e'],
  ['LECHON BELLY', 'crispy every hour', '#e47852'],
  ['JEEPNEY PARTS', 'chrome & care', '#78a9c9'],
  ['TINAPANG BISAYA', 'smoked by the sea', '#c6a272'],
  ['GOLDEN COIN', 'pawnshop · jewelry', '#d8b95c'],
  ['VISAYAS TRADING', 'wholesale goods', '#8fb6a1'],
  ['MERCADO CENTRAL', 'colon since 1949', '#e4b56d'],
  ['ROSAL DRUG', '24-hour pharmacy', '#70c6aa'],
  ['COLON OPTICAL', 'clearer horizons', '#7ab2d4'],
  ['HAPUNAN SA KANTO', 'carinderia', '#dd9f5a'],
  ['BEBOT CARINDERIA', 'lutong bahay', '#e1ac61'],
  ['LOLA HOMEMADE', 'kakanin & kape', '#d3a86e'],
  ['KAPE NI TATAY', 'brewed strong', '#c79054'],
  ['ISLA STREETWEAR', 'local threads', '#cf85a4'],
  ['BISAYA CRAFTS', 'gifts & souvenirs', '#a4b56d'],
  ['SABON & MORE', 'sari-sari supplies', '#7bb8bc'],
  ['PARIAN ANTIQUES', 'old colon stories', '#d29b58'],
];

const signTextures: THREE.Texture[] = [];

export class BuildingGenerator {
  private scene: THREE.Scene;
  private collision: CollisionSystem;
  private rng: Random;
  private structural: THREE.BufferGeometry[] = [];
  private fabric: THREE.BufferGeometry[] = [];
  private glowing: THREE.BufferGeometry[] = [];
  private metal: THREE.BufferGeometry[] = [];
  private windows: WindowPlacement[] = [];
  private signs: THREE.Mesh[] = [];

  constructor(scene: THREE.Scene, collision: CollisionSystem) {
    this.scene = scene;
    this.collision = collision;
    this.rng = makeRng(88421);
  }

  build(): void {
    this.prepareSigns();
    const sides: Array<-1 | 1> = [-1, 1];
    for (const side of sides) this.buildSide(side);
    this.buildSideStreets();
    addMergedMesh(this.scene, this.structural, MATERIALS.structure(), 'building-structure');
    addMergedMesh(this.scene, this.fabric, MATERIALS.fabric(), 'building-awnings');
    addMergedMesh(this.scene, this.glowing, MATERIALS.glow(), 'building-lights');
    addMergedMesh(this.scene, this.metal, MATERIALS.metal(), 'building-metal');
    this.buildWindowInstances();
  }

  private prepareSigns(): void {
    const accents = ['#e0ad5e', '#71c69b', '#f0c36b', '#f4c84a', '#d7b079', '#e8854f', '#b786db', '#c6a272', '#d8b95c', '#78a9c9'];
    SHOP_NAMES.forEach(([title, subtitle], index) => {
      signTextures.push(
        makeSignTexture(title, subtitle, {
          accent: accents[index % accents.length],
          dark: '#140e0a',
        }),
      );
    });
  }

  private buildSide(side: -1 | 1): void {
    const facadeX = side * 19.8;
    const inner = -side;
    const available = this.frontSegments();

    for (const segment of available) {
      const width = segment.end - segment.start;
      const midZ = (segment.start + segment.end) / 2;
      const depth = range(this.rng, 11, 20);
      const height = this.pickHeight(midZ);
      const color = jitterColor(pick(this.rng, BUILDING_COLORS), this.rng, 0.028);
      const centerX = facadeX + side * (depth / 2);

      this.structural.push(box(depth, height, width, color, { x: centerX, y: height / 2, z: midZ }));
      // Roof cap and cornice.
      this.structural.push(box(depth + 0.55, 0.55, width + 0.55, '#3b342d', { x: centerX, y: height + 0.26, z: midZ }));
      this.structural.push(box(0.18, 0.28, width + 0.3, jitterColor(color, this.rng, 0.07), { x: facadeX + inner * 0.09, y: height - 0.18, z: midZ }));
      // Ground floor frame.
      this.structural.push(box(0.5, 0.24, width + 0.2, '#2d2924', { x: facadeX + inner * 0.1, y: 0.12, z: midZ }));

      const shopfrontWidth = Math.min(width - 1.5, range(this.rng, 4.2, 8.6));
      const shopfrontZ = midZ + range(this.rng, -1.3, 1.3);
      const warm = this.rng() > 0.28;
      // Recessed storefront glow behind a frame.
      this.glowing.push(box(0.07, 2.15, shopfrontWidth, warm ? pick(this.rng, ['#ffd9a0', '#ffc477', '#f6e5c2', '#a8d7e8']) : '#6c8796', {
        x: facadeX + inner * 0.04,
        y: 1.55,
        z: shopfrontZ,
      }));
      this.structural.push(box(0.12, 2.45, 0.22, '#2a241f', { x: facadeX + inner * 0.1, y: 1.35, z: shopfrontZ - shopfrontWidth / 2 }));
      this.structural.push(box(0.12, 2.45, 0.22, '#2a241f', { x: facadeX + inner * 0.1, y: 1.35, z: shopfrontZ + shopfrontWidth / 2 }));
      for (let i = 0; i < 2; i++) {
        this.structural.push(box(0.12, 2.35, 0.12, '#312a22', {
          x: facadeX + inner * 0.1,
          y: 1.33,
          z: shopfrontZ - shopfrontWidth / 3 + (i * shopfrontWidth) / 3,
        }));
      }
      // Doorway.
      this.structural.push(box(0.1, 2.45, 0.9, '#211b17', {
        x: facadeX + inner * 0.09,
        y: 1.25,
        z: shopfrontZ + shopfrontWidth / 2 + 0.75,
      }));
      this.glowing.push(box(0.06, 0.35, 0.16, '#ffd382', {
        x: facadeX + inner * 0.13,
        y: 1.9,
        z: shopfrontZ + shopfrontWidth / 2 + 0.38,
      }));

      // Striped awning over the storefront.
      const awningColors = pick(this.rng, AWNING_COLORS);
      const awningWidth = Math.min(width - 0.9, shopfrontWidth + range(this.rng, 0.8, 2.2));
      const awningDepth = range(this.rng, 1.5, 2.6);
      const awningCenterX = facadeX + inner * (awningDepth / 2 + 0.1);
      const awningY = 3.2;
      const slots = Math.max(3, Math.round(awningWidth / 0.8));
      for (let i = 0; i < slots; i++) {
        const slotWidth = awningWidth / slots;
        this.fabric.push(box(awningDepth, 0.1, slotWidth * 0.94, i % 2 === 0 ? awningColors[0] : awningColors[1], {
          x: awningCenterX,
          y: awningY - i * 0.004,
          z: shopfrontZ - awningWidth / 2 + slotWidth * (i + 0.5),
          rz: inner * 0.09,
        }));
      }
      this.structural.push(box(0.08, 0.7, awningWidth, '#34302b', {
        x: facadeX + inner * 0.06,
        y: 3.45,
        z: shopfrontZ,
      }));
      // Warm bulbs on the awning.
      for (let i = 0; i < Math.max(2, Math.round(awningWidth / 1.5)); i++) {
        this.glowing.push(cylinder(0.055, 0.055, 0.08, 6, '#ffc97d', {
          x: facadeX + inner * (awningDepth + 0.1),
          y: 3.13,
          z: shopfrontZ - awningWidth / 2 + 0.8 + i * 1.5,
        }));
      }

      // Big hand-painted sign on the facade.
      if (this.rng() > 0.16) {
        this.addSign(side, facadeX, shopfrontZ, Math.min(8.4, width - 1.6), height);
      } else {
        this.addBanner(side, facadeX, shopfrontZ, width);
      }

      const floorCount = Math.max(1, Math.floor((height - 4.7) / 3.1));
      for (let floor = 0; floor < floorCount; floor++) {
        const y = 5.3 + floor * 3.05;
        if (y + 1.2 > height) break;
        const cols = Math.max(2, Math.floor((width - 1.2) / 2.2));
        const spacing = (width - 1.2) / cols;
        const hasBalcony = this.rng() > 0.64 && floor === 0;
        for (let col = 0; col < cols; col++) {
          const z = segment.start + 0.6 + spacing * (col + 0.5);
          const lit = this.rng() > 0.45;
          const windowColor = lit
            ? pick(this.rng, ['#ffd188', '#ffc06d', '#ffe0aa', '#9fcfe6', '#e7b878'])
            : pick(this.rng, ['#1b2229', '#22201f', '#172029', '#261d17']);
          this.windows.push({ x: facadeX + inner * 0.02, y, z, color: windowColor });
          this.structural.push(box(0.07, 1.28, 0.92, '#2e2923', { x: facadeX + inner * 0.055, y: y + 0.02, z }));
          // Window mullions.
          this.structural.push(box(0.085, 0.06, 0.96, '#4b4033', { x: facadeX + inner * 0.09, y: y + 0.02, z }));
          if (lit && this.rng() > 0.6) {
            this.glowing.push(box(0.03, 0.12, 0.23, '#fff1c9', {
              x: facadeX + inner * 0.09,
              y: y + 0.02,
              z,
            }));
          }
        }
        if (hasBalcony) {
          const balconyWidth = Math.min(width - 0.7, range(this.rng, 3, 5.5));
          const bx = facadeX + inner * 0.9;
          this.structural.push(box(1.75, 0.15, balconyWidth, '#76614a', { x: bx, y: 4.55, z: midZ }));
          this.structural.push(box(1.75, 0.08, 0.08, '#42362a', { x: bx, y: 5.35, z: midZ - balconyWidth / 2 }));
          this.structural.push(box(1.75, 0.08, 0.08, '#42362a', { x: bx, y: 5.35, z: midZ + balconyWidth / 2 }));
          const railCount = Math.round(balconyWidth / 0.9);
          for (let j = 0; j < railCount; j++) {
            this.structural.push(box(0.06, 0.8, 0.06, '#3c3127', {
              x: bx + inner * 0.75,
              y: 4.95,
              z: midZ - balconyWidth / 2 + (balconyWidth * (j + 0.5)) / railCount,
            }));
          }
          // A plant or laundry line on the balcony.
          if (this.rng() > 0.5) {
            this.structural.push(cylinder(0.24, 0.18, 0.3, 7, '#75543d', {
              x: bx,
              y: 4.75,
              z: midZ + balconyWidth * 0.25,
            }));
            this.fabric.push(box(1.1, 0.75, 0.06, pick(this.rng, ['#d2c5a7', '#b84c45', '#5b8b9d', '#dbad55']), {
              x: bx + inner * 0.2,
              y: 4.2,
              z: midZ - balconyWidth * 0.24,
            }));
          }
        }
      }

      // Air conditioners and pipes.
      const acCount = Math.floor(this.rng() * 3);
      for (let i = 0; i < acCount; i++) {
        this.metal.push(box(0.6, 0.48, 0.9, '#787b76', {
          x: facadeX + inner * 0.32,
          y: range(this.rng, 5.6, Math.max(6, height - 2)),
          z: midZ + range(this.rng, -width / 2 + 0.7, width / 2 - 0.7),
        }));
      }
      this.structural.push(cylinder(0.07, 0.07, height, 6, '#38312b', {
        x: facadeX + inner * 0.06,
        y: height / 2,
        z: midZ + width / 2 - 0.25,
      }));

      // Rooftop details.
      if (this.rng() > 0.4) {
        const tankX = centerX + range(this.rng, -depth * 0.25, depth * 0.25);
        const tankZ = midZ + range(this.rng, -width * 0.3, width * 0.3);
        this.structural.push(cylinder(1.0, 1.0, 1.55, 10, '#5d6770', { x: tankX, y: height + 1.1, z: tankZ }));
        this.metal.push(cylinder(0.08, 0.08, 0.8, 6, '#3b3c3b', { x: tankX - 0.45, y: height + 0.4, z: tankZ - 0.45 }));
        this.metal.push(cylinder(0.08, 0.08, 0.8, 6, '#3b3c3b', { x: tankX + 0.45, y: height + 0.4, z: tankZ + 0.45 }));
      }
      if (this.rng() > 0.37) {
        this.metal.push(cylinder(0.025, 0.025, 4.2, 4, '#272522', { x: centerX, y: height + 2.1, z: midZ + width * 0.2 }));
        this.metal.push(box(1.1, 0.035, 0.035, '#272522', { x: centerX, y: height + 3.4, z: midZ + width * 0.2 }));
      }
      if (this.rng() > 0.5) {
        this.structural.push(box(1.3, 0.55, 1.05, '#4b4641', {
          x: centerX + range(this.rng, -3, 3),
          y: height + 0.55,
          z: midZ + range(this.rng, -width * 0.3, width * 0.3),
        }));
      }

      // Wires stapled down the facade.
      if (this.rng() > 0.6) {
        this.metal.push(box(0.05, range(this.rng, 3, 8), 0.05, '#141311', {
          x: facadeX + inner * 0.1,
          y: range(this.rng, 5, height - 1),
          z: midZ + width * 0.32,
        }));
      }

      // A fold-out tarp stall just outside some shops keeps the street dense.
      if (this.rng() > 0.55) {
        const tarpColor = pick(this.rng, ['#5d7f89', '#8b4f45', '#8b7c4a', '#4e6c57']);
        const tarpZ = midZ + range(this.rng, -width * 0.3, width * 0.3);
        const tarpDepth = range(this.rng, 2.2, 3.4);
        this.fabric.push(box(tarpDepth, 0.07, range(this.rng, 2.5, 3.8), tarpColor, {
          x: facadeX + inner * (tarpDepth / 2 + 0.2),
          y: 2.85,
          z: tarpZ,
          rz: inner * 0.08,
        }));
        this.metal.push(cylinder(0.035, 0.035, 2.8, 5, '#4b443a', {
          x: facadeX + inner * (tarpDepth + 0.15),
          y: 1.4,
          z: tarpZ - 1.5,
        }));
        this.metal.push(cylinder(0.035, 0.035, 2.8, 5, '#4b443a', {
          x: facadeX + inner * (tarpDepth + 0.15),
          y: 1.4,
          z: tarpZ + 1.5,
        }));
      }

      this.collision.addBox(
        Math.min(facadeX, facadeX + side * depth),
        Math.max(facadeX, facadeX + side * depth),
        segment.start,
        segment.end,
        0,
        height + 1,
        'building',
      );
    }

    // The second, taller row behind the street frontage.
    let z = -244;
    while (z < 244) {
      const width = range(this.rng, 13, 24);
      const midZ = z + width / 2;
      const depth = range(this.rng, 12, 22);
      const height = range(this.rng, 14, 38);
      const x = side * (41 + depth / 2 + range(this.rng, 0, 3));
      const color = jitterColor(pick(this.rng, BUILDING_COLORS), this.rng, 0.05);
      this.structural.push(box(depth, height, width, color, { x, y: height / 2, z: midZ }));
      this.structural.push(box(depth + 0.5, 0.4, width + 0.5, '#2a2925', { x, y: height + 0.2, z: midZ }));
      if (this.rng() > 0.35) {
        this.glowing.push(box(0.06, 1.4, width * 0.55, pick(this.rng, ['#ffd28f', '#ffbd6a', '#7fb6cd']), {
          x: side * (41 - 0.03),
          y: 2.4,
          z: midZ,
        }));
      }
      const rows = Math.floor((height - 3) / 3.2);
      const cols = Math.floor((width - 2) / 2.8);
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          if (this.rng() > 0.55) continue;
          this.windows.push({
            x: side * (41 - 0.02),
            y: 3.2 + row * 3.2,
            z: z + 1.4 + col * 2.8,
            color: this.rng() > 0.45 ? '#ffcc85' : '#29313a',
          });
        }
      }
      z += width + range(this.rng, 0.3, 2.2);
    }
  }

  private frontSegments(): Array<{ start: number; end: number }> {
    const segments: Array<{ start: number; end: number }> = [];
    let z: number = WORLD.minZ;
    const gaps = WORLD.sideStreets.map((street) => [street - WORLD.sideStreetHalfWidth - 1.2, street + WORLD.sideStreetHalfWidth + 1.2] as [number, number]);
    while (z < WORLD.maxZ) {
      const gap = gaps.find(([start, end]) => z >= start && z < end);
      if (gap) {
        z = gap[1];
        continue;
      }
      const nextGap = gaps.find(([start]) => start > z);
      let width = range(this.rng, 9.5, 19);
      if (nextGap) width = Math.min(width, nextGap[0] - z);
      if (width < 4) {
        z += width + 0.8;
        continue;
      }
      segments.push({ start: z + 0.55, end: z + width - 0.55 });
      z += width + range(this.rng, 0.4, 1.3);
    }
    return segments;
  }

  private pickHeight(z: number): number {
    // Slight landmarks: a couple of taller heritage buildings near the market heart.
    if (z > 20 && z < 80) return range(this.rng, 16, 26);
    if (z > -90 && z < -20) return range(this.rng, 12, 23);
    return range(this.rng, 8.5, 21);
  }

  private addSign(side: -1 | 1, facadeX: number, z: number, width: number, height: number): void {
    const texture = signTextures[Math.floor(this.rng() * signTextures.length)];
    const signWidth = Math.min(width, Math.max(4.4, width * 0.8));
    const signHeight = signWidth * 0.22;
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      toneMapped: false,
      transparent: true,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(signWidth, signHeight), material);
    const inner = -side;
    plane.position.set(facadeX + inner * 0.065, 4.35, z);
    plane.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    plane.renderOrder = 2;
    this.scene.add(plane);
    this.signs.push(plane);

    // A small projecting blade sign catches the eye from up the street.
    if (this.rng() > 0.63 && height > 8) {
      const blade = new THREE.Mesh(
        new THREE.PlaneGeometry(signWidth * 0.6, signHeight * 0.9),
        new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, transparent: true, side: THREE.DoubleSide }),
      );
      blade.position.set(facadeX + inner * 1.3, 6.2, z + signWidth * 0.42);
      blade.rotation.y = 0;
      this.scene.add(blade);
      this.signs.push(blade);
      this.metal.push(box(0.05, 0.05, 1.4, '#2e2a25', {
        x: facadeX + inner * 0.7,
        y: 6.2,
        z: z + signWidth * 0.42,
      }));
    }
  }

  private addBanner(side: -1 | 1, facadeX: number, z: number, width: number): void {
    const inner = -side;
    const colors = ['#c75445', '#e0a23d', '#4c8292', '#5a8e63'];
    const banner = pick(this.rng, colors);
    const height = range(this.rng, 4, 6.5);
    this.fabric.push(box(0.06, height, Math.min(2.4, width - 2), banner, {
      x: facadeX + inner * 0.15,
      y: 4.8,
      z,
    }));
    this.glowing.push(box(0.04, 0.1, Math.min(2.4, width - 2) * 0.88, '#f2dcb5', {
      x: facadeX + inner * 0.2,
      y: 4.9,
      z,
    }));
  }

  private buildWindowInstances(): void {
    const geometry = new THREE.BoxGeometry(0.07, 1.04, 0.76);
    const material = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
    const mesh = new THREE.InstancedMesh(geometry, material, this.windows.length);
    mesh.frustumCulled = false;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    this.windows.forEach((window, index) => {
      dummy.position.set(window.x, window.y, window.z);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      mesh.setColorAt(index, color.set(window.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.scene.add(mesh);
  }

  private buildSideStreets(): void {
    const roadMaterial = new THREE.MeshStandardMaterial({
      color: '#202226',
      roughness: 0.94,
      metalness: 0.05,
    });
    const lampMaterial = new THREE.MeshBasicMaterial({ color: '#ffc977', toneMapped: false });
    for (const z of WORLD.sideStreets) {
      for (const side of [-1, 1]) {
        const road = new THREE.Mesh(new THREE.PlaneGeometry(35, WORLD.sideStreetHalfWidth * 2 + 2), roadMaterial);
        road.rotation.x = -Math.PI / 2;
        road.position.set(side * 37, 0.005, z);
        this.scene.add(road);

        // Lit alley sign in the distance — the street keeps going even where you can't.
        const frame = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.2), new THREE.MeshBasicMaterial({
          color: '#20140d',
          toneMapped: false,
        }));
        frame.position.set(side * 52, 3.6, z - 0.1);
        frame.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        this.scene.add(frame);
        const text = new THREE.Mesh(
          new THREE.PlaneGeometry(3.1, 0.9),
          new THREE.MeshBasicMaterial({
            map: signTextures[(WORLD.sideStreets.indexOf(z) + (side > 0 ? 1 : 0) + 5) % signTextures.length],
            transparent: true,
            toneMapped: false,
          }),
        );
        text.position.set(side * 52 - side * 0.03, 3.6, z - 0.1);
        text.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        this.scene.add(text);

        for (let i = 0; i < 4; i++) {
          const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), lampMaterial);
          bulb.position.set(side * (23 + i * 7), 4.4, z + WORLD.sideStreetHalfWidth * 0.45);
          this.scene.add(bulb);
        }
        // Warm haze at the alley end.
        const glow = new THREE.Mesh(
          new THREE.PlaneGeometry(7, 4),
          new THREE.MeshBasicMaterial({ color: '#d7883f', transparent: true, opacity: 0.1, depthWrite: false, toneMapped: false }),
        );
        glow.position.set(side * 52, 2, z);
        glow.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        this.scene.add(glow);
      }
    }
  }
}
