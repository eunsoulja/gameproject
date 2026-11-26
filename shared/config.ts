// ─────────────────────────────────────────────────────────────────────────────
// Merkado De 'Colon — shared game configuration
// The server is authoritative for every economy rule in this file.
// ─────────────────────────────────────────────────────────────────────────────

export type StallCategory = 'driedFish' | 'fruit' | 'streetFood' | 'ukay';
export type UpgradeBranch = 'stall' | 'workers' | 'security' | 'products';
export type WeatherCondition = 'clear' | 'cloudy' | 'rain' | 'typhoon' | 'fiesta';
export type EventVisual = 'none' | 'rain' | 'flood' | 'outage' | 'crowd';
export type PowerUpId =
  | 'iceBlock'
  | 'sukiDay'
  | 'megaphone'
  | 'tawadShield'
  | 'priceRadar'
  | 'extraHands'
  | 'permitShield';

export const START_BALANCE = 1250;
export const DAY_MS = 6 * 60 * 1000;
export const START_DAY_PROGRESS = 0.52; // the market opens at dusk — evening rush
export const MAX_PLOTS = 16;
export const WORLD_SEED = 20261118;

export interface StallCategoryDef {
  id: StallCategory;
  name: string;
  shortName: string;
  tagline: string;
  icon: string;
  color: string;
  accent: string;
  baseDemand: number;
  haggle: number;
  spoil: number;
}

export const STALL_CATEGORIES: Record<StallCategory, StallCategoryDef> = {
  driedFish: {
    id: 'driedFish',
    name: 'Dried Fish & Danggit',
    shortName: 'Danggit',
    tagline: 'Pasalubong favorites that keep for weeks.',
    icon: 'fish',
    color: '#3f8ccc',
    accent: '#8fd0ff',
    baseDemand: 0.8,
    haggle: 0.06,
    spoil: 0,
  },
  fruit: {
    id: 'fruit',
    name: 'Fruit Stand',
    shortName: 'Fruits',
    tagline: 'Sweet Cebu mangoes, bananas and lanzones.',
    icon: 'mango',
    color: '#e6a52e',
    accent: '#ffe08a',
    baseDemand: 1.08,
    haggle: 0.08,
    spoil: 0.13,
  },
  streetFood: {
    id: 'streetFood',
    name: 'Street Food',
    shortName: 'Street Food',
    tagline: 'Siomai, barbecue and puso for the night crowd.',
    icon: 'bbq',
    color: '#d94b3d',
    accent: '#ffb27a',
    baseDemand: 1.32,
    haggle: 0.05,
    spoil: 0.16,
  },
  ukay: {
    id: 'ukay',
    name: 'Ukay-Ukay',
    shortName: 'Ukay-Ukay',
    tagline: 'Pre-loved finds, thrift hauls and lucky bargains.',
    icon: 'shirt',
    color: '#8a5bc7',
    accent: '#d8b9ff',
    baseDemand: 0.95,
    haggle: 0.18,
    spoil: 0,
  },
};

export const CATEGORY_ORDER: StallCategory[] = ['driedFish', 'fruit', 'streetFood', 'ukay'];

export interface ProductDef {
  id: string;
  name: string;
  category: StallCategory;
  cost: number;
  price: number;
  unit: string;
  maxStock: number;
  spoilage: number;
  iconColor: string;
}

