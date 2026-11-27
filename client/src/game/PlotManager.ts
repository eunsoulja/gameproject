import * as THREE from 'three';
import {
  BRANCH_ORDER,
  PRODUCTS,
  STALL_CATEGORIES,
  UPGRADE_TREE,
  type StallCategory,
  type UpgradeBranch,
} from '../../../shared/config';
import { PLOT_SLOTS, plotSlot, type PlotSlot } from '../../../shared/layout';
import type { PlayerProfile, PublicPlot } from '../../../shared/types';
import type { CollisionSystem } from './CollisionSystem';
import {
  MATERIALS,
  addMergedMesh,
  box,
  cylinder,
  makeLabelTexture,
  makeRng,
  makeSignTexture,
  pick,
  range,
  sphere,
  type Random,
} from './utils';

export interface PlotPad {
  branch: UpgradeBranch;
  center: THREE.Vector3;
  radius: number;
  color: string;
  name: string;
}

export interface PlotStallPoint {
  index: number;
  center: THREE.Vector3;
  radius: number;
  isSelf: boolean;
  plot: PublicPlot;
}

interface SlotView {
  index: number;
  group: THREE.Group | null;
  signature: string;
  marker: THREE.Mesh | null;
  markerBaseY: number;
  padGlow: THREE.Mesh[];
  light: THREE.PointLight | null;
  plot: PublicPlot | null;
  isSelf: boolean;
}

interface StallBase {
  group: THREE.Group;
  structural: THREE.BufferGeometry[];
  fabric: THREE.BufferGeometry[];
  glow: THREE.BufferGeometry[];
  metal: THREE.BufferGeometry[];
  slot: PlotSlot;
  side: -1 | 1;
  inward: 1 | -1;
  front: number;
  centerX: number;
  width: number;
  counterY: number;
  canopyY: number;
  hasVendor: boolean;
}

const CATEGORY_CANOPY: Record<StallCategory, [string, string]> = {
  driedFish: ['#3f6a92', '#e8ddc4'],
  fruit: ['#c98a2c', '#f1e2bd'],
  streetFood: ['#aa3f33', '#f0d9b8'],
  ukay: ['#79528c', '#e7dccf'],
};

/** Owns the 16 vendor bays: empty filler stalls, neighbour stalls and the player's own bay. */
export class PlotManager {
  private scene: THREE.Scene;
  private collision: CollisionSystem;
  private rng: Random;
  private views: SlotView[] = [];
  private steam: Array<{ sprite: THREE.Sprite; base: THREE.Vector3; phase: number }> = [];
  private steamTexture: THREE.Texture | null = null;
  private ownPads: PlotPad[] = [];
  private ownIndex = -1;
  private elapsed = 0;
  private built = false;

  constructor(scene: THREE.Scene, collision: CollisionSystem) {
    this.scene = scene;
    this.collision = collision;
    this.rng = makeRng(44021);
    for (const slot of PLOT_SLOTS) {
      this.views.push({
        index: slot.index,
        group: null,
        signature: '',
        marker: null,
        markerBaseY: 4.5,
        padGlow: [],
        light: null,
        plot: null,
        isSelf: false,
      });
    }
  }

  build(): void {
    if (this.built) return;
    this.built = true;
    for (const slot of PLOT_SLOTS) {
      const inward = slot.side === 'west' ? 1 : -1;
      const front = slot.x - inward * 0.3;
      const outward = -inward;
      const back = front + outward * 3.05;
      this.collision.addBox(
        Math.min(front, back),
        Math.max(front, back),
        slot.z - 2.55,
        slot.z + 2.55,
        0,
        3.5,
        'plot-stall',
      );
    }
    this.setState([], '', null);
  }

  setState(plots: PublicPlot[], selfId: string, profile: PlayerProfile | null): void {
    const byIndex = new Map<number, PublicPlot>();
    for (const plot of plots) {
      if (plot.index >= 0 && plot.index < PLOT_SLOTS.length) byIndex.set(plot.index, plot);
    }
    const nextOwnIndex = profile ? profile.plotIndex : -1;
    if (nextOwnIndex !== this.ownIndex) {
      this.ownIndex = nextOwnIndex;
      this.ownPads = [];
    }

    for (const slot of PLOT_SLOTS) {
      const publicPlot = byIndex.get(slot.index) ?? null;
      const isSelf = !!profile && slot.index === profile.plotIndex;
      const view = this.views[slot.index];
      const signature = this.signatureFor(publicPlot, isSelf, profile);

      if (signature === view.signature) {
        // An online / offline dot is cheap enough to update without rebuilding.
        continue;
      }
      view.signature = signature;
      this.rebuild(view, slot, publicPlot, isSelf, profile);
    }
  }

  private signatureFor(plot: PublicPlot | null, isSelf: boolean, profile: PlayerProfile | null): string {
    if (!plot) return 'empty';
    if (isSelf && profile) {
      return `own|${profile.businessName}|${profile.plotIndex}|${profile.unlockedCategories.join(',')}|${Object.keys(profile.chosenUpgrades).sort().join(',')}`;
    }
    return `other|${plot.ownerId}|${plot.businessName}|${plot.categories.join(',')}|${plot.upgrades.join(',')}|${plot.online ? 1 : 0}|${plot.stallCount}`;
  }

  private rebuild(
    view: SlotView,
    slot: PlotSlot,
    plot: PublicPlot | null,
    isSelf: boolean,
    profile: PlayerProfile | null,
  ): void {
    this.disposeView(view);
    if (isSelf) this.ownPads = [];
    view.plot = plot;
    view.isSelf = isSelf;

    const base = this.createBase(slot, plot, isSelf, profile);
    if (!plot) {
      this.dressEmpty(base, slot);
      this.finishSlot(base);
      view.group = base.group;
      this.scene.add(base.group);
      return;
    }

    if (isSelf && profile) {
      this.dressOwn(base, profile);
    } else {
      this.dressNeighbour(base, plot);
    }
    this.finishSlot(base);
    view.group = base.group;
    this.scene.add(base.group);

    const marker = base.group.userData.marker as THREE.Mesh | undefined;
    if (marker) {
      view.marker = marker;
      view.markerBaseY = marker.position.y;
    }
    view.padGlow = (base.group.userData.padGlow as THREE.Mesh[] | undefined) ?? [];
    view.light = (base.group.userData.light as THREE.PointLight | undefined) ?? null;
  }

