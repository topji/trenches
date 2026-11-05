# PROGRESS.md — newest first

## Thu 5 Nov 2026, 14:40 IST — Step 1 done: foundation and domain core

**Works**
- pnpm workspace: `apps/web` (Next.js 15, React 19, Tailwind 3 mapped to design tokens), `apps/worker` (node-cron shell, no jobs yet), `packages/core`.
- `packages/core`: domain types, `computeLeaderboard` (average-cost P&L, ROI, win rate, deterministic rank with tie-breaks), `splitPrize` (6 dp base units, remainder to rank 1), `splitFee`, ids/slugs, status derivation, `createTrenchSchema` with COPY.md error strings. 30 unit tests green.
- Landing page with COPY.md strings, nav, footer, Button / StatusPill / ExplorerLink / HumanBadge / EmptyState / InlineError components, `font-scoreboard` utility, Archivo (wdth axis) + JetBrains Mono via next/font.
- `pnpm dev`, `pnpm build`, `pnpm test`, `pnpm typecheck`, `pnpm lint` all green. `scripts/screenshot.ts` captures any page at 390 and 1280 px (Playwright). Landing reviewed at both widths: no overflow, tokens only, no shadows, no all-caps.
- `docs/integrations/{flash,arkiv,hedera,world}.md`: exact external shapes from the official docs with URLs.

**Decisions made (from the integration docs; these change the spec)**
- Flash has no `dca` order type. "DCA" in the UI maps to Flash `twap` (`durationSeconds` ≥ 300, `twapBucketCount` 2–2560). Flash order types we will use: `market`, `twap` (as DCA), `bracket`, `limit`, `twap`. Platform fee = `flashIntegratorFeeBps` on quote and order; there is no fee-recipient parameter, fees accrue to the Definitive account that owns the API key. `FLASH_FEE_RECIPIENT` env is therefore unused and will be dropped.
- Flash signing: quote with `funderAddress` → optional one-time ERC-20 approve to the settlement contract → `eth_signTypedData_v4` over `evm.orderTypedData` → POST /order. Privy embedded wallet signs client-side.
- Arkiv SDK is 1.0.x: schema-typed entities (`defineSchema`, `createEntity`, `patchEntity`, `deleteEntity`, `executeBatch`), expiry in blocks (`ExpirationTime.fromDays(30)`), update-in-place supported, no `IN`/`NOT` in queries (use `or(eq, eq)`), indexed columns only are filterable, page size ≤ 100. RPC and chain id in the spec are correct (Rabdi testnet). Access key from hub.arkiv.network needed to avoid 429s.
- World ID is IDKit 4.x: `IDKitRequestWidget` with a backend-signed `rp_context` (RP signing key, 300 s TTL), preset `proofOfHuman({ signal })`, verify at `POST https://developer.world.org/api/v4/verify/{rp_id}`. Portal v4 accepts nullifier reuse, so once-per-Trench is enforced by our unique index. No IDKit mock mode is documented; top booth question for step 4 (`allow_legacy_proofs: true` + simulator is the fallback).
- Hedera: use `@hiero-ledger/sdk` (same API as `@hashgraph/sdk`, which is frozen). Parse keys with `fromStringECDSA`/`fromStringDer`, never `fromString`. Testnet USDC exists: `0.0.429274` (Circle faucet). HIP-423 long-term scheduling is live on testnet (max 62 days), so a Scheduled Transaction with a future execution time is feasible; smoke-test it in step 2.
- Root `package.json` is `"type": "module"` so `tsx` scripts can use top-level await.

**Doesn't work yet**
- Nothing external: no `.env`, no network calls made.

**Next:** step 2 on command. Flash client + `scripts/flash-smoke.ts` first (gate 17:00 IST), then Arkiv, Hedera, World.

## Thu 5 Nov 2026, 13:00 IST — kickoff
- Single repo `topji/trenches`. Spec docs stay outside the repo. Build gated by `ROADMAP.md` steps.
