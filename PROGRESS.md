# PROGRESS.md — newest first

## Sat 7 Nov 2026, 03:10 IST — Step 4 done: join with World ID (F2.1–F2.5), Privy login

**Works (live, testnet + Neon)**
- Privy login (email + external wallet, embedded wallet for users without one, Base default) via `@privy-io/react-auth`; nav shows Connect wallet → short address + Sign out. Server session: `Authorization: Bearer <access token>` verified with `@privy-io/node`, wallet read from the identity token (`apps/web/lib/server/privy.ts`). The typed host-address field from step 3 is gone; the create and fund routes take the signed-in wallet.
- World ID: `GET /api/world/rp-context` signs an `rp_context` (300 s) and persists the nonce (`issued_nonces`); `POST /api/trenches/[id]/join` verifies the IDKit result (`packages/worldid/src/verify.ts`: environment, action, signal hash = `trenchId:wallet`, credential `proof_of_human`/`orb`, single-use nonce, then the Portal unless mocked), stores `sha256(nullifier + TRENCH_SALT)` with a unique index per Trench, writes the `trenches.entry` and `trenches.profile` entities to Arkiv, and posts `entry.joined` to HCS.
- Trench page: `JoinPanel` (real mode = `IDKitRequestWidget`, Proof of Human preset; mock mode = in-page sheet) and a real `<table>` leaderboard merging Arkiv `lb` rows with entrants at $0.00, human badge on every entrant, "You" tag + accent left border on the caller's row, scoreboard figures, 120 ms stagger.
- Playwright `e2e/f2-join.spec.ts`, mobile, all five green (3.7 min): F2.1 success → "You're in", rank 1, $0.00, badge, `1 entrant`, `entry.joined` on HCS; F2.2 cancel → inline muted copy, zero join requests; F2.3 tampered signal → 401 "Verification failed. Try again.", plus direct malformed and unsolicited-nonce payloads → 401; F2.4 same mock human from another wallet → 409 "You've already entered this Trench.", same wallet via API → 409; F2.5 draft → "This Trench hasn't been funded yet.", ended → "This Trench has ended.", button disabled.
- F2.1 run links: Trench entity https://rabdi.explorer.arkiv.network/entity/0x2cc8f30c2654069c1a45197e37163bd9b67fd17af4fe0a4b54168747ec0f72d7 · entry entity https://rabdi.explorer.arkiv.network/entity/0x5baa662724a84121df1672e1d872e4606437943e652a568ac51f21de55342d53 · profile entity (verifiedHuman=true) https://rabdi.explorer.arkiv.network/entity/0x8fa610a8811dbb9d54bacfeabb8d3efc0bef65f9a1203043bf277e651705547f · escrow https://hashscan.io/testnet/account/0.0.11345746 · topic https://hashscan.io/testnet/topic/0.0.11345747 · `entry.joined` https://hashscan.io/testnet/transaction/0.0.11330265-1793999918-164082358.
- F1 suite green on mobile and desktop after the session change. F2 suite green on desktop too (3.2 min) once the three post-join writes (Arkiv entry, Arkiv profile, HCS) ran concurrently; sequentially the join took 60 s.
- `docs/integrations/privy.md` (exact 3.51 / node 0.38 API), `docs/worldid-debrief.md` (trust moment, credential choice, time to first success, friction, one improvement).

**Decisions made**
- **Mocked proofs, our way.** No documented IDKit mock mode (booth note was for Agent Pass), no phone at the venue. `WORLD_MOCK=true` skips only the Portal call; the result must still carry a nonce this server signed, the right action, environment and signal hash, so an unsolicited payload fails. The mock sheet keeps the four paths demonstrable. `WORLD_MOCK=false` runs the real widget + Portal on the same code path. Stated in the debrief and will be in the README.
- Nonces live in Postgres, not memory, so verification works on serverless and across workers.
- Demo session for e2e and scripted demos: `x-trenches-demo: <DEMO_SECRET>` + `x-trenches-address`, DEMO_MODE only; the browser UI never uses it (Playwright injects it via localStorage). Real users go through Privy.
- `@privy-io/server-auth` is deprecated on npm → `@privy-io/node`. Identity token sent as `privy-id-token` to avoid the rate-limited user lookup.
- Hedera SDK, gRPC, postgres, pino, @privy-io/node are explicit **server webpack externals**. `serverExternalPackages` silently stopped working once pnpm installed a second SDK instance (new peers from Privy); the bundled SDK then failed with "timeout exceeded" / `e.startsWith is not a function`. Cost ~1.5 h of the night.
- Service singletons (db pool, Hedera client, Arkiv repo) are cached on `globalThis` so Next hot reloads reuse them. Hedera client: 4 attempts, 60 s request timeout, so a stuck call fails in a minute.
- `TRENCH_SALT` was the placeholder; a random 32-byte hex is now in `.env`. Changing it later would orphan existing nullifier hashes.
- e2e: `globalSetup` warms the dev server's lazy routes; dev script runs with a 6 GB heap (Next restarted itself on its memory threshold mid-suite).

