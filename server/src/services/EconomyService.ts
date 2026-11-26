import {
  CATEGORY_ORDER,
  GOALS,
  POWERUPS,
  PRODUCTS,
  PRODUCT_BY_ID,
  STALL_CATEGORIES,
  START_BALANCE,
  UPGRADE_TREE,
  dateForDay,
  phaseFor,
  upgradeById,
  type ActiveEventState,
  type MarketEventType,
  type ProductDef,
  type StallCategory,
  type UpgradeBranch,
} from '../../../shared/config';
import type {
  Appearance,
  DailyReport,
  PlayerProfile,
  SukiCustomer,
  TodayStats,
} from '../../../shared/types';

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export interface EconomyNotice {
  kind: 'info' | 'success' | 'warning' | 'danger' | 'event';
  title: string;
  message: string;
}

export interface SaleResult {
  revenue: number;
  customers: number;
  sold: number;
  reputationGained: number;
  notices: EconomyNotice[];
  soldOut: StallCategory[];
}

const SHIRT_COLORS = ['#3f78c4', '#c44848', '#3f9b72', '#c9a23c', '#8455b5', '#d977a6', '#4f5f70'];

const SUKI_FIRST = ['Aling', 'Mang', 'Inday', 'Kuy', 'Manang', 'Tatay', 'Nanay', 'Kuya'];
const SUKI_NAMES = [
  'Nena', 'Corazon', 'Lorna', 'Fe', 'Rowena', 'Divine', 'Mylene', 'Angel',
  'Jojo', 'Bong', 'Rene', 'Totoy', 'Cardo', 'Efren', 'Jun', 'Marlo',
];
const PANTS_COLORS = ['#29303d', '#3a3f52', '#4b3f34', '#2d4757'];
const SKIN_COLORS = ['#c98d64', '#b8784f', '#e0aa7e', '#9a6442', '#8a5436'];
const HAIR_COLORS = ['#1d1a1a', '#2e2420', '#141414'];

export function makeAppearance(seed = Math.random()): Appearance {
  const i = Math.floor(seed * 997) % SHIRT_COLORS.length;
  return {
    shirt: SHIRT_COLORS[i],
    pants: PANTS_COLORS[(i + 1) % PANTS_COLORS.length],
    skin: SKIN_COLORS[(i + 2) % SKIN_COLORS.length],
    hair: HAIR_COLORS[(i + 1) % HAIR_COLORS.length],
  };
}

export function emptyToday(repStart: number): TodayStats {
  return {
    revenue: 0,
    expenses: 0,
    customers: 0,
    productsSold: 0,
    spoiled: 0,
    theftLoss: 0,
    incidents: 0,
    repStart,
    soldByProduct: {},
    expenseBreakdown: {},
  };
}

export function makeSupplierPrices(): Record<StallCategory, number> {
  const result = {} as Record<StallCategory, number>;
  for (const category of CATEGORY_ORDER) result[category] = Number(rand(0.88, 1.16).toFixed(3));
  return result;
}

function makeForecast(): Record<StallCategory, number> {
  const result = {} as Record<StallCategory, number>;
  for (const category of CATEGORY_ORDER) result[category] = Number(rand(0.86, 1.22).toFixed(3));
  return result;
}

