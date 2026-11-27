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
        emote: typeof p.emote === 'string' ? p.emote : undefined,
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

    socket.on('serveCustomer', (ack: Ack) => {
      safe(ack, () => {
        if (!rateLimit(socket, 100)) return { ok: false, error: 'Slow down a moment.' };
        return game.serveCustomer(socket.id);
      });
    });

    socket.on('respondHaggle', (payload: unknown, ack: Ack) => {
      safe(ack, () => {
        if (!rateLimit(socket, 100)) return { ok: false, error: 'Slow down a moment.' };
        const p = (payload ?? {}) as Record<string, unknown>;
        return game.respondHaggle(socket.id, p.accept === true);
      });
    });

    socket.on('takeOrder', (ack: Ack) => {
      safe(ack, () => {
        if (!rateLimit(socket, 100)) return { ok: false, error: 'Slow down a moment.' };
        return game.takeKarenderoOrder(socket.id);
      });
    });

    socket.on('pickupFood', (ack: Ack) => {
      safe(ack, () => {
        if (!rateLimit(socket, 100)) return { ok: false, error: 'Slow down a moment.' };
        return game.pickupKarenderoFood(socket.id);
      });
    });

    socket.on('serveDish', (payload: unknown, ack: Ack) => {
      safe(ack, () => {
        if (!rateLimit(socket, 100)) return { ok: false, error: 'Slow down a moment.' };
        const p = (payload ?? {}) as Record<string, unknown>;
        if (typeof p.dishId !== 'string') return { ok: false, error: 'Invalid dish.' };
        return game.serveKarenderoDish(socket.id, p.dishId);
      });
    });

    socket.on('karenderoUpsell', (payload: unknown, ack: Ack) => {
      safe(ack, () => {
        if (!rateLimit(socket, 100)) return { ok: false, error: 'Slow down a moment.' };
        const p = (payload ?? {}) as Record<string, unknown>;
        return game.respondKarenderoUpsell(socket.id, p.accept === true);
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

    socket.on('respondOffer', (payload: unknown, ack: Ack) => {
      safe(ack, () => {
        if (!rateLimit(socket, 200)) return { ok: false, error: 'Slow down a moment.' };
        const p = (payload ?? {}) as Record<string, unknown>;
        if (typeof p.id !== 'string') return { ok: false, error: 'Invalid offer.' };
        return game.respondOffer(socket.id, p.id, p.accept === true);
      });
    });

    socket.on('setDifficulty', (payload: unknown, ack: Ack) => {
      safe(ack, () => {
        if (!rateLimit(socket, 400)) return { ok: false, error: 'Slow down a moment.' };
        const p = (payload ?? {}) as Record<string, unknown>;
        if (typeof p.difficulty !== 'string') return { ok: false, error: 'Invalid difficulty.' };
        return game.setDifficulty(socket.id, p.difficulty);
      });
    });

    socket.on('negotiateSupplier', (payload: unknown, ack: Ack) => {
      safe(ack, () => {
        if (!rateLimit(socket, 600)) return { ok: false, error: 'Slow down a moment.' };
        const p = (payload ?? {}) as Record<string, unknown>;
        if (typeof p.category !== 'string') return { ok: false, error: 'Invalid category.' };
        return game.negotiateSupplier(socket.id, p.category);
      });
    });

    socket.on('sendCompliment', (payload: unknown, ack: Ack) => {
      safe(ack, () => {
        if (!rateLimit(socket, 900)) return { ok: false, error: 'Slow down a moment.' };
        const p = (payload ?? {}) as Record<string, unknown>;
        if (typeof p.toId !== 'string') return { ok: false, error: 'Invalid vendor.' };
        return game.sendCompliment(socket.id, p.toId, typeof p.message === 'string' ? p.message : '');
      });
    });

    socket.on('importSave', (payload: unknown, ack: Ack) => {
      safe(ack, () => {
        if (!rateLimit(socket, 900)) return { ok: false, error: 'Slow down a moment.' };
        const p = (payload ?? {}) as Record<string, unknown>;
        return game.importSave(socket.id, p.save ?? p);
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
