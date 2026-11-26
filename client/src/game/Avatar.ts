import * as THREE from 'three';
import type { Appearance } from '../../../shared/types';
import { box as coloredBox, makeNameTagTexture, merge } from './utils';

export interface AvatarOptions {
  appearance: Appearance;
  name?: string;
  subtitle?: string;
  scale?: number;
  shadows?: boolean;
}

type AnimState = 'idle' | 'walk' | 'run' | 'jump';

/**
 * A chunky, Roblox-inspired blocky humanoid with a hand-built face and a
 * simple limb-swing animation. Shared by the player, remote vendors and NPCs.
 */
export class Avatar {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private head: THREE.Mesh;
  private hair: THREE.Mesh;
  private torso: THREE.Mesh;
  private leftArm: THREE.Group;
  private rightArm: THREE.Group;
  private leftLeg: THREE.Group;
  private rightLeg: THREE.Group;
  private tag: THREE.Sprite | null = null;
  private tagTexture: THREE.Texture | null = null;
  private tagVisible = true;
  private phase = Math.random() * Math.PI * 2;
  private anim: AnimState = 'idle';
  private lean = 0;
  private emote: string | null = null;
  private colorTargets: Array<{ material: THREE.MeshLambertMaterial; part: AvatarPart }> = [];
  private materials: THREE.Material[] = [];
  private geometries: THREE.BufferGeometry[] = [];
  private shadow: boolean;

  constructor(options: AvatarOptions) {
    const appearance = options.appearance;
    this.shadow = options.shadows ?? true;
    this.root.add(this.body);
    this.root.scale.setScalar(options.scale ?? 1);

    const shirt = this.material(appearance.shirt);
    const pants = this.material(appearance.pants);
    const skin = this.material(appearance.skin);
    const hair = this.material(appearance.hair);
    const shoe = this.material('#22242a');

    // Legs.
    this.leftLeg = this.limb(-0.145, 0.74);
    this.rightLeg = this.limb(0.145, 0.74);
    const legGeo = this.boxGeo(0.24, 0.68, 0.26);
    const leftLegMesh = this.mesh(legGeo, pants, 0, -0.34, 0);
    const rightLegMesh = this.mesh(legGeo, pants, 0, -0.34, 0);
    this.leftLeg.add(leftLegMesh);
    this.rightLeg.add(rightLegMesh);
    this.leftLeg.add(this.mesh(this.boxGeo(0.26, 0.12, 0.32), shoe, 0, -0.68, 0.03));
    this.rightLeg.add(this.mesh(this.boxGeo(0.26, 0.12, 0.32), shoe, 0, -0.68, 0.03));
    this.body.add(this.leftLeg, this.rightLeg);

    // Torso.
    this.torso = this.mesh(this.boxGeo(0.52, 0.66, 0.3), shirt, 0, 1.07, 0);
    this.body.add(this.torso);
    this.body.add(this.mesh(this.boxGeo(0.54, 0.1, 0.32), shirt, 0, 0.77, 0));
    // Accessories are merged into a single vertex-coloured draw call.
    const accessoryGeo = merge([
      coloredBox(0.3, 0.16, 0.02, '#e7ddc5', { x: 0, y: 0.96, z: 0.16 }),
      coloredBox(0.2, 0.08, 0.32, appearance.skin, { x: 0, y: 1.38, z: 0 }),
      coloredBox(0.2, 0.28, 0.35, '#7d5736', { x: 0.36, y: 0.98, z: 0 }),
      coloredBox(0.03, 0.62, 0.03, '#57402a', { x: 0.3, y: 1.2, z: 0.14 }),
      coloredBox(0.44, 0.07, 0.02, '#ece2cb', { x: 0, y: 1.28, z: 0.17 }),
    ]);
    if (accessoryGeo) {
      this.geometries.push(accessoryGeo);
      const accessoryMat = this.material('#ffffff');
      accessoryMat.vertexColors = true;
      this.body.add(new THREE.Mesh(accessoryGeo, accessoryMat));
    }

    // Arms.
    this.leftArm = this.limb(-0.36, 1.32);
    this.rightArm = this.limb(0.36, 1.32);
    const armGeo = this.boxGeo(0.19, 0.56, 0.22);
    const leftArmMesh = this.mesh(armGeo, shirt, 0, -0.26, 0);
    const rightArmMesh = this.mesh(armGeo, shirt, 0, -0.26, 0);
    this.leftArm.add(leftArmMesh, this.mesh(this.boxGeo(0.2, 0.14, 0.23), skin, 0, -0.58, 0));
    this.rightArm.add(rightArmMesh, this.mesh(this.boxGeo(0.2, 0.14, 0.23), skin, 0, -0.58, 0));
    this.body.add(this.leftArm, this.rightArm);

    // Head.
    this.head = this.mesh(this.boxGeo(0.4, 0.4, 0.38), skin, 0, 1.63, 0);
    this.body.add(this.head);
    this.hair = this.mesh(this.boxGeo(0.43, 0.14, 0.41), hair, 0, 1.82, -0.005);
    this.body.add(this.hair);
    this.body.add(this.mesh(this.boxGeo(0.42, 0.18, 0.08), hair, 0, 1.74, -0.17));

    // Face — all the tiny details merged into one draw call.
    const faceParts: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
      faceParts.push(coloredBox(0.09, 0.1, 0.02, '#f8f2e5', { x: side * 0.1, y: 1.65, z: 0.191 }));
      faceParts.push(coloredBox(0.045, 0.065, 0.025, '#201814', { x: side * 0.1, y: 1.65, z: 0.203 }));
      faceParts.push(coloredBox(0.11, 0.02, 0.02, '#201814', { x: side * 0.1, y: 1.73, z: 0.195 }));
    }
    faceParts.push(coloredBox(0.16, 0.035, 0.02, '#8b4f43', { x: 0, y: 1.52, z: 0.196 }));
    faceParts.push(coloredBox(0.04, 0.03, 0.02, appearance.skin, { x: 0, y: 1.57, z: 0.2 }));
    faceParts.push(coloredBox(0.06, 0.06, 0.04, appearance.skin, { x: 0, y: 1.59, z: 0.2 }));
    const faceGeo = merge(faceParts);
    if (faceGeo) {
      this.geometries.push(faceGeo);
      const faceMat = this.material('#ffffff');
      faceMat.vertexColors = true;
      this.body.add(new THREE.Mesh(faceGeo, faceMat));
    }