export const PRODUCTS: ProductDef[] = [
  // Dried fish
  { id: 'danggit', name: 'Danggit', category: 'driedFish', cost: 34, price: 62, unit: 'packs', maxStock: 48, spoilage: 0, iconColor: '#d8c29a' },
  { id: 'driedSquid', name: 'Dried Squid', category: 'driedFish', cost: 46, price: 82, unit: 'packs', maxStock: 40, spoilage: 0, iconColor: '#c5a27d' },
  { id: 'tinapa', name: 'Tinapa', category: 'driedFish', cost: 28, price: 52, unit: 'packs', maxStock: 50, spoilage: 0, iconColor: '#b98e65' },
  { id: 'bangus', name: 'Boneless Bangus', category: 'driedFish', cost: 65, price: 112, unit: 'packs', maxStock: 30, spoilage: 0, iconColor: '#c9d4d8' },
  // Fruit
  { id: 'mango', name: 'Cebu Mangoes', category: 'fruit', cost: 24, price: 45, unit: 'kg', maxStock: 52, spoilage: 0.15, iconColor: '#f4bf32' },
  { id: 'banana', name: 'Saging', category: 'fruit', cost: 14, price: 27, unit: 'bunches', maxStock: 60, spoilage: 0.11, iconColor: '#e8d24a' },
  { id: 'lanzones', name: 'Lanzones', category: 'fruit', cost: 32, price: 58, unit: 'kg', maxStock: 40, spoilage: 0.18, iconColor: '#d9c57d' },
  { id: 'watermelon', name: 'Pakwan', category: 'fruit', cost: 38, price: 68, unit: 'pieces', maxStock: 28, spoilage: 0.09, iconColor: '#e05454' },
  // Street food
  { id: 'siomai', name: 'Siomai', category: 'streetFood', cost: 11, price: 24, unit: 'servings', maxStock: 70, spoilage: 0.2, iconColor: '#e8ce96' },
  { id: 'barbecue', name: 'Pork BBQ', category: 'streetFood', cost: 17, price: 35, unit: 'sticks', maxStock: 64, spoilage: 0.22, iconColor: '#a84c32' },
  { id: 'puso', name: 'Puso', category: 'streetFood', cost: 7, price: 15, unit: 'pieces', maxStock: 80, spoilage: 0.24, iconColor: '#e2d5a4' },
  { id: 'kwek', name: 'Kwek-Kwek', category: 'streetFood', cost: 9, price: 21, unit: 'servings', maxStock: 56, spoilage: 0.18, iconColor: '#e98a2d' },
  // Ukay-ukay
  { id: 'shirt', name: 'Ukay Shirt', category: 'ukay', cost: 38, price: 88, unit: 'pieces', maxStock: 34, spoilage: 0, iconColor: '#6aa7d9' },
  { id: 'jeans', name: 'Denim Jeans', category: 'ukay', cost: 72, price: 158, unit: 'pieces', maxStock: 24, spoilage: 0, iconColor: '#49617f' },
  { id: 'jacket', name: 'Vintage Jacket', category: 'ukay', cost: 95, price: 205, unit: 'pieces', maxStock: 18, spoilage: 0, iconColor: '#6b4a7f' },
  { id: 'kidsSet', name: 'Kids Set', category: 'ukay', cost: 30, price: 68, unit: 'sets', maxStock: 30, spoilage: 0, iconColor: '#df8aa6' },
];

export const PRODUCT_BY_ID: Record<string, ProductDef> = Object.fromEntries(
  PRODUCTS.map((p) => [p.id, p]),
);

export interface UpgradeOption {
  id: string;
  name: string;
  description: string;
  effect: string;
  price: number;
  dailyCost?: number;
  icon: string;
}

export interface UpgradeTier {
  tier: number;
  name: string;
  options: UpgradeOption[];
}

export interface UpgradeBranchDef {
  id: UpgradeBranch;
  name: string;
  blurb: string;
  icon: string;
  color: string;
  tiers: UpgradeTier[];
}

