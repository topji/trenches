# PROGRESS.md — newest first

## Sat 7 Nov 2026, 06:40 IST — Step 7 done: settlement and payout on Hedera (F5), Bracket orders

**Works (live, testnet + Base)**
- `packages/services/src/settlement.ts` `settleTrench`: claims the ended Trench (`settlement_started_at`), recomputes once, posts HCS `leaderboard.final`, splits the pool with `splitPrize` (6 dp exact, remainder and unfilled places → rank 1), resolves each winner's Hedera account, pays from the Trench's own escrow in one HTS `TransferTransaction` signed with the decrypted escrow key, posts `trench.paid`, writes `trenches.payout` entities on Arkiv, patches the Trench to `settled` with `payoutTxId` / `scheduleId`.
- Host fee share: the sum of `fee_ledger.admin_usd` is paid treasury → admin account `0.0.11337182` by a **HIP-423 Scheduled Transaction** created at settlement with `expirationTime = now + 3 min` and `waitForExpiry = true`; the network executes it on its own, recipient fixed at creation, no Solidity. HCS `fee_share.scheduled`. Amount is only known at settlement, which is why it is created then (DECISIONS.md fallback wording honoured: the mechanism actually used is stated).
- Worker `settleTrenches` every 60 s; `POST /api/dev/fast-forward` (DEMO_MODE + DEMO_SECRET) ends a Trench now and settles it immediately.
- Trench page settled state: countdown reads "Settled · paid HH:MM IST", a Payouts table (rank, trader, amount, HashScan tx per winner), escrow line adds the payout tx and the fee-share schedule links, leaderboard headed "Final results"; Mirror Node escrow balance goes 1.00 → 0.00 (F5.3).
- Bracket orders: ticket type Bracket (buy entry + stop loss + take profit, defaults ±3 % of the quote price); the quote returns the attached bracket's own typed data (`salt`, `deadline`, `signedMaxFromAmount`), the client signs both payloads, submit re-sends `attachedBracket` with its signature (docs/integrations/flash.md §3.3). Live bracket quote verified in `e2e/f3-orders.spec.ts`.
- `e2e/f5-settlement.spec.ts` green (mobile): two entrants (UI + API join), fast-forward → `ended` true, `payoutTxId`, `leaderboard.final` + `trench.paid` on HCS, payout entities tx, winners [0.70, 0.30] of a 1.00 pool (rank 1 gets 50 + the unfilled 20), escrow 1.00 → 0.00 on the Mirror Node, settled page with both payout rows. F5.4: zero `.sol` files, zero `pragma solidity`.
  - e2e payout tx: https://hashscan.io/testnet/transaction/0.0.11330265-1794009485-617069933
