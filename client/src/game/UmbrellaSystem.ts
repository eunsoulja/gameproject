import * as THREE from 'three';
import { WORLD } from '../../../shared/layout';
import {
  MATERIALS,
  addMergedMesh,
  box,
  cylinder,
  makeGlowSprite,
  makeGlowTexture,
  makeRng,
  pick,
  range,
  sphere,
  type Random,
} from './utils';

const UMBRELLA_COLORS = [
  '#d94a3f',
  '#e9a63a',
  '#3f80b8',
  '#4b9663',
  '#b75d9b',
  '#e1733e',
  '#52a8a0',
  '#e8c84a',
  '#8c62c4',
  '#cf6b85',
];

interface UmbrellaPlacement {
  x: number;
  z: number;
  y: number;
  radius: number;
  tiltX: number;
  tiltZ: number;
  color: string;
  trim: string;
}

/** A canopy of bright Filipino umbrellas strung above the whole length of Colon. */
export class UmbrellaSystem {
  private scene: THREE.Scene;
  private rng: Random;
  private fabric: THREE.BufferGeometry[] = [];
  private metal: THREE.BufferGeometry[] = [];
  private glow: THREE.BufferGeometry[] = [];
  private sprites: THREE.Sprite[] = [];
  private glowTexture = makeGlowTexture();
  private placements: UmbrellaPlacement[] = [];
  private group = new THREE.Group();
  private built = false;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.rng = makeRng(90311);
  }

  build(): void {
    if (this.built) return;
    this.built = true;
    this.group.name = 'overhead-umbrellas';
    this.scene.add(this.group);
    this.plan();
    for (const umbrella of this.placements) this.addUmbrella(umbrella);
    addMergedMesh(this.group, this.fabric, MATERIALS.fabric(), 'umbrella-canopies');
    addMergedMesh(this.group, this.metal, MATERIALS.metal(), 'umbrella-ribs');
    addMergedMesh(this.group, this.glow, MATERIALS.glow(), 'umbrella-bulbs');
    for (const sprite of this.sprites) this.group.add(sprite);
  }

  update(_dt: number, elapsed: number): void {
    this.group.position.y = Math.sin(elapsed * 0.42) * 0.035;
    for (let i = 0; i < this.sprites.length; i++) {
      const sprite = this.sprites[i];
      const pulse = 0.9 + 0.1 * Math.sin(elapsed * 1.8 + i * 1.7);
      sprite.scale.setScalar((1.0 + (i % 3) * 0.18) * pulse);
    }
  }

  private plan(): void {
    let z = WORLD.playableMinZ + 3;
    let row = 0;
    while (z < WORLD.playableMaxZ - 3) {
      const spacing = range(this.rng, 4.6, 7.0);
      const count = this.rng() > 0.24 ? 2 + Math.floor(this.rng() * 3) : 1;
      for (let i = 0; i < count; i++) {
        const lane = count === 1 ? range(this.rng, -10, 10) : -15 + (30 * (i + 0.5)) / count + range(this.rng, -2.4, 2.4);
        // Leave a little sky above the widest part of the street now and then.
        if (this.rng() > 0.17) {
          const color = pick(this.rng, UMBRELLA_COLORS);
          this.placements.push({
            x: lane,
            z: z + range(this.rng, -1.1, 1.1),
            y: range(this.rng, 3.95, 5.4) + (row % 2 === 0 ? 0.35 : 0),
            radius: range(this.rng, 1.35, 2.15),
            tiltX: range(this.rng, -0.3, 0.3),
            tiltZ: range(this.rng, -0.3, 0.3),
            color,
            trim: pick(this.rng, ['#f6e4be', '#f3d18f', '#f7efe0', '#d8e9e2']),
          });
        }
      }
      z += spacing;
      row++;
    }

    // A few special clusters near the entrance and at the fiesta corners.
    for (const cz of [WORLD.archZ - 12, -62, 64, 118]) {
      for (let i = 0; i < 3; i++) {
        const color = pick(this.rng, ['#f0c14c', '#d94a3f', '#3f8ccc']);
        this.placements.push({
          x: -8 + i * 8,
          z: cz + range(this.rng, -2, 2),
          y: range(this.rng, 4.5, 5.6),
          radius: range(this.rng, 1.6, 2.25),
          tiltX: range(this.rng, -0.16, 0.16),
          tiltZ: range(this.rng, -0.16, 0.16),
          color,
          trim: '#ffe7b4',
        });
      }
    }
  }

  private addUmbrella(u: UmbrellaPlacement): void {
    const segments = 8;
    // Canopy: two shallow cones, the inner one acting as the underside lining.
    const canopy = new THREE.ConeGeometry(u.radius, u.radius * 0.46, segments, 1, true);
    canopy.rotateY(this.rng() * Math.PI);
    canopy.rotateX(u.tiltX);
    canopy.rotateZ(u.tiltZ);
    canopy.translate(u.x, u.y, u.z);
    this.fabric.push(colorize(canopy, u.color));

    const lining = new THREE.ConeGeometry(u.radius * 0.9, u.radius * 0.34, segments, 1, true);
    lining.rotateX(u.tiltX);
    lining.rotateZ(u.tiltZ);
    lining.translate(u.x, u.y - 0.075, u.z);
    this.fabric.push(colorize(lining, u.trim, true));

    // Scalloped edge dashes give the silhouette a market-fair feel.
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const rx = Math.cos(angle) * u.radius * 0.94;
      const rz = Math.sin(angle) * u.radius * 0.94;
      this.fabric.push(box(0.22, 0.16, 0.06, i % 2 ? u.color : u.trim, {
        x: u.x + rx,
        y: u.y - u.radius * 0.19 - 0.02,
        z: u.z + rz,
        ry: -angle,
        rz: u.tiltZ * 0.5,
      }));
      // Ribs underneath.
      this.metal.push(box(u.radius * 0.9, 0.022, 0.022, '#5b4a36', {
        x: u.x + Math.cos(angle) * u.radius * 0.43,
        y: u.y - u.radius * 0.1,
        z: u.z + Math.sin(angle) * u.radius * 0.43,
        ry: -angle,
        rz: Math.PI / 2 + u.tiltZ * 0.3,
      }));
    }

    // Central hub, finial and hanging cord.
    this.metal.push(cylinder(0.055, 0.07, 0.22, 6, '#5a4b39', {
      x: u.x,
      y: u.y + u.radius * 0.19,
      z: u.z,
    }));
    this.metal.push(sphere(0.09, '#e9c57c', { x: u.x, y: u.y + u.radius * 0.29, z: u.z }, 6));
    this.metal.push(box(0.018, range(this.rng, 0.6, 1.6), 0.018, '#2c2720', {
      x: u.x,
      y: u.y + u.radius * 0.3 + 0.55,
      z: u.z,
    }));

    // A warm bulb dangling beneath a third of the umbrellas.
    if (this.rng() > 0.62) {
      const bulbY = u.y - u.radius * 0.24 - 0.35;
      this.metal.push(box(0.012, 0.35, 0.012, '#2a251e', { x: u.x + 0.15, y: bulbY + 0.18, z: u.z }));
      this.glow.push(sphere(0.075, '#ffcf86', { x: u.x + 0.15, y: bulbY, z: u.z }, 6));
      const sprite = makeGlowSprite(this.glowTexture, '#ffb35f', range(this.rng, 0.8, 1.35));
      sprite.position.set(u.x + 0.15, bulbY, u.z);
      this.sprites.push(sprite);
    }
  }
}

function colorize(geometry: THREE.BufferGeometry, color: THREE.ColorRepresentation, underside = false): THREE.BufferGeometry {
  const attr = geometry.getAttribute('position');
  const colors = new Float32Array(attr.count * 3);
  const c = new THREE.Color(color);
  const shade = underside ? 0.74 : 1;
  for (let i = 0; i < attr.count; i++) {
    colors[i * 3] = c.r * shade;
    colors[i * 3 + 1] = c.g * shade;
    colors[i * 3 + 2] = c.b * shade;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}