export function createNewProfile(input: {
  id: string;
  name: string;
  category: StallCategory;
  appearance?: Appearance;
  plotIndex: number;
  day: number;
  dayProgress: number;
}): PlayerProfile {
  const appearance = input.appearance ?? makeAppearance(input.name.length / 17);
  const inventory: Record<string, number> = {};
  for (const product of PRODUCTS) {
    inventory[product.id] = product.category === input.category ? 14 : 0;
  }
  const prices: Record<string, number> = {};
  for (const product of PRODUCTS) prices[product.id] = product.price;

  return {
    id: input.id,
    name: input.name,
    businessName: `${input.name}'s Merkado`,
    plotIndex: input.plotIndex,
    balance: START_BALANCE,
    reputation: 0,
    day: input.day,
    dayProgress: input.dayProgress,
    inventory,
    prices,
    unlockedCategories: [input.category],
    chosenUpgrades: {},
    powerUps: [],
    permitShields: 0,
    stallCount: 1,
    employees: 0,
    today: emptyToday(0),
    lifetime: {
      totalEarnings: 0,
      totalRevenue: 0,
      totalExpenses: 0,
      totalCustomers: 0,
      totalProductsSold: 0,
      totalSpoiled: 0,
      totalUpgrades: 0,
      daysPlayed: 0,
      peakDayRevenue: 0,
    },
    reports: [],
    goalStage: 0,
    supplierPrices: makeSupplierPrices(),
    supplierForecast: makeForecast(),
    appearance,
    weather: { condition: 'clear', temperature: 24 },
    activeEvent: null,
    nextDayEvent: null,
    suki: [],
    lastSukiNoticeAt: 0,
    quest: null,
    difficulty: 'standard',
    updatedAt: Date.now(),
    online: false,
  };
}

/** Repairs older/partial saves and makes sure every shared field exists. */
export function normalizeProfile(input: PlayerProfile): PlayerProfile {
  const profile = input as PlayerProfile;
  profile.online = false;
  profile.balance = Number.isFinite(profile.balance) ? Math.max(0, profile.balance) : START_BALANCE;
  profile.reputation = clamp(Number(profile.reputation) || 0, 0, 100);
  profile.day = Math.max(1, Math.floor(profile.day || 1));
  profile.dayProgress = clamp(profile.dayProgress || 0.5, 0, 0.999);
  profile.businessName = profile.businessName || `${profile.name}'s Merkado`;
  profile.appearance = { ...makeAppearance(), ...(profile.appearance ?? {}) };
  profile.inventory = profile.inventory ?? {};
  profile.prices = profile.prices ?? {};
  profile.unlockedCategories = (profile.unlockedCategories?.length ? profile.unlockedCategories : ['streetFood']) as StallCategory[];
  profile.unlockedCategories = [...new Set(profile.unlockedCategories)].filter((c) => !!STALL_CATEGORIES[c]);
  profile.chosenUpgrades = profile.chosenUpgrades ?? {};
  profile.powerUps = Array.isArray(profile.powerUps) ? profile.powerUps : [];
  profile.permitShields = Math.max(0, Math.floor(profile.permitShields || 0));
  profile.stallCount = Math.max(1, Math.floor(profile.stallCount || 1));
  profile.employees = Math.max(0, Math.floor(profile.employees || 0));
  profile.goalStage = clamp(Math.floor(profile.goalStage || 0), 0, GOALS.length - 1);
  profile.supplierPrices = { ...makeSupplierPrices(), ...(profile.supplierPrices ?? {}) };
  profile.supplierForecast = { ...makeForecast(), ...(profile.supplierForecast ?? {}) };
  profile.weather = profile.weather ?? { condition: 'clear', temperature: 24 };
  profile.activeEvent = null;
  profile.nextDayEvent = profile.nextDayEvent ?? null;
  profile.suki = Array.isArray(profile.suki) ? profile.suki.slice(0, 14) : [];
  profile.lastSukiNoticeAt = Number(profile.lastSukiNoticeAt) || 0;
  profile.quest = profile.quest ?? null;
  profile.difficulty =
    profile.difficulty === 'chill' || profile.difficulty === 'hustle' ? profile.difficulty : 'standard';
  profile.updatedAt = profile.updatedAt || Date.now();
  profile.today = profile.today ?? emptyToday(profile.reputation);
  profile.today.soldByProduct = profile.today.soldByProduct ?? {};
  profile.today.expenseBreakdown = profile.today.expenseBreakdown ?? {};
  profile.lifetime = profile.lifetime ?? {
    totalEarnings: 0,
    totalRevenue: 0,
    totalExpenses: 0,
    totalCustomers: 0,
    totalProductsSold: 0,
    totalSpoiled: 0,
    totalUpgrades: 0,
    daysPlayed: 0,
    peakDayRevenue: 0,
  };
  profile.reports = Array.isArray(profile.reports) ? profile.reports.slice(-20) : [];

  for (const product of PRODUCTS) {
    if (!Number.isFinite(profile.inventory[product.id])) profile.inventory[product.id] = 0;
    if (!Number.isFinite(profile.prices[product.id])) profile.prices[product.id] = product.price;
    profile.prices[product.id] = clamp(
      Math.round(profile.prices[product.id] || product.price),
      Math.floor(product.price * 0.7),
      Math.ceil(product.price * 1.4),
    );
  }
  profile.employees = employeeCount(profile);
  profile.stallCount = 1 + (hasUpgrade(profile, 'secondStall') ? 1 : 0);
  syncExpiredPowerUps(profile, Date.now());
  return profile;
}