- **Live settlement of the Flash gate Trench** (`/t/flash-gate-trench-1syb`, real P&L from the builder's Flash fills): payout tx https://hashscan.io/testnet/transaction/0.0.11330265-1794009690-444552754 (10 TRENCH-USDC → winner account 0.0.11347290), `leaderboard.final` https://hashscan.io/testnet/transaction/0.0.11330265-1794009681-567134987, `trench.paid` https://hashscan.io/testnet/transaction/0.0.11330265-1794009692-552435577, payout entities https://rabdi.explorer.arkiv.network/tx/0xe36931913e6f3f814aa4cb6d50fde7d99899e291c9ac2b0471cc240c1163aaa3, fee-share schedule 0.0.11347292 (0.010421 TRENCH-USDC, executes 3 min after creation) https://hashscan.io/testnet/schedule/0.0.11347292. **Executed by the network on its own at expiry** (Mirror `executed_timestamp` 1794009860.04 = 2026-11-07T00:04:20Z, 3 min after creation; the step 2 smoke schedule 0.0.11337186 also executed at its expiry). Winner account https://hashscan.io/testnet/account/0.0.11347290 holds 10.000000 TRENCH-USDC (Mirror).
- The fast-forward ended the Trench but the worker's `settleTrenches` tick claimed the settlement first while the route was still patching Arkiv — the claim worked as designed (one payout, no double spend); the route reports `settlement: null` in that case.

**Decisions made**
- Winners' Hedera accounts: `DEMO_WINNER_ACCOUNTS` if present, else a stored `winner_accounts` row, else the platform creates an account per trader (0.5 ℏ, unlimited auto-association, key encrypted like escrow keys). Stated as a hackathon trust assumption; production collects a Hedera account at join.
- Every ranked entrant is eligible for a place, fills or not: "the board settles it", and a Trench nobody traded still pays per rank rather than stranding the pool.
- Settlement claims the Trench first; if anything throws before the transfer, the claim is released for the next tick; after a payout it stays claimed, so a Trench can never be paid twice.
- Ended Trenches keep recomputing until settled; settlement recomputes once more so the final board marks at ≈ endAt.

**Doesn't work yet**
- Dashboard, profile, discovery filters, sponsor flow, Limit / TWAP, OG card (step 8).

**Next:** step 8 on command.

## Sat 7 Nov 2026, 05:45 IST — Step 6 done: live leaderboard on Arkiv (F4)

**Works (live)**
- `packages/services/src/leaderboard.ts`: `recomputeLeaderboard(trenchId)` scores the Trench's fills (`computeLeaderboard`, average-cost P&L, fees subtracted, window + allowed-asset filters) with mark prices from a Flash $100 market quote cached 20 s (fallback: last fill price), mirrors rows to Postgres (upsert), rewrites the public `trenches.lb` entities in one Arkiv `executeBatch` (create/patch/delete), and posts HCS `leaderboard.snapshot` (top 20, ≤ 1 KB) on every rank change and at least every 5 min. Writes happen only when something moved (rank, P&L ≥ 1 ¢, volume, fills).
- Worker `recomputeLeaderboards` every 30 s for live and ended-but-unsettled Trenches; `pollOrders` also recomputes immediately for any Trench that just received a fill, so the board reflects a fill within one 15 s poll (F4.1).
- `GET /api/trenches/[id]/leaderboard` (public, no-store): Arkiv `lb` rows ordered by rank, merged with entrants at $0.00.
- Trench page: server-rendered from the Arkiv query, then `LiveBoard` polls the route every 15 s; moved rows get the 1.5 s accent highlight (`.rank-flash`), the caller's own move is announced in a polite live region ("You moved to rank 2."), rows stagger in once on load, reduced motion respected (globals.css). Real `<table>` with headers; win rate hides below 640 px so the board fits 390 px.
- Live result on the Flash gate Trench from the builder's five real fills: rank 1 `0xd3ad…d00c`, P&L −$0.23, ROI −7.5 %, volume $6.94, win rate 0 %. Arkiv `lb` entity https://rabdi.explorer.arkiv.network/entity/0x0435dde4e4516a309c7f7c10714e106d55d1bc058d880aaa66ffff5a0afbd7d4 · HCS snapshots on topic https://hashscan.io/testnet/topic/0.0.11346342 (e.g. https://hashscan.io/testnet/transaction/0.0.11330265-1794007692-641358893, https://hashscan.io/testnet/transaction/0.0.11330265-1794008039-715839371) · example batch writes https://rabdi.explorer.arkiv.network/tx/0x05d00993da5a60f9d92887c6f6237d717c53b2356f3b87f707ef6e2d06290631, https://rabdi.explorer.arkiv.network/tx/0x0ffd817b548c16663c451ea89c85276cf1502f0b18ce7b9e215bdc695ecf129b.
- `pnpm smoke:f4 <trenchId>` PASS (computed board == Arkiv board). `e2e/f4-leaderboard.spec.ts` green: F4.1 logged-out page + API from Arkiv with signed P&L and the human badge, no "You" tag when logged out; F4.2 scripted rank swap → both rows flash, live region reads "You moved to rank 2.", highlight clears after 1.5 s. F4.3 and F4.5 are the step 1 unit tests (window/asset exclusion, ties, fees, partial fills, empty entrant). F4.4 snapshots verified on the topic above.

**Decisions made**
- The board is written to Arkiv only on change, not every 30 s: a quiet Trench costs nothing; a moving one gets a batch per tick at most.
- Snapshot payload uses 10-char address prefixes so 20 rows stay under the 1 KB HCS envelope.
- Ended Trenches keep recomputing until settled, so step 7's `leaderboard.final` starts from a current board.
- Three worker processes had been running at once (earlier `pkill` patterns never matched tsx's command line), which produced duplicate-key errors on the Postgres mirror and paired HCS snapshots on the gate Trench (seq 5–8). The mirror is now an upsert, so a second process can never throw, and exactly one worker runs.

**Doesn't work yet**
- Settlement / payout (step 7), Bracket (step 7), dashboard/profile/discovery filters/sponsor (step 8).

**Next:** step 7 on command. Needs `DEMO_WINNER_ACCOUNTS` (set) and the admin Hedera account (set, `0.0.11337182`).

## Sat 7 Nov 2026, 05:10 IST — Step 5 done: Flash Market, Sell and DCA fills live from the builder's wallet

**Works (live quotes against Flash, Base mainnet)**
- `POST /api/trenches/[id]/orders/quote`: window (`canTrade`), entered, allowed-asset and 1 USDC minimum checks → `buildQuoteRequest` with `flashIntegratorFeeBps=30` and the trader as `funderAddress` → Flash quote stored in `quotes` (server-side source of truth for fee/asset/qty at submit). `preview: true` for the ticket's live line.
- `POST /api/trenches/[id]/orders`: loads the stored quote, forwards the trader's EIP-712 signature (`eth_signTypedData_v4` over Flash's `orderTypedData`, signed in the Privy wallet) → Flash order id → `orders` row. A Flash rejection is stored as a `failed` order with the message and returned verbatim (F3.4).
- `GET /api/trenches/[id]/orders`: own orders + fills. `GET /api/wallet/balances`: on-chain USDC / asset / ETH for the ticket.
- Worker `pollOrders` every 15 s: open orders → `GET /orders/{id}?funderAddress` → fills inserted once per (tx, order), `fee_ledger` rows split by `adminFeeShareBps` (F3.5), status from Flash, exponential backoff to 60 s on errors.
- Order ticket (`components/trench/order-ticket.tsx`): segmented type control (Market, DCA active; Bracket/Limit/TWAP disabled until steps 7–8), asset select limited to allowed assets, Buy/Sell, amount with USDC suffix, balances + Max, debounced quote line "≈ qty SYMBOL at price · fee", one button with approve → sign → submit steps. Orders list with Basescan links, polled while anything is open.
- `e2e/f3-orders.spec.ts` green (mobile, 3.2 min): F3.3 guards (403 not entered, 409 not live, 400 wrong asset, 400 below minimum, exact copy); market + DCA quotes with fee ≈ $0.009 on $3; ticket renders the quote line, Bracket disabled, DCA fields; F3.4 bad signature → Flash error stored as `failed` and shown inline.
- Live Trench for the gate: `/t/flash-gate-trench-1syb` (`01M6SEX2Q1PQD42NG4MNY4TMVR`, WETH + cbBTC, 6 h, pool 10). Builder's wallet `0xd3ad26714e5ef9583d9b441146e14a8e3913d00c` holds 5 USDC + 0.0018 ETH on Base, is joined, and has fetched valid quotes (2 USDC → 0.000886 WETH, fee 0.006).

**Flash gate passed (Sat 7 Nov, 04:22 IST) — first live fill through the UI**
- Market buy, 2 USDC → 0.000878693540802360 WETH at $2,276.11, Flash order `ffb3549f-f2ed-496e-9825-d2b27b52e5c2`, `ORDER_STATUS_FILLED` / `REASON_FULLY_FILLED`. Signed in the builder's Privy wallet (`0xd3ad…d00c`), approval + EIP-712 signature in the browser, platform fee 30 bps attached.
- Fill tx https://basescan.org/tx/0x9a1708462e0b7f29ee4b730e4233c1db05494f3c5529982ffcdce75009a0a7b2 — ingested by the worker within one 15 s tick; `fee_ledger`: integrator fee 0.006 USDC → platform 0.003 / host 0.003 (adminFeeShareBps 5000) (F3.5).
- The first attempt died in Privy's transaction modal ("Rendered fewer hooks", `isActive` prop) under React 19.3; pinning React to 19.1.1 (the version Privy's starter uses) fixed it.
- **Sell + DCA done (04:45–05:05 IST), all from the builder's wallet through the ticket:**
  - Market sell 0.00087 WETH → 1.924893 USDC at $2,212.52, Flash `0f2e48bd…`, tx https://basescan.org/tx/0x90b526ebf80b87cd1bdd2ecc7785b1940d25be45e9e0fbf39bb7d648f454fbd8.
  - A first sell attempt was rejected by Flash and stored as `failed` with the verbatim message "flash order submission failed: insufficient source asset balance: balance 0.00087869354080236 is less than required 0.000879" (F3.4 live). Cause: the ticket's Max button rounded the balance up at 6 dp; it now rounds down.
  - DCA 3 USDC, 3 legs, 60 s interval → Flash `twap` (`durationSeconds` 300, `twapBucketCount` 3), order `225730c0…`, `ORDER_STATUS_FILLED` with **3 fills ingested as they landed**: https://basescan.org/tx/0x2da38a2c625e02b8d73a7a915b67621f96d36f6471d23748a90a8db2f2ee5f66 (0.000440 WETH / 1.00 USDC), https://basescan.org/tx/0xb713b147b753ddeb2a6862049e1d34dea74eab407208b5217bb05ca13b59b630 (0.000453 / 1.05), https://basescan.org/tx/0xa19d575d069660a4eba83d6417201d6f2061172dc8f1b07f7c8ca56e8a5d44e9 (0.000411 / 0.95). Average $2,301.24. Integrator fee per leg ≈ 0.003 USDC; Flash's own fees on $1 legs are larger (0.017–0.038), which scoring subtracts.
  - Privy's embedded-wallet confirmation modal crashed again on the WETH approval ("Rendered fewer hooks"); switched to headless signing (`embeddedWallets.showWalletUIs: false`), the ticket narrates approve → sign itself. The approval had been mined before the crash (unlimited allowance to Flash's settlement contract for USDC and WETH).

