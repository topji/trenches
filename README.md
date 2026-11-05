# Trenches

Trading competitions your community can't fake. KOLs and trading communities host on-chain competitions; entrants prove they are a unique human, trade from their own wallet, a live leaderboard ranks them, and the prize pool pays out on its own at the deadline.

Built solo at ETHGlobal Mumbai, 5–7 Nov 2026. Work in progress: see [ROADMAP.md](ROADMAP.md) and [PROGRESS.md](PROGRESS.md).

## Stack
- Next.js 15 app (`apps/web`) and a node-cron worker (`apps/worker`)
- Execution: Definitive Flash · Public records: Arkiv · Escrow and audit log: Hedera (no Solidity) · Humans: World ID

## Run
```
pnpm install
cp .env.example .env   # fill in keys
pnpm dev               # web on :3000
pnpm dev:worker
pnpm test              # unit tests
```

## Licence
MIT