**Doesn't work yet**
- Real (non-mocked) World verification is untested live: needs a phone with World App or the simulator at staging. Code path exists and is covered by unit tests with a mocked Portal.
- Orders / Flash fill (step 5), leaderboard scoring (step 6), settlement (step 7).

**Next:** step 5 on command. First order through the UI is also the deferred Flash gate; needs the builder's own wallet with a few USDC on Base.

## Fri 6 Nov 2026, 20:05 IST — Step 3 done: create → fund → live (F1.1–F1.4)

**Works (live, testnet + Neon)**
- `packages/db`: Drizzle schema for trenches, escrow_keys (AES-256-GCM), entries, world_verifications (unique on trenchId+nullifierHash), orders, fills, leaderboard, payouts, fee_ledger, hcs_messages, jobs. Migration `0000` applied to Neon (`pnpm db:migrate`).
- `packages/services`: `createTrench` (Hedera escrow account + topic → Arkiv `trenches.trench` entity → Postgres + encrypted key → HCS `trench.created`), `fundTrench` (treasury HTS transfer → status funded, Arkiv patch in place, HCS `trench.funded`), `activateTrenches` (funded→live at startAt, live→ended at endAt, Arkiv patch + HCS `trench.live`/`trench.ended`), Mirror escrow balance. An Arkiv failure is stored as pending and shown in the UI, never hidden.
- `apps/worker`: `activateTrenches` every 30 s, non-overlapping.
- Routes: `POST/GET /api/trenches`, `GET /api/trenches/[id]` (Arkiv + Mirror + HCS log + every explorer link), `POST /api/trenches/[id]/fund`, `POST /api/dev/tick` (DEMO_MODE: run the worker job once).
- Pages: `/create` (one long form, live split sum, field-level errors from the shared zod schema), `/create/[id]/fund` (escrow + topic + Arkiv record with links, one "Fund escrow" button), `/t/[slug]` (header from the Arkiv entity: countdown hero, pool, status pill, escrow line with HashScan/topic/funding/Arkiv links, on-chain log), `/trenches` (Arkiv discovery query, sorted by pool, All/Live/Upcoming/Ended chips).
- `scripts/f1-smoke.ts` (services layer, no HTTP) PASS in 47 s: https://hashscan.io/testnet/account/0.0.11340033 (escrow), https://hashscan.io/testnet/topic/0.0.11340034 (topic, 3 messages), https://rabdi.explorer.arkiv.network/entity/0xdc70684a25b67bccf01a34372bbbffffeb1b8f174bbf8bfa79027bc58ad8b3bf (entity, patched draft→funded→live), funding tx https://hashscan.io/testnet/transaction/0.0.11330265-1793973448-984972714.
- Playwright `e2e/f1-create.spec.ts` (mobile + desktop): F1.2 field errors with zero requests; F1.1 create → funding screen with HashScan links + Arkiv entity link; F1.3 fund → `funded`, fundingTxId, `trench.funded` on HCS, shows in discovery, Trench page reads from Arkiv (`source: "arkiv"`); F1.4 worker tick after startAt → Live pill. Example run: escrow https://hashscan.io/testnet/account/0.0.11340200, topic https://hashscan.io/testnet/topic/0.0.11340201, funding https://hashscan.io/testnet/transaction/0.0.11330265-1793974478-382116623, entity https://rabdi.explorer.arkiv.network/entity/0xc6ff13edef28a7d629a74eda60f847065b661a1ab5651de77d26e81ad9812972.
- Screenshots at 390 px reviewed: tokens only, no shadows, no all-caps, rows not cards. Two wraps fixed (split sum, Arkiv link on the funding screen).