// ── Upgrade helpers ─────────────────────────────────────────────────────────

export function chosenUpgradeId(profile: PlayerProfile, branch: UpgradeBranch, tier: number): string | null {
  return profile.chosenUpgrades[`${branch}-${tier}`] ?? null;
}

export function hasUpgrade(profile: PlayerProfile, upgradeId: string): boolean {
  return Object.values(profile.chosenUpgrades).includes(upgradeId);
}

export function chosenUpgradeIds(profile: PlayerProfile): string[] {
  return Object.values(profile.chosenUpgrades);
}

export function employeeCount(profile: PlayerProfile): number {
  const count = Object.values(profile.chosenUpgrades).filter((id) => {
    const found = upgradeById(id);
    return found?.branch === 'workers';
  }).length;
  return count;
}

export function dailyWages(profile: PlayerProfile): number {
  let wages = 0;
  for (const id of chosenUpgradeIds(profile)) {
    wages += upgradeById(id)?.option.dailyCost ?? 0;
  }
  return wages;
}

export function stockCapacity(profile: PlayerProfile, product: ProductDef): number {
  let cap = product.maxStock;
  if (hasUpgrade(profile, 'displayShelves')) cap += 8;
  if (hasUpgrade(profile, 'biggerTable')) cap += 20;
  if (hasUpgrade(profile, 'secondStall')) cap += 10;
  if (hasUpgrade(profile, 'bulkStock')) cap += 8;
  return cap;
}

export function productUnlocked(profile: PlayerProfile, product: ProductDef): boolean {
  return profile.unlockedCategories.includes(product.category);
}

export function supplierUnitCost(profile: PlayerProfile, product: ProductDef, eventType: MarketEventType | null): number {
  let multiplier = profile.supplierPrices[product.category] ?? 1;
  if (hasUpgrade(profile, 'supplierContract')) multiplier *= 0.85;
  if (eventType === 'shortage') multiplier *= 1.2;
  return Math.max(1, Math.round(product.cost * multiplier));
}

export function priceModifier(profile: PlayerProfile): number {
  let modifier = 1;
  if (hasUpgrade(profile, 'qualityUpgrade')) modifier *= 1.08;
  if (hasUpgrade(profile, 'premiumLine')) modifier *= 1.22;
  if (hasUpgrade(profile, 'bulkStock')) modifier *= 0.9;
  return modifier;
}

export function effectiveSellingPrice(profile: PlayerProfile, product: ProductDef): number {
  return Math.max(1, Math.round((profile.prices[product.id] ?? product.price) * priceModifier(profile)));
}

export function activePowerUp(profile: PlayerProfile, id: string, now: number): boolean {
  return profile.powerUps.some((p) => {
    if (p.id !== id) return false;
    if (p.endsAt === null) return p.id === 'permitShield' ? (p.uses ?? 0) > 0 : true;
    return p.endsAt > now;
  });
}