    this.colorTargets = [
      { material: (leftLegMesh.material as THREE.MeshLambertMaterial), part: 'pants' },
      { material: (rightLegMesh.material as THREE.MeshLambertMaterial), part: 'pants' },
      { material: (this.torso.material as THREE.MeshLambertMaterial), part: 'shirt' },
      { material: (leftArmMesh.material as THREE.MeshLambertMaterial), part: 'shirt' },
      { material: (rightArmMesh.material as THREE.MeshLambertMaterial), part: 'shirt' },
      { material: (this.head.material as THREE.MeshLambertMaterial), part: 'skin' },
      { material: (this.hair.material as THREE.MeshLambertMaterial), part: 'hair' },
    ];

    if (options.name) this.setNameTag(options.name, options.subtitle ?? '');
    this.setShadows(this.shadow);
  }

  private limb(x: number, y: number): THREE.Group {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    return pivot;
  }

  private material(color: string): THREE.MeshLambertMaterial {
    const material = new THREE.MeshLambertMaterial({ color });
    this.materials.push(material);
    return material;
  }

  private boxGeo(w: number, h: number, d: number): THREE.BoxGeometry {
    const geometry = new THREE.BoxGeometry(w, h, d);
    this.geometries.push(geometry);
    return geometry;
  }

  private mesh(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = this.shadow;
    mesh.receiveShadow = false;
    return mesh;
  }

  setAppearance(appearance: Appearance): void {
    const map: Record<AvatarPart, string> = {
      shirt: appearance.shirt,
      pants: appearance.pants,
      skin: appearance.skin,
      hair: appearance.hair,
    };
    for (const target of this.colorTargets) {
      target.material.color.set(map[target.part]);
    }
  }

  setNameTag(name: string, subtitle = ''): void {
    if (this.tag) {
      this.root.remove(this.tag);
      this.tagTexture?.dispose();
      (this.tag.material as THREE.SpriteMaterial).dispose();
      this.tag = null;
      this.tagTexture = null;
    }
    if (!name) return;
    const texture = makeNameTagTexture(name, subtitle);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(1.5, 0.47, 1);
    sprite.position.set(0, 2.16, 0);
    sprite.renderOrder = 4;
    this.root.add(sprite);
    this.tag = sprite;
    this.tagTexture = texture;
    this.setNameVisible(this.tagVisible);
  }

  setNameVisible(visible: boolean): void {
    this.tagVisible = visible;
    if (this.tag) this.tag.visible = visible;
  }

  setShadows(enabled: boolean): void {
    this.shadow = enabled;
    this.body.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        (child as THREE.Mesh).castShadow = enabled;
      }
    });
  }

  get position(): THREE.Vector3 {
    return this.root.position;
  }

  setAnim(anim: AnimState): void {
    this.anim = anim;
  }

  /**
   * Play a one-shot gesture (wave, dance, point, cheer). Pass null to clear.
   * Driven by `elapsed` so remote players stay roughly in sync.
   */
  setEmote(emote: string | null): void {
    this.emote = emote;
    if (emote) this.phase = 0;
  }

  /** Drive limb motion from ground speed in metres per second. */
  update(dt: number, elapsed: number, speed = 0): void {
    const moving = speed > 0.08;
    const running = speed > 4.2;
    const anim: AnimState = this.anim === 'jump' ? 'jump' : moving ? (running ? 'run' : 'walk') : 'idle';
    const rate = running ? 12.5 : 8.2;
    if (moving && this.anim !== 'jump') {
      this.phase += dt * rate * Math.min(1.4, 0.65 + speed / 5);
    } else if (this.anim !== 'jump') {
      this.phase += dt * 1.2;
    }

    let swing = 0;
    let armSwing = 0;
    let bob = 0;
    if (anim === 'walk') {
      swing = Math.sin(this.phase) * 0.55;
      armSwing = Math.sin(this.phase) * 0.45;
      bob = Math.abs(Math.cos(this.phase)) * 0.03;
    } else if (anim === 'run') {
      swing = Math.sin(this.phase) * 0.82;
      armSwing = Math.sin(this.phase) * 0.7;
      bob = Math.abs(Math.cos(this.phase)) * 0.055;
    } else if (anim === 'jump') {
      swing = 0.45;
      armSwing = -0.8;
      bob = 0.03;
    } else {
      armSwing = Math.sin(this.phase * 0.9) * 0.045;
      swing = 0.02;
      bob = Math.sin(this.phase * 1.1) * 0.01;
    }

    const targetLean = anim === 'run' ? 0.12 : anim === 'walk' ? 0.03 : 0;
    this.lean += (targetLean - this.lean) * Math.min(1, dt * 7);

    const e = this.emote;
    if (e === 'wave') {
      // Right arm raised, waving.
      this.rightArm.rotation.x = -2.4;
      this.rightArm.rotation.z = -0.5 + Math.sin(elapsed * 10) * 0.35;
      this.leftArm.rotation.x = -armSwing;
      this.body.position.y = bob + Math.abs(Math.sin(elapsed * 6)) * 0.02;
      this.head.rotation.y = 0.15;
    } else if (e === 'dance') {
      // Bounce + alternating arm pumps.
      const t = elapsed * 7;
      this.rightArm.rotation.x = -1.4 + Math.sin(t) * 0.5;
      this.leftArm.rotation.x = -1.4 - Math.sin(t) * 0.5;
      this.leftArm.rotation.z = 0.9;
      this.rightArm.rotation.z = -0.9;
      this.body.position.y = bob + Math.abs(Math.sin(t)) * 0.09;
      this.body.rotation.y = Math.sin(t * 0.5) * 0.18;
      this.leftLeg.rotation.x = swing * 0.4;
      this.rightLeg.rotation.x = -swing * 0.4;
    } else if (e === 'point') {
      // Right arm extended forward toward something.
      this.rightArm.rotation.x = -1.35;
      this.rightArm.rotation.z = -0.15;
      this.leftArm.rotation.x = -armSwing;
      this.head.rotation.y = -0.3;
      this.torso.rotation.y = -0.12;
    } else if (e === 'cheer') {
      // Both arms up, little jump bounces.
      this.leftArm.rotation.x = -2.7;
      this.rightArm.rotation.x = -2.7;
      this.leftArm.rotation.z = 0.35;
      this.rightArm.rotation.z = -0.35;
      this.body.position.y = bob + Math.abs(Math.sin(elapsed * 9)) * 0.12;
    } else {
      this.leftArm.rotation.x = -armSwing;
      this.rightArm.rotation.x = armSwing;
      this.leftArm.rotation.z = 0.03;
      this.rightArm.rotation.z = -0.03;
    }

    this.leftLeg.rotation.x = swing;
    this.rightLeg.rotation.x = -swing;
    this.body.rotation.x = this.lean;
    this.head.rotation.y = anim === 'idle' ? Math.sin(elapsed * 0.7 + this.phase) * 0.1 : 0;
    this.torso.rotation.y = anim === 'idle' ? Math.sin(elapsed * 0.9 + this.phase) * 0.035 : 0;

    if (this.anim === 'jump') this.anim = 'idle';
  }

  dispose(): void {
    if (this.tag) {
      (this.tag.material as THREE.SpriteMaterial).dispose();
      this.tagTexture?.dispose();
    }
    for (const material of this.materials) material.dispose();
    for (const geometry of this.geometries) geometry.dispose();
    this.root.removeFromParent();
  }
}

type AvatarPart = 'shirt' | 'pants' | 'skin' | 'hair';