export const UPGRADE_TREE: Record<UpgradeBranch, UpgradeBranchDef> = {
  stall: {
    id: 'stall',
    name: 'Stall',
    blurb: 'Grow from a single tarp to a permanent market fixture.',
    icon: 'stall',
    color: '#f0a43c',
    tiers: [
      {
        tier: 1,
        name: 'Starter Foundations',
        options: [
          {
            id: 'rainTarp',
            name: 'Rain Tarp',
            description: 'A sturdy reinforced tarp over your counter.',
            effect: 'Blocks rain and typhoon inventory damage.',
            price: 450,
            icon: 'tarp',
          },
          {
            id: 'displayShelves',
            name: 'Display Shelves',
            description: 'Tiered wooden shelves stacked with your best goods.',
            effect: '+18% customers · +8 stock cap per product.',
            price: 500,
            icon: 'shelf',
          },
        ],
      },
      {
        tier: 2,
        name: 'Bigger Business',
        options: [
          {
            id: 'biggerTable',
            name: 'Bigger Table',
            description: 'Two extra meters of counter space for overflow stock.',
            effect: '+20 stock capacity on every product.',
            price: 1100,
            icon: 'table',
          },
          {
            id: 'signage',
            name: 'Signage',
            description: 'A bright hand-painted sign that reads from across the street.',
            effect: '+22% foot traffic to your stalls.',
            price: 1000,
            icon: 'sign',
          },
        ],
      },
      {
        tier: 3,
        name: 'Market Empire',
        options: [
          {
            id: 'secondStall',
            name: 'Second Stall',
            description: 'Open a second counter beside your original stall.',
            effect: '+1 active stall · +35% sales throughput.',
            price: 2800,
            icon: 'stall2',
          },
          {
            id: 'permanentKiosk',
            name: 'Permanent Kiosk',
            description: 'Concrete footing, lockable shutters, your name on the lease.',
            effect: 'Removes the ₱40 nightly setup cost.',
            price: 2500,
            icon: 'kiosk',
          },
        ],
      },
    ],
  },
  workers: {
    id: 'workers',
    name: 'Workers',
    blurb: 'Hire the neighborhood and let your business run itself.',
    icon: 'workers',
    color: '#5aa7e8',
    tiers: [
      {
        tier: 1,
        name: 'First Hires',
        options: [
          {
            id: 'helper',
            name: 'Helper',
            description: 'A reliable neighbor who serves the next customer in line.',
            effect: '+1 service capacity · ₱35/day wage.',
            price: 600,
            dailyCost: 35,
            icon: 'helper',
          },
          {
            id: 'barker',
            name: 'Barker',
            description: 'A booming voice shouting today’s best deals.',
            effect: '+18% traffic · ₱25/day wage.',
            price: 550,
            dailyCost: 25,
            icon: 'barker',
          },
        ],
      },
      {
        tier: 2,
        name: 'Trusted Crew',
        options: [
          {
            id: 'cashier',
            name: 'Cashier',
            description: 'Fast hands, accurate change, fewer costly mistakes.',
            effect: '+25% throughput · +4% sales value · ₱55/day.',
            price: 1300,
            dailyCost: 55,
            icon: 'cashier',
          },
          {
            id: 'bodegaBoy',
            name: 'Bodega Boy',
            description: 'Keeps stock moving from the storeroom to the counter.',
            effect: 'Auto-restocks 4 units/product each day · ₱45/day.',
            price: 1200,
            dailyCost: 45,
            icon: 'bodega',
          },
        ],
      },
      {
        tier: 3,
        name: 'Leave It To Them',
        options: [
          {
            id: 'manager',
            name: 'Manager',
            description: 'Runs the evening shift while you explore the district.',
            effect: '+30% sales while away from your stall · ₱90/day.',
            price: 3200,
            dailyCost: 90,
            icon: 'manager',
          },
          {
            id: 'sukiSpecialist',
            name: 'Suki Specialist',
            description: 'Remembers every regular by name. They always come back.',
            effect: '+32% repeat customer spend · ₱60/day.',
            price: 2800,
            dailyCost: 60,
            icon: 'suki',
          },
        ],
      },
    ],
  },
  security: {
    id: 'security',
    name: 'Security',
    blurb: 'Protect your till, your stock and your peace of mind.',
    icon: 'security',
    color: '#57c9a1',
    tiers: [
      {
        tier: 1,
        name: 'Basic Protection',
        options: [
          {
            id: 'nightWatch',
            name: 'Padlock & Night Watch',
            description: 'A heavy padlock and a kuya who watches the row after closing.',
            effect: '−40% theft risk · ₱30/day.',
            price: 400,
            dailyCost: 30,
            icon: 'lock',
          },
          {
            id: 'bagCheck',
            name: 'Mirror & Bag Check',
            description: 'A convex mirror and a polite bag check at the counter.',
            effect: '−35% pickpocket risk.',
            price: 450,
            icon: 'mirror',
          },
        ],
      },
      {
        tier: 2,
        name: 'Eyes On The Stall',
        options: [
          {
            id: 'cctv',
            name: 'CCTV',
            description: 'Two cameras and a flickering monitor under the counter.',
            effect: '−55% theft risk · catches incidents for reports.',
            price: 1100,
            icon: 'cctv',
          },
          {
            id: 'guard',
            name: 'Guard',
            description: 'A licensed security guard posted beside your counter.',
            effect: 'Prevents most theft attempts · ₱80/day.',
            price: 1500,
            dailyCost: 80,
            icon: 'guard',
          },
        ],
      },
      {
        tier: 3,
        name: 'Community Shield',
        options: [
          {
            id: 'tanod',
            name: 'Tanod Partnership',
            description: 'Coordinate with the barangay tanod for nightly rounds.',
            effect: '−50% inspection fines · −25% theft · ₱40/day.',
            price: 2600,
            dailyCost: 40,
            icon: 'tanod',
          },
          {
            id: 'alarm',
            name: 'Alarm System',
            description: 'A screaming siren wired to your stall and your phone.',
            effect: 'Instantly notifies you about security incidents.',
            price: 2200,
            icon: 'alarm',
          },
        ],
      },
    ],
  },
  products: {
    id: 'products',
    name: 'Products',
    blurb: 'Better goods, smarter buying, bigger margins.',
    icon: 'products',
    color: '#d886d1',
    tiers: [
      {
        tier: 1,
        name: 'New Offerings',
        options: [
          {
            id: 'newCategory',
            name: 'Unlock New Category',
            description: 'Add a whole new stall category to your market row.',
            effect: 'Unlocks the next product category.',
            price: 900,
            icon: 'category',
          },
          {
            id: 'qualityUpgrade',
            name: 'Quality Upgrade',
            description: 'Choose only the freshest, best-sourced goods.',
            effect: '+8% selling prices · +reputation from every sale.',
            price: 1000,
            icon: 'quality',
          },
        ],
      },
      {
        tier: 2,
        name: 'Smarter Supply',
        options: [
          {
            id: 'coolerBox',
            name: 'Cooler Box',
            description: 'Insulated coolers and a daily ice delivery.',
            effect: '−60% spoilage on fruit and street food.',
            price: 1600,
            icon: 'cooler',
          },
          {
            id: 'supplierContract',
            name: 'Supplier Contract',
            description: 'Lock in prices with the carbon market wholesalers.',
            effect: '−15% supplier costs, forever.',
            price: 1800,
            icon: 'contract',
          },
        ],
      },
      {
        tier: 3,
        name: 'Market Strategy',
        options: [
          {
            id: 'premiumLine',
            name: 'Premium Line',
            description: 'Curated, gift-wrapped pasalubong for discerning buyers.',
            effect: '+22% prices · −12% customers.',
            price: 3500,
            icon: 'premium',
          },
          {
            id: 'bulkStock',
            name: 'Bulk Stock',
            description: 'Buy by the crate, sell by the scoop. Volume wins.',
            effect: '−10% prices · +35% customers.',
            price: 3000,
            icon: 'bulk',
          },
        ],
      },
    ],
  },
};

