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

// ── District zoning ─────────────────────────────────────────────────────────
// The market is a real district: named zones along the street, each with its
// own character, stall mix and crowd density. Zones tile playableMinZ..maxZ.

export type DistrictTheme = 'ukay' | 'pasalubong' | 'plaza' | 'food' | 'drag' | 'night';

export interface DistrictZone {
  id: string;
  name: string;
  zMin: number;
  zMax: number;
  theme: DistrictTheme;
  /** Relative foot-traffic expectation — guides NPC density and stall mix. */
  crowd: number;
  /** Stall categories this zone favors, in rough priority order. */
  favors: StallCategory[];
}

export const DISTRICTS: DistrictZone[] = [
  {
    id: 'ukay',
    name: 'Ukay Alley',
    zMin: -232,
    zMax: -176,
    theme: 'ukay',
    crowd: 0.45,
    favors: ['ukay', 'ukay', 'streetFood', 'driedFish'],
  },
  {
    id: 'pasalubong',
    name: 'Pasalubong Row',
    zMin: -170,
    zMax: -76,
    theme: 'pasalubong',
    crowd: 0.7,
    favors: ['fruit', 'driedFish', 'streetFood', 'ukay'],
  },
  {
    id: 'plaza',
    name: 'Plaza del Mercado',
    zMin: -70,
    zMax: 16,
    theme: 'plaza',
    crowd: 1.0,
    favors: ['streetFood', 'fruit', 'streetFood', 'ukay'],
  },
  {
    id: 'food',
    name: 'Pares District',
    zMin: 22,
    zMax: 92,
    theme: 'food',
    crowd: 0.85,
    favors: ['streetFood', 'streetFood', 'fruit', 'driedFish'],
  },
  {
    id: 'drag',
    name: 'Colon Drag',
    zMin: 98,
    zMax: 168,
    theme: 'drag',
    crowd: 0.9,
    favors: ['fruit', 'driedFish', 'streetFood', 'ukay'],
  },
  {
    id: 'night',
    name: 'Night Market Row',
    zMin: 174,
    zMax: 232,
    theme: 'night',
    crowd: 0.6,
    favors: ['streetFood', 'ukay', 'driedFish', 'fruit'],
  },
];

export function districtAt(z: number): DistrictZone {
  for (const zone of DISTRICTS) {
    if (z >= zone.zMin && z <= zone.zMax) return zone;
  }
  return DISTRICTS[DISTRICTS.length - 1];
}

/** Category a stall at this z should probably sell — weighted by zone favors. */
export function zoneCategoryAt(z: number, rng: () => number): StallCategory {
  const favors = districtAt(z).favors;
  const roll = rng();
  if (roll < 0.62) return favors[Math.floor(rng() * Math.min(2, favors.length))];
  return favors[Math.floor(rng() * favors.length)];
}
