import type {
  ActiveEventState,
  PowerUpState,
  StallCategory,
  UpgradeBranch,
} from './config';

export interface Appearance {
  shirt: string;
  pants: string;
  skin: string;
  hair: string;
}

export interface TodayStats {
  revenue: number;
  expenses: number;
  customers: number;
  productsSold: number;
  spoiled: number;
  theftLoss: number;
  incidents: number;
  repStart: number;
  soldByProduct: Record<string, number>;
  expenseBreakdown: Record<string, number>;
}

export interface LifetimeStats {
  totalEarnings: number;
  totalRevenue: number;
  totalExpenses: number;
  totalCustomers: number;
  totalProductsSold: number;
  totalSpoiled: number;
  totalUpgrades: number;
  daysPlayed: number;
  peakDayRevenue: number;
}

export interface DailyReport {
  day: number;
  dateLabel: string;
  revenue: number;
  expenses: number;
  net: number;
  productsSold: number;
  customers: number;
  spoiled: number;
  theftLoss: number;
  incidents: number;
  reputationDelta: number;
  reputation: number;
  notes: string[];
  breakdown: Array<{ label: string; amount: number }>;
  topProduct: string | null;
}

export interface SukiCustomer {
  name: string;
  visits: number;
  favorite: string;
  lastDay: number;
}

export interface DailyQuest {
  id: string;
  label: string;
  target: number;
  progress: number;
  reward: number;
  done: boolean;
  paid: boolean;
}

export interface MarketOffer {
  id: string;
  kind: 'bulkBuy' | 'consignment';
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  expiresAt: number;
  buyerName: string;
}

export interface PlayerProfile {
  id: string;
  name: string;
  businessName: string;
  plotIndex: number;
  balance: number;
  reputation: number;
  day: number;
  dayProgress: number;
  inventory: Record<string, number>;
  prices: Record<string, number>;
  unlockedCategories: StallCategory[];
  chosenUpgrades: Record<string, string>;
  powerUps: PowerUpState[];
  permitShields: number;
  stallCount: number;
  employees: number;
  today: TodayStats;
  lifetime: LifetimeStats;
  reports: DailyReport[];
  goalStage: number;
  supplierPrices: Record<StallCategory, number>;
  supplierForecast: Record<StallCategory, number>;
  appearance: Appearance;
  weather: {
    condition: 'clear' | 'cloudy' | 'rain';
    temperature: number;
  };
  activeEvent: ActiveEventState | null;
  nextDayEvent: string | null;
  suki: SukiCustomer[];
  lastSukiNoticeAt: number;
  quest: DailyQuest | null;
  difficulty: 'chill' | 'standard' | 'hustle';
  updatedAt: number;
  online: boolean;
}

export interface PublicPlot {
  index: number;
  ownerId: string;
  ownerName: string;
  businessName: string;
  categories: StallCategory[];
  reputation: number;
  stallCount: number;
  upgrades: string[];
  totalEarnings: number;
  online: boolean;
  appearance: Appearance;
  lastSeen: number;
}

export interface RemotePlayer {
  id: string;
  name: string;
  plotIndex: number;
  x: number;
  y: number;
  z: number;
  rot: number;
  anim: 'idle' | 'walk' | 'run' | 'jump';
  emote?: string | null;
  emoteUntil?: number;
  appearance: Appearance;
  reputation: number;
  online?: boolean;
}

export interface GameSnapshot {
  serverNow: number;
  profile: PlayerProfile;
  plots: PublicPlot[];
  onlineCount: number;
  activeEvent: ActiveEventState | null;
}

export interface JoinResult {
  ok: boolean;
  error?: string;
  token?: string;
  snapshot?: GameSnapshot;
  players?: RemotePlayer[];
}

export interface Ack<T = unknown> {
  ok: boolean;
  error?: string;
  data?: T;
}

export interface PurchaseRequest {
  branch: UpgradeBranch;
  tier: number;
  optionId: string;
}

export interface StockRequest {
  productId: string;
  quantity: number;
}

export interface PriceRequest {
  productId: string;
  price: number;
}

export interface NotificationPayload {
  kind: 'info' | 'success' | 'warning' | 'danger' | 'event';
  title: string;
  message: string;
  icon?: string;
}

export interface DayReportPayload {
  report: DailyReport;
  profile: PlayerProfile;
}

export interface PositionPayload {
  x: number;
  y: number;
  z: number;
  rot: number;
  anim: 'idle' | 'walk' | 'run' | 'jump';
  emote?: string;
}

export type ServerEventMap = {
  snapshot: (snapshot: GameSnapshot) => void;
  profile: (profile: PlayerProfile) => void;
  plots: (plots: PublicPlot[]) => void;
  positions: (players: RemotePlayer[]) => void;
  playerJoined: (player: RemotePlayer) => void;
  playerLeft: (payload: { id: string }) => void;
  notification: (payload: NotificationPayload) => void;
  dayReport: (payload: DayReportPayload) => void;
  marketEvent: (event: ActiveEventState | null) => void;
  offer: (offer: MarketOffer) => void;
  offerResolved: (payload: { id: string; accepted: boolean }) => void;
  onlineCount: (count: number) => void;
  forceLogout: (payload: { reason: string }) => void;
};

export type ClientEventMap = {
  join: (
    payload: { name: string; token?: string; category?: StallCategory; appearance?: Appearance },
    ack: (result: JoinResult) => void,
  ) => void;
  position: (payload: PositionPayload) => void;
  purchaseUpgrade: (payload: PurchaseRequest, ack: (result: Ack<PlayerProfile>) => void) => void;
  buyStock: (payload: StockRequest, ack: (result: Ack<PlayerProfile>) => void) => void;
  setPrice: (payload: PriceRequest, ack: (result: Ack<PlayerProfile>) => void) => void;
  setBusinessName: (payload: { name: string }, ack: (result: Ack<PlayerProfile>) => void) => void;
  setAppearance: (payload: Appearance, ack: (result: Ack<PlayerProfile>) => void) => void;
  activatePowerUp: (payload: { id: string }, ack: (result: Ack<PlayerProfile>) => void) => void;
  respondOffer: (payload: { id: string; accept: boolean }, ack: (result: Ack<PlayerProfile>) => void) => void;
  setDifficulty: (payload: { difficulty: string }, ack: (result: Ack<PlayerProfile>) => void) => void;
  sendCompliment: (payload: { toId: string; message: string }, ack: (result: Ack) => void) => void;
  requestSnapshot: (ack: (result: Ack<GameSnapshot>) => void) => void;
};
