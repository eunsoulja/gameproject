import {
  CATEGORY_ORDER,
  POWERUP_ORDER,
  POWERUPS,
  PRODUCTS,
  STALL_CATEGORIES,
  type PowerUpId,
  type ProductDef,
  type StallCategory,
} from '../../../shared/config';
import type { PlayerProfile } from '../../../shared/types';
import { openModal, modalHeader, type ModalHandle } from './Modal';
import { clamp, escapeHtml, formatDuration, peso } from './format';
import { CATEGORY_ICONS, POWERUP_ICONS, icon } from './icons';
import type { MenuContext } from './MenuContext';

type ShopTab = 'stock' | 'boosts' | 'suppliers';

const TABS: Array<{ id: ShopTab; label: string; icon: string }> = [
  { id: 'stock', label: 'Stock & prices', icon: 'shop' },
  { id: 'boosts', label: 'Power-ups', icon: 'bolt' },
  { id: 'suppliers', label: 'Supplier radar', icon: 'radar' },
];

export class ShopMenu {
  private ctx: MenuContext;
  private handle: ModalHandle | null = null;
  private tab: ShopTab = 'stock';
  private busy = false;

  constructor(ctx: MenuContext) {
    this.ctx = ctx;
  }

  open(tab: ShopTab = 'stock'): void {
    this.tab = tab;
    this.handle = openModal(
      `
        ${modalHeader({
          eyebrow: 'The supply run',
          eyebrowIcon: icon('shop', 13),
          title: 'Restock the counter',
          subtitle: 'Buy stock, set your prices and keep the suki coming back.',
          right: `<div class="modal-balance">${icon('coin', 14)}<span data-ref="shop-balance">${peso(this.profile.balance)}</span></div>`,
        })}
        <div class="modal-tabs" data-ref="shop-tabs"></div>
        <div class="modal-body" data-ref="shop-body"></div>
        <div class="modal-foot">
          <span class="modal-foot-note" data-ref="shop-foot-note">Fresh stock arrives instantly. Leftover food spoils overnight.</span>
          <button type="button" class="btn-ghost" data-modal-close>Done</button>
        </div>
      `,
      'shop-modal',
    );
    this.renderTabs();
    this.renderBody();
    this.bind();
  }

  refresh(profile: PlayerProfile): void {
    if (!this.handle) return;
    this.renderTabs();
    this.renderBody();
    this.el('shop-balance').textContent = peso(profile.balance);
  }

  private get profile(): PlayerProfile {
    return this.ctx.getProfile();
  }

  private el(ref: string): HTMLElement {
    return this.handle!.el.querySelector<HTMLElement>(`[data-ref="${ref}"]`)!;
  }

