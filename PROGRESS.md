# PROGRESS.md — newest first

## Thu 5 Nov 2026, 16:10 IST — Step 2 code done; smoke runs blocked on `.env`

**Works**
- `packages/flash`: zod-validated client (quote, order, get/list orders, cancel, search, balances), `buildQuoteRequest` for market / dca→twap / bracket→market+attachedBracket / limit / twap, EIP-712 normalisation for viem, Flash fill → domain fill. **Live read-only probe with the public dev key passed:** search, and $3 market / TWAP(3 buckets) / market+bracket quotes all parsed; integrator fee 30 bps shows as `estimatedFeeNotional: "0.009"`.
- `packages/arkiv`: SDK 1.0 schemas (`trenches.trench|entry|lb|payout|profile|sponsorship`), repo with update-in-place (`patchEntity`) and one-tx leaderboard rewrite (`executeBatch` creates+patches+deletes), expiry = end + 30 d in blocks capped at the 182-day max. **Keyless RPC read passed** (block timing).
- `packages/hedera`: `@hiero-ledger/sdk` client, DER/ECDSA key parsing, AES-256-GCM escrow-key envelope, escrow account (unlimited auto-association), demo token, associate, multi-party HTS transfer, HCS topic + 1 KB envelope, HIP-423 long-term scheduled transfer, Mirror Node reads, HashScan links. **Mirror read passed** (testnet USDC 0.0.429274).
- `packages/worldid`: IDKit 4.x result schemas, `signRpContext` (idkit-core signing), nonce registry, `verifyIdKitResult` (forwards unchanged to `/api/v4/verify/{rp_id}`, enforces env/action/signal/credential), salted nullifier hash. `WORLD_MOCK=true` accepts only results carrying a server-issued single-use nonce.
- `scripts/flash-smoke.ts`, `arkiv-smoke.ts`, `hedera-smoke.ts`: each exits 2 "NEEDS ENV" today after its read-only check; 0 PASS / 1 FAIL once keys exist. 68 unit tests green.

**Decisions made**
- World action stays `join-trench` (one Portal action). Once-per-Trench is our unique index on (trenchId, nullifierHash); the signal is `${trenchId}:${wallet}` so a proof is bound to both the Trench and the caller wallet. (In 4.0 the signal does not change the nullifier.)
- `FLASH_FEE_RECIPIENT` dropped: Flash fees accrue to the API-key owner's Definitive account.
- Scheduled Transaction plan: HIP-423 long-term schedule with `waitForExpiry=true`, escrow key pre-signed at creation. The smoke script falls back to a plain transfer and says so if the network rejects it.
- DCA UI = Flash TWAP; legs → `twapBucketCount`, legs×interval → `durationSeconds` (floored at 300 s).

**Blocked (not failures)**
- Flash gate: no fill yet — needs `DEMO_TRADER_A_KEY` + `FLASH_API_KEY`. The quote → sign → submit → poll path is written and typechecked; it runs the moment the key lands.
- Arkiv write, Hedera writes: need the keys listed in `.env.example`.

**Next:** when `.env` lands → `pnpm smoke` and log every explorer link here. Then step 3 on command.

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