export const BRANCH_ORDER: UpgradeBranch[] = ['stall', 'workers', 'security', 'products'];

export function upgradeById(id: string): { branch: UpgradeBranch; tier: number; option: UpgradeOption } | null {
  for (const branch of BRANCH_ORDER) {
    for (const tier of UPGRADE_TREE[branch].tiers) {
      const option = tier.options.find((o) => o.id === id);
      if (option) return { branch, tier: tier.tier, option };
    }
  }
  return null;
}

export interface PowerUpDef {
  id: PowerUpId;
  name: string;
  description: string;
  price: number;
  durationMs: number | 'day' | 'untilUsed';
  icon: string;
  color: string;
}

export const POWERUPS: Record<PowerUpId, PowerUpDef> = {
  iceBlock: {
    id: 'iceBlock',
    name: 'Ice Block',
    description: 'Chilled blocks keep every fresh product from spoiling for the rest of the day.',
    price: 120,
    durationMs: 'day',
    icon: 'ice',
    color: '#78d6ff',
  },
  sukiDay: {
    id: 'sukiDay',
    name: 'Suki Card Day',
    description: 'Your regulars come back twice as often. Loyal customers +20% traffic.',
    price: 150,
    durationMs: 6 * 60 * 1000,
    icon: 'suki',
    color: '#ffd36e',
  },
  megaphone: {
    id: 'megaphone',
    name: 'Megaphone',
    description: 'A booming “Tara, bili na!” pulls 50% more foot traffic your way.',
    price: 180,
    durationMs: 4 * 60 * 1000,
    icon: 'megaphone',
    color: '#ff9a5f',
  },
  tawadShield: {
    id: 'tawadShield',
    name: 'Tawad Shield',
    description: 'No haggling. Your posted prices stay firm with every customer.',
    price: 100,
    durationMs: 5 * 60 * 1000,
    icon: 'shield',
    color: '#7cd6a5',
  },
  priceRadar: {
    id: 'priceRadar',
    name: 'Price Radar',
    description: 'Supplier whispers reveal tomorrow’s wholesale price changes.',
    price: 80,
    durationMs: 'day',
    icon: 'radar',
    color: '#a5b8ff',
  },
  extraHands: {
    id: 'extraHands',
    name: 'Extra Hands',
    description: 'A temporary worker helps serve the rush for the next four minutes.',
    price: 140,
    durationMs: 4 * 60 * 1000,
    icon: 'hands',
    color: '#ffc3dd',
  },
  permitShield: {
    id: 'permitShield',
    name: 'Permit Shield',
    description: 'Blocks the next permit inspection fine and temporary closure.',
    price: 200,
    durationMs: 'untilUsed',
    icon: 'permit',
    color: '#d6c48a',
  },
};

