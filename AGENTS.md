# AGENTS.md

## Commands

- `npm run dev` — server (:4000) + Vite client (:5173) with hot reload
- `npm run typecheck` — type-checks server and client (run before committing)
- `npm run build` — compiles server and builds the client into `dist/`
- `npm start` — production server serving `dist/client`

## Layout

- `client/src/game/` — Three.js world: `Game.ts` orchestrates, `Environment`, `CrowdSystem`, `PlotManager`, `Avatar`, `Input`, `AudioManager`
- `client/src/ui/` — HUD and modal menus (all modals use the shared modal helper; `isModalOpen()` gates input)
- `client/src/systems/` — `NetworkClient` (socket actions), `Settings` (persisted localStorage)
- `server/src/services/` — `GameService` (socket-facing actions), `EconomyService` (sim: sales, offers, quests, suki)
- `shared/` — types + config imported by both sides (`config.ts` holds products, upgrades, events, achievements)

## Conventions

- New player actions need: shared type in `shared/types.ts`, server method in `GameService` + socket handler in `GameSocket.ts` (wrapped in `rateLimit`), `NetworkClient` method, then client wiring.
- Settings changes go through `SettingsManager.set/patch` so they persist and notify listeners.
- Keep commits small and descriptive; `npm run typecheck` must stay clean.