  private bind(): void {
    if (!this.handle) return;
    this.handle.el.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const tab = target.closest<HTMLElement>('[data-shop-tab]');
      if (tab) {
        this.tab = tab.dataset.shopTab as ShopTab;
        this.renderTabs();
        this.renderBody();
        return;
      }
      if (this.busy) return;

      const buyStock = target.closest<HTMLButtonElement>('[data-stock-buy]');
      if (buyStock) {
        const productId = buyStock.dataset.stockBuy!;
        const amount = buyStock.dataset.qty ?? '1';
        const product = PRODUCTS.find((item) => item.id === productId);
        if (!product) return;
        const cap = stockCapacity(this.profile, product);
        const current = this.profile.inventory[productId] ?? 0;
        const room = Math.max(0, cap - current);
        const quantity = amount === 'max' ? Math.max(1, room) : Number(amount);
        void this.buyStock(productId, quantity);
        return;
      }

      const preset = target.closest<HTMLButtonElement>('[data-price-preset]');
      if (preset) {
        const productId = preset.dataset.priceProduct!;
        const product = PRODUCTS.find((item) => item.id === productId);
        if (!product) return;
        const factor = Number(preset.dataset.pricePreset);
        const next = clamp(Math.round(product.price * factor), Math.floor(product.price * 0.7), Math.ceil(product.price * 1.4));
        void this.setPrice(product, next);
        return;
      }

      const priceButton = target.closest<HTMLButtonElement>('[data-price-dir]');
      if (priceButton) {
        const productId = priceButton.dataset.priceProduct!;
        const direction = Number(priceButton.dataset.priceDir);
        const product = PRODUCTS.find((item) => item.id === productId);
        if (!product) return;
        const current = this.profile.prices[productId] ?? product.price;
        const step = Math.max(1, Math.round(product.price * 0.05));
        const next = clamp(current + direction * step, Math.floor(product.price * 0.7), Math.ceil(product.price * 1.4));
        void this.setPrice(product, next);
        return;
      }

      const boost = target.closest<HTMLButtonElement>('[data-boost]');
      if (boost) {
        void this.activateBoost(boost.dataset.boost as PowerUpId);
        return;
      }

      const negotiate = target.closest<HTMLButtonElement>('[data-negotiate]');
      if (negotiate) {
        void this.negotiate(negotiate.dataset.negotiate!);
      }
    });
  }

  private async negotiate(category: string): Promise<void> {
    this.busy = true;
    try {
      const result = await this.ctx.network.negotiateSupplier(category);
      if (!result.ok) {
        this.ctx.notify.info('No deal tonight', result.error ?? 'The supplier declined.', 'warning');
      } else if (result.data) {
        this.ctx.onProfile(result.data);
        this.refresh(result.data);
      }
    } catch {
      this.ctx.notify.info('No deal tonight', 'The supplier did not answer.', 'warning');
    } finally {
      this.busy = false;
    }
  }

  private renderTabs(): void {
    if (!this.handle) return;
    const activeBoosts = this.profile.powerUps.filter((power) => {
      if (power.endsAt === null) return (power.uses ?? 0) > 0;
      return power.endsAt > Date.now();
    }).length;
    const tabs = this.el('shop-tabs');
    tabs.innerHTML = TABS.map((tab) => {
      const count =
        tab.id === 'boosts' && activeBoosts > 0 ? `<span class="tab-count">${activeBoosts}</span>` : '';
      return `
        <button type="button" class="modal-tab ${tab.id === this.tab ? 'active' : ''}" data-shop-tab="${tab.id}">
          ${icon(tab.icon, 14)} ${tab.label} ${count}
        </button>
      `;
    }).join('');
  }

  private renderBody(): void {
    if (!this.handle) return;
    const body = this.el('shop-body');
    const scroll = body.scrollTop;
    if (this.tab === 'stock') body.innerHTML = this.renderStock();
    else if (this.tab === 'boosts') body.innerHTML = this.renderBoosts();
    else body.innerHTML = this.renderSuppliers();
    body.scrollTop = scroll;
  }

  private renderStock(): string {
    const profile = this.profile;
    const unlocked = new Set(profile.unlockedCategories);
    const totalUnits = PRODUCTS.filter((product) => unlocked.has(product.category)).reduce(
      (sum, product) => sum + (profile.inventory[product.id] ?? 0),
      0,
    );
    const stockValue = PRODUCTS.filter((product) => unlocked.has(product.category)).reduce(
      (sum, product) => sum + (profile.inventory[product.id] ?? 0) * supplierCost(profile, product),
      0,
    );
    const dayNet = profile.today.revenue - profile.today.expenses;
    const categories = CATEGORY_ORDER.filter((category) => unlocked.has(category));
    const lockedCategories = CATEGORY_ORDER.filter((category) => !unlocked.has(category));

    return `
      <div class="shop-stats-row">
        <div class="shop-stat"><span>Stock on hand</span><b>${totalUnits} units</b></div>
        <div class="shop-stat"><span>Stock at cost</span><b>${peso(stockValue)}</b></div>
        <div class="shop-stat"><span>Today's net</span><b class="${dayNet >= 0 ? 'pos' : 'warn'}">${dayNet >= 0 ? '+' : '−'}${peso(Math.abs(dayNet))}</b></div>
      </div>
      ${categories.map((category) => this.renderCategory(category)).join('')}
      ${
        lockedCategories.length
          ? `<div class="locked-category-note">${icon('lock', 18)}
              <span><b>${lockedCategories.map((category) => STALL_CATEGORIES[category].shortName).join(' · ')}</b> still locked. Buy <b>Unlock New Category</b> from Products Tier 1 to widen your counter.</span>
            </div>`
          : ''
      }
      <div class="shop-hint">${icon('info', 14)}
        <span>Prices can move between 70% and 140% of the market guide. Cheap prices pull a bigger crowd; premium prices protect your margin. Upgrades and events shift your real selling price.</span>
      </div>
    `;
  }

  private renderCategory(category: StallCategory): string {
    const def = STALL_CATEGORIES[category];
    const products = PRODUCTS.filter((product) => product.category === category);
    const supplierIndex = this.profile.supplierPrices[category] ?? 1;
    return `
      <section class="shop-category" style="--cat-color:${def.color}">
        <div class="shop-cat-head">
          <div class="shop-cat-icon">${icon(CATEGORY_ICONS[category], 15)}</div>
          <div><b>${def.name}</b><small>${def.tagline}</small></div>
          <div class="cat-supplier ${supplierIndex > 1.1 ? 'warn' : ''}">Supplier <b>${Math.round(supplierIndex * 100)}%</b></div>
        </div>
        <div class="product-table">
          ${products.map((product) => this.renderProductRow(product)).join('')}
        </div>
      </section>
    `;
  }

  private renderProductRow(product: ProductDef): string {
    const profile = this.profile;
    const stock = profile.inventory[product.id] ?? 0;
    const cap = stockCapacity(profile, product);
    const fraction = cap > 0 ? Math.min(1, stock / cap) : 0;
    const low = fraction < 0.25;
    const cost = supplierCost(profile, product);
    const setPrice = profile.prices[product.id] ?? product.price;
    const effective = effectivePrice(profile, product);
    const margin = effective - cost;
    const room = Math.max(0, cap - stock);
    const affordableUnits = Math.max(0, Math.floor(profile.balance / Math.max(1, cost)));
    const canBuy = room > 0 && affordableUnits > 0;
    const quick = [1, 5, 10].filter((quantity) => quantity <= affordableUnits && quantity <= room);
    const maxQuantity = Math.min(room, affordableUnits, 200);
    const demand = STALL_CATEGORIES.find((c) => c.id === product.category)?.baseDemand ?? 1;
    const ratio = setPrice / Math.max(1, product.price);
    const hint =
      demand >= 1.2 && ratio <= 1.05
        ? 'Hot demand — premium pricing still flies'
        : demand >= 1.2
          ? 'Hot demand — but your price is scaring people off'
          : demand <= 0.85 && ratio >= 1
            ? 'Soft demand — undercut to move stock'
            : demand <= 0.85
              ? 'Soft demand — your price is already competitive'
              : ratio >= 1.15
                ? 'Premium price — expect thinner traffic'
                : 'Balanced — close to market guide';
    return `
      <div class="product-row">
        <div class="product-name">
          <span class="product-swatch" style="--product-color:${product.iconColor}"></span>
          <div style="min-width:0">
            <b>${escapeHtml(product.name)}</b>
            <small>${product.unit} · guides at ${peso(product.price)}</small>
          </div>
        </div>
        <div class="stock-block">
          <div class="stock-numbers ${low ? 'low' : ''}"><span><b>${stock}</b> / ${cap}</span><span>${Math.round(fraction * 100)}%</span></div>
          <div class="stock-bar"><span class="${low ? 'low' : ''}" style="width:${fraction * 100}%"></span></div>
        </div>
        <div class="cost-cell">
          <b>${peso(cost)}</b>
          <small>${margin >= 0 ? '+' : '−'}${peso(Math.abs(margin))} margin</small>
        </div>
        <div class="price-cell">
          <div>
            <div class="price-stepper">
              <button type="button" data-price-dir="-1" data-price-product="${product.id}" aria-label="Lower price">−</button>
              <span class="price-val">${peso(setPrice)}</span>
              <button type="button" data-price-dir="1" data-price-product="${product.id}" aria-label="Raise price">+</button>
            </div>
            <span class="price-warn">${effective !== setPrice ? `${peso(effective)} after perks` : `target ${peso(product.price)}`}</span>
            <span class="price-hint">${escapeHtml(hint)}</span>
            <div class="price-presets">
              <button type="button" data-price-preset="0.85" data-price-product="${product.id}" title="Undercut the guide by 15%">−15%</button>
              <button type="button" data-price-preset="1" data-price-product="${product.id}" title="Match the guide price">Guide</button>
              <button type="button" data-price-preset="1.15" data-price-product="${product.id}" title="Premium pricing, +15%">+15%</button>
            </div>
          </div>
        </div>
        <div class="buy-cell">
          ${quick.map((quantity) => `<button type="button" class="btn-buy-qty" data-stock-buy="${product.id}" data-qty="${quantity}">${quantity}</button>`).join('')}
          <button type="button" class="btn-buy-qty max" data-stock-buy="${product.id}" data-qty="max" ${canBuy && maxQuantity > 0 ? '' : 'disabled'}>All</button>
        </div>
      </div>
    `;
  }

  private renderBoosts(): string {
    const profile = this.profile;
    const now = Date.now();
    return `
      <div class="powerup-info-strip">${icon('bolt', 15)}
        <span>Power-ups are instant and last for the listed time. Only one of each can run at once.</span>
      </div>
      <div class="boost-grid">
        ${POWERUP_ORDER.map((id) => {
          const def = POWERUPS[id];
          const active = profile.powerUps.find((power) => {
            if (power.id !== id) return false;
            if (power.endsAt === null) return (power.uses ?? 0) > 0;
            return power.endsAt > now;
          });
          const duration =
            def.durationMs === 'day'
              ? 'Rest of day'
              : def.durationMs === 'untilUsed'
                ? `${profile.permitShields} shield${profile.permitShields === 1 ? '' : 's'}`
                : formatDuration(def.durationMs);
          const liveLabel = active
            ? active.endsAt === null
              ? 'Ready to use'
              : formatDuration(active.endsAt - now)
            : duration;
          return `
            <article class="boost-card ${active ? 'active-boost' : ''}" style="--boost-color:${def.color}">
              <div class="boost-icon">${icon(POWERUP_ICONS[id] ?? def.icon, 19)}</div>
              <div class="boost-content">
                <div class="boost-top"><b>${escapeHtml(def.name)}</b><span class="boost-duration ${active ? 'live' : ''}">${liveLabel}</span></div>
                <p>${escapeHtml(def.description)}</p>
                <div class="boost-bottom">
                  <span class="boost-price">${peso(def.price)}</span>
                  <button type="button" class="btn-buy ${!active && profile.balance >= def.price ? 'affordable' : ''}"
                    data-boost="${id}" ${active || profile.balance < def.price ? 'disabled' : ''}>
                    ${active ? `${icon('check', 10)} Active` : `${icon('bolt', 10)} Activate`}
                  </button>
                </div>
              </div>
            </article>
          `;
        }).join('')}
      </div>
    `;
  }

  private renderSuppliers(): string {
    const profile = this.profile;
    const radarActive = profile.powerUps.some(
      (power) => power.id === 'priceRadar' && (power.endsAt === null || power.endsAt > Date.now()),
    );
    if (!radarActive) {
      return `
        ${this.negotiateStrip()}
        <div class="radar-locked">
          ${icon('radar', 30)}
          <b>Tomorrow's prices are still a whisper</b>
          <p>Activate the <strong>Price Radar</strong> power-up to see tomorrow's supplier forecast for all four categories before you stock up.</p>
          <button type="button" class="btn-buy affordable" data-shop-tab="boosts">${icon('bolt', 11)} See power-ups</button>
        </div>
      `;
    }
    return `
      ${this.negotiateStrip()}
      <div class="powerup-info-strip">${icon('radar', 15)}
        <span>Price Radar is live. These indices predict tomorrow's wholesale movement — stock up before a rise.</span>
      </div>
      <div class="supplier-grid">
        ${CATEGORY_ORDER.map((category) => {
          const def = STALL_CATEGORIES[category];
          const today = profile.supplierPrices[category] ?? 1;
          const tomorrow = profile.supplierForecast[category] ?? today;
          const diff = tomorrow - today;
          return `
            <section class="supplier-card" style="--cat-color:${def.color}">
              <div class="supplier-head">${icon(CATEGORY_ICONS[category], 15)}<b>${def.shortName}</b><span>today ${Math.round(today * 100)}%</span></div>
              ${PRODUCTS.filter((product) => product.category === category).map((product) => {
                const baseCost = product.cost * tomorrow;
                return `<div class="supplier-line"><span>${escapeHtml(product.name)}</span><span><b>${peso(baseCost)}</b> <span class="supplier-trend ${diff > 0.01 ? 'up' : diff < -0.01 ? 'down' : ''}">${diff > 0.01 ? '▲' : diff < -0.01 ? '▼' : '•'} ${Math.round(Math.abs(tomorrow - today) * 100)}%</span></span></div>`;
              }).join('')}
            </section>
          `;
        }).join('')}
      </div>
    `;
  }

  private negotiateStrip(): string {
    return `
      <div class="negotiation-strip">
        <div class="negotiation-copy">
          <b>${icon('hands', 14)} Haggle with a wholesaler</b>
          <span>Once per night. Better reputation means better odds — win a discount on today's prices, or get pushed back.</span>
        </div>
        <div class="negotiation-actions">
          ${CATEGORY_ORDER.map(
            (category) =>
              `<button type="button" class="btn-ghost negotiate-btn" data-negotiate="${category}" style="--cat:${STALL_CATEGORIES[category].color}">${icon(CATEGORY_ICONS[category], 12)} ${STALL_CATEGORIES[category].shortName}</button>`,
          ).join('')}
        </div>
      </div>
    `;
  }

  private async buyStock(productId: string, quantity: number): Promise<void> {
    this.busy = true;
    try {
      const result = await this.ctx.network.buyStock(productId, quantity);
      if (!result.ok) {
        this.ctx.notify.info('Stock not delivered', result.error ?? 'Please try again.', 'warning');
      } else if (result.data) {
        this.ctx.onProfile(result.data);
        this.refresh(result.data);
      }
    } catch {
      this.ctx.notify.info('Stock not delivered', 'The market did not respond. Try again.', 'warning');
    } finally {
      this.busy = false;
    }
  }

  private async setPrice(product: ProductDef, price: number): Promise<void> {
    this.busy = true;
    try {
      const result = await this.ctx.network.setPrice(product.id, price);
      if (!result.ok) {
        this.ctx.notify.info('Price not changed', result.error ?? 'Please try again.', 'warning');
      } else if (result.data) {
        this.ctx.onProfile(result.data);
        this.refresh(result.data);
      }
    } catch {
      this.ctx.notify.info('Price not changed', 'The market did not respond. Try again.', 'warning');
    } finally {
      this.busy = false;
    }
  }

  private async activateBoost(id: PowerUpId): Promise<void> {
    this.busy = true;
    try {
      const result = await this.ctx.network.activatePowerUp(id);
      if (!result.ok) {
        this.ctx.notify.info('Power-up not activated', result.error ?? 'Please try again.', 'warning');
      } else if (result.data) {
        this.ctx.onProfile(result.data);
        this.refresh(result.data);
      }
    } catch {
      this.ctx.notify.info('Power-up not activated', 'The market did not respond. Try again.', 'warning');
    } finally {
      this.busy = false;
    }
  }

  get activeTab(): ShopTab {
    return this.tab;
  }

  get isBusy(): boolean {
    return this.busy;
  }
}