  private createBase(slot: PlotSlot, plot: PublicPlot | null, isSelf: boolean, profile: PlayerProfile | null): StallBase {
    const side: -1 | 1 = slot.side === 'west' ? -1 : 1;
    const inward: 1 | -1 = slot.side === 'west' ? 1 : -1;
    const group = new THREE.Group();
    group.name = `plot-${slot.index}`;
    const structural: THREE.BufferGeometry[] = [];
    const fabric: THREE.BufferGeometry[] = [];
    const glow: THREE.BufferGeometry[] = [];
    const metal: THREE.BufferGeometry[] = [];
    const front = slot.x - inward * 0.3;
    const outward = -inward;
    // Lot width comes from the slot — flagship and corner lots run wider.
    const width = isSelf ? slot.width + 0.55 : plot ? slot.width + 0.35 : Math.max(4.2, slot.width - 0.1);
    const counterY = plot ? 1.02 : 0.9;
    const canopyY = plot ? 2.95 : 2.62;
    const centerX = front + outward * 1.35;
    const category = plot?.categories[0] ?? 'streetFood';
    const [primary, secondary] = isSelf
      ? ['#c68a34', '#f2e0ba']
      : plot
        ? CATEGORY_CANOPY[category]
        : [pick(this.rng, ['#64707a', '#6e665a', '#5c6b66']), '#d8cfbf'];

    // Counter, lower cabinet and legs.
    structural.push(box(2.4, 0.16, width, plot ? '#8b673f' : '#6f5a3d', { x: centerX, y: counterY, z: slot.z }));
    structural.push(box(2.16, 0.78, width - 0.3, plot ? '#5d4328' : '#4b3d2b', {
      x: centerX,
      y: counterY - 0.46,
      z: slot.z,
    }));
    for (const dz of [-width / 2 + 0.18, width / 2 - 0.18]) {
      metal.push(cylinder(0.05, 0.05, counterY, 5, '#3e372e', {
        x: front + outward * 0.2,
        y: counterY / 2,
        z: slot.z + dz,
      }));
      metal.push(cylinder(0.05, 0.05, counterY, 5, '#3e372e', {
        x: centerX + outward * 1.0,
        y: counterY / 2,
        z: slot.z + dz,
      }));
    }

    // Back panel and shelves.
    structural.push(box(0.12, 1.7, width - 0.2, '#4a3927', {
      x: centerX + outward * 1.12,
      y: 1.64,
      z: slot.z,
    }));
    for (let i = 0; i < 2; i++) {
      structural.push(box(0.42, 0.06, width - 0.5, '#6b5134', {
        x: centerX + outward * 1.0,
        y: 1.12 + i * 0.52,
        z: slot.z,
      }));
    }

    // Four posts and a striped tarp roof.
    const postH = canopyY + 0.35;
    for (const dx of [-1.2, 1.12]) {
      for (const dz of [-width / 2 + 0.1, width / 2 - 0.1]) {
        metal.push(cylinder(0.04, 0.05, postH, 5, '#4a4136', {
          x: centerX + dx,
          y: postH / 2,
          z: slot.z + dz,
        }));
      }
    }
    const stripes = Math.max(5, Math.round(width / 0.75));
    for (let i = 0; i < stripes; i++) {
      const stripeW = width / stripes;
      fabric.push(box(3.0, 0.09, stripeW * 0.97, i % 2 ? primary : secondary, {
        x: centerX - inward * 0.1,
        y: canopyY,
        z: slot.z - width / 2 + stripeW * (i + 0.5),
        rz: inward * -0.08,
      }));
    }
    fabric.push(box(0.07, 0.42, width + 0.2, primary, {
      x: front - outward * 0.02,
      y: canopyY - 0.3,
      z: slot.z,
    }));

    // Warm string bulbs under the canopy.
    const bulbs = Math.max(3, Math.round(width / 1.1));
    for (let i = 0; i < bulbs; i++) {
      glow.push(sphere(0.055, '#ffd28b', {
        x: front + outward * 0.5,
        y: canopyY - 0.24,
        z: slot.z - width / 2 + (width * (i + 0.5)) / bulbs,
      }, 5));
    }

    // ── Lot-tier kit variations ──────────────────────────────────────────
    if (slot.kind === 'flagship') {
      // Parol arch over the front — a string of star lanterns.
      const archZ = slot.z;
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        const az = archZ - width / 2 - 0.4 + t * (width + 0.8);
        const ay = canopyY + 0.55 + Math.sin(t * Math.PI) * 0.5;
        glow.push(sphere(0.09, i % 2 ? '#ff6b5e' : '#ffd76a', {
          x: front + outward * 0.15,
          y: ay,
          z: az,
        }, 6));
      }
      // Taller corner posts carry the arch.
      for (const dz of [-width / 2 - 0.3, width / 2 + 0.3]) {
        metal.push(cylinder(0.05, 0.06, canopyY + 1.1, 5, '#4a4136', {
          x: front + outward * 0.15,
          y: (canopyY + 1.1) / 2,
          z: slot.z + dz,
        }));
      }
      // Flagship gets a second shelf row on the back wall.
      structural.push(box(2.2, 0.08, width - 0.8, '#7a5c39', {
        x: centerX + outward * 0.95,
        y: counterY + 1.55,
        z: slot.z,
      }));
    } else if (slot.kind === 'corner') {
      // Corner lots wrap a second counter along the side street edge.
      structural.push(box(1.1, 0.16, 0.9, '#8b673f', {
        x: centerX - inward * 1.15,
        y: counterY,
        z: slot.z + width / 2 - 0.2,
      }));
      fabric.push(box(1.5, 0.07, 1.3, primary, {
        x: centerX - inward * 1.1,
        y: canopyY - 0.02,
        z: slot.z + width / 2 - 0.2,
        rz: inward * 0.12,
      }));
      metal.push(cylinder(0.045, 0.05, canopyY + 0.4, 5, '#4a4136', {
        x: centerX - inward * 1.7,
        y: (canopyY + 0.4) / 2,
        z: slot.z + width / 2 - 0.2,
      }));
    }