**Decisions made**
- Host identity before Privy (step 4): in DEMO_MODE the create form has a "Your wallet address" field and mutating routes read it from the body (`lib/server/session.ts`). Step 4 swaps that helper for the Privy session; the form field goes away.
- Migrations live in `packages/db/drizzle` (spec said `apps/web/drizzle`); the worker needs the same schema, so the db package owns it.
- Next.js must treat `@hiero-ledger/sdk`, `@grpc/grpc-js`, `postgres`, `pino` as server externals, and they must be direct deps of `apps/web` for that to work under pnpm. Bundled, the Hedera SDK's gRPC never connects ("timeout exceeded" after 15 min). Also `extensionAlias` so workspace `.js` specifiers resolve to `.ts`.
- `packages/core` uses Web Crypto, not `node:crypto`, so the create form can run the same zod schema client-side.
- Status pill is time-aware: a persisted `live` Trench whose window ended reads "Ended"; under 10 min left reads "Ending soon".
- Each e2e run creates a real escrow account (1 HBAR) and a topic on testnet; operator had 960 HBAR.

**Doesn't work yet**
- Join (step 4), orders (step 5), leaderboard rows (step 6), settlement (step 7). Flash fill still unverified live (deferred to step 5).

**Next:** step 4 on command. Needs Privy app id + secret (set), World app id + RP id + signing key (set), and the booth's answer on IDKit mock mode.

## Fri 6 Nov 2026, 15:10 IST — Step 2 live: Arkiv and Hedera smokes PASS; Flash fill deferred to step 5

**Works (live, testnet)**
- `pnpm smoke:arkiv` PASS on Rabdi. Writer `0xE5B3DB4a3D4F88C21CF85492222c8B4dDcdc1e87`.
  - create `trenches.trench` entity: https://rabdi.explorer.arkiv.network/tx/0x70b04fad99f6af2113c1287b60c821b3e348926fb38d80b5663e645b49811d87
  - query by trenchId and by slug: ok
  - `patchEntity` status draft → funded (update in place): https://rabdi.explorer.arkiv.network/tx/0x8574b3d3f826a24b4de64f9f7049cc2d3ae755bf017e426c9905ccef92583faf
  - discovery query (status in funded/live, asset WETH) returned it
  - entity: https://rabdi.explorer.arkiv.network/entity/0x95277f9af5d962e24418a2bc789cf8b8d49c86da108b0c000cb1823cb23d8ac0
- `pnpm smoke:hedera` PASS on testnet, **including the HIP-423 long-term Scheduled Transaction**. Operator `0.0.11330265`.
  - demo prize token TRENCH-USDC `0.0.11337181` (now in `.env`): https://hashscan.io/testnet/token/0.0.11337181
  - admin fee-share account `0.0.11337182` (now in `.env`, key kept in `.env` too): https://hashscan.io/testnet/account/0.0.11337182
  - escrow account `0.0.11337183` (unlimited auto-association): https://hashscan.io/testnet/account/0.0.11337183
  - HCS topic `0.0.11337184`, message seq 1 (`trench.created` envelope): https://hashscan.io/testnet/topic/0.0.11337184
  - fund escrow 1.000000: https://hashscan.io/testnet/transaction/0.0.11330265-1793957724-380422235
  - payout 0.600000 from escrow, signed by the escrow key: https://hashscan.io/testnet/transaction/0.0.11330265-1793957727-888524131
  - Scheduled Transaction `0.0.11337186` (0.400000 escrow → admin, `waitForExpiry=true`, expires 2026-11-06T09:38:34Z): https://hashscan.io/testnet/schedule/0.0.11337186
  - Mirror Node reconciled: escrow balance 400000, 1 topic message, payout SUCCESS.
  - An earlier identical run also passed (token `0.0.11337130`, schedule `0.0.11337136`); those ids are unused.
- `scripts/hedera-smoke.ts` now creates the admin account when `ADMIN_HEDERA_ACCOUNT_ID` is blank, routes the scheduled fee share to it, and closes the SDK client so the process exits.

**Decisions made**
- **No funded demo trader wallet.** Builder chose not to fund a throwaway Base wallet, so `scripts/flash-smoke.ts` stays unrun (it exits 2 "NEEDS ENV"). The Flash gate proof moves to step 5: the first fill goes through the real UI with the builder's own Privy wallet. Read-only Flash validation (search + market/TWAP/bracket quotes with the public dev key) already passed, so the request shapes are right; the untested part is sign → submit → fill. `DEMO_TRADER_B_KEY` is likewise unused until step 9.
- Demo prize token is our own TRENCH-USDC (`0.0.11337181`), not Circle's testnet USDC, so we can mint freely for demo pools. Switch by changing `HEDERA_PRIZE_TOKEN_ID`.

**Doesn't work yet**
- Flash order submission is unverified live (see above).

**Next:** step 3 on command (`DATABASE_URL` is set).

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