function hasUpgrade(profile: PlayerProfile, id: string): boolean {
  return Object.values(profile.chosenUpgrades).includes(id);
}

function stockCapacity(profile: PlayerProfile, product: ProductDef): number {
  let cap = product.maxStock;
  if (hasUpgrade(profile, 'displayShelves')) cap += 8;
  if (hasUpgrade(profile, 'biggerTable')) cap += 20;
  if (hasUpgrade(profile, 'secondStall')) cap += 10;
  if (hasUpgrade(profile, 'bulkStock')) cap += 8;
  return cap;
}

function supplierCost(profile: PlayerProfile, product: ProductDef): number {
  let multiplier = profile.supplierPrices[product.category] ?? 1;
  if (hasUpgrade(profile, 'supplierContract')) multiplier *= 0.85;
  if (profile.activeEvent?.type === 'shortage') multiplier *= 1.2;
  return Math.max(1, Math.round(product.cost * multiplier));
}

function effectivePrice(profile: PlayerProfile, product: ProductDef): number {
  let modifier = 1;
  if (hasUpgrade(profile, 'qualityUpgrade')) modifier *= 1.08;
  if (hasUpgrade(profile, 'premiumLine')) modifier *= 1.22;
  if (hasUpgrade(profile, 'bulkStock')) modifier *= 0.9;
  return Math.max(1, Math.round((profile.prices[product.id] ?? product.price) * modifier));
}