export function syncExpiredPowerUps(profile: PlayerProfile, now: number): void {
  profile.powerUps = profile.powerUps.filter((p) => {
    if (p.endsAt !== null) return p.endsAt > now;
    return p.id !== 'permitShield' || (p.uses ?? 0) > 0;
  });
}

export function activeEventMultiplier(event: ActiveEventState | null, now: number, profile: PlayerProfile): number {
  if (!event || event.endsAt <= now) return 1;
  switch (event.type) {
    case 'rain':
      return 0.8;
    case 'typhoon':
      return 0.52;
    case 'jeepneyStrike':
      return 0.68;
    case 'theft':
      return 0.94;
    case 'blackout':
      return 0.86;
    case 'rival':
      return 0.86;
    case 'inspection':
      return 0.6;
    case 'fiesta':
      return 1.55;
    case 'christmasRush':
      return 1.7;
    case 'staffIssue':
      return hasUpgrade(profile, 'manager') ? 0.96 : 0.68;
    default:
      return 1;
  }
}

function trafficMultiplier(profile: PlayerProfile, event: ActiveEventState | null, now: number): number {
  let multiplier = 1;
  if (hasUpgrade(profile, 'displayShelves')) multiplier *= 1.18;
  if (hasUpgrade(profile, 'signage')) multiplier *= 1.22;
  if (hasUpgrade(profile, 'barker')) multiplier *= 1.18;
  if (hasUpgrade(profile, 'bulkStock')) multiplier *= 1.35;
  if (hasUpgrade(profile, 'premiumLine')) multiplier *= 0.88;
  if (activePowerUp(profile, 'megaphone', now)) multiplier *= 1.5;
  if (activePowerUp(profile, 'sukiDay', now)) multiplier *= 1.2;
  multiplier *= activeEventMultiplier(event, now, profile);
  return multiplier;
}

function serviceCapacity(profile: PlayerProfile, now: number): number {
  let capacity = 3;
  if (hasUpgrade(profile, 'helper')) capacity += 3;
  if (hasUpgrade(profile, 'cashier')) capacity += 4;
  if (hasUpgrade(profile, 'manager')) capacity += 5;
  if (activePowerUp(profile, 'extraHands', now)) capacity += 4;
  return capacity;
}

// ── Sales simulation ────────────────────────────────────────────────────────