export const POWERUP_ORDER: PowerUpId[] = [
  'iceBlock',
  'sukiDay',
  'megaphone',
  'tawadShield',
  'priceRadar',
  'extraHands',
  'permitShield',
];

export type MarketEventType =
  | 'typhoon'
  | 'rain'
  | 'theft'
  | 'inspection'
  | 'rival'
  | 'shortage'
  | 'jeepneyStrike'
  | 'blackout'
  | 'staffIssue'
  | 'fiesta'
  | 'christmasRush';

export interface MarketEventDef {
  type: MarketEventType;
  name: string;
  icon: string;
  description: string;
  visual: EventVisual;
  durationMs: number;
  weight: number;
  severity: 'minor' | 'moderate' | 'major' | 'positive';
}

export const MARKET_EVENTS: Record<MarketEventType, MarketEventDef> = {
  typhoon: {
    type: 'typhoon',
    name: 'Typhoon “Bising”',
    icon: 'typhoon',
    description: 'Strong winds and flooding close parts of the street. Unprotected stock may be damaged.',
    visual: 'flood',
    durationMs: 90_000,
    weight: 4,
    severity: 'major',
  },
  rain: {
    type: 'rain',
    name: 'Evening Rain',
    icon: 'rain',
    description: 'A sudden downpour thins the crowd. A rain tarp protects your inventory.',
    visual: 'rain',
    durationMs: 70_000,
    weight: 13,
    severity: 'minor',
  },
  theft: {
    type: 'theft',
    name: 'Pickpocket Alert',
    icon: 'theft',
    description: 'Daggers are working the crowd near your stall. Security upgrades reduce losses.',
    visual: 'none',
    durationMs: 45_000,
    weight: 9,
    severity: 'moderate',
  },
  inspection: {
    type: 'inspection',
    name: 'Permit Inspection',
    icon: 'permit',
    description: 'Barangay inspectors are checking permits tonight. Fines are possible.',
    visual: 'none',
    durationMs: 40_000,
    weight: 8,
    severity: 'moderate',
  },
  rival: {
    type: 'rival',
    name: 'Rival Stall Opens',
    icon: 'rival',
    description: 'A competitor copies your prices across the street, starting a price war.',
    visual: 'none',
    durationMs: 80_000,
    weight: 10,
    severity: 'moderate',
  },
  shortage: {
    type: 'shortage',
    name: 'Supplier Shortage',
    icon: 'shortage',
    description: 'Wholesale deliveries are delayed. Supplier prices rise for the rest of the day.',
    visual: 'none',
    durationMs: 100_000,
    weight: 8,
    severity: 'moderate',
  },
  jeepneyStrike: {
    type: 'jeepneyStrike',
    name: 'Jeepney Strike',
    icon: 'jeepney',
    description: 'No jeepneys tonight — fewer customers can reach the market.',
    visual: 'none',
    durationMs: 90_000,
    weight: 7,
    severity: 'moderate',
  },
  blackout: {
    type: 'blackout',
    name: 'Power Outage',
    icon: 'blackout',
    description: 'A line fault darkens the block. Coolers fail and fresh stock spoils faster.',
    visual: 'outage',
    durationMs: 55_000,
    weight: 7,
    severity: 'moderate',
  },
  staffIssue: {
    type: 'staffIssue',
    name: 'Staff Walkout',
    icon: 'staff',
    description: 'One of your crew quits over late wages. Service slows for a while.',
    visual: 'none',
    durationMs: 60_000,
    weight: 5,
    severity: 'moderate',
  },
  fiesta: {
    type: 'fiesta',
    name: 'Barangay Fiesta',
    icon: 'fiesta',
    description: 'Banderitas, drums and a huge crowd. Sales surge and stock runs low.',
    visual: 'crowd',
    durationMs: 100_000,
    weight: 6,
    severity: 'positive',
  },
  christmasRush: {
    type: 'christmasRush',
    name: 'Christmas Rush',
    icon: 'christmas',
    description: 'Simbang Gabi crowds fill Colon. Demand spikes — keep those shelves full.',
    visual: 'crowd',
    durationMs: 110_000,
    weight: 5,
    severity: 'positive',
  },
};

