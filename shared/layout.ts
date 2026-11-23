import type { StallCategory } from './config';

/** Shared world layout — used by the server for spawns and by the client for plot placement. */
export const WORLD = {
  minZ: -244,
  maxZ: 244,
  roadHalfWidth: 12,
  sidewalkOuter: 18,
  playableHalfX: 84,
  playableMinZ: -232,
  playableMaxZ: 232,
  sideStreets: [-170, -70, 120, 210],
  sideStreetHalfWidth: 8,
  spawn: { x: 0, z: 96 },
  archZ: 108,
} as const;

export interface PlotSlot {
  index: number;
  x: number;
  z: number;
  rotY: number;
  side: 'west' | 'east';
  sign: string;
}

const WEST_Z = [76, 63, 50, 37, 24, 11, -2, -15];
const EAST_Z = [82, 69, 56, 43, 30, 17, 4, -9];

export const PLOT_SLOTS: PlotSlot[] = [];
for (let i = 0; i < 8; i++) {
  PLOT_SLOTS.push({
    index: PLOT_SLOTS.length,
    x: -9.6,
    z: WEST_Z[i],
    rotY: Math.PI / 2,
    side: 'west',
    sign: `COLON BAY W${String(i + 1).padStart(2, '0')}`,
  });
  PLOT_SLOTS.push({
    index: PLOT_SLOTS.length,
    x: 9.6,
    z: EAST_Z[i],
    rotY: -Math.PI / 2,
    side: 'east',
    sign: `COLON BAY E${String(i + 1).padStart(2, '0')}`,
  });
}

export function plotSlot(index: number): PlotSlot {
  return PLOT_SLOTS[index] ?? PLOT_SLOTS[0];
}

/** Owner spawn: a couple of meters into the walkway, facing their stall. */
export function spawnForPlot(index: number): { x: number; z: number; rot: number } {
  const slot = plotSlot(index);
  const inward = slot.side === 'west' ? 1 : -1;
  return {
    x: slot.x + inward * 3.1,
    z: slot.z + 0.6,
    rot: slot.side === 'west' ? -Math.PI / 2 : Math.PI / 2,
  };
}

export const STALL_FACING: Record<'west' | 'east', number> = {
  west: Math.PI / 2,
  east: -Math.PI / 2,
};

export const CATEGORY_WORLD_LABEL: Record<StallCategory, string> = {
  driedFish: 'DANGGIT & PASALUBONG',
  fruit: 'FRESH FRUITS',
  streetFood: 'STREET FOOD',
  ukay: 'UKAY-UKAY',
};

/** Pedestrian route spine used by NPCs, expressed as z coordinate lanes. */
export const PEDESTRIAN_LANES = [-5.5, -2.5, 0.5, 3.2, 6.2, -13.4, 13.4];
