# Ghost Whale

Solana whale alert system — monitor wallet addresses in real-time and receive signals when large on-chain movements are detected.

## Features

- Real-time WebSocket alerts from Helius RPC
- Scoring engine (danger / pump / whale / scanning)
- Watchlist persists across browser sessions (localStorage)
- Browser push notifications on PHANTOM SURGE (score >= 70)
- Per-wallet transaction history with Solscan links
- Glassmorphism dark UI

---

## Project Structure

```
ghost-whale/
│
├── README.md
├── package.json                          ← root workspace config
├── pnpm-workspace.yaml                   ← pnpm monorepo config
├── tsconfig.base.json                    ← shared TypeScript base
│
├── artifacts/
│   │
│   ├── api-server/                       ← Express backend (port 8080)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── build.mjs                     ← esbuild bundler script
│   │   └── src/
│   │       ├── index.ts                  ← HTTP server + WebSocket upgrade
│   │       ├── app.ts                    ← Express app setup
│   │       ├── routes/
│   │       │   ├── index.ts              ← combines all routers
│   │       │   ├── health.ts             ← GET /api/healthz
│   │       │   ├── feed.ts               ← POST /api/feed (scoring engine)
│   │       │   └── track.ts              ← GET /api/track/:wallet
│   │       └── lib/
│   │           ├── logger.ts             ← pino logger singleton
│   │           └── ws-server.ts          ← WebSocket server + Helius bridge
│   │
│   └── dashboard/                        ← React + Vite frontend (port 3000)
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── index.html
│       └── src/
│           ├── main.tsx                  ← React entry point
│           ├── App.tsx                   ← router (wouter)
│           ├── index.css                 ← global styles + glassmorphism
│           ├── hooks/
│           │   ├── use-feed.ts           ← merged polling + realtime hook
│           │   ├── use-ws.ts             ← WebSocket client lifecycle
│           │   ├── use-watchlist.ts      ← localStorage wallet persistence
│           │   └── use-notifications.ts  ← browser push notification hook
│           ├── pages/
│           │   ├── dashboard.tsx         ← main dashboard page
│           │   ├── track.tsx             ← wallet transaction history page
│           │   └── not-found.tsx         ← 404 page
│           └── components/
│               └── ui/                   ← shadcn/ui components
│                   ├── badge.tsx
│                   ├── button.tsx
│                   ├── input.tsx
│                   ├── scroll-area.tsx
│                   ├── skeleton.tsx
│                   └── ...
```

---

## Prerequisites

