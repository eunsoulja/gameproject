import { io, type Socket } from 'socket.io-client';
import type {
  Ack,
  Appearance,
  DayReportPayload,
  GameSnapshot,
  JoinResult,
  NotificationPayload,
  PlayerProfile,
  PositionPayload,
  PublicPlot,
  RemotePlayer,
} from '../../../shared/types';
import type { ActiveEventState, StallCategory, UpgradeBranch } from '../../../shared/config';

export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'offline' | 'error';

export interface NetworkHandlers {
  onProfile: (profile: PlayerProfile) => void;
  onPlots: (plots: PublicPlot[]) => void;
  onPositions: (players: RemotePlayer[]) => void;
  onPlayerJoined: (player: RemotePlayer) => void;
  onPlayerLeft: (id: string) => void;
  onNotification: (notification: NotificationPayload) => void;
  onDayReport: (payload: DayReportPayload) => void;
  onMarketEvent: (event: ActiveEventState | null) => void;
  onOnlineCount: (count: number) => void;
  onStatus: (state: ConnectionState, message?: string) => void;
  onForceLogout: (reason: string) => void;
  onRejoin: (snapshot: GameSnapshot, players: RemotePlayer[]) => void;
}

interface JoinCredentials {
  name: string;
  token?: string;
  category: StallCategory;
  appearance: Appearance;
}

interface ServerToClientEvents {
  profile: (profile: PlayerProfile) => void;
  plots: (plots: PublicPlot[]) => void;
  positions: (players: RemotePlayer[]) => void;
  playerJoined: (player: RemotePlayer) => void;
  playerLeft: (payload: { id: string }) => void;
  notification: (payload: NotificationPayload) => void;
  dayReport: (payload: DayReportPayload) => void;
  marketEvent: (event: ActiveEventState | null) => void;
  onlineCount: (count: number) => void;
  forceLogout: (payload: { reason: string }) => void;
}

interface ClientToServerEvents {
  join: (
    payload: JoinCredentials,
    ack: (result: JoinResult) => void,
  ) => void;
  position: (payload: PositionPayload) => void;
  purchaseUpgrade: (
    payload: { branch: UpgradeBranch; tier: number; optionId: string },
    ack: (result: Ack<PlayerProfile>) => void,
  ) => void;
  buyStock: (
    payload: { productId: string; quantity: number },
    ack: (result: Ack<PlayerProfile>) => void,
  ) => void;
  setPrice: (
    payload: { productId: string; price: number },
    ack: (result: Ack<PlayerProfile>) => void,
  ) => void;
  activatePowerUp: (
    payload: { id: string },
    ack: (result: Ack<PlayerProfile>) => void,
  ) => void;
  setBusinessName: (
    payload: { name: string },
    ack: (result: Ack<PlayerProfile>) => void,
  ) => void;
  setAppearance: (
    payload: Appearance,
    ack: (result: Ack<PlayerProfile>) => void,
  ) => void;
  requestSnapshot: (ack: (result: Ack<GameSnapshot>) => void) => void;
}

export class NetworkClient {
  private socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;
  private handlers: NetworkHandlers;
  private credentials: JoinCredentials | null = null;
  private joined = false;
  private hasJoinedOnce = false;
  private intentionalClose = false;
  private rejoinPending = false;
  private lastPositionSent = 0;
  private lastSent: PositionPayload | null = null;

  constructor(handlers: NetworkHandlers) {
    this.handlers = handlers;
  }

  async join(credentials: JoinCredentials): Promise<JoinResult> {
    this.credentials = credentials;
    this.intentionalClose = false;

    if (!this.socket) {
      this.handlers.onStatus('connecting');
      this.socket = io({
        autoConnect: false,
        reconnection: true,
        reconnectionAttempts: 15,
        reconnectionDelay: 900,
        reconnectionDelayMax: 4500,
        timeout: 9000,
        transports: ['websocket', 'polling'],
      });
      this.bindSocket(this.socket);
    }

    if (!this.socket.connected) {
      const connected = await this.waitForConnection();
      if (!connected) {
        this.handlers.onStatus('error', 'Could not reach the market server.');
        return { ok: false, error: 'The market server is offline. Start the Node server (npm run dev) and try again.' };
      }
    }

    return this.sendJoin(credentials, false);
  }

