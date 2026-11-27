import { randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import {
  BRANCH_ORDER,
  DAY_MS,
  MARKET_EVENTS,
  MAX_PLOTS,
  POWERUPS,
  PRODUCT_BY_ID,
  PRODUCTS,
  START_DAY_PROGRESS,
  STALL_CATEGORIES,
  dateForDay,
  phaseFor,
  upgradeById,
  type ActiveEventState,
  type MarketEventType,
  type PhaseId,
  type StallCategory,
  type UpgradeBranch,
} from '../../../shared/config';
import { plotSlot, spawnForPlot } from '../../../shared/layout';
import {
  KARENDERO_DRINKS,
  KARENDERO_DISHES,
  KARENDERO_MAX_ORDERS,
  KARENDERO_ORDER_TTL_MS,
  KARENDERO_RICE_PRICE,
  type KarenderoOrderInfo,
  type KarenderoOrderReceipt,
  type KarenderoPickup,
} from '../../../shared/karendero';
import type {
  Ack,
  Appearance,
  CounterCustomerType,
  GameSnapshot,
  JoinResult,
  MarketOffer,
  PlayerProfile,
  PositionPayload,
  RemotePlayer,
  SaleReceipt,
} from '../../../shared/types';
import { SERVER_CONFIG } from '../config';
import { SaveService, type StoredProfile } from './SaveService';
import { findFreePlot, sortPlots, toPublicPlot } from './PlotService';
import {
  advanceTutorial,
  checkGoalProgress,
  createNewProfile,
  emptyToday,
  endDay,
  ensureQuest,
  effectiveSellingPrice,
  firstNightBoost,
  makeAppearance,
  normalizeProfile,
  simulateSales,
  syncExpiredPowerUps,
  updateQuestProgress,
  updateWeather,
  type EconomyNotice,
} from './EconomyService';
import { activatePowerUp, consumePermitShield, purchaseUpgrade } from './UpgradeService';
import { buyStock, setSellingPrice } from './InventoryService';

interface PlayerRecord {
  profile: PlayerProfile;
  token: string;
  nameKey: string;
  socketId: string | null;
  position: PositionPayload;
  emote: string | null;
  emoteUntil: number;
  lowStockWarnAt: number;
  lastActionAt: number;
  lastServeAt: number;
  lastEmployeeSaleAt?: number;
}

interface PendingOffer {
  offer: MarketOffer;
  record: PlayerRecord;
}

interface PendingHaggle {
  productId: string;
  quantity: number;
  askPrice: number;
  offerPrice: number;
  expiresAt: number;
  customer: CounterCustomerType;
}

interface Clock {
  day: number;
  progress: number;
}

/** One rotating night market twist, picked deterministically by market day. */
const DAILY_CHALLENGES = [
  {
    id: 'premiumNight',
    label: 'Premium night',
    desc: 'Prices at or above guide earn +15% revenue tonight.',
  },
  {
    id: 'earlyBird',
    label: 'Early bird',
    desc: 'Before midday, crowd traffic is +30%.',
  },
  {
    id: 'sukiRush',
    label: 'Suki rush',
    desc: 'Tips are 50% bigger tonight — keep the regulars happy.',
  },
  {
    id: 'bargainNight',
    label: 'Bargain night',
    desc: 'Customers haggle 15% less at your counter.',
  },
] as const;

function dailyChallengeFor(day: number): (typeof DAILY_CHALLENGES)[number] {
  return DAILY_CHALLENGES[Math.abs(day) % DAILY_CHALLENGES.length];
}

const ONLINE_POSITION_HZ = 8;
const ECON_TICK_MS = 5000;
const ANIM_STATES = new Set(['idle', 'walk', 'run', 'jump']);
const EMOTE_STATES = new Set(['wave', 'dance', 'point', 'cheer']);
const OFFER_TTL_MS = 45_000;
const OFFER_INTERVAL_MS = 80_000;

export class GameService {
  private records = new Map<string, PlayerRecord>();
  private nameIndex = new Map<string, string>();
  private clock: Clock = { day: 1, progress: START_DAY_PROGRESS };
  private activeEvent: ActiveEventState | null = null;
  private dayWeather: PlayerProfile['weather'] = { condition: 'clear', temperature: 24 };
  private lastPhase: PhaseId = 'afternoon';
  private lastTick = Date.now();
  private lastEconomyTick = 0;
  private lastPositionBroadcast = 0;
  private lastProfileSync = 0;
  private lastSave = 0;
  private nextEventAllowedAt = Date.now() + 55_000;
  private lastEventType: MarketEventType | null = null;
  private negotiationDay = new Map<string, number>();
  private offers = new Map<string, PendingOffer>();
  private haggles = new Map<string, PendingHaggle>();
  private karenderoOrders = new Map<string, Array<KarenderoOrderInfo & { served?: boolean }>>();
  private lastOrderAt = new Map<string, number>();
  /** profileId → timestamp until which an "extra rice?" offer is open. */
  private karenderoUpsells = new Map<string, number>();
  /** profileId → consecutive plates served within 12s of coming off the stove. */
  private karenderoStreak = new Map<string, number>();
  private rushUntil = 0;
  private nextRushAt = 0;
  private nextOfferAt = 0;
  private plotsDirty = true;
  private lastOnlineCount = 0;
  private timers: NodeJS.Timeout[] = [];
  private running = false;

  constructor(private io: Server, private saveService: SaveService) {}

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async init(): Promise<void> {
    const loaded = await this.saveService.loadAll();
    const usedPlots = new Set<number>();
    let maxDay = 1;

    for (const stored of loaded) {
      try {
        const profile = normalizeProfile(stored.profile);
        maxDay = Math.max(maxDay, profile.day);
        if (usedPlots.has(profile.plotIndex) || profile.plotIndex < 0 || profile.plotIndex >= MAX_PLOTS) {
          const free = findFreePlot([...this.records.values()].map((r) => r.profile));
          profile.plotIndex = free ?? profile.plotIndex % MAX_PLOTS;
        }
        usedPlots.add(profile.plotIndex);
        const nameKey = stored.nameKey || profile.name.trim().toLowerCase();
        this.records.set(profile.id, {
          profile,
          token: stored.token,
          nameKey,
          socketId: null,
          position: {
            x: spawnForPlot(profile.plotIndex).x,
            y: 0,
            z: spawnForPlot(profile.plotIndex).z,
            rot: spawnForPlot(profile.plotIndex).rot,
            anim: 'idle',
          },
          lowStockWarnAt: 0,
          emote: null,
          emoteUntil: 0,
          lastActionAt: 0,
          lastServeAt: 0,
        });
        this.nameIndex.set(nameKey, profile.id);
      } catch (error) {
        console.error('[game] Skipping a corrupted player profile', error);
      }
    }

    this.clock.day = maxDay;
    this.clock.progress = START_DAY_PROGRESS;
    this.lastPhase = phaseFor(this.clock.progress).id;
    console.log(
      `[game] Market ready — day ${this.clock.day}, persistence: ${this.saveService.mongoStatus}, ${this.records.size} vendor profile(s)`,
    );
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTick = Date.now();
    this.nextEventAllowedAt = Date.now() + 55_000;
    this.nextOfferAt = Date.now() + 90_000;
    this.nextRushAt = Date.now() + 4 * 60_000;

    const main = setInterval(() => this.tick(), 1000);
    const positions = setInterval(() => this.broadcastPositions(), Math.round(1000 / ONLINE_POSITION_HZ));
    const save = setInterval(() => void this.saveOnline(), SERVER_CONFIG.saveIntervalMs);
    this.timers.push(main, positions, save);
  }

  async stop(): Promise<void> {
    this.running = false;
    for (const timer of this.timers) clearInterval(timer);
    this.timers = [];
    await this.saveAll();
  }

  private serializeRecord(record: PlayerRecord | null): StoredProfile | null {
    if (!record) return null;
    return {
      playerId: record.profile.id,
      nameKey: record.nameKey,
      name: record.profile.name,
      token: record.token,
      profile: record.profile,
    };
  }

  private tick(): void {
    const now = Date.now();
    const delta = Math.min(2000, now - this.lastTick);
    this.lastTick = now;

    const online = this.onlineRecords();
    if (!online.length) {
      this.lastEconomyTick = now;
      return;
    }

    // Shared market clock runs only while at least one vendor is present.
    this.clock.progress += delta / DAY_MS;
    if (this.clock.progress >= 1) {
      this.rolloverDay(now);
    } else {
      const phase = phaseFor(this.clock.progress);
      if (phase.id !== this.lastPhase) {
        this.lastPhase = phase.id;
        this.maybeStartEvent(now);
      }
    }

    if (this.activeEvent && this.activeEvent.endsAt <= now) {
      this.endEvent();
    }

    if (!this.activeEvent) this.maybeStartEvent(now);
    this.maybeSendOffer(now);
    this.maybeStartRush(now);

    if (now - this.lastEconomyTick >= ECON_TICK_MS) {
      this.lastEconomyTick = now;
      this.simulateMarket(now);
    }

    if (now - this.lastProfileSync >= SERVER_CONFIG.profileSyncMs) {
      this.lastProfileSync = now;
      this.syncProfiles(now);
    }

    if (now - this.lastSave >= SERVER_CONFIG.saveIntervalMs) {
      this.lastSave = now;
      void this.saveOnline();
    }
  }

  private rolloverDay(now: number): void {
    const reportRecords = this.onlineRecords();
    this.clock.day += 1;
    this.clock.progress = 0.06;
    this.lastPhase = phaseFor(this.clock.progress).id;
    this.dayWeather = this.rollWeather();

    for (const record of reportRecords) {
      const profile = record.profile;
      try {
        const { report, notices } = endDay(profile, now, this.activeEvent);
        profile.day = this.clock.day;
        profile.dayProgress = this.clock.progress;
        ensureQuest(profile, this.clock.day);
        updateWeather(profile, this.dayWeather);
        profile.activeEvent = null;
        this.saveService.recordDailyReport(profile.id, report);
        if (report.revenue > 0) {
          this.saveService.recordTransaction(
            profile.id,
            'daily_revenue',
            report.revenue,
            profile.balance,
            `Day ${report.day} revenue`,
          );
        }
        for (const notice of notices) this.notifyRecord(record, notice);
        this.emitToSocket(record, 'dayReport', { report, profile });
        this.plotsDirty = true;
      } catch (error) {
        console.error('[game] Failed to close the day for', profile.name, error);
      }
    }

    this.activeEvent = null;
    for (const record of reportRecords) {
      record.profile.activeEvent = null;
      this.io.to(record.socketId!).emit('marketEvent', null);
    }
    this.nextEventAllowedAt = now + 40_000;
    this.emitOnlineCount();
    void this.saveAll();
    console.log(`[game] Day ${this.clock.day} started.`);
  }

  // ── Joining / leaving ─────────────────────────────────────────────────────

  join(socket: Socket, payload: { name?: string; token?: string; category?: StallCategory; appearance?: Appearance }): JoinResult {
    const nameResult = sanitizeName(payload?.name);
    if (!nameResult.ok) return { ok: false, error: nameResult.error };
    const name = nameResult.name;
    const nameKey = name.toLowerCase();

    const existingId = this.nameIndex.get(nameKey);
    if (existingId) {
      const record = this.records.get(existingId);
      if (!record) return { ok: false, error: 'This vendor profile could not be loaded.' };
      if (!payload.token || payload.token !== record.token) {
        return { ok: false, error: 'That vendor name is already taken. Use the saved token on this device, or pick another name.' };
      }
      if (record.socketId && record.socketId !== socket.id) {
        const old = this.io.sockets.sockets.get(record.socketId);
        const oldId = record.socketId;
        record.socketId = null;
        old?.emit('forceLogout', { reason: 'Signed in from another tab.' });
        old?.disconnect(true);
        console.log('[game] Replaced a duplicate session', oldId);
      }
      socket.join('market');

      // Advance an offline vendor to the shared market day without charging missed wages.
      if (record.profile.day !== this.clock.day) {
        record.profile.day = this.clock.day;
        record.profile.dayProgress = this.clock.progress;
        record.profile.today = emptyToday(record.profile.reputation);
        record.profile.activeEvent = null;
        syncExpiredPowerUps(record.profile, Date.now());
      }
      record.profile.online = true;
      record.profile.dayProgress = this.clock.progress;
      record.profile.activeEvent = this.activeEvent;
      ensureQuest(record.profile, this.clock.day);
      updateWeather(record.profile, this.currentWeather());
      record.socketId = socket.id;
      record.position = {
        ...spawnForPlot(record.profile.plotIndex),
        y: 0,
        anim: 'idle',
      };
      record.profile.updatedAt = Date.now();
      this.plotsDirty = true;
      this.emitOnlineCount();
      this.broadcastPlots();
      this.broadcastJoin(record, socket.id);
      this.notifyRecord(record, {
        kind: 'info',
        title: `Welcome back, ${record.profile.name}`,
        message: `Day ${this.clock.day} · ${dateForDay(this.clock.day)}. Lifetime ₱${record.profile.lifetime.totalEarnings.toLocaleString('en-PH')} · ${record.profile.suki.length} sukis · stall at ${STALL_CATEGORIES[record.profile.unlockedCategories[0]].shortName} row.`,
      });
      // Retention loop: consecutive-day streak, a daily login chest, and a
      // comeback package after two or more days away.
      const p = record.profile;
      const gap = this.clock.day - p.lastPlayedDay;
      p.streak = gap === 1 ? p.streak + 1 : gap <= 1 ? Math.max(1, p.streak) : 1;
      p.lastPlayedDay = this.clock.day;
      let chestNote = '';
      if (p.chestDay !== this.clock.day) {
        p.chestDay = this.clock.day;
        const chest = 150 + Math.min(850, p.streak * 60) + (gap > 2 ? Math.min(1200, gap * 200) : 0);
        p.balance += chest;
        chestNote = ` Daily chest +₱${chest}.`;
        if (gap > 2) chestNote += ` Welcome back after ${gap} days — comeback bonus included.`;
      }
      if (p.streak >= 3) chestNote += ` 🔥 ${p.streak}-day streak!`;
      if (chestNote) {
        this.notifyRecord(record, {
          kind: 'success',
          title: p.streak >= 3 ? `${p.streak}-day streak!` : 'Daily chest',
          message: chestNote.trim(),
        });
      }
      void this.saveService.save(this.serializeRecord(record)!);
      return {
        ok: true,
        token: record.token,
        snapshot: this.snapshotFor(record),
        players: this.othersFor(record.profile.id),
      };
    }

    const plotIndex = findFreePlot(
      [...this.records.values()].map((r) => r.profile),
    );
    if (plotIndex === null) {
      return { ok: false, error: 'Every vendor bay is occupied tonight. Try again soon.' };
    }

    const category: StallCategory = payload.category && STALL_CATEGORIES[payload.category]
      ? payload.category
      : 'streetFood';
    const id = randomUUID();
    const token = randomUUID();
    const profile = createNewProfile({
      id,
      name,
      category,
      appearance: sanitizeAppearance(payload.appearance) ?? makeAppearance(),
      plotIndex,
      day: this.clock.day,
      dayProgress: this.clock.progress,
    });
    const record: PlayerRecord = {
      profile,
      token,
      nameKey,
      socketId: socket.id,
      position: {
        ...spawnForPlot(plotIndex),
        y: 0,
        anim: 'idle',
      },
      lowStockWarnAt: 0,
      emote: null,
      emoteUntil: 0,
      lastActionAt: 0,
      lastServeAt: 0,
    };
    record.profile.online = true;
    record.profile.activeEvent = this.activeEvent;
    ensureQuest(record.profile, this.clock.day);
    updateWeather(record.profile, this.currentWeather());
    this.records.set(id, record);
    this.nameIndex.set(nameKey, id);
    socket.join('market');
    this.plotsDirty = true;
    this.emitOnlineCount();
    this.broadcastPlots();
    this.broadcastJoin(record, socket.id);
    void this.saveService.save(this.serializeRecord(record)!);
    console.log(`[game] ${name} opened bay ${plotIndex} (${category})`);

    this.notifyRecord(record, {
      kind: 'success',
      title: 'Your stall is open!',
      message: 'First-night perk: +25% prices and a starter crate on the house. Walk to the glowing pads or press E at the counter to get going.',
    });

    return {
      ok: true,
      token,
      snapshot: this.snapshotFor(record),
      players: this.othersFor(id),
    };
  }

  detach(socket: Socket): void {
    const record = this.recordForSocket(socket.id);
    if (!record) return;
    if (record.socketId !== socket.id) return;
    record.socketId = null;
    record.profile.online = false;
    record.profile.updatedAt = Date.now();
    record.profile.activeEvent = null;
    this.plotsDirty = true;
    void this.saveService.save(this.serializeRecord(record)!);
    this.io.to('market').emit('playerLeft', { id: record.profile.id });
    this.broadcastPlots();
    this.emitOnlineCount();
    console.log(`[game] ${record.profile.name} left the market`);
  }

  recordForSocket(socketId: string): PlayerRecord | null {
    for (const record of this.records.values()) {
      if (record.socketId === socketId) return record;
    }
    return null;
  }

  // ── Player actions (server-authoritative) ────────────────────────────────

  updatePosition(socketId: string, position: PositionPayload): void {
    const record = this.recordForSocket(socketId);
    if (!record) return;
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : 0));
    record.position = {
      x: clamp(position.x, -90, 90),
      y: clamp(position.y, -2, 40),
      z: clamp(position.z, -250, 250),
      rot: Number.isFinite(position.rot) ? position.rot : 0,
      anim: ANIM_STATES.has(position.anim) ? position.anim : 'idle',
    };
    if (position.emote && EMOTE_STATES.has(position.emote)) {
      record.emote = position.emote;
      record.emoteUntil = Date.now() + 2600;
    } else if (record.emote && Date.now() > record.emoteUntil) {
      record.emote = null;
    }
  }

  purchaseUpgrade(socketId: string, branch: UpgradeBranch, tier: number, optionId: string): Ack<PlayerProfile> {
    const record = this.recordForSocket(socketId);
    if (!record) return { ok: false, error: 'Join the market first.' };
    if (!this.canAct(record)) return { ok: false, error: 'Slow down a moment.' };
    if (!BRANCH_ORDER.includes(branch)) return { ok: false, error: 'Unknown upgrade branch.' };
    const parsedTier = Math.floor(Number(tier));
    if (![1, 2, 3].includes(parsedTier) || typeof optionId !== 'string') {
      return { ok: false, error: 'Invalid upgrade.' };
    }
    const found = upgradeById(optionId);
    if (!found || found.branch !== branch || found.tier !== parsedTier) {
      return { ok: false, error: 'That upgrade does not fit this slot.' };
    }

    const before = record.profile.balance;
    const result = purchaseUpgrade(record.profile, branch, parsedTier, optionId);
    if (!result.ok) return { ok: false, error: result.error };
    for (const notice of result.notices) this.notifyRecord(record, notice);
    this.saveService.recordTransaction(
      record.profile.id,
      'upgrade',
      record.profile.balance - before,
      record.profile.balance,
      found.option.name,
      { upgradeId: optionId },
    );
    this.plotsDirty = true;
    this.emitProfile(record);
    void this.saveService.save(this.serializeRecord(record)!);
    return { ok: true, data: record.profile };
  }

  buyStock(socketId: string, productId: string, quantity: number): Ack<PlayerProfile> {
    const record = this.recordForSocket(socketId);
    if (!record) return { ok: false, error: 'Join the market first.' };
    if (!this.canAct(record)) return { ok: false, error: 'Slow down a moment.' };
    if (typeof productId !== 'string') return { ok: false, error: 'Invalid product.' };
    const result = buyStock(record.profile, productId, quantity, this.activeEvent?.type ?? null);
    if (!result.ok) return { ok: false, error: result.error };
    if (result.spent > 0) {
      this.saveService.recordTransaction(
        record.profile.id,
        'stock_purchase',
        -result.spent,
        record.profile.balance,
        `${result.purchased} unit(s) of ${productId}`,
      );
    }
    this.notifyRecord(record, {
      kind: 'success',
      title: 'Stock delivered',
      message: `+${result.purchased} ${result.purchased === 1 ? 'unit' : 'units'} for ₱${result.spent}.`,
    });
    if (result.error) {
      this.notifyRecord(record, { kind: 'warning', title: 'Buying limit', message: result.error });
    }
    this.emitProfile(record);
    void this.saveService.save(this.serializeRecord(record)!);
    return { ok: true, data: record.profile };
  }

  /**
   * Hands-on sale: the vendor personally serves a customer at their own stall.
   * Full price (no haggle discount) plus an occasional tip — the reward for
   * actually standing at the counter instead of letting the sim run.
   */
  serveCustomer(socketId: string): Ack<SaleReceipt> {
    const record = this.recordForSocket(socketId);
    if (!record) return { ok: false, error: 'Join the market first.' };
    const profile = record.profile;
    const now = Date.now();

    const slot = plotSlot(profile.plotIndex);
    const dx = record.position.x - slot.x;
    const dz = record.position.z - slot.z;
    if (Math.hypot(dx, dz) > 9) {
      return { ok: false, error: 'Step up to your own stall counter to serve a customer.' };
    }
    if (now - record.lastServeAt < 1100) return { ok: false, error: 'One customer at a time — catch your breath.' };

    // Pick a product weighted by remaining stock, same as the sim.
    const candidates: typeof PRODUCTS = [];
    for (const product of PRODUCTS) {
      if (!profile.unlockedCategories.includes(product.category)) continue;
      const stock = profile.inventory[product.id] ?? 0;
      for (let w = 0; w < Math.min(stock, 12); w++) candidates.push(product);
    }
    if (!candidates.length) {
      return { ok: false, error: 'Nothing on the shelf — restock at the Shop first.' };
    }
    record.lastServeAt = now;

    const product = candidates[Math.floor(Math.random() * candidates.length)];
    const rush = now < this.rushUntil && Math.random() < 0.4;
    let quantity = 1;
    if (profile.powerUps.some((p) => p.id === 'sukiDay' && (p.endsAt === null || p.endsAt > now))) {
      quantity = 2;
    }
    if (rush) quantity += 1;
    quantity = Math.min(quantity, profile.inventory[product.id] ?? 0);
    if (quantity <= 0) return { ok: false, error: 'That item just sold out.' };

    const unitPrice = Math.round(effectiveSellingPrice(profile, product) * firstNightBoost(profile));
    const askPrice = unitPrice * quantity;

    // Who's at the counter shapes the sale: tourists pay full price and tip
    // generously, bargain hunters haggle constantly, locals are everyday trade.
    const roll = Math.random();
    const customer: CounterCustomerType = roll < 0.34 ? 'tourist' : roll < 0.62 ? 'bargain' : 'local';

    // Some customers haggle — tawadShield regulars trust your price and skip it.
    const tawad = profile.powerUps.some((p) => p.id === 'tawadShield' && (p.endsAt === null || p.endsAt > now));
    const haggleChance =
      (tawad ? 0.04 : customer === 'tourist' ? 0.06 : customer === 'bargain' ? 0.45 : 0.3) -
      (profile.dailyChallenge?.id === 'bargainNight' ? 0.15 : 0);
    const existing = this.haggles.get(profile.id);
    if (existing && existing.expiresAt > now) {
      return { ok: false, error: 'A customer is still deciding — answer them first.' };
    }
    if (Math.random() < haggleChance) {
      const offerPrice = Math.max(1, Math.round(askPrice * (0.78 + Math.random() * 0.1)));
      this.haggles.set(profile.id, {
        productId: product.id,
        quantity,
        askPrice,
        offerPrice,
        expiresAt: now + 6000,
        customer,
      });
      return {
        ok: true,
        data: {
          productId: product.id,
          productName: product.name,
          quantity: 0,
          revenue: 0,
          tip: 0,
          balance: profile.balance,
          haggle: {
            productId: product.id,
            productName: product.name,
            quantity,
            askPrice,
            offerPrice,
            expiresAt: this.haggles.get(profile.id)!.expiresAt,
          },
        },
      };
    }

    return {
      ok: true,
      data: this.completeCounterSale(record, product, quantity, askPrice, now, customer),
    };
  }

  /** Customer answered the haggle — accept at their offer or let them walk. */
  respondHaggle(socketId: string, accept: boolean): Ack<SaleReceipt> {
    const record = this.recordForSocket(socketId);
    if (!record) return { ok: false, error: 'Join the market first.' };
    const profile = record.profile;
    const pending = this.haggles.get(profile.id);
    const now = Date.now();
    if (!pending || pending.expiresAt <= now) {
      this.haggles.delete(profile.id);
      return { ok: false, error: 'That customer already walked away.' };
    }
    this.haggles.delete(profile.id);
    if (!accept) {
      return {
        ok: true,
        data: {
          productId: pending.productId,
          productName: PRODUCT_BY_ID[pending.productId]?.name ?? 'item',
          quantity: 0,
          revenue: 0,
          tip: 0,
          balance: profile.balance,
          refused: true,
        },
      };
    }
    const product = PRODUCT_BY_ID[pending.productId];
    const inStock = profile.inventory[pending.productId] ?? 0;
    if (!product || inStock < pending.quantity) {
      return { ok: false, error: 'Not enough stock left to close that deal.' };
    }
    return {
      ok: true,
      data: this.completeCounterSale(
        record,
        product,
        pending.quantity,
        pending.offerPrice,
        now,
        pending.customer,
      ),
    };
  }

  /** Book a counter sale at the given total price and update all ledgers. */
  private completeCounterSale(
    record: PlayerRecord,
    product: { id: string; name: string },
    quantity: number,
    priceTotal: number,
    now: number,
    customer?: CounterCustomerType,
  ): SaleReceipt {
    const profile = record.profile;
    profile.inventory[product.id] -= quantity;
    // Tourists tip generously; bargain hunters rarely do.
    const tipChance = customer === 'tourist' ? 0.55 : customer === 'bargain' ? 0.12 : 0.3;
    const sukiRush = profile.dailyChallenge?.id === 'sukiRush';
    const tip =
      Math.random() < tipChance
        ? Math.round(priceTotal * (0.1 + Math.random() * 0.25) * (sukiRush ? 1.5 : 1))
        : 0;
    const total = priceTotal + tip;

    profile.balance += total;
    profile.today.revenue += total;
    profile.today.customers += 1;
    profile.today.productsSold += quantity;
    profile.today.soldByProduct[product.id] = (profile.today.soldByProduct[product.id] ?? 0) + quantity;
    profile.lifetime.totalRevenue += total;
    profile.lifetime.totalEarnings += total;
    profile.lifetime.totalCustomers += 1;
    profile.lifetime.totalProductsSold += quantity;
    profile.reputation = Math.min(100, profile.reputation + 0.22);

    const notices: EconomyNotice[] = [];
    updateQuestProgress(profile, quantity, total, 1, notices);
    for (const notice of notices) this.notifyRecord(record, notice);

    if (now - profile.lastSukiNoticeAt > 45_000 && Math.random() < 0.18) {
      profile.lastSukiNoticeAt = now;
      this.notifyRecord(record, {
        kind: 'info',
        title: 'Word travels fast',
        message: `A customer paid for your ${product.name} — no haggling needed when you serve them yourself.`,
      });
    }

    this.saveService.recordTransaction(
      profile.id,
      'sale',
      total,
      profile.balance,
      `${quantity}x ${product.name} (counter sale)`,
    );
    this.emitProfile(record);
    void this.saveService.save(this.serializeRecord(record)!);

    return {
      productId: product.id,
      productName: product.name,
      quantity,
      revenue: priceTotal,
      tip,
      balance: profile.balance,
      customer,
    };
  }

  /** Live orders for a player, pruning anything that went cold. */
  private activeOrders(profileId: string, now: number) {
    const list = (this.karenderoOrders.get(profileId) ?? []).filter(
      (o) => !o.served && o.expiresAt > now,
    );
    this.karenderoOrders.set(profileId, list);
    return list;
  }

  private karenderoSpotCheck(record: PlayerRecord): string | null {
    const slot = plotSlot(record.profile.plotIndex);
    const dx = record.position.x - slot.x;
    const dz = record.position.z - slot.z;
    return Math.hypot(dx, dz) > 9 ? 'Step up to your own stall counter.' : null;
  }

  /** Take an order at the counter — the stove starts cooking immediately. */
  takeKarenderoOrder(socketId: string): Ack<KarenderoOrderReceipt> {
    const record = this.recordForSocket(socketId);
    if (!record) return { ok: false, error: 'Join the market first.' };
    const profile = record.profile;
    const now = Date.now();
    const spotError = this.karenderoSpotCheck(record);
    if (spotError) return { ok: false, error: spotError };
    if (!profile.unlockedCategories.includes('streetFood')) {
      return { ok: false, error: 'Only food stalls take orders — unlock street food first.' };
    }
    if (now - (this.lastOrderAt.get(profile.id) ?? 0) < 1400) {
      return { ok: false, error: 'One order at a time — finish the last one.' };
    }
    const orders = this.activeOrders(profile.id, now);
    if (orders.length >= KARENDERO_MAX_ORDERS) {
      return { ok: false, error: 'The counter is swamped — serve someone first.' };
    }
    const dish = KARENDERO_DISHES[Math.floor(Math.random() * KARENDERO_DISHES.length)];
    // Some customers add a drink — it cooks on the same ticket.
    const drink = Math.random() < 0.35
      ? KARENDERO_DRINKS[Math.floor(Math.random() * KARENDERO_DRINKS.length)]
      : null;
    const boost = firstNightBoost(profile) * (profile.dailyChallenge?.id === 'premiumNight' ? 1.15 : 1);
    const price = Math.round(dish.price * boost) + (drink ? Math.round(drink.price * boost) : 0);
    const cookMs = Math.max(dish.cookMs, drink?.cookMs ?? 0);
    const order: KarenderoOrderInfo & { served?: boolean } = {
      dishId: dish.id,
      dishName: dish.name,
      price,
      drinkId: drink?.id,
      drinkName: drink?.name,
      drinkPrice: drink ? Math.round(drink.price * boost) : undefined,
      readyAt: now + cookMs,
      expiresAt: now + cookMs + KARENDERO_ORDER_TTL_MS,
      picked: false,
    };
    orders.push(order);
    this.karenderoOrders.set(profile.id, orders);
    this.lastOrderAt.set(profile.id, now);
    return { ok: true, data: { ...order, balance: profile.balance, readyInMs: cookMs } };
  }

  /** Pick up a finished plate — marks the order held by the player. */
  pickupKarenderoFood(socketId: string): Ack<KarenderoPickup> {
    const record = this.recordForSocket(socketId);
    if (!record) return { ok: false, error: 'Join the market first.' };
    const profile = record.profile;
    const now = Date.now();
    const spotError = this.karenderoSpotCheck(record);
    if (spotError) return { ok: false, error: spotError };
    const orders = this.activeOrders(profile.id, now);
    if (orders.some((o) => o.picked && !o.served)) {
      return { ok: false, error: 'Your hands are full — serve the plate first.' };
    }
    const ready = orders.find((o) => !o.picked && !o.served && o.readyAt <= now);
    if (!ready) {
      const next = orders
        .filter((o) => !o.picked && !o.served)
        .sort((a, b) => a.readyAt - b.readyAt)[0];
      const secs = next ? Math.max(1, Math.ceil((next.readyAt - now) / 1000)) : 0;
      return {
        ok: false,
        error: secs ? `Still on the stove — about ${secs}s left.` : 'No orders waiting.',
      };
    }
    ready.picked = true;
    const next = orders
      .filter((o) => !o.picked && !o.served)
      .sort((a, b) => a.readyAt - b.readyAt)[0];
    return {
      ok: true,
      data: {
        dishId: ready.dishId,
        dishName: ready.dishName,
        drinkName: ready.drinkName,
        price: ready.price,
        nextInSec: next ? Math.max(0, Math.ceil((next.readyAt - now) / 1000)) : 0,
      },
    };
  }

  /** Serve the held plate to the matching customer — pays out and clears the order. */
  serveKarenderoDish(socketId: string, dishId: string): Ack<SaleReceipt> {
    const record = this.recordForSocket(socketId);
    if (!record) return { ok: false, error: 'Join the market first.' };
    const profile = record.profile;
    const now = Date.now();
    const spotError = this.karenderoSpotCheck(record);
    if (spotError) return { ok: false, error: spotError };
    const orders = this.activeOrders(profile.id, now);
    const order = orders.find((o) => o.dishId === dishId && o.picked && !o.served);
    if (!order) {
      const held = orders.find((o) => o.picked && !o.served);
      return {
        ok: false,
        error: held
          ? `Wrong plate — you picked up ${held.dishName}.`
          : 'Pick up the food first.',
      };
    }
    order.served = true;

    const sukiRush = profile.dailyChallenge?.id === 'sukiRush';
    const tip = Math.random() < 0.3 ? Math.round(order.price * (0.1 + Math.random() * 0.25) * (sukiRush ? 1.5 : 1)) : 0;
    // Fast hands build a streak — each quick plate adds a small bonus, capped.
    const fast = now - order.readyAt < 12_000;
    const streak = fast ? (this.karenderoStreak.get(profile.id) ?? 0) + 1 : 0;
    this.karenderoStreak.set(profile.id, streak);
    const streakBonus = Math.min(streak, 5) * 3;
    const total = order.price + tip + streakBonus;
    profile.balance += total;
    profile.today.revenue += total;
    profile.today.customers += 1;
    profile.lifetime.totalRevenue += total;
    profile.lifetime.totalEarnings += total;
    profile.lifetime.totalCustomers += 1;
    profile.reputation = Math.min(100, profile.reputation + 0.22);

    const notices: EconomyNotice[] = [];
    updateQuestProgress(profile, 1, total, 1, notices);
    for (const notice of notices) this.notifyRecord(record, notice);

    this.saveService.recordTransaction(
      profile.id,
      'sale',
      total,
      profile.balance,
      `${order.dishName}${order.drinkName ? ` + ${order.drinkName}` : ''} (karendero)`,
    );
    // Some customers ask for extra rice right after being served.
    const upsell = Math.random() < 0.45;
    if (upsell) this.karenderoUpsells.set(profile.id, now + 10_000);
    this.emitProfile(record);
    void this.saveService.save(this.serializeRecord(record)!);

    return {
      ok: true,
      data: {
        productId: order.dishId,
        productName: order.drinkName ? `${order.dishName} + ${order.drinkName}` : order.dishName,
        quantity: 1,
        revenue: order.price,
        tip,
        balance: profile.balance,
        customer: 'local',
        upsell,
        streakBonus: streakBonus || undefined,
      },
    };
  }

  /** Answer the "extra rice?" offer that followed a karendero serving. */
  respondKarenderoUpsell(socketId: string, accept: boolean): Ack<{ price: number; balance: number }> {
    const record = this.recordForSocket(socketId);
    if (!record) return { ok: false, error: 'Join the market first.' };
    const profile = record.profile;
    const now = Date.now();
    const deadline = this.karenderoUpsells.get(profile.id);
    if (!deadline || deadline < now) {
      return { ok: false, error: 'Too late — they already left.' };
    }
    this.karenderoUpsells.delete(profile.id);
    if (!accept) {
      return { ok: true, data: { price: 0, balance: profile.balance } };
    }
    const spotError = this.karenderoSpotCheck(record);
    if (spotError) return { ok: false, error: spotError };

    profile.balance += KARENDERO_RICE_PRICE;
    profile.today.revenue += KARENDERO_RICE_PRICE;
    profile.lifetime.totalRevenue += KARENDERO_RICE_PRICE;
    profile.lifetime.totalEarnings += KARENDERO_RICE_PRICE;
    this.saveService.recordTransaction(
      profile.id,
      'sale',
      KARENDERO_RICE_PRICE,
      profile.balance,
      'Extra rice (karendero)',
    );
    this.emitProfile(record);
    void this.saveService.save(this.serializeRecord(record)!);
    return { ok: true, data: { price: KARENDERO_RICE_PRICE, balance: profile.balance } };
  }

  setPrice(socketId: string, productId: string, price: number): Ack<PlayerProfile> {
    const record = this.recordForSocket(socketId);
    if (!record) return { ok: false, error: 'Join the market first.' };
    const result = setSellingPrice(record.profile, productId, price);
    if (!result.ok) return { ok: false, error: result.error };
    this.emitProfile(record);
    void this.saveService.save(this.serializeRecord(record)!);
    return { ok: true, data: record.profile };
  }

  activatePowerUp(socketId: string, id: string): Ack<PlayerProfile> {
    const record = this.recordForSocket(socketId);
    if (!record) return { ok: false, error: 'Join the market first.' };
    if (!this.canAct(record)) return { ok: false, error: 'Slow down a moment.' };
    if (!POWERUPS[id as keyof typeof POWERUPS]) return { ok: false, error: 'Unknown power-up.' };
    const now = Date.now();
    const msUntilDayEnd = Math.max(1000, (1 - this.clock.progress) * DAY_MS);
    const result = activatePowerUp(record.profile, id, now, msUntilDayEnd);
    if (!result.ok) return { ok: false, error: result.error };
    for (const notice of result.notices) this.notifyRecord(record, notice);
    const powerUp = POWERUPS[id as keyof typeof POWERUPS];
    this.saveService.recordTransaction(
      record.profile.id,
      'power_up',
      -powerUp.price,
      record.profile.balance,
      powerUp.name,
      { id },
    );
    this.emitProfile(record);
    void this.saveService.save(this.serializeRecord(record)!);
    return { ok: true, data: record.profile };
  }

  setBusinessName(socketId: string, rawName: string): Ack<PlayerProfile> {
    const record = this.recordForSocket(socketId);
    if (!record) return { ok: false, error: 'Join the market first.' };
    const cleaned = sanitizeBusinessName(rawName);
    if (!cleaned) return { ok: false, error: 'Business name must be 2–30 characters.' };
    record.profile.businessName = cleaned;
    record.profile.updatedAt = Date.now();
    this.plotsDirty = true;
    this.notifyRecord(record, { kind: 'success', title: 'Storefront renamed', message: `Now trading as ${cleaned}.` });
    this.emitProfile(record);
    this.broadcastPlots();
    void this.saveService.save(this.serializeRecord(record)!);
    return { ok: true, data: record.profile };
  }

  setAppearance(socketId: string, appearance: Appearance): Ack<PlayerProfile> {
    const record = this.recordForSocket(socketId);
    if (!record) return { ok: false, error: 'Join the market first.' };
    const safe = sanitizeAppearance(appearance);
    if (!safe) return { ok: false, error: 'Invalid character colors.' };
    record.profile.appearance = safe;
    record.profile.updatedAt = Date.now();
    this.plotsDirty = true;
    this.emitProfile(record);
    this.broadcastPlots();
    void this.saveService.save(this.serializeRecord(record)!);
    return { ok: true, data: record.profile };
  }

  setDifficulty(socketId: string, difficulty: string): Ack<PlayerProfile> {
    const record = this.recordForSocket(socketId);
    if (!record) return { ok: false, error: 'Join the market first.' };
    if (difficulty !== 'chill' && difficulty !== 'standard' && difficulty !== 'hustle') {
      return { ok: false, error: 'Unknown difficulty.' };
    }
    record.profile.difficulty = difficulty;
    this.notifyRecord(record, {
      kind: 'info',
      title: 'Pace updated',
      message:
        difficulty === 'chill'
          ? 'Chill mode: a gentler crowd and lower nightly costs.'
          : difficulty === 'hustle'
            ? 'Hustle mode: a bigger crowd, but prices and costs run hotter.'
            : 'Standard market rhythm restored.',
    });
    this.emitProfile(record);
    void this.saveService.save(this.serializeRecord(record)!);
    return { ok: true, data: record.profile };
  }

  importSave(socketId: string, raw: unknown): Ack<PlayerProfile> {
    const record = this.recordForSocket(socketId);
    if (!record) return { ok: false, error: 'Join the market first.' };
    if (!raw || typeof raw !== 'object') return { ok: false, error: 'That does not look like a save file.' };
    let imported: PlayerProfile;
    try {
      imported = normalizeProfile(raw as PlayerProfile);
    } catch {
      return { ok: false, error: 'That save file could not be read.' };
    }
    // Identity and plot ownership always stay with the live record — a save
    // file can restore a stall's contents but never hijack a name or bay.
    imported.id = record.profile.id;
    imported.name = record.profile.name;
    imported.plotIndex = record.profile.plotIndex;
    imported.online = false;
    imported.updatedAt = Date.now();
    imported.balance = Math.min(imported.balance, 50_000_000);
    if (!imported.businessName) imported.businessName = record.profile.businessName;
    record.profile = imported;
    this.plotsDirty = true;
    this.notifyRecord(record, {
      kind: 'success',
      title: 'Save restored',
      message: `Welcome back, ${record.profile.businessName}. The stall is exactly where you left it.`,
    });
    this.emitProfile(record);
    this.broadcastPlots();
    void this.saveService.save(this.serializeRecord(record)!);
    return { ok: true, data: record.profile };
  }

  respondOffer(socketId: string, offerId: string, accept: boolean): Ack<PlayerProfile> {
    const record = this.recordForSocket(socketId);
    if (!record) return { ok: false, error: 'Join the market first.' };
    const pending = this.offers.get(offerId);
    if (!pending || pending.record !== record) {
      return { ok: false, error: 'That offer is no longer open.' };
    }
    this.offers.delete(offerId);
    const { offer } = pending;
    const now = Date.now();

    if (!accept || offer.expiresAt <= now) {
      this.emitToSocket(record, 'offerResolved', { id: offer.id, accepted: false });
      if (accept) {
        this.notifyRecord(record, {
          kind: 'warning',
          title: 'Offer expired',
          message: `${offer.buyerName}'s bulk order lapsed before you answered.`,
        });
      }
      return { ok: true, data: record.profile };
    }

    const product = PRODUCT_BY_ID[offer.productId];
    const inStock = record.profile.inventory[offer.productId] ?? 0;
    if (!product || inStock < offer.quantity) {
      this.emitToSocket(record, 'offerResolved', { id: offer.id, accepted: false });
      this.notifyRecord(record, {
        kind: 'warning',
        title: 'Not enough stock',
        message: `You need ${offer.quantity} ${product?.name ?? offer.productName} on hand for that order.`,
      });
      return { ok: false, error: 'Not enough stock for that order.' };
    }

    record.profile.inventory[offer.productId] = inStock - offer.quantity;
    record.profile.balance += offer.total;
    record.profile.today.revenue += offer.total;
    record.profile.today.productsSold += offer.quantity;
    record.profile.today.customers += 1;
    record.profile.reputation = Math.min(100, record.profile.reputation + (offer.kind === 'consignment' ? 1.2 : 0.8));
    record.profile.lifetime.totalRevenue += offer.total;
    record.profile.lifetime.totalEarnings += offer.total;
    record.profile.lifetime.totalCustomers += 1;
    record.profile.lifetime.totalProductsSold += offer.quantity;
    record.profile.today.soldByProduct[offer.productId] =
      (record.profile.today.soldByProduct[offer.productId] ?? 0) + offer.quantity;

    this.emitToSocket(record, 'offerResolved', { id: offer.id, accepted: true });
    this.notifyRecord(record, {
      kind: 'success',
      title: offer.kind === 'consignment' ? 'Consignment filled' : 'Bulk order filled',
      message:
        offer.kind === 'consignment'
          ? `${offer.buyerName} took ${offer.quantity} ${product.name} on consignment for ₱${offer.total.toLocaleString('en-PH')} — they will sell it at their own stall.`
          : `${offer.buyerName} took ${offer.quantity} ${product.name} for ₱${offer.total.toLocaleString('en-PH')}.`,
    });
    this.saveService.recordTransaction(
      record.profile.id,
      'bulk_sale',
      offer.total,
      record.profile.balance,
      `Bulk order from ${offer.buyerName}`,
      { offerId: offer.id },
    );
    this.emitProfile(record);
    this.plotsDirty = true;
    void this.saveService.save(this.serializeRecord(record)!);
    return { ok: true, data: record.profile };
  }

  negotiateSupplier(socketId: string, category: string): Ack<PlayerProfile> {
    const record = this.recordForSocket(socketId);
    if (!record) return { ok: false, error: 'Join the market first.' };
    if (!this.canAct(record)) return { ok: false, error: 'Slow down a moment.' };
    if (!(category in STALL_CATEGORIES)) return { ok: false, error: 'Unknown category.' };
    const cat = category as StallCategory;
    if (this.negotiationDay.get(record.profile.id) === this.clock.day) {
      return { ok: false, error: 'You already haggled with suppliers tonight.' };
    }
    this.negotiationDay.set(record.profile.id, this.clock.day);

    // Better reputation means better odds at the wholesale table; Colon
    // legends also squeeze a deeper discount when they win.
    const chance = Math.min(0.95, 0.45 + record.profile.reputation / 200);
    const current = record.profile.supplierPrices[cat] ?? 1;
    const tierRoll = Math.random();
    if (Math.random() < chance) {
      // Tiered outcome: legends land 'great' deals — deeper cut plus a free
      // crate of the category's first product; everyone else gets 'fair'.
      const great = tierRoll < 0.22 + record.profile.reputation / 1200;
      const discount = great
        ? 0.68 + Math.random() * 0.08
        : 0.8 + Math.random() * 0.08 - Math.min(0.08, record.profile.reputation / 1500);
      record.profile.supplierPrices[cat] = Math.max(0.55, Math.round(current * discount * 100) / 100);
      let bonusNote = '';
      if (great) {
        const first = PRODUCTS.find((p) => p.category === cat);
        if (first) {
          const qty = Math.min(8, Math.max(2, Math.floor(first.maxStock * 0.15)));
          record.profile.inventory[first.id] = Math.min(
            first.maxStock,
            (record.profile.inventory[first.id] ?? 0) + qty,
          );
          bonusNote = ` They also threw in ${qty}x ${first.name} on the house.`;
        }
      }
      this.notifyRecord(record, {
        kind: 'success',
        title: great ? 'Dream deal struck!' : 'Supplier deal struck',
        message: `Your ${STALL_CATEGORIES[cat].shortName} wholesaler knocked ${Math.round((1 - discount) * 100)}% off today's prices.${bonusNote}`,
      });
    } else {
      const markup = tierRoll > 0.75 ? 1.12 + Math.random() * 0.06 : 1.04 + Math.random() * 0.04;
      record.profile.supplierPrices[cat] = Math.min(1.7, Math.round(current * markup * 100) / 100);
      this.notifyRecord(record, {
        kind: 'warning',
        title: 'Haggling backfired',
        message:
          markup > 1.1
            ? `The ${STALL_CATEGORIES[cat].shortName} supplier heard you out — then raised prices sharply.`
            : `The ${STALL_CATEGORIES[cat].shortName} supplier heard you out — then raised prices a touch.`,
      });
    }
    record.profile.updatedAt = Date.now();
    this.emitProfile(record);
    void this.saveService.save(this.serializeRecord(record)!);
    return { ok: true, data: record.profile };
  }

  sendCompliment(socketId: string, toId: string, rawMessage: string): Ack {
    const record = this.recordForSocket(socketId);
    if (!record) return { ok: false, error: 'Join the market first.' };
    if (!this.canAct(record)) return { ok: false, error: 'Slow down a moment.' };
    const target = [...this.records.values()].find((r) => r.profile.id === toId);
    if (!target || target === record) return { ok: false, error: 'That vendor is not here.' };
    const message = typeof rawMessage === 'string' ? rawMessage.replace(/\s+/g, ' ').trim().slice(0, 90) : '';
    if (message.length < 2) return { ok: false, error: 'Write a short compliment first.' };
    this.notifyRecord(target, {
      kind: 'success',
      title: `${record.profile.name} sends compliments`,
      message: `“${message}” — from a fellow vendor on Colon Street.`,
    });
    record.profile.reputation = Math.min(100, record.profile.reputation + 0.2);
    this.emitProfile(record);
    return { ok: true };
  }

  private maybeSendOffer(now: number): void {
    if (now < this.nextOfferAt) return;
    // Legends of the market get approached more often — reputation literally
    // brings buyers to your stall.
    const repBonus = this.onlineRecords().reduce((sum, r) => sum + r.profile.reputation, 0) / Math.max(1, this.onlineRecords().length);
    const interval = OFFER_INTERVAL_MS * (1 - Math.min(0.35, repBonus / 400));
    this.nextOfferAt = now + interval + Math.random() * 60_000;
    const online = this.onlineRecords();
    if (online.length < 1) return;

    // Sweep expired offers.
    for (const [id, pending] of this.offers) {
      if (pending.offer.expiresAt <= now) {
        this.offers.delete(id);
        this.emitToSocket(pending.record, 'offerResolved', { id, accepted: false });
      }
    }
    if (this.offers.size >= online.length) return;

    const buyers = ['Mang Domeng', 'Aling Puring', 'Kuya Bebot', 'Inday Luning', 'Tatay Ondoy', 'Manang Susing'];
    const record = online[Math.floor(Math.random() * online.length)];
    if ([...this.offers.values()].some((p) => p.record === record)) return;

    const candidates = PRODUCTS.filter((p) => (record.profile.inventory[p.id] ?? 0) >= 5);
    if (!candidates.length) return;
    const product = candidates[Math.floor(Math.random() * candidates.length)];
    const stock = record.profile.inventory[product.id] ?? 0;
    const quantity = Math.min(stock, 5 + Math.floor(Math.random() * 9));
    const kind: MarketOffer['kind'] = Math.random() < 0.3 ? 'consignment' : 'bulkBuy';
    const factor = kind === 'consignment' ? 0.68 : 0.88;
    const unitPrice = Math.max(1, Math.round(effectiveSellingPrice(record.profile, product) * factor));
    const buyerName = buyers[Math.floor(Math.random() * buyers.length)];
    const offer: MarketOffer = {
      id: `offer-${now}-${Math.floor(Math.random() * 9999)}`,
      kind,
      productId: product.id,
      productName: product.name,
      quantity,
      unitPrice,
      total: quantity * unitPrice,
      expiresAt: now + OFFER_TTL_MS,
      buyerName,
    };
    this.offers.set(offer.id, { offer, record });
    this.emitToSocket(record, 'offer', offer);
  }

  getSnapshot(socketId: string): Ack<GameSnapshot> {
    const record = this.recordForSocket(socketId);
    if (!record) return { ok: false, error: 'Join the market first.' };
    return { ok: true, data: this.snapshotFor(record) };
  }

  getPublicStatus(): {
    online: number;
    day: number;
    dayProgress: number;
    recordCount: number;
    persistence: string;
    event: ActiveEventState | null;
  } {
    return {
      online: this.onlineRecords().length,
      day: this.clock.day,
      dayProgress: Number(this.clock.progress.toFixed(3)),
      recordCount: this.records.size,
      persistence: this.saveService.mongoStatus,
      event: this.activeEvent,
    };
  }

  private canAct(record: PlayerRecord): boolean {
    const now = Date.now();
    if (now - record.lastActionAt < 180) return false;
    record.lastActionAt = now;
    return true;
  }

  // ── Market simulation ─────────────────────────────────────────────────────

  /** Every ~9 minutes a tour group sweeps the street — 75s of bonus traffic. */
  private maybeStartRush(now: number): void {
    if (now < this.nextRushAt) return;
    this.nextRushAt = now + (8 + Math.random() * 5) * 60_000;
    this.rushUntil = now + 75_000;
    for (const record of this.onlineRecords()) {
      this.notifyRecord(record, {
        kind: 'event',
        title: 'Tour group inbound!',
        message: 'A busload of sightseers is pouring into Colon Street — stock up and serve fast!',
      });
    }
    console.log('[game] Rush hour — tour group on the street.');
  }

  /** Each employee works the counter: every ~50s one rings up a sale at 85% price. */
  private employeeAutoServe(record: PlayerRecord, now: number): void {
    const profile = record.profile;
    const staff = profile.employees;
    if (staff <= 0) return;
    if (now - (record.lastEmployeeSaleAt ?? 0) < 50_000 / staff) return;
    const inStock = PRODUCTS.filter((p) => (profile.inventory[p.id] ?? 0) > 0);
    if (inStock.length === 0) return;
    const product = inStock[Math.floor(Math.random() * inStock.length)];
    const quantity = Math.min(2, profile.inventory[product.id] ?? 0);
    const unit = Math.round(
      effectiveSellingPrice(profile, product) * firstNightBoost(profile) * 0.85,
    );
    record.lastEmployeeSaleAt = now;
    this.completeCounterSale(record, product, quantity, unit * quantity, now, 'local');
  }

  private simulateMarket(now: number): void {
    const online = this.onlineRecords();
    let activeSales = false;
    for (const record of online) {
      const profile = record.profile;
      syncExpiredPowerUps(profile, now);
      profile.dayProgress = this.clock.progress;
      profile.activeEvent = this.activeEvent;
      if (profile.challengeDay !== this.clock.day) {
        profile.challengeDay = this.clock.day;
        profile.dailyChallenge = { ...dailyChallengeFor(this.clock.day) };
        this.notifyRecord(record, {
          kind: 'event',
          title:
            this.clock.day % 9 >= 7
              ? "Tonight's challenge: Fiesta week!"
              : this.clock.day % 36 < 3
                ? "Tonight's challenge: Parol season"
                : `Tonight's challenge: ${profile.dailyChallenge.label}`,
          message:
            (this.clock.day % 9 >= 7
              ? 'Fiesta crowds — traffic is up 20% tonight. '
              : this.clock.day % 36 < 3
                ? 'Parol season — traffic dips but margins hold. '
                : '') + profile.dailyChallenge.desc,
        });
      }
      try {
        const result = simulateSales(profile, now, this.activeEvent, now < this.rushUntil);
        this.employeeAutoServe(record, now);
        for (const notice of advanceTutorial(profile, now)) {
          this.notifyRecord(record, notice);
          this.emitProfile(record);
        }
        if (result.revenue > 0) {
          activeSales = true;
          this.plotsDirty = true;
          checkGoalProgress(profile, result.notices);
        }
        // Throttle repeated stock warnings.
        for (const notice of result.notices) {
          if (notice.title === 'Sold out') {
            if (now - record.lowStockWarnAt < 75_000) continue;
            record.lowStockWarnAt = now;
          }
          this.notifyRecord(record, notice);
        }
      } catch (error) {
        console.error('[game] Economy tick failed for', profile.name, error);
      }
    }
    if (activeSales) {
      this.profileSyncAll(now);
    }
  }

  private syncProfiles(now: number): void {
    for (const record of this.onlineRecords()) {
      syncExpiredPowerUps(record.profile, now);
      record.profile.day = this.clock.day;
      record.profile.dayProgress = this.clock.progress;
      record.profile.activeEvent = this.activeEvent;
      updateWeather(record.profile, this.currentWeather());
      this.emitProfile(record);
    }
    if (this.plotsDirty) this.broadcastPlots();
    this.emitOnlineCount();
  }

  private profileSyncAll(now: number): void {
    for (const record of this.onlineRecords()) {
      record.profile.dayProgress = this.clock.progress;
      this.emitProfile(record);
    }
    void now;
  }

  private emitProfile(record: PlayerRecord): void {
    if (!record.socketId) return;
    record.profile.day = this.clock.day;
    record.profile.dayProgress = this.clock.progress;
    record.profile.activeEvent = this.activeEvent;
    record.profile.marketRushUntil = this.rushUntil;
    record.profile.online = true;
    record.profile.updatedAt = Date.now();
    updateWeather(record.profile, this.currentWeather());
    this.io.to(record.socketId).emit('profile', record.profile);
  }

  private snapshotFor(record: PlayerRecord): GameSnapshot {
    record.profile.day = this.clock.day;
    record.profile.dayProgress = this.clock.progress;
    record.profile.activeEvent = this.activeEvent;
    record.profile.marketRushUntil = this.rushUntil;
    record.profile.online = true;
    updateWeather(record.profile, this.currentWeather());
    return {
      serverNow: Date.now(),
      profile: record.profile,
      plots: sortPlots([...this.records.values()].map((r) => toPublicPlot(r.profile))),
      onlineCount: this.onlineRecords().length,
      activeEvent: this.activeEvent,
    };
  }

  private othersFor(excludeId: string): RemotePlayer[] {
    return this.onlineRecords()
      .filter((r) => r.profile.id !== excludeId)
      .map((r) => this.remotePlayerFor(r));
  }

  private remotePlayerFor(record: PlayerRecord): RemotePlayer {
    return {
      id: record.profile.id,
      name: record.profile.name,
      plotIndex: record.profile.plotIndex,
      x: record.position.x,
      y: record.position.y,
      z: record.position.z,
      rot: record.position.rot,
      anim: record.position.anim,
      emote: record.emote && record.emoteUntil > Date.now() ? record.emote : null,
      emoteUntil: record.emoteUntil,
      appearance: record.profile.appearance,
      reputation: record.profile.reputation,
    };
  }

  private onlineRecords(): PlayerRecord[] {
    return [...this.records.values()].filter((r) => r.socketId && r.profile.online);
  }

  private onlineCount(): number {
    return this.onlineRecords().length;
  }

  private broadcastPositions(): void {
    const online = this.onlineRecords();
    if (!online.length) return;
    const payload = online.map((r) => this.remotePlayerFor(r));
    this.io.to('market').emit('positions', payload);
  }

  private broadcastJoin(record: PlayerRecord, excludeSocketId: string): void {
    const remote = this.remotePlayerFor(record);
    this.io.to('market').except(excludeSocketId).emit('playerJoined', remote);
  }

  private emitOnlineCount(): void {
    const count = this.onlineCount();
    if (count === this.lastOnlineCount) return;
    this.lastOnlineCount = count;
    this.io.to('market').emit('onlineCount', count);
  }

  private broadcastPlots(): void {
    this.plotsDirty = false;
    const plots = sortPlots([...this.records.values()].map((r) => toPublicPlot(r.profile)));
    this.io.to('market').emit('plots', plots);
    for (const plot of plots) this.saveService.savePlot(plot);
  }

  private notifyRecord(record: PlayerRecord, notice: EconomyNotice): void {
    if (!record.socketId) return;
    this.io.to(record.socketId).emit('notification', {
      kind: notice.kind,
      title: notice.title,
      message: notice.message,
    });
  }

  private notifyAll(notice: EconomyNotice): void {
    for (const record of this.onlineRecords()) this.notifyRecord(record, notice);
  }

  private emitToSocket(record: PlayerRecord, event: string, payload: unknown): void {
    if (!record.socketId) return;
    this.io.to(record.socketId).emit(event, payload);
  }

  // ── Weather & events ──────────────────────────────────────────────────────

  private rollWeather(): PlayerProfile['weather'] {
    const roll = Math.random();
    const condition = roll < 0.62 ? 'clear' : roll < 0.85 ? 'cloudy' : 'rain';
    const temperature = condition === 'rain' ? 23 : condition === 'cloudy' ? 25 : 24;
    return { condition, temperature };
  }

  private currentWeather(): PlayerProfile['weather'] {
    if (this.activeEvent) {
      switch (this.activeEvent.type) {
        case 'typhoon':
          return { condition: 'rain', temperature: 22 };
        case 'rain':
          return { condition: 'rain', temperature: 23 };
        case 'fiesta':
          return { condition: 'clear', temperature: 26 };
        case 'christmasRush':
          return { condition: 'clear', temperature: 24 };
        case 'blackout':
          return { condition: 'cloudy', temperature: 24 };
        default:
          return { ...this.dayWeather, temperature: this.dayWeather.temperature - 1 };
      }
    }
    return this.dayWeather;
  }

  private maybeStartEvent(now: number): void {
    if (this.activeEvent && this.activeEvent.endsAt > now) return;
    if (now < this.nextEventAllowedAt) return;
    if (!this.onlineRecords().length) return;
    if (Math.random() > 0.42) {
      this.nextEventAllowedAt = now + 45_000;
      return;
    }
    this.startEvent(now);
  }

  private startEvent(now: number): void {
    const types = (Object.keys(MARKET_EVENTS) as MarketEventType[]).filter((t) => t !== this.lastEventType);
    const totalWeight = types.reduce((sum, type) => sum + MARKET_EVENTS[type].weight, 0);
    let roll = Math.random() * totalWeight;
    let chosen: MarketEventType = types[0];
    for (const type of types) {
      roll -= MARKET_EVENTS[type].weight;
      if (roll <= 0) {
        chosen = type;
        break;
      }
    }
    const definition = MARKET_EVENTS[chosen];
    this.activeEvent = {
      type: chosen,
      startedAt: now,
      endsAt: now + definition.durationMs,
    };
    this.lastEventType = chosen;
    this.nextEventAllowedAt = now + definition.durationMs + 25_000;
    this.notifyAll({
      kind: 'event',
      title: definition.name,
      message: definition.description,
    });
    this.io.to('market').emit('marketEvent', this.activeEvent);
    for (const record of this.onlineRecords()) {
      record.profile.activeEvent = this.activeEvent;
      updateWeather(record.profile, this.currentWeather());
      this.emitProfile(record);
    }
    this.applyEventImpact(chosen, now);
    console.log(`[game] Market event: ${definition.name}`);
  }

  private endEvent(): void {
    if (!this.activeEvent) return;
    const definition = MARKET_EVENTS[this.activeEvent.type];
    this.activeEvent = null;
    this.nextEventAllowedAt = Date.now() + 30_000;
    this.io.to('market').emit('marketEvent', null);
    for (const record of this.onlineRecords()) {
      record.profile.activeEvent = null;
      updateWeather(record.profile, this.currentWeather());
      this.emitProfile(record);
    }
    this.notifyAll({
      kind: 'info',
      title: `${definition.name} has passed`,
      message: 'The street settles back into its usual rhythm.',
    });
  }

  private applyEventImpact(type: MarketEventType, now: number): void {
    const online = this.onlineRecords();
    for (const record of online) {
      const profile = record.profile;
      switch (type) {
        case 'theft': {
          let risk = 0.48;
          if (has(profile, 'nightWatch')) risk *= 0.6;
          if (has(profile, 'bagCheck')) risk *= 0.65;
          if (has(profile, 'cctv')) risk *= 0.45;
          if (has(profile, 'guard')) risk *= 0.15;
          if (has(profile, 'tanod')) risk *= 0.75;
          if (Math.random() > risk) break;
          const loss = Math.min(profile.balance, Math.round(30 + Math.random() * 140));
          profile.balance -= loss;
          profile.today.theftLoss += loss;
          profile.today.incidents += 1;
          if (has(profile, 'alarm')) {
            this.notifyRecord(record, {
              kind: 'warning',
              title: 'Alarm triggered',
              message: `Your alarm caught a pickpocket. ₱${loss} was lost before they fled.`,
            });
          } else {
            this.notifyRecord(record, {
              kind: 'danger',
              title: 'Theft at your stall',
              message: `A pickpocket slipped away with ₱${loss}. Security upgrades reduce the risk.`,
            });
          }
          if (loss > 0) {
            this.saveService.recordTransaction(profile.id, 'theft', -loss, profile.balance, 'Pickpocket incident');
          }
          break;
        }
        case 'inspection': {
          if (consumePermitShield(profile)) {
            this.notifyRecord(record, {
              kind: 'success',
              title: 'Permit Shield used',
              message: 'The inspection found your papers in order. No fine this time.',
            });
            break;
          }
          let fine = 90 + this.clock.day * 12;
          if (has(profile, 'tanod')) fine *= 0.5;
          if (has(profile, 'permanentKiosk')) fine *= 0.8;
          const charged = Math.min(profile.balance, Math.round(fine));
          profile.balance -= charged;
          profile.today.expenses += charged;
          profile.today.expenseBreakdown['Permit fines'] = (profile.today.expenseBreakdown['Permit fines'] ?? 0) + charged;
          profile.today.incidents += 1;
          if (charged > 0) {
            this.saveService.recordTransaction(profile.id, 'permit_fine', -charged, profile.balance, 'Inspection fine');
          }
          this.notifyRecord(record, {
            kind: 'danger',
            title: 'Permit inspection',
            message: charged > 0
              ? `The barangay issued a ₱${charged} fine. Keep a Permit Shield ready next time.`
              : 'Your stall was inspected and closed briefly, but you had no cash for the fine.',
          });
          break;
        }
        case 'typhoon': {
          if (has(profile, 'rainTarp')) {
            this.notifyRecord(record, {
              kind: 'success',
              title: 'Rain tarp held',
              message: 'Your reinforced tarp kept the typhoon from damaging your inventory.',
            });
            break;
          }
          let lost = 0;
          for (const product of Object.keys(profile.inventory)) {
            const qty = profile.inventory[product] ?? 0;
            if (qty <= 0) continue;
            const category = product.startsWith('danggit') || product.startsWith('dried') || product.startsWith('tinapa') || product.startsWith('bangus')
              ? 'driedFish'
              : product.startsWith('ukay') || ['shirt', 'jeans', 'jacket', 'kidsSet'].includes(product)
                ? 'ukay'
                : 'fresh';
            const rate = category === 'fresh' ? 0.15 : 0.05;
            const loss = Math.min(qty, Math.max(1, Math.round(qty * rate)));
            profile.inventory[product] = qty - loss;
            lost += loss;
          }
          profile.today.spoiled += lost;
          profile.today.incidents += 1;
          this.notifyRecord(record, {
            kind: 'danger',
            title: 'Typhoon damage',
            message: `${lost} item${lost === 1 ? '' : 's'} were damaged by wind and floodwater. A Rain Tarp would protect your stock.`,
          });
          break;
        }
        case 'blackout': {
          let lost = 0;
          for (const product of ['siomai', 'barbecue', 'puso', 'kwek', 'mango', 'banana', 'lanzones', 'watermelon']) {
            const qty = profile.inventory[product] ?? 0;
            if (qty <= 0) continue;
            const rate = has(profile, 'coolerBox') ? 0.02 : 0.06;
            const loss = Math.min(qty, Math.max(1, Math.round(qty * rate)));
            profile.inventory[product] = qty - loss;
            lost += loss;
          }
          profile.today.spoiled += lost;
          this.notifyRecord(record, {
            kind: 'warning',
            title: 'Power outage',
            message: lost > 0
              ? `Coolers lost power and ${lost} fresh item${lost === 1 ? '' : 's'} spoiled.`
              : 'The block went dark. Keep a cooler box ready for the next outage.',
          });
          break;
        }
        case 'staffIssue': {
          if (profile.employees > 0) {
            this.notifyRecord(record, {
              kind: 'warning',
              title: 'Staff trouble',
              message: 'One of your crew walked out mid-shift. Service is slower until the night ends.',
            });
          }
          break;
        }
        case 'shortage':
          this.notifyRecord(record, {
            kind: 'warning',
            title: 'Supplier shortage',
            message: 'Wholesale prices are up 20% during the shortage. Stock up carefully.',
          });
          break;
        case 'rival':
          this.notifyRecord(record, {
            kind: 'warning',
            title: 'Rival stall',
            message: 'A competitor across the street copied your bestsellers. Traffic is split tonight.',
          });
          break;
        case 'jeepneyStrike':
          this.notifyRecord(record, {
            kind: 'warning',
            title: 'Jeepney strike',
            message: 'No rides, fewer shoppers. Foot traffic is down for a while.',
          });
          break;
        case 'fiesta':
        case 'christmasRush':
          this.notifyRecord(record, {
            kind: 'success',
            title: type === 'fiesta' ? 'Fiesta crowd!' : 'Christmas rush!',
            message: 'The street is packed. Keep your shelves stocked to capture the surge.',
          });
          break;
        default:
          break;
      }
      profile.updatedAt = now;
    }
    for (const record of online) this.emitProfile(record);
  }

  /** True while the player's current event matches, used by client visual hints. */
  hasActiveEvent(record: PlayerRecord, type: MarketEventType): boolean {
    return !!this.activeEvent && this.activeEvent.type === type && this.activeEvent.endsAt > Date.now();
  }

  // ── Persistence ───────────────────────────────────────────────────────────

  private async saveOnline(): Promise<void> {
    const records = [...this.records.values()].filter((r) => r.socketId || r.profile.online);
    await Promise.all(records.map((r) => this.saveService.save(this.serializeRecord(r)!)));
  }

  private async saveAll(): Promise<void> {
    await Promise.all(
      [...this.records.values()].map((r) => this.saveService.save(this.serializeRecord(r)!)),
    );
  }

  get debug(): { day: number; progress: number; records: number; online: number; event: ActiveEventState | null } {
    return {
      day: this.clock.day,
      progress: Number(this.clock.progress.toFixed(3)),
      records: this.records.size,
      online: this.onlineCount(),
      event: this.activeEvent,
    };
  }
}