export function simulateSales(
  profile: PlayerProfile,
  now: number,
  activeEvent: ActiveEventState | null,
): SaleResult {
  const notices: EconomyNotice[] = [];
  const soldOut: StallCategory[] = [];
  const result: SaleResult = {
    revenue: 0,
    customers: 0,
    sold: 0,
    reputationGained: 0,
    notices,
    soldOut,
  };

  const phase = phaseFor(profile.dayProgress);
  profile.today.repStart = Math.min(profile.today.repStart, profile.reputation);

  const unlocked = profile.unlockedCategories.filter((c) => CATEGORY_ORDER.includes(c));
  if (!unlocked.length) return result;

  const categories = unlocked.map((id) => STALL_CATEGORIES[id]);
  const totalDemandWeight = categories.reduce((sum, c) => sum + c.baseDemand, 0);
  const traffic = trafficMultiplier(profile, activeEvent, now);
  const timeModifier = phase.demand;

  let attempts =
    (0.58 + profile.reputation * 0.0075 + (profile.stallCount - 1) * 0.28) *
    traffic *
    timeModifier *
    rand(0.72, 1.28);

  let serviceLeft = serviceCapacity(profile, now);
  if (serviceLeft <= 0) return result;

  for (const category of categories) {
    const products = PRODUCTS.filter((p) => p.category === category.id);
    const stockUnits = products.reduce((sum, p) => sum + (profile.inventory[p.id] ?? 0), 0);
    if (stockUnits <= 0) {
      soldOut.push(category.id);
      continue;
    }

    // Some categories have their own rush hours.
    let categoryMod = 1;
    if (category.id === 'streetFood') {
      categoryMod = phase.id === 'evening' ? 1.4 : phase.id === 'morning' ? 0.8 : 1;
    } else if (category.id === 'driedFish') {
      categoryMod = phase.id === 'afternoon' ? 1.25 : 0.95;
    } else if (category.id === 'fruit') {
      categoryMod = phase.id === 'afternoon' ? 1.18 : 1;
    } else if (category.id === 'ukay') {
      categoryMod = phase.id === 'night' ? 1.12 : 1;
    }

    let priceAttraction = 1;
    let expectedRatio = 0;
    for (const product of products) {
      const base = product.price;
      const price = effectiveSellingPrice(profile, product);
      expectedRatio += price / base;
    }
    expectedRatio /= Math.max(1, products.length);
    priceAttraction = clamp(1 - (expectedRatio - 1) * 0.9, 0.55, 1.16);

    const share = category.baseDemand / totalDemandWeight;
    let potentialCustomers = attempts * share * categoryMod * priceAttraction;
    const guaranteed = Math.floor(potentialCustomers);
    let buyers = guaranteed + (Math.random() < potentialCustomers - guaranteed ? 1 : 0);
    buyers = Math.min(buyers, serviceLeft, Math.floor(stockUnits / 1.4));
    if (buyers <= 0) continue;

    for (let b = 0; b < buyers; b++) {
      const remaining = products.filter((p) => (profile.inventory[p.id] ?? 0) > 0);
      if (!remaining.length) break;
      let qty = 1 + Math.floor(Math.random() * 2);
      if (activePowerUp(profile, 'sukiDay', now)) qty += 1;
      if (hasUpgrade(profile, 'sukiSpecialist')) qty += Math.random() < 0.35 ? 1 : 0;

      for (let q = 0; q < qty; q++) {
        const inStock = products.filter((p) => (profile.inventory[p.id] ?? 0) > 0);
        if (!inStock.length) break;
        const weighted: ProductDef[] = [];
        for (const p of inStock) {
          const weight = Math.max(1, Math.ceil((profile.inventory[p.id] ?? 0) / 6));
          for (let w = 0; w < weight; w++) weighted.push(p);
        }
        const product = pick(weighted);
        profile.inventory[product.id] -= 1;
        let unitPrice = effectiveSellingPrice(profile, product);
        if (!activePowerUp(profile, 'tawadShield', now)) {
          unitPrice = Math.round(unitPrice * (1 - category.haggle));
        }
        result.revenue += unitPrice;
        result.sold += 1;
        profile.today.soldByProduct[product.id] = (profile.today.soldByProduct[product.id] ?? 0) + 1;
      }
      result.customers += 1;
      serviceLeft -= 1;
      if (serviceLeft <= 0) break;
    }
    attempts = Math.max(0, attempts - buyers);
  }

  if (result.revenue > 0) {
    profile.balance += result.revenue;
    profile.today.revenue += result.revenue;
    profile.today.customers += result.customers;
    profile.today.productsSold += result.sold;
    profile.lifetime.totalRevenue += result.revenue;
    profile.lifetime.totalEarnings += result.revenue;
    profile.lifetime.totalCustomers += result.customers;
    profile.lifetime.totalProductsSold += result.sold;
    profile.reputation = clamp(
      profile.reputation + result.customers * 0.16 + result.sold * 0.012,
      0,
      100,
    );
    recordSukiVisit(profile, now, notices);
  }

  // Low-stock warning (one shared throttle lives in GameService).
  for (const category of soldOut) {
    const name = STALL_CATEGORIES[category].shortName;
    notices.push({
      kind: 'warning',
      title: 'Sold out',
      message: `${name} has run out of stock. Visit the Shop to restock.`,
    });
  }

  return result;
}

/**
 * Regulars (suki) remember a fair price. Now and then one stops by, bumps
 * your reputation a touch, and gets a line in the market chatter.
 */
