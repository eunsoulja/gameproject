import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import cors from 'cors';
import express from 'express';
import { Server } from 'socket.io';
import { SERVER_CONFIG } from './config';
import { SaveService } from './services/SaveService';
import { GameService } from './services/GameService';
import { registerGameSockets } from './sockets/GameSocket';

async function bootstrap(): Promise<void> {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (!SERVER_CONFIG.isProduction) return callback(null, true);
        if (SERVER_CONFIG.clientOrigin.includes(origin)) return callback(null, true);
        return callback(new Error('Origin not allowed'), false);
      },
      methods: ['GET', 'POST'],
    },
    maxHttpBufferSize: 200_000,
    pingTimeout: 20_000,
    pingInterval: 10_000,
  });

  app.use(cors({ origin: true }));
  app.use(express.json({ limit: '24kb' }));
  app.disable('x-powered-by');

  const saveService = new SaveService();
  await saveService.init();
  const game = new GameService(io, saveService);
  await game.init();
  registerGameSockets(io, game);
  game.start();

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'merkado-de-colon',
      uptime: Math.round(process.uptime()),
      persistence: saveService.mongoStatus,
      market: game.debug,
      transactionsLogged: saveService.stats.transactions,
    });
  });

  app.get('/api/market', (_req, res) => {
    res.json({
      ok: true,
      ...game.getPublicStatus(),
      serverTime: Date.now(),
    });
  });

  app.get('/api/version', (_req, res) => {
    res.json({ name: "Merkado De 'Colon", version: '1.0.0' });
  });

  // In production the Vite build is served by Express as a single origin.
  const clientDir = path.resolve(process.cwd(), 'dist/client');
  if (fs.existsSync(clientDir)) {
    app.use(
      express.static(clientDir, {
        etag: true,
        maxAge: '1h',
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
        },
      }),
    );
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io')) return next();
      res.sendFile(path.join(clientDir, 'index.html'));
    });
  } else if (SERVER_CONFIG.isProduction) {
    console.warn('[server] dist/client was not found. Run `npm run build` before starting production.');
  }

  app.use((_req, res) => {
    res.status(404).json({ ok: false, error: 'Not found' });
  });

  server.listen(SERVER_CONFIG.port, () => {
    console.log('');
    console.log("  ╔══════════════════════════════════════════════════╗");
    console.log("  ║        MERKADO DE 'COLON — NIGHT MARKET          ║");
    console.log('  ╠══════════════════════════════════════════════════╣');
    console.log(`  ║  Server   http://localhost:${SERVER_CONFIG.port}                    ║`);
    console.log(`  ║  Persist  ${saveService.mongoStatus.padEnd(38)}║`);
    console.log(`  ║  Market   day ${String(game.debug.day).padEnd(35)}║`);
    console.log('  ╚══════════════════════════════════════════════════╝');
    console.log('');
    if (!fs.existsSync(clientDir)) console.log('  Dev UI → npm run dev  (Vite on http://localhost:5173)');
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[server] ${signal} — saving market and closing…`);
    try {
      await game.stop();
      await saveService.close();
      io.close();
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 4000);
    } catch (error) {
      console.error('[server] Shutdown error', error);
      process.exit(1);
    }
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

bootstrap().catch((error) => {
  console.error('[server] Failed to start', error);
  process.exit(1);
});
