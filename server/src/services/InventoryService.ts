import { PRODUCT_BY_ID, PRODUCTS, type MarketEventType } from '../../../shared/config';
import type { PlayerProfile } from '../../../shared/types';
import {
  productUnlocked,
  recordExpense,
  stockCapacity,
  supplierUnitCost,
} from './EconomyService';

export interface StockResult {
  ok: boolean;
  error?: string;
  purchased: number;
  spent: number;
}

export function buyStock(
  profile: PlayerProfile,
  productId: string,
  requestedQuantity: number,
  eventType: MarketEventType | null,
): StockResult {
  const product = PRODUCT_BY_ID[productId];
  if (!product) return { ok: false, error: 'Unknown product.', purchased: 0, spent: 0 };
  if (!productUnlocked(profile, product)) {
    return { ok: false, error: 'That product category is not unlocked yet.', purchased: 0, spent: 0 };
  }
  const quantity = Math.floor(Number(requestedQuantity));
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 200) {
    return { ok: false, error: 'Invalid stock quantity.', purchased: 0, spent: 0 };
  }
  const cap = stockCapacity(profile, product);
  const current = profile.inventory[product.id] ?? 0;
  const room = Math.max(0, cap - current);
  if (room <= 0) {
    return { ok: false, error: 'Storage is full. Upgrade your stall for more capacity.', purchased: 0, spent: 0 };
  }
  const actual = Math.min(quantity, room);
  const unitCost = supplierUnitCost(profile, product, eventType);
  const affordable = Math.floor(profile.balance / unitCost);
  const purchased = Math.min(actual, affordable);
  if (purchased <= 0) {
    return { ok: false, error: `You need at least ₱${unitCost} to buy stock.`, purchased: 0, spent: 0 };
  }
  const spent = purchased * unitCost;
  profile.balance -= spent;
  profile.inventory[product.id] = current + purchased;
  recordExpense(profile, 'Stock purchases', spent);
  profile.updatedAt = Date.now();
  if (purchased < quantity) {
    return {
      ok: true,
      purchased,
      spent,
      error: purchased < actual ? 'Bought as much as your till could afford.' : 'Bought up to your storage capacity.',
    };
  }
  return { ok: true, purchased, spent };
}

export interface PriceResult {
  ok: boolean;
  error?: string;
  price: number;
}

export function setSellingPrice(profile: PlayerProfile, productId: string, requestedPrice: number): PriceResult {
  const product = PRODUCT_BY_ID[productId];
  if (!product) return { ok: false, error: 'Unknown product.', price: 0 };
  if (!productUnlocked(profile, product)) {
    return { ok: false, error: 'That product category is not unlocked yet.', price: 0 };
  }
  const numeric = Number(requestedPrice);
  if (!Number.isFinite(numeric)) return { ok: false, error: 'Invalid price.', price: 0 };
  const min = Math.floor(product.price * 0.7);
  const max = Math.ceil(product.price * 1.4);
  const price = Math.round(Math.max(min, Math.min(max, numeric)));
  profile.prices[product.id] = price;
  profile.updatedAt = Date.now();
  return { ok: true, price };
}

export function totalStockValue(profile: PlayerProfile): number {
  let total = 0;
  for (const product of PRODUCTS) {
    if (!productUnlocked(profile, product)) continue;
    total += (profile.inventory[product.id] ?? 0) * product.price;
  }
  return total;
}