export interface ActiveEventState {
  type: MarketEventType;
  startedAt: number;
  endsAt: number;
}

export interface PowerUpState {
  id: PowerUpId;
  activatedAt: number;
  endsAt: number | null;
  uses?: number;
}

export interface GoalDef {
  id: string;
  title: string;
  description: string;
  targetLabel: string;
}

export const GOALS: GoalDef[] = [
  { id: 'firstWeek', title: 'Earn ₱5,000 by the end of the week!', description: 'Total earnings', targetLabel: 'Week 1' },
  { id: 'crowd', title: 'Serve 150 customers at your stall.', description: 'Customers served', targetLabel: 'Market Rhythm' },
  { id: 'upgrades', title: 'Own 3 upgrades across 2 branches.', description: 'Upgrade your business', targetLabel: 'Growing Pains' },
  { id: 'rep', title: 'Reach 60 reputation and ₱20,000 earned.', description: 'Become a Colon staple', targetLabel: 'Suki Status' },
  { id: 'empire', title: 'Unlock all 4 categories and a Tier 3 upgrade.', description: 'Build a market empire', targetLabel: 'Merkado Master' },
  { id: 'legend', title: 'Earn ₱100,000. The whole street knows your name.', description: 'Living legend', targetLabel: 'Colon Legend' },
];