  private waitForConnection(timeoutMs = 12000): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.socket) return resolve(false);
      if (this.socket.connected) return resolve(true);
      let done = false;
      const finish = (value: boolean) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        this.socket?.off('connect', onConnect);
        this.socket?.off('connect_error', onError);
        resolve(value);
      };
      const onConnect = () => finish(true);
      const onError = () => finish(false);
      const timer = window.setTimeout(() => finish(false), timeoutMs);
      this.socket.once('connect', onConnect);
      this.socket.once('connect_error', onError);
      this.socket.connect();
    });
  }

  private sendJoin(credentials: JoinCredentials, isRejoin: boolean): Promise<JoinResult> {
    return new Promise((resolve) => {
      if (!this.socket) return resolve({ ok: false, error: 'Not connected.' });
      const timer = window.setTimeout(() => {
        resolve({ ok: false, error: 'The server took too long to respond. Please try again.' });
      }, 10000);
      this.socket.emit('join', credentials, (result) => {
        clearTimeout(timer);
        if (result.ok) {
          this.joined = true;
          this.hasJoinedOnce = true;
          this.credentials = {
            ...credentials,
            token: result.token ?? credentials.token,
          };
          this.handlers.onStatus('connected');
          if (isRejoin && result.snapshot) {
            this.handlers.onRejoin(result.snapshot, result.players ?? []);
          }
        } else {
          this.joined = false;
        }
        resolve(result);
      });
    });
  }

  private bindSocket(socket: Socket<ServerToClientEvents, ClientToServerEvents>): void {
    socket.on('connect', () => {
      if (this.intentionalClose || !this.hasJoinedOnce || !this.credentials) return;
      if (this.rejoinPending) return;
      this.rejoinPending = true;
      this.handlers.onStatus('reconnecting');
      this.sendJoin(this.credentials, true)
        .then((result) => {
          this.rejoinPending = false;
          if (!result.ok) {
            this.handlers.onStatus('error', result.error ?? 'Could not restore your market session.');
          }
        })
        .catch(() => {
          this.rejoinPending = false;
          this.handlers.onStatus('error', 'Could not restore your market session.');
        });
    });

    socket.on('disconnect', (reason) => {
      if (this.intentionalClose) return;
      this.joined = false;
      this.rejoinPending = false;
      this.handlers.onStatus('reconnecting', reason);
    });

    socket.on('connect_error', () => {
      if (this.intentionalClose) return;
      this.joined = false;
      this.handlers.onStatus('offline');
    });

    socket.io.on('reconnect_attempt', () => {
      if (this.intentionalClose) return;
      this.handlers.onStatus('reconnecting');
    });

    socket.io.on('reconnect_failed', () => {
      this.joined = false;
      this.rejoinPending = false;
      this.handlers.onStatus('error', 'Could not reconnect to the market.');
    });

    socket.on('profile', (profile) => this.handlers.onProfile(profile));
    socket.on('plots', (plots) => this.handlers.onPlots(plots));
    socket.on('positions', (players) => this.handlers.onPositions(players));
    socket.on('playerJoined', (player) => this.handlers.onPlayerJoined(player));
    socket.on('playerLeft', (payload) => this.handlers.onPlayerLeft(payload.id));
    socket.on('notification', (payload) => this.handlers.onNotification(payload));
    socket.on('dayReport', (payload) => this.handlers.onDayReport(payload));
    socket.on('marketEvent', (event) => this.handlers.onMarketEvent(event));
    socket.on('onlineCount', (count) => this.handlers.onOnlineCount(count));
    socket.on('forceLogout', (payload) => {
      this.joined = false;
      this.handlers.onForceLogout(payload.reason);
    });
  }

  sendPosition(position: PositionPayload, force = false): void {
    if (!this.socket?.connected || !this.joined) return;
    const now = performance.now();
    if (!force && now - this.lastPositionSent < 72) return;
    const prev = this.lastSent;
    if (
      prev &&
      !force &&
      Math.abs(prev.x - position.x) < 0.015 &&
      Math.abs(prev.y - position.y) < 0.015 &&
      Math.abs(prev.z - position.z) < 0.015 &&
      Math.abs(prev.rot - position.rot) < 0.02 &&
      prev.anim === position.anim
    ) {
      return;
    }
    this.lastPositionSent = now;
    this.lastSent = position;
    this.socket.emit('position', position);
  }

  private emitAck<T>(event: string, payload: unknown): Promise<Ack<T>> {
    return new Promise((resolve) => {
      if (!this.socket?.connected) {
        resolve({ ok: false, error: 'You are disconnected from the market.' });
        return;
      }
      const timer = window.setTimeout(() => resolve({ ok: false, error: 'The market did not respond.' }), 8000);
      (this.socket as any).emit(event, payload, (result: Ack<T>) => {
        clearTimeout(timer);
        resolve(result);
      });
    });
  }

  purchaseUpgrade(branch: UpgradeBranch, tier: number, optionId: string): Promise<Ack<PlayerProfile>> {
    return this.emitAck('purchaseUpgrade', { branch, tier, optionId });
  }

  buyStock(productId: string, quantity: number): Promise<Ack<PlayerProfile>> {
    return this.emitAck('buyStock', { productId, quantity });
  }

  setPrice(productId: string, price: number): Promise<Ack<PlayerProfile>> {
    return this.emitAck('setPrice', { productId, price });
  }

  activatePowerUp(id: string): Promise<Ack<PlayerProfile>> {
    return this.emitAck('activatePowerUp', { id });
  }

  setBusinessName(name: string): Promise<Ack<PlayerProfile>> {
    return this.emitAck('setBusinessName', { name });
  }

  setAppearance(appearance: Appearance): Promise<Ack<PlayerProfile>> {
    return this.emitAck('setAppearance', appearance);
  }

  async requestSnapshot(): Promise<GameSnapshot | null> {
    const result = await this.emitAck<GameSnapshot>('requestSnapshot', undefined);
    return result.ok && result.data ? result.data : null;
  }

  close(): void {
    this.intentionalClose = true;
    this.joined = false;
    this.hasJoinedOnce = false;
    this.rejoinPending = false;
    this.socket?.removeAllListeners();
    this.socket?.io.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
  }

  get connected(): boolean {
    return !!this.socket?.connected && this.joined;
  }
}
