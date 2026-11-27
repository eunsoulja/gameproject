# Merkado De 'Colon

A browser-based 3D Filipino night-market tycoon. Walk around a lively market, buy and sell goods, upgrade your stall, and grow your business while the market day ticks on.

Built with **Three.js** on the client, **Express + Socket.IO** on the server, and **TypeScript** across the whole stack. MongoDB persistence is optional — the game falls back to in-memory saves for local play.

## Features

- Third-person 3D night market with procedurally generated stalls, crowds, umbrellas, weather, and audio
- Real-time economy: prices shift with supply, demand, and market events
- Buy, sell, and inventory management with plots and upgrades
- Suki regulars who remember your stall, nightly missions, and a badge collection
- Market offers (bulk buys, consignment), supplier haggling, and player compliments
- Difficulty modes (chill / standard / hustle) and save export/import
- Emotes, floating sale text, bloom post-processing, real rain particles, and jeepneys
- Multiplayer-ready Socket.IO server with synchronized market state and remote players
- Day cycle with daily reports
- Optional MongoDB saves; in-memory mode works out of the box

## Controls

| Input | Action |
| --- | --- |
| `WASD` | Move |
| `Shift` | Sprint |
| `Space` | Jump |
| `E` | Interact |
| Drag / scroll | Look / zoom |
| `B` `P` `T` | Stock / power-ups / ledger panels |
| `1`–`4` | Wave, dance, point, cheer emotes |
| `M` `F` `R` `N` | Mute, fullscreen, reset camera, name tags |
| `H` | Help |

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

## Changelog — NPC realism arc (P1–P50)

**NPC life** — realistic walk cycles with turn banking, soft-body crowd separation,
bench sitting, idle fidgets (watch checks, phone scroll, stretches), kids and elders
with distinct gaits, greeting pairs, umbrella etiquette, vendor keepers behind stalls,
and NPCs that wave back and step aside when you emote nearby. Every shopper has a
name, chats in Taglish, and can be chatted with (E) — suki regulars queue more often
and earn a ★ badge and milestone toast.

**Karendero mode** — food stalls run a real queue: take order → auto-cook → pick up →
serve the match. Drinks add-ons, "Extra rice?" up-sells, fast-service streaks,
star reviews, patience timers, numbered floor decals, and a colorblind-safe marker
option. Karendero stats live in the lifetime ledger alongside an NPC chat counter.

**World & ambience** — district zoning (Ukay Alley, Pasalubong Row, Plaza del Mercado,
Pares District, Colon Drag, Night Market Row), lot-tier stall placement, category
silhouettes, visible upgrade dressing, street clutter (bikes, planters, vending
machines, loading docks), swaying laundry, steam vents, string-light sway, lantern
flicker, wet-ground treatment, rain ripple rings, footstep dust, and procedural
market music plus ambient NPC mumble.

**UI & tech** — minimap, pinnable objective tracker, objective toasts, stats ledger,
awning color picker, spectate orbit cam (C), spin emote (5), touch-friendly chat
radius, crowd distance LOD, draw-call readout, shadows-first auto-quality, and a
join→first-sale telemetry ping.
