# Merkado De 'Colon

A browser-based 3D Filipino night-market tycoon. Walk around a lively market, buy and sell goods, upgrade your stall, and grow your business while the market day ticks on.

Built with **Three.js** on the client, **Express + Socket.IO** on the server, and **TypeScript** across the whole stack. MongoDB persistence is optional — the game falls back to in-memory saves for local play.

## Features

- Third-person 3D night market with procedurally generated stalls, crowds, umbrellas, weather, and audio
- Real-time economy: prices shift with supply, demand, and market events
- Buy, sell, and inventory management with plots and upgrades
- Multiplayer-ready Socket.IO server with synchronized market state and remote players
- Day cycle with daily reports
- Optional MongoDB saves; in-memory mode works out of the box

## Requirements

- Node.js 20+ (tested with Node 24)
- npm 10+
- MongoDB (optional)

## Getting started

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. The Vite dev server proxies `/api` and `/socket.io` to the game server on port 4000.

> On Windows PowerShell, if `npm` is blocked by the execution policy, use `npm.cmd` instead.

## Production

```bash
npm run build
npm start
```

The Express server serves the built client from `dist/client` and the API/sockets from the same origin. Open <http://localhost:4000>.

## Configuration

Copy `.env.example` to `.env` and adjust as needed:

| Variable | Description | Default |
| --- | --- | --- |
| `PORT` | HTTP + Socket.IO port | `4000` |
| `NODE_ENV` | Set to `production` for production mode | `development` |
| `MONGODB_URI` | MongoDB connection string (optional) | in-memory |
| `CLIENT_ORIGIN` | Comma-separated allowed origins in production | `http://localhost:5173,http://localhost:4000` |

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Run server and Vite client together with hot reload |
| `npm run dev:client` | Vite client only (port 5173) |
| `npm run dev:server` | Game server only (port 4000, watch mode) |
| `npm run build` | Type-check/compile the server and build the client |
| `npm start` | Run the production server from `dist/` |
| `npm run typecheck` | Type-check server and client without emitting |
| `npm run preview` | Preview the production client build |

## Project structure

```
client/            Vite + Three.js front end
  src/game/        World, player, market generation, crowds, weather
  src/ui/          HUD, menus, notifications
  src/systems/     Networking and settings
  src/styles/      CSS
server/
  src/services/    Economy, plots, inventory, upgrades, saves
  src/sockets/     Socket.IO game protocol
  src/models/      Mongoose models
shared/            Types, config, and layout shared by client and server
```

## API

- `GET /api/health` — server status, persistence mode, market debug info
- `GET /api/market` — public market status
- `GET /api/version` — app name and version