    const base: StallBase = {
      group,
      structural,
      fabric,
      glow,
      metal,
      slot,
      side,
      inward,
      front,
      centerX,
      width,
      counterY,
      canopyY,
      hasVendor: false,
    };
    return base;
  }

  private dressEmpty(base: StallBase, slot: PlotSlot): void {
    const { structural, fabric, glow, metal, centerX, slot: s, counterY, width } = base;
    // A modest market stall run by a neighbour, waiting for its next vendor.
    structural.push(box(0.65, 0.24, 0.9, '#a58251', { x: centerX, y: counterY + 0.2, z: s.z - 0.9 }));
    structural.push(sphere(0.17, '#d58c3b', { x: centerX, y: counterY + 0.37, z: s.z - 1.1 }, 7));
    structural.push(sphere(0.15, '#d7c444', { x: centerX, y: counterY + 0.36, z: s.z - 0.95 }, 7));
    structural.push(sphere(0.15, '#8eac54', { x: centerX, y: counterY + 0.34, z: s.z - 0.74 }, 7));
    structural.push(box(0.55, 0.35, 0.6, '#7b603c', { x: centerX, y: counterY + 0.18, z: s.z + 0.6 }));
    structural.push(box(0.5, 0.24, 0.5, '#b8a273', { x: centerX, y: counterY + 0.46, z: s.z + 0.6 }));
    fabric.push(box(2.2, 0.26, 1.6, pick(this.rng, ['#5e6d79', '#73644f', '#5b7063']), {
      x: centerX + base.inward * 0.1,
      y: 1.8,
      z: s.z + width * 0.28,
    }));
    glow.push(sphere(0.05, '#f0bc72', { x: base.front - base.inward * 0.4, y: 2.1, z: s.z }, 5));
    // A handwritten vacancy board.
    const texture = makeLabelTexture('BAKANTE', '#d7c9ae', 'rgba(18,20,18,0.82)');
    this.addPlane(base.group, texture, 1.9, 0.55, base.front - base.inward * 0.2, 1.92, s.z, base.side);
    this.addBaySign(base.group, slot.sign, '#8a5a1e', base.front - base.inward * 0.22, 3.04, s.z, base.side, 2.7);
    this.addVendor(base, ['#7a756b', '#4d4a43'], null, base.centerX + base.inward * -1.0);
    metal.push(cylinder(0.25, 0.25, 0.4, 9, '#7c694b', {
      x: base.centerX + base.inward * 1.0,
      y: 0.2,
      z: s.z + width / 2 - 0.5,
    }));
  }

  private dressNeighbour(base: StallBase, plot: PublicPlot): void {
    const { structural, glow, fabric, metal, centerX, counterY, width } = base;
    const categories = plot.categories.slice(0, 4);
    for (let i = 0; i < categories.length; i++) {
      const category = categories[i];
      const z = base.slot.z - width / 2 + 0.65 + (i + 0.5) * ((width - 1.3) / Math.max(1, categories.length));
      this.addCategoryGoods(base, category, z, centerX - base.inward * 0.05, counterY + 0.09);
    }
    // Neighbour stalls carry a few crates and a hand-written price board.
    structural.push(box(0.5, 0.3, 0.6, '#82643f', {
      x: centerX + base.inward * -1.1,
      y: counterY + 0.17,
      z: base.slot.z + width * 0.32,
    }));
    glow.push(sphere(0.06, plot.online ? '#7df1a1' : '#a6a089', {
      x: base.front - base.inward * 0.45,
      y: 3.35,
      z: base.slot.z - width * 0.4,
    }, 6));
    this.addSignTexture(
      base.group,
      plot.businessName,
      `${plot.ownerName} · BAY ${String(plot.index + 1).padStart(2, '0')}`,
      STALL_CATEGORIES[plot.categories[0] ?? 'streetFood'].accent,
      base.front - base.inward * 0.24,
      2.72,
      base.slot.z,
      base.side,
      3.8,
    );
    this.addUpgradeDressing(base, new Set(plot.upgrades), false);
    this.addVendor(base, ['#6c6152', '#4c4337'], plot.appearance, centerX + base.inward * -1.05);
    fabric.push(box(1.4, 0.06, width * 0.35, '#d8d1bf', {
      x: base.front - base.inward * 0.4,
      y: 1.75,
      z: base.slot.z + width * 0.32,
      rz: base.side * 0.16,
    }));
    metal.push(cylinder(0.04, 0.04, 1.6, 5, '#4c4438', {
      x: base.front - base.inward * 0.75,
      y: 0.8,
      z: base.slot.z + width * 0.43,
    }));
  }

  private dressOwn(base: StallBase, profile: PlayerProfile): void {
    const { structural, fabric, glow, metal, centerX, counterY, width, front, side, slot, inward } = base;
    const categories = profile.unlockedCategories.slice(0, 4);
    for (let i = 0; i < categories.length; i++) {
      const z = slot.z - width / 2 + 0.7 + (i + 0.5) * ((width - 1.4) / Math.max(1, categories.length));
      this.addCategoryGoods(base, categories[i], z, centerX - inward * 0.05, counterY + 0.09);
    }

    // Gold trim, brighter bulbs and a "YOUR STALL" marker.
    for (let i = 0; i < 5; i++) {
      glow.push(sphere(0.07, '#ffd873', {
        x: front - inward * 0.42,
        y: base.canopyY - 0.15,
        z: slot.z - width / 2 + 0.5 + i * ((width - 1) / 4),
      }, 6));
    }
    fabric.push(box(0.5, 0.06, width + 0.5, '#eccb7e', {
      x: front - inward * 0.3,
      y: base.canopyY + 0.12,
      z: slot.z,
    }));

    // Name board with a lit frame.
    this.addSignTexture(
      this.groupFor(base),
      profile.businessName,
      `${profile.name} · BAY ${String(profile.plotIndex + 1).padStart(2, '0')}`,
      '#ffd481',
      front - inward * 0.26,
      2.82,
      slot.z,
      side,
      4.1,
    );

    // A warm local light so your bay reads as "yours" at night.
    const light = new THREE.PointLight('#ffb45f', 4.2, 7.5, 2);
    light.position.set(front - inward * 1.1, 2.55, slot.z);
    light.castShadow = false;
    base.group.add(light);
    base.group.userData.light = light;

    // Multi-stall vendors get a visibly bigger footprint: a second bulb
    // string, an "EXPANDED" banner and extra gold trim along the back.
    if (profile.stallCount >= 2) {
      for (let i = 0; i < 7; i++) {
        glow.push(sphere(0.06, '#ffe9a8', {
          x: front - inward * 0.5,
          y: base.canopyY - 0.22,
          z: slot.z - width / 2 + 0.4 + i * ((width - 0.8) / 6),
        }, 6));
      }
      fabric.push(box(0.34, 0.05, width * 0.7, '#e8b04b', {
        x: front - inward * 0.18,
        y: base.canopyY + 0.2,
        z: slot.z,
      }));
      // Second mini name board on the far end for the extra stall.
      this.addSignTexture(
        this.groupFor(base),
        `STALL ${profile.stallCount}`,
        'expanded bay',
        '#ffd481',
        front - inward * 0.26,
        2.3,
        slot.z + width * 0.34,
        side,
        1.7,
      );
    }

    // Floating diamond marker.
    const markerMaterial = new THREE.MeshBasicMaterial({
      color: '#ffd15c',
      toneMapped: false,
      transparent: true,
      opacity: 0.95,
    });
    const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 0), markerMaterial);
    marker.position.set(front - inward * 0.35, 4.45, slot.z);
    marker.renderOrder = 3;
    base.group.add(marker);
    base.group.userData.marker = marker;
    glow.push(box(0.03, 0.55, 0.03, '#e8b969', {
      x: front - inward * 0.35,
      y: 3.95,
      z: slot.z,
    }));

    // A live stock board under the name sign — redrawn as inventory changes.
    const stockCanvas = document.createElement('canvas');
    stockCanvas.width = 512;
    stockCanvas.height = 128;
    const stockTexture = new THREE.CanvasTexture(stockCanvas);
    stockTexture.colorSpace = THREE.SRGBColorSpace;
    stockTexture.anisotropy = 4;
    const stockMat = new THREE.MeshBasicMaterial({
      map: stockTexture,
      transparent: true,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    const stockMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 0.68), stockMat);
    stockMesh.position.set(front - inward * 0.3, 2.32, slot.z);
    stockMesh.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    stockMesh.renderOrder = 2;
    base.group.add(stockMesh);
    base.group.userData.stockBoard = { canvas: stockCanvas, texture: stockTexture, mesh: stockMesh };
    this.redrawStockBoard(stockCanvas, stockTexture, profile);

    this.addUpgradeDressing(base, new Set(Object.values(profile.chosenUpgrades)), true);
    this.addVendor(base, [profile.appearance.shirt, profile.appearance.pants], profile.appearance, centerX + inward * -1.02);

    // Four physical upgrade pads on the walkway.
    const padGlow: THREE.Mesh[] = [];
    const offsets = [-4.45, -1.5, 1.45, 4.4];
    const padX = slot.x + inward * 4.0;
    BRANCH_ORDER.forEach((branch, i) => {
      const def = UPGRADE_TREE[branch];
      const pz = slot.z + offsets[i];
      const center = new THREE.Vector3(padX, 0.05, pz);
      this.addPad(base, branch, def.color, center, padGlow);
      this.ownPads.push({
        branch,
        center,
        radius: 1.15,
        color: def.color,
        name: def.name,
      });
    });
    base.group.userData.padGlow = padGlow;
  }

  private addPad(base: StallBase, branch: UpgradeBranch, color: string, center: THREE.Vector3, padGlow: THREE.Mesh[]): void {
    const def = UPGRADE_TREE[branch];
    // Sticker-button pad: ink base rim, cream medallion face, branch-color core.
    const baseMat = new THREE.MeshStandardMaterial({
      color: '#241a12',
      roughness: 0.7,
      metalness: 0.05,
    });
    const padBase = new THREE.Mesh(new THREE.CylinderGeometry(0.88, 0.94, 0.1, 8), baseMat);
    padBase.position.set(center.x, 0.05, center.z);
    padBase.receiveShadow = false;
    base.group.add(padBase);

    const topMat = new THREE.MeshBasicMaterial({
      map: this.makePadTopTexture(def.name, color),
      transparent: true,
      toneMapped: false,
    });
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.05, 8), topMat);
    top.position.set(center.x, 0.125, center.z);
    base.group.add(top);
    padGlow.push(top);

    // Glossy shine sweep orbiting the rim — a cartoon highlight pass.
    const spinner = new THREE.Group();
    spinner.position.set(center.x, 0.16, center.z);
    const sweep = new THREE.Mesh(
      new THREE.RingGeometry(0.86, 0.97, 28, 1, 0, Math.PI * 1.55),
      new THREE.MeshBasicMaterial({ color: '#fff8e4', transparent: true, opacity: 0.5, side: THREE.DoubleSide, toneMapped: false }),
    );
    sweep.rotation.x = -Math.PI / 2;
    spinner.add(sweep);
    base.group.add(spinner);
    const spinners = (base.group.userData.padSpinners ??= []) as THREE.Group[];
    spinners.push(spinner);

    // Two little stars orbiting the pad — pure cartoon sparkle.
    const starTexture = this.makeStarTexture();
    const stars: Array<{ sprite: THREE.Sprite; cx: number; cz: number; radius: number; speed: number; phase: number; y: number }> =
      (base.group.userData.padStars ??= []);
    for (let i = 0; i < 2; i++) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: starTexture, transparent: true, depthWrite: false }),
      );
      sprite.scale.set(0.3, 0.3, 1);
      sprite.renderOrder = 3;
      base.group.add(sprite);
      stars.push({
        sprite,
        cx: center.x,
        cz: center.z,
        radius: 1.05 + i * 0.22,
        speed: (i === 0 ? 1 : -0.8) * (0.9 + this.rng() * 0.4),
        phase: this.rng() * Math.PI * 2,
        y: 0.55 + i * 0.3,
      });
    }

    // Floating branch chip — the pad's name readable from across the market.
    const chip = this.makePadChip(def.name, color);
    chip.position.set(center.x, 1.55, center.z);
    base.group.add(chip);
    const padIcons = (base.group.userData.padIcons ??= []) as Array<{ sprite: THREE.Sprite; phase: number }>;
    padIcons.push({ sprite: chip, phase: this.rng() * Math.PI * 2 });
  }

  /** Cartoon medallion for the pad face — cream sticker, ink outline, branch color, stitched ring. */
  private makePadTopTexture(name: string, color: string): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    const cx = 128;
    const cy = 128;

    // Cream sticker face.
    ctx.fillStyle = '#fff3d6';
    ctx.beginPath();
    ctx.arc(cx, cy, 126, 0, Math.PI * 2);
    ctx.fill();

    // Branch-color core.
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, 100, 0, Math.PI * 2);
    ctx.fill();

    // Ink rings: outer sticker border, inner core edge, dashed stitch ring.
    ctx.strokeStyle = '#1c1008';
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.arc(cx, cy, 119, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(cx, cy, 93, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(28,16,8,0.5)';
    ctx.lineWidth = 5;
    ctx.setLineDash([11, 9]);
    ctx.beginPath();
    ctx.arc(cx, cy, 106, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Branch name in bold cartoon lettering with an ink outline.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let fontSize = 36;
    const label = name.toUpperCase();
    ctx.font = `700 ${fontSize}px "Lilita One", "Arial Black", sans-serif`;
    while (ctx.measureText(label).width > 168 && fontSize > 18) {
      fontSize -= 2;
      ctx.font = `700 ${fontSize}px "Lilita One", "Arial Black", sans-serif`;
    }
    ctx.lineJoin = 'round';
    ctx.lineWidth = 9;
    ctx.strokeStyle = '#1c1008';
    ctx.strokeText(label, cx, cy + 2);
    ctx.fillStyle = '#fff3d6';
    ctx.fillText(label, cx, cy + 2);

    // Corner sparkles.
    ctx.fillStyle = '#fff3d6';
    for (const [sx, sy, r] of [
      [34, 40, 7],
      [222, 44, 5],
      [40, 216, 5],
      [220, 212, 7],
    ] as const) {
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  }

  private makeStarTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.translate(32, 32);
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 26 : 11;
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = '#fff3d6';
    ctx.fill();
    ctx.strokeStyle = '#1c1008';
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';
    ctx.stroke();
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private makePadChip(name: string, color: string): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 96;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createLinearGradient(0, 0, 0, 96);
    grad.addColorStop(0, '#fff8e4');
    grad.addColorStop(1, '#f0d9a8');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(6, 6, 244, 84, 26);
    ctx.fill();
    ctx.strokeStyle = '#1c1008';
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillRect(28, 74, 200, 8);
    ctx.fillStyle = '#1c1008';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '44px "Lilita One", "Arial Black", sans-serif';
    ctx.fillText(name.toUpperCase(), 128, 44);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }),
    );
    sprite.scale.set(1.7, 0.64, 1);
    sprite.renderOrder = 3;
    return sprite;
  }

  private addCategoryGoods(base: StallBase, category: StallCategory, z: number, x: number, y: number): void {
    const { structural, glow, metal, fabric } = base;
    if (category === 'fruit') {
      const colors = ['#f0b52e', '#e6cf3c', '#d9473b', '#7fa64e', '#e58b31'];
      structural.push(box(0.66, 0.09, 0.54, '#8b6a43', { x, y, z }));
      for (let i = 0; i < 5; i++) {
        structural.push(sphere(0.11, pick(this.rng, colors), {
          x: x + range(this.rng, -0.2, 0.2),
          y: y + 0.14 + (i > 2 ? 0.12 : 0),
          z: z + range(this.rng, -0.15, 0.15),
        }, 6));
      }
      structural.push(box(0.16, 0.11, 0.015, '#f7ecd3', { x: x + base.inward * 0.35, y: y + 0.12, z: z + 0.2 }));
    } else if (category === 'streetFood') {
      structural.push(box(0.72, 0.2, 0.56, '#3b3630', { x, y: y + 0.08, z }));
      glow.push(box(0.55, 0.03, 0.4, '#ff7c2d', { x, y: y + 0.19, z }));
      for (let i = 0; i < 3; i++) {
        metal.push(box(0.04, 0.02, 0.48, '#191817', { x: x - 0.16 + i * 0.16, y: y + 0.23, z }));
        structural.push(box(0.06, 0.06, 0.2, '#8d4b2e', { x: x - 0.16 + i * 0.16, y: y + 0.23, z }));
      }
      structural.push(cylinder(0.17, 0.17, 0.18, 8, '#d8c896', { x: x + base.inward * 0.55, y: y + 0.14, z: z - 0.1 }));
      glow.push(cylinder(0.12, 0.12, 0.02, 8, '#ffc074', { x: x + base.inward * 0.55, y: y + 0.24, z: z - 0.1 }));
      // Steam curls off the grill — the stall smells like dinner from the street.
      for (let i = 0; i < 3; i++) {
        const sprite = this.makeSteamSprite();
        sprite.position.set(x - 0.16 + i * 0.16, y + 0.42, z);
        base.group.add(sprite);
        this.steam.push({ sprite, base: sprite.position.clone(), phase: (i * 2.1 + x) % 6.28 });
      }
    } else if (category === 'driedFish') {
      structural.push(box(0.62, 0.06, 0.46, '#b7a781', { x, y, z }));
      for (let i = 0; i < 3; i++) {
        structural.push(box(0.1, 0.03, 0.22, pick(this.rng, ['#d9c19a', '#c4a478', '#b89368']), {
          x: x - 0.18 + i * 0.14,
          y: y + 0.05,
          z,
          ry: range(this.rng, -0.3, 0.3),
        }));
      }
      structural.push(box(0.15, 0.1, 0.015, '#f4ecd8', { x: x + base.inward * 0.32, y: y + 0.1, z: z + 0.18 }));
    } else {
      metal.push(cylinder(0.03, 0.03, 1.75, 5, '#4a4640', { x, y: y + 0.78, z }));
      metal.push(box(0.04, 0.04, 0.72, '#4a4640', { x, y: y + 1.62, z }));
      const shirtColors = ['#b44c4b', '#4c74a8', '#5d8a5e', '#c49a3d', '#8b5a9e'];
      for (let i = 0; i < 4; i++) {
        fabric.push(box(0.38, 0.5, 0.04, pick(this.rng, shirtColors), {
          x,
          y: y + 1.35,
          z: z - 0.26 + i * 0.17,
          ry: range(this.rng, -0.2, 0.2),
        }));
      }
    }
  }

  private addUpgradeDressing(base: StallBase, upgrades: Set<string>, isOwn: boolean): void {
    const { structural, fabric, glow, metal, slot, width, centerX, front, inward } = base;
    const has = (id: string) => upgrades.has(id);

    if (has('rainTarp')) {
      fabric.push(box(3.35, 0.06, width + 0.7, '#4f6b72', {
        x: centerX,
        y: base.canopyY + 0.38,
        z: slot.z,
        rz: inward * -0.03,
      }));
    }
    if (has('displayShelves')) {
      for (let i = 0; i < 3; i++) {
        structural.push(box(0.48, 0.07, width - 0.8, '#805f39', {
          x: centerX + inward * -0.95,
          y: 1.48 + i * 0.36,
          z: slot.z,
        }));
        for (let j = 0; j < 3; j++) {
          structural.push(box(0.26, 0.24, 0.26, pick(this.rng, ['#c9a86e', '#b4864f', '#d8c08c']), {
            x: centerX + inward * -0.95,
            y: 1.65 + i * 0.36,
            z: slot.z - width * 0.3 + j * 0.45,
          }));
        }
      }
    }
    if (has('biggerTable')) {
      structural.push(box(2.4, 0.16, 1.15, '#a17a48', {
        x: centerX,
        y: base.counterY,
        z: slot.z + width / 2 + 0.4,
      }));
      structural.push(box(2.1, 0.68, 1.0, '#63492c', {
        x: centerX,
        y: base.counterY - 0.45,
        z: slot.z + width / 2 + 0.4,
      }));
    }
    if (has('signage')) {
      const frame = 3.9;
      glow.push(box(0.06, 0.06, frame, '#ffd374', { x: front - inward * 0.34, y: 3.38, z: slot.z + frame / 2 }));
      glow.push(box(0.06, 0.06, frame, '#ffd374', { x: front - inward * 0.34, y: 3.38, z: slot.z - frame / 2 }));
      glow.push(box(0.06, 0.07, 0.06, '#ffd374', { x: front - inward * 0.34, y: 3.54, z: slot.z }));
    }
    if (has('secondStall')) {
      const extraZ = slot.z + width / 2 + 1.45;
      structural.push(box(1.7, 0.12, 2.1, '#906b41', { x: centerX + inward * -0.1, y: 0.88, z: extraZ }));
      structural.push(box(1.5, 0.62, 1.9, '#5a4329', { x: centerX + inward * -0.1, y: 0.42, z: extraZ }));
      for (const dz of [-0.9, 0.9]) {
        metal.push(cylinder(0.035, 0.035, 2.3, 5, '#463e32', { x: centerX + inward * 0.7, y: 1.15, z: extraZ + dz }));
      }
      for (let i = 0; i < 5; i++) {
        fabric.push(box(1.9, 0.06, 0.44, i % 2 ? '#b8503e' : '#e7d9bc', {
          x: centerX + inward * -0.1,
          y: 2.28,
          z: extraZ - 0.9 + i * 0.44,
        }));
      }
      glow.push(sphere(0.06, '#ffd38a', { x: centerX + inward * 0.55, y: 2.05, z: extraZ }, 5));
    }
    if (has('permanentKiosk')) {
      structural.push(box(0.5, 0.7, width + 0.3, '#6d6a62', { x: front + inward * 0.05, y: 0.35, z: slot.z }));
      for (let i = 0; i < 5; i++) {
        metal.push(box(0.08, 0.16, width - 0.3, '#686f73', {
          x: front + inward * 0.3,
          y: 0.8 + i * 0.18,
          z: slot.z,
        }));
      }
    }
    if (has('helper') || has('barker') || has('cashier') || has('bodegaBoy') || has('manager') || has('sukiSpecialist')) {
      const workerSpots = [-2.6, 2.4, 3.4];
      const count =
        (has('helper') ? 1 : 0) +
        (has('barker') ? 1 : 0) +
        (has('cashier') ? 1 : 0) +
        (has('bodegaBoy') ? 1 : 0) +
        (has('manager') ? 1 : 0) +
        (has('sukiSpecialist') ? 1 : 0);
      for (let i = 0; i < Math.min(count, 3); i++) {
        const wx = centerX + inward * -1.5;
        this.addVendor(base, [pick(this.rng, ['#567a8f', '#8b5a4b', '#6a7454']), '#3f4650'], null, wx, slot.z + workerSpots[i]);
      }
    }
    if (has('nightWatch') || has('guard') || has('tanod')) {
      this.addGuard(base, centerX + inward * -1.65, slot.z + width * 0.42);
      if (has('tanod')) {
        glow.push(sphere(0.06, '#68e2a8', { x: front - inward * 0.5, y: 3.25, z: slot.z + width * 0.45 }, 5));
      }
    }
    if (has('cctv')) {
      metal.push(box(0.16, 0.14, 0.32, '#d6d8d4', {
        x: front - inward * 0.15,
        y: 2.55,
        z: slot.z - width * 0.4,
        ry: inward * 0.4,
      }));
      metal.push(box(0.04, 0.15, 0.04, '#464b4e', {
        x: front - inward * 0.12,
        y: 2.65,
        z: slot.z - width * 0.4,
      }));
      glow.push(sphere(0.035, '#ff5f59', {
        x: front - inward * 0.2,
        y: 2.51,
        z: slot.z - width * 0.4,
      }, 4));
    }
    if (has('guard')) {
      // A brighter security post light.
      glow.push(box(0.06, 0.05, 0.06, '#ffde7c', {
        x: front - inward * 0.5,
        y: 3.1,
        z: slot.z + width * 0.4,
      }));
    }
    if (has('bagCheck')) {
      metal.push(sphere(0.18, '#cdd5d4', { x: front - inward * 0.18, y: 2.38, z: slot.z + width * 0.18 }, 8));
    }
    if (has('alarm')) {
      const alarmMat = new THREE.MeshBasicMaterial({ color: '#ff4e42', toneMapped: false, transparent: true });
      const alarm = new THREE.Mesh(new THREE.SphereGeometry(0.11, 7, 5), alarmMat);
      alarm.position.set(front - inward * 0.3, 3.25, slot.z - width * 0.12);
      base.group.add(alarm);
    }
    if (has('coolerBox')) {
      structural.push(box(0.62, 0.48, 0.82, '#dbe5e3', {
        x: centerX + inward * -1.35,
        y: 0.24,
        z: slot.z + width * 0.2,
      }));
      structural.push(box(0.6, 0.08, 0.8, '#a7bfc0', {
        x: centerX + inward * -1.35,
        y: 0.51,
        z: slot.z + width * 0.2,
      }));
    }
    if (has('supplierContract') || has('bulkStock')) {
      for (let i = 0; i < 3; i++) {
        structural.push(box(0.75, 0.5, 0.8, '#8f6a43', {
          x: centerX + inward * -1.55,
          y: 0.25,
          z: slot.z - width * 0.4 + i * 0.55,
        }));
      }
    }
    if (has('premiumLine')) {
      glow.push(box(0.05, 0.05, width + 0.3, '#ffd977', { x: front - inward * 0.33, y: 2.2, z: slot.z }));
      glow.push(box(0.05, 0.05, width + 0.3, '#ffd977', { x: front - inward * 0.33, y: 1.72, z: slot.z }));
    }
    if (has('newCategory') && isOwn) {
      glow.push(sphere(0.09, '#b9e78e', { x: front - inward * 0.4, y: 3.02, z: slot.z - width * 0.45 }, 6));
    }
  }

  private addGuard(base: StallBase, x: number, z: number): void {
    const { structural, fabric, glow } = base;
    const navy = '#26384c';
    structural.push(box(0.24, 0.75, 0.22, navy, { x, y: 0.55, z }));
    structural.push(box(0.24, 0.75, 0.22, navy, { x: x + 0.28, y: 0.55, z }));
    structural.push(box(0.56, 0.62, 0.3, '#34506d', { x: x + 0.14, y: 1.22, z }));
    structural.push(box(0.3, 0.3, 0.28, '#d4a77c', { x: x + 0.14, y: 1.69, z }));
    structural.push(box(0.34, 0.1, 0.32, '#203349', { x: x + 0.14, y: 1.88, z }));
    structural.push(box(0.07, 0.56, 0.12, '#34506d', { x: x - 0.22, y: 1.2, z }));
    structural.push(box(0.07, 0.56, 0.12, '#34506d', { x: x + 0.5, y: 1.2, z }));
    glow.push(box(0.08, 0.08, 0.02, '#ffd98d', { x: x + 0.14, y: 1.42, z: z + 0.16 }));
    fabric.push(box(0.38, 0.16, 0.05, '#17212c', { x: x + 0.14, y: 1.42, z: z + 0.17 }));
  }

  private addVendor(base: StallBase, colors: string[], appearance: PublicPlot['appearance'] | null, x: number, z = base.slot.z): void {
    const { structural, fabric } = base;
    const skin = appearance?.skin ?? '#d6a173';
    const hair = appearance?.hair ?? '#241a15';
    const shirt = appearance?.shirt ?? colors[0];
    const pants = appearance?.pants ?? colors[1];
    // Legs behind the counter, torso above it.
    structural.push(box(0.22, 0.62, 0.24, pants, { x: x - 0.12, y: 0.48, z }));
    structural.push(box(0.22, 0.62, 0.24, pants, { x: x + 0.14, y: 0.48, z }));
    structural.push(box(0.54, 0.62, 0.3, shirt, { x, y: 1.08, z }));
    structural.push(box(0.3, 0.3, 0.28, skin, { x, y: 1.55, z }));
    structural.push(box(0.32, 0.1, 0.3, hair, { x, y: 1.73, z }));
    structural.push(box(0.08, 0.05, 0.02, '#2c1e19', { x: x - 0.07, y: 1.56, z: z + 0.15 }));
    structural.push(box(0.08, 0.05, 0.02, '#2c1e19', { x: x + 0.07, y: 1.56, z: z + 0.15 }));
    structural.push(box(0.07, 0.58, 0.12, skin, { x: x - 0.33, y: 1.1, z }));
    structural.push(box(0.07, 0.58, 0.12, skin, { x: x + 0.33, y: 1.1, z }));
    // Apron.
    fabric.push(box(0.36, 0.5, 0.04, pick(this.rng, ['#e6ddc9', '#d8c39d', '#b95545']), { x, y: 0.95, z: z + 0.17 }));
    base.hasVendor = true;
  }

  /** Redraw the own-stall stock board without rebuilding the whole stall. */
  updateStock(profile: PlayerProfile): void {
    const view = this.views[this.ownIndex];
    const board = view?.group?.userData.stockBoard as
      | { canvas: HTMLCanvasElement; texture: THREE.Texture; mesh?: THREE.Mesh }
      | undefined;
    if (!board) return;
    // A sale visibly "pops" the board — inventory shrinking flashes it briefly.
    const total = Object.values(profile.inventory).reduce((sum, n) => sum + (n ?? 0), 0);
    if (this.lastStockTotal !== null && total < this.lastStockTotal) this.stockFlash = 1;
    this.lastStockTotal = total;
    this.redrawStockBoard(board.canvas, board.texture as THREE.CanvasTexture, profile);
  }

  private lastStockTotal: number | null = null;
  private stockFlash = 0;

  private redrawStockBoard(
    canvas: HTMLCanvasElement,
    texture: THREE.CanvasTexture,
    profile: PlayerProfile,
  ): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(10,13,18,0.88)';
    ctx.beginPath();
    ctx.roundRect(4, 4, w - 8, h - 8, 26);
    ctx.fill();
    ctx.strokeStyle = 'rgba(241,180,87,0.4)';
    ctx.lineWidth = 4;
    ctx.stroke();

    const unlocked = new Set(profile.unlockedCategories);
    const rows = PRODUCTS.filter((p) => unlocked.has(p.category))
      .map((p) => ({ name: p.name, count: profile.inventory[p.id] ?? 0, max: p.maxStock }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
    const total = rows.reduce((sum, r) => sum + r.count, 0);
    const low = rows.some((r) => r.count > 0 && r.count / r.max < 0.25) || total === 0;

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = low ? '#f08a7e' : '#ffd083';
    ctx.font = '800 44px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('STOCK', 34, h / 2 - 18);
    ctx.font = '800 64px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(String(total), 34, h / 2 + 30);

    ctx.textAlign = 'right';
    ctx.font = '700 30px "Plus Jakarta Sans", sans-serif';
    let y = 40;
    for (const row of rows) {
      ctx.fillStyle = row.count === 0 ? '#8a6f5c' : '#d8d2c4';
      const label = row.name.length > 16 ? `${row.name.slice(0, 15)}…` : row.name;
      ctx.fillText(`${label}  ×${row.count}`, w - 34, y);
      y += 30;
    }
    if (rows.length === 0) {
      ctx.fillStyle = '#8a6f5c';
      ctx.fillText('Restock soon', w - 34, h / 2);
    }
    texture.needsUpdate = true;
  }

  private finishSlot(base: StallBase): void {
    addMergedMesh(base.group, base.structural, MATERIALS.structure(), `plot-${base.slot.index}-structure`);
    addMergedMesh(base.group, base.fabric, MATERIALS.fabric(), `plot-${base.slot.index}-fabric`);
    addMergedMesh(base.group, base.glow, MATERIALS.glow(), `plot-${base.slot.index}-glow`);
    addMergedMesh(base.group, base.metal, MATERIALS.metal(), `plot-${base.slot.index}-metal`);
  }

  private groupFor(base: StallBase): THREE.Group {
    return base.group;
  }

  private addSignTexture(
    group: THREE.Group,
    title: string,
    subtitle: string,
    accent: string,
    x: number,
    y: number,
    z: number,
    side: -1 | 1,
    width: number,
  ): void {
    const texture = makeSignTexture(title, subtitle, { accent, dark: '#160f09' });
    this.addPlane(group, texture, width, width * 0.32, x, y, z, side);
    // A soft halo behind the board so the paper face pops against the night.
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.signGlowTexture(),
        color: '#ffcf8a',
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
      }),
    );
    glow.scale.set(width * 1.15, width * 0.62, 1);
    glow.position.set(x - side * 0.06, y, z);
    glow.renderOrder = 1;
    group.add(glow);
  }

  private glowTex: THREE.Texture | null = null;
  private signGlowTexture(): THREE.Texture {
    if (this.glowTex) return this.glowTex;
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
    gradient.addColorStop(0, 'rgba(255,214,140,0.85)');
    gradient.addColorStop(0.55, 'rgba(255,190,110,0.28)');
    gradient.addColorStop(1, 'rgba(255,180,100,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    this.glowTex = new THREE.CanvasTexture(canvas);
    return this.glowTex;
  }

  private addBaySign(
    group: THREE.Group,
    text: string,
    color: string,
    x: number,
    y: number,
    z: number,
    side: -1 | 1,
    width: number,
  ): void {
    const texture = makeLabelTexture(text, color, 'rgba(12,14,14,0.85)');
    this.addPlane(group, texture, width, width * 0.3, x, y, z, side);
  }

  private addPlane(
    group: THREE.Group,
    texture: THREE.Texture,
    width: number,
    height: number,
    x: number,
    y: number,
    z: number,
    side: -1 | 1,
  ): void {
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    mesh.position.set(x, y, z);
    mesh.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    mesh.renderOrder = 2;
    group.add(mesh);
  }

  private makeSteamSprite(): THREE.Sprite {
    if (!this.steamTexture) {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d')!;
      const gradient = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
      gradient.addColorStop(0, 'rgba(255,244,230,0.55)');
      gradient.addColorStop(0.6, 'rgba(240,235,225,0.22)');
      gradient.addColorStop(1, 'rgba(240,235,225,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 64, 64);
      this.steamTexture = new THREE.CanvasTexture(canvas);
    }
    const material = new THREE.SpriteMaterial({
      map: this.steamTexture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.setScalar(0.35);
    sprite.renderOrder = 4;
    return sprite;
  }

  update(dt: number, elapsed: number): void {
    this.elapsed = elapsed;
    // Steam puffs rise, swell and fade; prune emitters whose stall was rebuilt.
    this.steam = this.steam.filter((entry) => {
      if (!entry.sprite.parent) {
        (entry.sprite.material as THREE.SpriteMaterial).dispose();
        return false;
      }
      const t = (elapsed * 0.45 + entry.phase) % 1;
      entry.sprite.position.set(
        entry.base.x + Math.sin(elapsed * 1.3 + entry.phase) * 0.14,
        entry.base.y + t * 1.7,
        entry.base.z + Math.cos(elapsed * 1.1 + entry.phase) * 0.1,
      );
      const scale = 0.3 + t * 0.55;
      entry.sprite.scale.setScalar(scale);
      (entry.sprite.material as THREE.SpriteMaterial).opacity = Math.sin(t * Math.PI) * 0.34;
      return true;
    });
    for (const view of this.views) {
      if (!view.group) continue;
      if (view.marker) {
        view.marker.rotation.y += dt * 1.7;
        view.marker.position.y = view.markerBaseY + Math.sin(elapsed * 2.1) * 0.13;
      }
      if (view.light) {
        view.light.intensity = 4.0 + Math.sin(elapsed * 3.1) * 0.28;
      }
    }
    // Pads gently pulse their glow; radar rings sweep and chips bob.
    for (const view of this.views) {
      for (let i = 0; i < view.padGlow.length; i++) {
        const material = view.padGlow[i].material as THREE.MeshBasicMaterial;
        if (material) material.opacity = 0.88 + 0.12 * Math.sin(elapsed * 2.4 + i * 1.4);
      }
      const spinners = view.group?.userData.padSpinners as THREE.Group[] | undefined;
      if (spinners) for (const spinner of spinners) spinner.rotation.y += dt * 1.4;
      const padStars = view.group?.userData.padStars as Array<{
        sprite: THREE.Sprite;
        cx: number;
        cz: number;
        radius: number;
        speed: number;
        phase: number;
        y: number;
      }> | undefined;
      if (padStars) {
        for (const star of padStars) {
          const a = elapsed * star.speed + star.phase;
          star.sprite.position.set(
            star.cx + Math.cos(a) * star.radius,
            star.y + Math.sin(elapsed * 2.2 + star.phase) * 0.08,
            star.cz + Math.sin(a) * star.radius,
          );
        }
      }
      const padIcons = view.group?.userData.padIcons as Array<{ sprite: THREE.Sprite; phase: number }> | undefined;
      if (padIcons) {
        for (const entry of padIcons) {
          entry.sprite.position.y = 1.55 + Math.sin(elapsed * 1.8 + entry.phase) * 0.09;
        }
      }
    }
    // Stock board pops when a sale lands.
    if (this.stockFlash > 0) {
      this.stockFlash = Math.max(0, this.stockFlash - dt * 2.2);
      const mesh = this.views[this.ownIndex]?.group?.userData.stockBoard?.mesh as THREE.Mesh | undefined;
      if (mesh) {
        const s = 1 + this.stockFlash * 0.16;
        mesh.scale.set(s, s, 1);
      }
    }
  }

  getStallPoints(): PlotStallPoint[] {
    const points: PlotStallPoint[] = [];
    for (const view of this.views) {
      if (!view.group || !view.plot) continue;
      const slot = plotSlot(view.index);
      const inward = slot.side === 'west' ? 1 : -1;
      points.push({
        index: view.index,
        center: new THREE.Vector3(slot.x + inward * 1.6, 1.1, slot.z),
        radius: 2.25,
        isSelf: view.index === this.ownIndex,
        plot: view.plot,
      });
    }
    return points;
  }

  getOwnPads(): PlotPad[] {
    return this.ownPads;
  }

  getOwnIndex(): number {
    return this.ownIndex;
  }

  disposeView(view: SlotView): void {
    this.disposeGroup(view);
  }

  private disposeGroup(view: SlotView): void {
    if (!view.group) return;
    this.scene.remove(view.group);
    view.group.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (!material) return;
      const list = Array.isArray(material) ? material : [material];
      for (const item of list) {
        const map = (item as THREE.MeshBasicMaterial).map;
        if (map) map.dispose();
        item.dispose();
      }
    });
    view.group = null;
    view.marker = null;
    view.padGlow = [];
    view.light = null;
  }

  dispose(): void {
    for (const view of this.views) this.disposeGroup(view);
    this.ownPads = [];
  }
}