export const PHASES = [
  { id: 'morning', label: 'Morning', start: 0, demand: 0.55 },
  { id: 'afternoon', label: 'Afternoon', start: 0.28, demand: 0.85 },
  { id: 'evening', label: 'Evening', start: 0.5, demand: 1.35 },
  { id: 'night', label: 'Night', start: 0.8, demand: 0.95 },
] as const;

export type PhaseId = (typeof PHASES)[number]['id'];

export function phaseFor(progress: number): (typeof PHASES)[number] {
  let phase: (typeof PHASES)[number] = PHASES[0];
  for (const p of PHASES) if (progress >= p.start) phase = p;
  return phase;
}

/** Server and HUD share this clock representation. */
export function gameClock(progress: number): string {
  // The night market day runs 08:00 → 02:00.
  const totalMinutes = (8 * 60 + progress * 18 * 60) % (24 * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = Math.floor(totalMinutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export const BASE_DATE = new Date(2026, 10, 16, 18, 0, 0); // Monday, Nov 16, in-game calendar

export function dateForDay(day: number): string {
  const d = new Date(BASE_DATE);
  d.setDate(d.getDate() + day - 1);
  return d.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });
}

export const CUSTOMER_NAMES = [
  'Maya', 'Jun', 'Ate Lita', 'Paolo', 'Bea', 'Kiko', 'Nena', 'Renz', 'Shaira', 'Miguel',
  'Andrei', 'Trisha', 'Nonoy', 'Inday', 'Carlo', 'Joy', 'Dado', 'Mylene', 'Jomar', 'Kim',
];

export const SHOP_NAMES = [
  'Aling Nena’s', 'Danggit ni Tatay', 'Manggo Avenue', 'Puso ni Inday', 'Siomai sa Tisa',
  'Ukay ni Ate Vi', 'Cebu Pasalubong', 'Lechon Belly', 'Sari-Sari ni Kuya', 'Fruit Stand ni Lolo',
];

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  icon: string;
  /** Returns true when the profile has earned the badge. */
  check: (p: import('./types').PlayerProfile) => boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first-sale',
    title: 'Unang Benta',
    description: 'Make your very first sale on Colon Street.',
    icon: 'coin',
    check: (p) => p.lifetime.totalProductsSold >= 1,
  },
  {
    id: 'century',
    title: 'Suking Century',
    description: 'Earn ₱100,000 in lifetime revenue.',
    icon: 'trophy',
    check: (p) => p.lifetime.totalRevenue >= 100_000,
  },
  {
    id: 'big-day',
    title: 'Sobrang Araw',
    description: 'Take home ₱5,000 net in a single day.',
    icon: 'star',
    check: (p) => p.reports.some((r) => r.net >= 5_000),
  },
  {
    id: 'regulars',
    title: 'May Suki Na',
    description: 'Have 5 regular customers return to your stall.',
    icon: 'users',
    check: (p) => p.suki.length >= 5,
  },
  {
    id: 'builder',
    title: 'Maringal na Tindahan',
    description: 'Install 8 upgrades across your stall.',
    icon: 'shelf',
    check: (p) => Object.keys(p.chosenUpgrades).length >= 8,
  },
  {
    id: 'week-one',
    title: 'Isang Linggo na Merkado',
    description: 'Keep your stall open for 7 days.',
    icon: 'calendar',
    check: (p) => p.lifetime.daysPlayed >= 7,
  },
  {
    id: 'typhoon-survivor',
    title: 'Bagyo Survivor',
    description: 'Stay open through a typhoon event.',
    icon: 'shield',
    check: (p) => p.reports.some((r) => r.notes.some((n) => /typhoon|bagyo/i.test(n))),
  },
  {
    id: 'legend',
    title: 'Colon Legend',
    description: 'Reach 90 reputation with the whole market.',
    icon: 'parol',
    check: (p) => p.reputation >= 90,
  },
];