**Decisions made**
- Quotes are persisted server-side and the client only returns `{ quoteId, userSignature }`; nothing about fee, asset or qty is trusted from the browser.
- The ticket's quote line is informational; the order re-quotes at click time because the signed deadline is ~5 min.
- Fee ledger: `platform_usd` + `admin_usd` = Flash `integratorFeeNotional` per fill (our 30 bps), split by `adminFeeShareBps`. Scoring (step 6) subtracts the fill's total `feeNotional`.
- Funding claims `draft → funded|live` atomically and the worker claims `funded → live` / `live → ended` with `UPDATE … RETURNING`, so the demo tick and the worker never double-process; Arkiv is patched from the claimed row with one retry (shared writer wallet, nonce clashes). Found when a Trench ended up `live` in Postgres and `funded` on Arkiv.
- Worker and web both load the root `.env` via symlinks (`apps/*/.env`, gitignored). The worker had been running without env since step 3; its jobs failed silently in the log.
- e2e asserts the Arkiv-backed status by polling (`waitForStatus`), since Arkiv lags Postgres by a few seconds.

**Doesn't work yet**
- No live fill yet (above). Leaderboard scoring (step 6), settlement (step 7), Bracket/Limit/TWAP (steps 7–8).

**Next:** step 6 on command (leaderboard scoring from these fills, `lb` entities on Arkiv, HCS snapshots).

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
