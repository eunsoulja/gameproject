/**
 * Karendero mode — food stalls run a real queue: customers order at the
 * counter, meals auto-cook, and the player picks up and serves each plate.
 */

export interface KarenderoDish {
  id: string;
  name: string;
  /** Base price in pesos before boosts. */
  price: number;
  /** Milliseconds the stove needs before the plate is ready. */
  cookMs: number;
}

export const KARENDERO_DISHES: KarenderoDish[] = [
  { id: 'silog-meat', name: 'Tapsilog', price: 85, cookMs: 9000 },
  { id: 'silog-chicken', name: 'Chicken Silog', price: 95, cookMs: 11000 },
  { id: 'nilaga', name: 'Nilaga', price: 90, cookMs: 10000 },
  { id: 'adobo', name: 'Adobo sa Gatas', price: 110, cookMs: 13000 },
  { id: 'sisig', name: 'Sisig', price: 120, cookMs: 14000 },
  { id: 'daing', name: 'Daing na Bangus', price: 100, cookMs: 12000 },
];

export interface KarenderoDrink {
  id: string;
  name: string;
  price: number;
  cookMs: number;
}

/** Drinks that ride along with a plate when a customer orders both. */
export const KARENDERO_DRINKS: KarenderoDrink[] = [
  { id: 'kape', name: 'Kape Barako', price: 25, cookMs: 4000 },
  { id: 'soda', name: 'Softdrinks', price: 20, cookMs: 3000 },
  { id: 'buko', name: 'Buko Juice', price: 30, cookMs: 6000 },
];

export const KARENDERO_MAX_ORDERS = 3;
/** An order stays claimable this long after it is ready. */
export const KARENDERO_ORDER_TTL_MS = 75_000;

/** "Extra rice?" up-sell price offered after some karendero servings. */
export const KARENDERO_RICE_PRICE = 15;

/** Client-visible snapshot of one open order. */
export interface KarenderoOrderInfo {
  dishId: string;
  dishName: string;
  price: number;
  /** Set when the customer also ordered a drink — rides on the same plate. */
  drinkId?: string;
  drinkName?: string;
  drinkPrice?: number;
  /** Epoch ms when the plate is ready to pick up. */
  readyAt: number;
  /** Epoch ms when the order goes cold. */
  expiresAt: number;
  picked: boolean;
}

/** Result of taking an order at the counter. */
export interface KarenderoOrderReceipt extends KarenderoOrderInfo {
  balance: number;
  /** Cook time in ms — client converts to a local deadline (clock-skew safe). */
  readyInMs: number;
}

/** Result of picking a finished plate off the counter. */
export interface KarenderoPickup {
  dishId: string;
  dishName: string;
  drinkName?: string;
  price: number;
  /** Seconds left on the next still-cooking order, or 0. */
  nextInSec: number;
}