function recordSukiVisit(profile: PlayerProfile, now: number, notices: EconomyNotice[]): void {
  if (now - (profile.lastSukiNoticeAt ?? 0) < 40_000) return;
  if (Math.random() > 0.4) return;
  profile.lastSukiNoticeAt = now;

  const unlockedProducts = PRODUCTS.filter((p) => profile.unlockedCategories.includes(p.category));
  if (!unlockedProducts.length) return;

  // Prefer returning regulars; occasionally a new face appears.
  let suki: SukiCustomer | undefined;
  if (profile.suki.length && Math.random() < 0.65) {
    const total = profile.suki.reduce((sum, s) => sum + s.visits + 1, 0);
    let roll = Math.random() * total;
    for (const candidate of profile.suki) {
      roll -= candidate.visits + 1;
      if (roll <= 0) {
        suki = candidate;
        break;
      }
    }
    suki ??= profile.suki[0];
  }
  if (!suki) {
    const first = pick(SUKI_FIRST);
    const name = `${first} ${pick(SUKI_NAMES)}`;
    suki = {
      name,
      visits: 0,
      favorite: pick(unlockedProducts).id,
      lastDay: profile.day,
    };
    profile.suki.push(suki);
    profile.suki.sort((a, b) => b.visits - a.visits);
    profile.suki = profile.suki.slice(0, 14);
  }
  suki.visits += 1;
  suki.lastDay = profile.day;
  if (Math.random() < 0.25) suki.favorite = pick(unlockedProducts).id;

  const favorite = PRODUCT_BY_ID[suki.favorite];
  const returning = suki.visits > 1;
  profile.reputation = clamp(profile.reputation + 0.4, 0, 100);
  notices.push({
    kind: 'success',
    title: returning ? `${suki.name} is back` : `New regular: ${suki.name}`,
    message: favorite
      ? `${suki.name} loves your ${favorite.name} — visits counted: ${suki.visits}.`
      : `${suki.name} stopped by your stall. Word travels at the mercado.`,
  });
}

// ── End of day ──────────────────────────────────────────────────────────────

export interface EndDayResult {
  report: DailyReport;
  notices: EconomyNotice[];
}

