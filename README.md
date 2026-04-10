# Ability System

```
ability-system/
├── ability-api/       Express + Neon + JWT — core API
├── ability-mobile/    Expo (React Native) — investors
├── ability-web/       Next.js — businesses & government
└── docs/              Documentation
```

## Prerequisites

- Node.js 20+
- Neon `DATABASE_URL`, `JWT_SECRET`, and other vars in **`ability-api/.env`** (see **`ability-api/.env.example`**)

## Install

From the repository root:

```bash
npm install
```

(This uses npm workspaces and installs all three packages.)

## Run

| Package | Command | Notes |
|---------|---------|--------|
| API | `npm run dev:api` | Default: `PORT` from **`ability-api/.env`** (often 3002) |
| Mobile | `npm run dev:mobile` | **`scripts/start-dev-tunnel.cjs`**: prefers API localtunnel, but starts Expo in **LAN** mode for stability. Start the API first. |
| Web | `npm run dev:web` | http://localhost:3001 |

Or run each package from its folder: `cd ability-api && npm run dev`, etc.

### Expo Go + API: avoiding “offline” and `Network request failed`

**Default `npm start` / `npm run dev:mobile`** runs **`ability-mobile/scripts/start-dev-tunnel.cjs`**: it attempts a **localtunnel** to the **`ability-api`** port (from **`ability-api/.env`** `PORT`), writes **`EXPO_PUBLIC_API_URL`** + **`EXPO_LOCK_API_URL=1`** into **`ability-mobile/.env`**, then starts Expo in **LAN mode** (**`expo start --lan`**) to avoid ngrok tunnel failures. If localtunnel setup fails, it removes the API lock and falls back to syncing LAN API URL automatically. Start **`ability-api`** (`npm run dev:api`) **before** the mobile script so the API is reachable.

- **Force pure LAN (no API tunnel):** use **`npm run start:lan`** in **`ability-mobile`** (syncs LAN API URL + **`expo start --lan`**).
- **iPhone-safe LAN startup with auto Metro port:** use **`npm run start:ios-safe`** in **`ability-mobile`**.
- **Tunnel only for Metro, API still on LAN:** **`npm run start:metro-only`** — only use if the phone can reach your PC’s LAN IP for **`EXPO_PUBLIC_API_URL`** (otherwise API calls fail).

**Security:** a dev tunnel exposes your local API on the public internet for as long as it runs. Use only for development; do not rely on it for production secrets.

## Environment

- **`ability-api/.env`** — `DATABASE_URL`, `JWT_SECRET`, `PORT`, optional `ADMIN_USER_IDS`
- **`ability-mobile/.env`** — `EXPO_PUBLIC_API_URL` (must be reachable from the **phone**), optional `EXPO_LOCK_API_URL`, `API_PORT`

See **`docs/FOLDER_STRUCTURE.md`** for details.