- [Node.js 20+](https://nodejs.org/)
- [pnpm 9+](https://pnpm.io/installation)
- [Helius API key](https://helius.dev) — free tier works

---

## Setup

### 1. Clone the repo

```bash
git clone https://github.com/your-username/ghost-whale.git
cd ghost-whale
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Set environment variables

Create a `.env` file in `artifacts/api-server/`:

```env
# artifacts/api-server/.env
HELIUS_KEY=your_helius_api_key_here
PORT=8080
NODE_ENV=development
```

Create a `.env` file in `artifacts/dashboard/`:

```env
# artifacts/dashboard/.env
PORT=3000
BASE_PATH=/
```

---

## Running Locally

Open **two terminal windows**:

**Terminal 1 — API Server:**
```bash
cd artifacts/api-server
pnpm run dev
# Server starts at http://localhost:8080
```

**Terminal 2 — Dashboard:**
```bash
cd artifacts/dashboard
pnpm run dev
# Dashboard starts at http://localhost:3000
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

---

## API Reference

### `GET /api/healthz`
Health check.
```json
{ "status": "ok" }
```

### `POST /api/feed`
Returns whale signal for a list of wallets.

**Request:**
```json
{ "wallets": ["wallet_address_1", "wallet_address_2"] }
```

**Response:**
```json
[
  {
    "message": "ALPHA GHOST DETECTED",
    "level": "danger",
    "score": 85
  }
]
```

Signal levels:

| Level | Score | Meaning |
|---|---|---|
| `danger` | >= 70 | PHANTOM SURGE — heavy accumulation |
| `pump` | >= 40 | SPECTER MOVE — momentum building |
| `whale` | > 0 | GHOST TRACE — shadow moves |
| `scanning` | 0 | Awaiting data |

### `GET /api/track/:wallet`
Returns last 20 transactions for a wallet address.

**Response:**
```json
[
  {
    "type": "BUY",
    "buyToken": "EPjFWdd5AufqSSqeM2q...",
    "buyAmount": 1000000,
    "token": "EPjFWdd5AufqSSqeM2q...",
    "amount": "2.5000",
    "price": null,
    "timestamp": 1715000000,
    "signature": "5KJtBV..."
  }
]
```

### `WebSocket /api/ws`
Real-time wallet subscription.

**Subscribe:**
```json
{ "type": "SUBSCRIBE", "wallet": "wallet_address" }
```

**Server pushes:**
```json
{
  "type": "ALERT_BUY",
  "data": {
    "wallet": "wallet_address",
    "buyToken": "EPjFWdd5...",
    "buyAmount": 1000000,
    "amount": "2.5000",
    "timestamp": 1715000000
  }
}
```

---

## How the Scoring Engine Works

The engine (`artifacts/api-server/src/routes/feed.ts`) fetches the last 10 transactions per wallet via Solana JSON-RPC, then scores them:

| Condition | Points |
|---|---|
| Transaction > 5 SOL | +30 |
| Transaction > 1 SOL | +15 |
| Transaction > 0.1 SOL | +5 |
| Transaction > 0.05 SOL | +2 |
| 6+ transactions in window | +20 |
| 3+ transactions in window | +10 |
| 4+ unique wallets active | +20 |
| 2+ unique wallets active | +10 |
| Max score | 100 |

Transactions below 0.05 SOL are ignored as noise.

---

## Frontend Hooks

| File | Purpose |
|---|---|
| `use-watchlist.ts` | Reads/writes wallet list to `localStorage` under key `ghost-whale-watchlist` |
| `use-feed.ts` | Merges polling (every 30s) and WebSocket alerts into a single history array |
| `use-ws.ts` | Manages WebSocket connection lifecycle with auto-reconnect every 3s |
| `use-notifications.ts` | Wraps the browser Notification API — requests permission and fires alerts when the tab is in the background |

---

## Pages

| Route | File | Description |
|---|---|---|
| `/` | `pages/dashboard.tsx` | Main dashboard — add wallets, view signal feed |
| `/track/:wallet` | `pages/track.tsx` | Transaction history for a specific wallet |

---

## Deployment

### Deploy API Server (e.g. Railway, Render, Fly.io)

Set these environment variables on your host:

```
HELIUS_KEY=your_key
PORT=8080
NODE_ENV=production
```

Build and start:
```bash
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/api-server run start
```

### Deploy Dashboard (e.g. Vercel, Netlify)

Build command:
```bash
pnpm --filter @workspace/dashboard run build
```

Output directory: `artifacts/dashboard/dist/public`

Set environment variables:
```
BASE_PATH=/
```

Make sure your dashboard points to your deployed API server URL. Update the fetch calls in `use-feed.ts` and `track.tsx` from `/api/...` to `https://your-api-server.com/api/...` if frontend and backend are on different domains.

---

## Environment Variables Summary

| Variable | Where | Required | Description |
|---|---|---|---|
| `HELIUS_KEY` | api-server | Yes | Your Helius API key |
| `PORT` | api-server | Yes | Port for the Express server |
| `NODE_ENV` | api-server | No | `development` or `production` |
| `PORT` | dashboard | Yes | Port for Vite dev server |
| `BASE_PATH` | dashboard | Yes | Base URL path, use `/` for root |

---

## .gitignore

Create this file at the root:

```gitignore
# Dependencies
node_modules/

# Build outputs
dist/
.next/

# Environment files — NEVER commit these
.env
.env.local
.env.*.local

# Logs
*.log

# OS
.DS_Store
Thumbs.db

# Editor
.vscode/
.idea/
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20+, TypeScript 5.9 |
| Package manager | pnpm (monorepo) |
| Backend framework | Express 5 |
| WebSocket | ws library + Helius RPC |
| Blockchain data | Helius API + Solana JSON-RPC |
| Frontend framework | React 18 + Vite |
| Styling | Tailwind CSS v4 + custom glassmorphism |
| UI components | shadcn/ui (Radix UI primitives) |
| Data fetching | TanStack Query (React Query) |
| Routing | wouter |
| Build tool | esbuild (backend), Vite (frontend) |
| Logging | pino + pino-http |

---

## License

MIT