// ── Utility ─────────────────────────────────────────────────────────────────

function has(profile: PlayerProfile, upgradeId: string): boolean {
  return Object.values(profile.chosenUpgrades).includes(upgradeId);
}

function sanitizeName(raw?: string): { ok: true; name: string } | { ok: false; error: string } {
  if (typeof raw !== 'string') return { ok: false, error: 'Enter your vendor name.' };
  const name = raw.replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > 18) {
    return { ok: false, error: 'Vendor name must be 2–18 characters.' };
  }
  if (!/^[\p{L}\p{N}][\p{L}\p{N} .'_-]*$/u.test(name)) {
    return { ok: false, error: 'Use letters, numbers, spaces, apostrophes or hyphens only.' };
  }
  return { ok: true, name };
}

function sanitizeBusinessName(raw?: string): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > 30) return null;
  if (!/^[\p{L}\p{N}][\p{L}\p{N} .'&!_-]*$/u.test(name)) return null;
  return name;
}

function sanitizeAppearance(appearance?: Appearance): Appearance | null {
  if (!appearance) return null;
  const valid = (value: unknown) => typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
  if (!valid(appearance.shirt) || !valid(appearance.pants) || !valid(appearance.skin) || !valid(appearance.hair)) {
    return null;
  }
  return {
    shirt: appearance.shirt,
    pants: appearance.pants,
    skin: appearance.skin,
    hair: appearance.hair,
  };
}