export function endDay(profile: PlayerProfile, now: number, activeEvent: ActiveEventState | null): EndDayResult {
  const notices: EconomyNotice[] = [];
  const breakdown: Array<{ label: string; amount: number }> = [];
  const beforeRevenue = profile.today.revenue;

  // Power-up: ice block prevents all spoilage today.
  const ice = activePowerUp(profile, 'iceBlock', now);
  const cooler = hasUpgrade(profile, 'coolerBox');
  const blackout = activeEvent && activeEvent.endsAt > now && activeEvent.type === 'blackout';
  let spoiled = 0;
  for (const product of PRODUCTS) {
    if (!productUnlocked(profile, product)) continue;
    const qty = profile.inventory[product.id] ?? 0;
    if (qty <= 0 || product.spoilage <= 0) continue;
    const spoilRate = product.spoilage * (cooler ? 0.4 : 1) * (ice ? 0 : 1) * (blackout ? 1.5 : 1);
    const loss = Math.min(qty, Math.max(spoilRate > 0 ? 1 : 0, Math.round(qty * spoilRate)));
    profile.inventory[product.id] = qty - loss;
    spoiled += loss;
    profile.lifetime.totalSpoiled += loss;
  }
  profile.today.spoiled += spoiled;
  if (spoiled > 0) {
    notices.push({
      kind: 'warning',
      title: 'Spoilage overnight',
      message: `${spoiled} fresh item${spoiled === 1 ? '' : 's'} spoiled. A cooler box or ice block would help.`,
    });
  }

  // Bodega Boy automatically restocks a small amount.
  if (hasUpgrade(profile, 'bodegaBoy')) {
    let restocked = 0;
    let cost = 0;
    for (const product of PRODUCTS) {
      if (!productUnlocked(profile, product)) continue;
      const cap = stockCapacity(profile, product);
      const room = Math.max(0, cap - (profile.inventory[product.id] ?? 0));
      const buy = Math.min(4, room);
      if (buy <= 0) continue;
      const unit = supplierUnitCost(profile, product, activeEvent?.type ?? null);
      if (profile.balance - cost < unit * buy) continue;
      profile.inventory[product.id] = (profile.inventory[product.id] ?? 0) + buy;
      cost += unit * buy;
      restocked += buy;
    }
    if (cost > 0) {
      profile.balance -= cost;
      profile.today.expenses += cost;
      profile.today.expenseBreakdown['Auto-restock'] = (profile.today.expenseBreakdown['Auto-restock'] ?? 0) + cost;
      breakdown.push({ label: 'Bodega auto-restock', amount: -cost });
      if (restocked > 0) {
        notices.push({
          kind: 'info',
          title: 'Bodega Boy restocked',
          message: `${restocked} items were moved to your counter for ₱${cost}.`,
        });
      }
    }
  }

  // Fixed costs & wages.
  const setup = hasUpgrade(profile, 'permanentKiosk') ? 0 : 40;
  const maintenance = 12 * profile.stallCount + 4 * profile.unlockedCategories.length;
  const wages = dailyWages(profile);
  const fixedCost = setup + maintenance + wages;
  const charged = Math.min(profile.balance, fixedCost);
  profile.balance -= charged;
  profile.today.expenses += charged;
  profile.today.expenseBreakdown['Wages & upkeep'] = (profile.today.expenseBreakdown['Wages & upkeep'] ?? 0) + charged;
  if (setup > 0) breakdown.push({ label: 'Nightly setup', amount: -setup });
  breakdown.push({ label: 'Maintenance', amount: -maintenance });
  if (wages > 0) breakdown.push({ label: 'Worker wages', amount: -wages });
  if (charged < fixedCost) {
    notices.push({
      kind: 'danger',
      title: 'Short on cash',
      message: 'Your till could not cover all wages and upkeep. Some staff went unpaid.',
    });
  }

  // Reputation drift.
  let reputationDelta = 0;
  if (profile.today.customers >= 25 && profile.today.incidents === 0) reputationDelta += 1.5;
  if (profile.today.productsSold === 0) reputationDelta -= 0.5;
  if (profile.today.incidents > 0) reputationDelta -= 0.8;
  profile.reputation = clamp(profile.reputation + reputationDelta, 0, 100);
  profile.today.repStart = Math.min(profile.today.repStart, profile.reputation);
  const repChange = Number((profile.reputation - profile.today.repStart).toFixed(1));

  profile.lifetime.totalExpenses += profile.today.expenses;
  profile.lifetime.daysPlayed += 1;
  profile.lifetime.peakDayRevenue = Math.max(profile.lifetime.peakDayRevenue, profile.today.revenue);

  let topProduct: string | null = null;
  let topCount = 0;
  for (const [productId, count] of Object.entries(profile.today.soldByProduct)) {
    if (count > topCount) {
      topCount = count;
      topProduct = PRODUCT_BY_ID[productId]?.name ?? productId;
    }
  }

  const reportsNotes: string[] = [];
  if (profile.today.customers > 40) reportsNotes.push('A busy night on Colon Street.');
  if (profile.today.incidents > 0) reportsNotes.push(`${profile.today.incidents} security incident(s) reported.`);
  if (spoiled > 0) reportsNotes.push(`${spoiled} items lost to spoilage.`);
  if (profile.today.productsSold === 0) reportsNotes.push('No sales recorded — check your stock and prices.');

  const report: DailyReport = {
    day: profile.day,
    dateLabel: dateForDay(profile.day),
    revenue: profile.today.revenue,
    expenses: profile.today.expenses,
    net: profile.today.revenue - profile.today.expenses,
    productsSold: profile.today.productsSold,
    customers: profile.today.customers,
    spoiled: profile.today.spoiled,
    theftLoss: profile.today.theftLoss,
    incidents: profile.today.incidents,
    reputationDelta: repChange,
    reputation: Number(profile.reputation.toFixed(1)),
    notes: reportsNotes,
    breakdown,
    topProduct,
  };

  profile.reports = [...profile.reports, report].slice(-20);
  profile.today = emptyToday(profile.reputation);
  profile.weather = profile.weather ?? { condition: 'clear', temperature: 24 };
  profile.supplierPrices = { ...profile.supplierForecast };
  profile.supplierForecast = makeForecast();
  profile.activeEvent = null;

  // Purchased-only power-ups that last until the day ends.
  profile.powerUps = profile.powerUps.filter((p) => {
    if (p.id === 'iceBlock' || p.id === 'priceRadar') return false;
    return true;
  });
  syncExpiredPowerUps(profile, now);

  checkGoalProgress(profile, notices);

  void beforeRevenue;
  return { report, notices };
}

