import type { Server, Socket } from 'socket.io';
import type { GameService } from '../services/GameService';

type Ack = (payload: unknown) => void;
const ANIMS = new Set(['idle', 'walk', 'run', 'jump']);

export function registerGameSockets(io: Server, game: GameService): void {
  io.on('connection', (socket: Socket) => {
    socket.data.lastPosition = 0;
    socket.data.lastAction = 0;

    const safe = <T>(ack: unknown, fn: () => T): void => {
      try {
        const result = fn();
        if (typeof ack === 'function') (ack as (p: T) => void)(result);
      } catch (error) {
        console.error('[socket] Handler error', error);
        if (typeof ack === 'function') {
          (ack as (p: unknown) => void)({ ok: false, error: 'The market hit an unexpected snag. Please try again.' });
        }
      }
    };

    socket.on('join', (payload: unknown, ack: Ack) => {
      safe(ack, () => {
        if (game.recordForSocket(socket.id)) {
          return game.getSnapshot(socket.id);
        }
        const data = (payload ?? {}) as {
          name?: string;
          token?: string;
          category?: string;
          appearance?: unknown;
        };
        if (typeof data.name !== 'string' || data.name.length > 40) {
          return { ok: false, error: 'Enter a valid vendor name.' };
        }
        if (data.token !== undefined && typeof data.token !== 'string') {
          return { ok: false, error: 'Invalid session token.' };
        }
        const result = game.join(socket, {
          name: data.name,
          token: data.token,
          category: data.category as never,
          appearance: data.appearance as never,
        });
        return result;
      });
    });

    socket.on('position', (payload: unknown) => {
      if (!payload || typeof payload !== 'object') return;
      const now = Date.now();
      if (now - Number(socket.data.lastPosition) < 40) return;
      socket.data.lastPosition = now;
      const p = payload as Record<string, unknown>;
      if (
        !Number.isFinite(p.x) ||
        !Number.isFinite(p.y) ||
        !Number.isFinite(p.z) ||
        !Number.isFinite(p.rot) ||
        typeof p.anim !== 'string' ||
        !ANIMS.has(p.anim)
      ) {
        return;
      }
      game.updatePosition(socket.id, {
        x: p.x as number,
        y: p.y as number,
        z: p.z as number,
        rot: p.rot as number,
        anim: p.anim as 'idle' | 'walk' | 'run' | 'jump',
      });
    });

    socket.on('purchaseUpgrade', (payload: unknown, ack: Ack) => {
      safe(ack, () => {
        if (!rateLimit(socket, 180)) return { ok: false, error: 'Slow down a moment.' };
        const p = (payload ?? {}) as Record<string, unknown>;
        if (typeof p.branch !== 'string' || typeof p.optionId !== 'string' || !Number.isFinite(p.tier)) {
          return { ok: false, error: 'Invalid upgrade request.' };
        }
        return game.purchaseUpgrade(socket.id, p.branch as never, Number(p.tier), p.optionId);
      });
    });

    socket.on('buyStock', (payload: unknown, ack: Ack) => {
      safe(ack, () => {
        if (!rateLimit(socket, 120)) return { ok: false, error: 'Slow down a moment.' };
        const p = (payload ?? {}) as Record<string, unknown>;
        if (typeof p.productId !== 'string') return { ok: false, error: 'Invalid product.' };
        return game.buyStock(socket.id, p.productId, Number(p.quantity));
      });
    });

    socket.on('setPrice', (payload: unknown, ack: Ack) => {
      safe(ack, () => {
        if (!rateLimit(socket, 80)) return { ok: false, error: 'Slow down a moment.' };
        const p = (payload ?? {}) as Record<string, unknown>;
        if (typeof p.productId !== 'string') return { ok: false, error: 'Invalid product.' };
        return game.setPrice(socket.id, p.productId, Number(p.price));
      });
    });

    socket.on('activatePowerUp', (payload: unknown, ack: Ack) => {
      safe(ack, () => {
        if (!rateLimit(socket, 350)) return { ok: false, error: 'Slow down a moment.' };
        const p = (payload ?? {}) as Record<string, unknown>;
        if (typeof p.id !== 'string') return { ok: false, error: 'Invalid power-up.' };
        return game.activatePowerUp(socket.id, p.id);
      });
    });

    socket.on('setBusinessName', (payload: unknown, ack: Ack) => {
      safe(ack, () => {
        if (!rateLimit(socket, 600)) return { ok: false, error: 'Slow down a moment.' };
        const p = (payload ?? {}) as Record<string, unknown>;
        if (typeof p.name !== 'string') return { ok: false, error: 'Invalid business name.' };
        return game.setBusinessName(socket.id, p.name);
      });
    });

    socket.on('setAppearance', (payload: unknown, ack: Ack) => {
      safe(ack, () => {
        if (!rateLimit(socket, 600)) return { ok: false, error: 'Slow down a moment.' };
        return game.setAppearance(socket.id, payload as never);
      });
    });

    socket.on('requestSnapshot', (ack: Ack) => {
      safe(ack, () => game.getSnapshot(socket.id));
    });

    socket.on('disconnect', () => {
      game.detach(socket);
    });
  });
}

function rateLimit(socket: Socket, minimumMs: number): boolean {
  const now = Date.now();
  if (now - Number(socket.data.lastAction ?? 0) < minimumMs) return false;
  socket.data.lastAction = now;
  return true;
}