// ── Goals ───────────────────────────────────────────────────────────────────

export function checkGoalProgress(profile: PlayerProfile, notices: EconomyNotice[] = []): boolean {
  let advanced = false;
  let changed = true;
  while (changed) {
    changed = false;
    const stage = profile.goalStage;
    if (stage >= GOALS.length) break;
    let done = false;
    switch (stage) {
      case 0:
        done = profile.lifetime.totalEarnings >= 5000;
        break;
      case 1:
        done = profile.lifetime.totalCustomers >= 150;
        break;
      case 2:
        done = chosenUpgradeIds(profile).length >= 3 &&
          new Set(chosenUpgradeIds(profile).map((id) => upgradeById(id)?.branch)).size >= 2;
        break;
      case 3:
        done = profile.reputation >= 60 && profile.lifetime.totalEarnings >= 20000;
        break;
      case 4:
        done = profile.unlockedCategories.length >= 4 &&
          chosenUpgradeIds(profile).some((id) => upgradeById(id)?.tier === 3);
        break;
      case 5:
        done = profile.lifetime.totalEarnings >= 100000;
        break;
    }
    if (done) {
      profile.goalStage = stage + 1;
      advanced = true;
      changed = true;
      if (profile.goalStage < GOALS.length) {
        notices.push({
          kind: 'success',
          title: 'Goal complete!',
          message: `New goal: ${GOALS[profile.goalStage].title}`,
        });
      } else {
        notices.push({
          kind: 'success',
          title: 'Merkado legend',
          message: 'You have completed every business goal on Colon Street.',
        });
      }
    }
  }
  return advanced;
}

// ── Purchase helpers ────────────────────────────────────────────────────────

export function addReputation(profile: PlayerProfile, amount: number): void {
  profile.reputation = clamp(profile.reputation + amount, 0, 100);
}

export function nextUnlockedCategory(profile: PlayerProfile): StallCategory | null {
  for (const category of CATEGORY_ORDER) {
    if (!profile.unlockedCategories.includes(category)) return category;
  }
  return null;
}

export function upgradePrice(branch: UpgradeBranch, tier: number, optionId: string): number {
  const found = UPGRADE_TREE[branch].tiers.find((t) => t.tier === tier)?.options.find((o) => o.id === optionId);
  return found?.price ?? 0;
}

export function powerUpPrice(id: string): number {
  return (POWERUPS as Record<string, { price: number }>)[id]?.price ?? 0;
}

export function recordExpense(profile: PlayerProfile, label: string, amount: number): void {
  profile.today.expenses += amount;
  profile.today.expenseBreakdown[label] = (profile.today.expenseBreakdown[label] ?? 0) + amount;
}

export function updateWeather(profile: PlayerProfile, weather: PlayerProfile['weather']): void {
  profile.weather = weather;
}

export function getGoalLine(profile: PlayerProfile): string {
  return GOALS[profile.goalStage]?.title ?? 'You have conquered Colon Street.';
}
