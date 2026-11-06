# Trenches — Build Roadmap

Ten steps. Each step is built only when the builder says "go step N" (or "go steps N and M, then stop" to batch while away). Each step ends with a runnable app and green tests for what it touches. Every commit is pushed to `main` immediately, not only at the end of a step. Nothing from a later step is started early.

Timeline anchor: build started Thu 5 Nov 2026, 13:00 IST. Flash gate is Thu 17:00 IST (decided in step 2). Submission is Fri evening; judging is Sat.

Spec documents (PRD, TECH_SPEC, DESIGN_SYSTEM, ACCEPTANCE_TESTS, DECISIONS, COPY) stay outside the repo at `../docs/trenches-docs/`. Everything the repo needs to explain itself goes in `README.md`, `docs/`, and `arkiv/`.

Repo layout (pnpm workspace, one repo):

```
apps/web          Next.js 15 app: UI + /api route handlers
apps/worker       Node process: pollers, scoring, settlement
packages/core     Domain types, scoring, prize + fee math (pure, unit-tested)
packages/arkiv    Arkiv client wrapper + entity schemas
packages/hedera   Hedera wrappers: escrow, HTS, HCS, scheduled tx, mirror
packages/flash    Definitive Flash client
packages/worldid  IDKit config + server verifier
scripts/          smoke, e2e-demo, verify
arkiv/            five sponsor files
docs/             integrations/, judging.md, worldid-debrief.md
```

---

## Step 1 — Foundation and domain core
**Goal:** the repo runs, the design system exists in code, and the maths is proven before any network call.

Deliverables
- pnpm workspace, TypeScript strict, ESLint + Prettier, Vitest, `.env.example`, MIT licence.
- `packages/core`: all domain types from TECH_SPEC §3.1; `scoring.ts` (average-cost P&L, ROI, win rate, deterministic ranking with tie-breaks); `prize.ts` (split in 6 dp base units, remainder to rank 1); `fees.ts` (platform/admin split by bps); ids and slugs. Unit tests on fixtures: single round-trip profit, loss with fee, open position marked, partial fills, ties by volume, empty entrant.
- `apps/web`: Next.js 15 App Router, Tailwind mapped to the design tokens, Archivo + JetBrains Mono, `font-scoreboard` utility, dark theme, app shell (nav, footer), landing page with copy from COPY.md, status pill + button + explorer-link components.
- `docs/integrations/{flash,arkiv,hedera,world}.md`: exact external shapes gathered from the official docs, with URLs.
- `PROGRESS.md`, `BLOCKERS.md`, `docs/judging.md` skeleton.

Done when: `pnpm test` green, `pnpm dev` renders the landing page at 390 px and 1280 px without design tells, pushed.
Needs from the builder: nothing.

## Step 2 — Rails proof (smoke scripts, the Flash gate)
**Goal:** one real transaction on each rail before any feature is built.

Order inside the step: Flash client and `flash-smoke.ts` first, then Arkiv, then Hedera, then World. The gate is Flash; the other two can slip past 17:00 without consequence.

Deliverables
- `packages/flash`: quote, place order, get order, zod schemas from the docs; platform fee attached.
- `packages/arkiv`: client, create/query/update/delete entity helpers, expiry conversion.
- `packages/hedera`: client, create account, create token (if no testnet USDC), associate, transfer, create topic, submit message, mirror-node reads, HashScan links.
- `packages/worldid`: server verifier against the documented verify endpoint, `WORLD_MOCK` gate.
- `scripts/flash-smoke.ts` (quote + tiny market order on Base → tx hash), `scripts/arkiv-smoke.ts` (create one `trench` entity, query it back), `scripts/hedera-smoke.ts` (account, topic, message, token transfer).
- Every smoke script prints PASS/FAIL and explorer links.

Done when: all three scripts PASS with real explorer links logged in `PROGRESS.md`. If Flash has not landed by Thu 17:00 IST, apply the Uniswap fallback from DECISIONS.md and record it.

Outcome (Fri 6 Nov): Arkiv and Hedera PASS live. Builder chose not to fund a demo trader wallet, so the Flash fill proof moves to step 5 (first order through the real UI with the builder's own wallet).
Needs from the builder: `.env` with Flash, Arkiv, Hedera keys; funded demo trader wallet on Base; Hedera operator with HBAR.

## Step 3 — Create and fund a Trench (F1)
**Goal:** a host creates a Trench and it exists publicly on Arkiv with money on Hedera.

Deliverables
- Postgres via Drizzle: trenches, entries, orders, fills, leaderboard, payouts, world_verifications, jobs, fee_ledger, escrow_keys (AES-256-GCM encrypted).
- `POST /api/trenches`: validate, write `trench` entity to Arkiv, create Hedera escrow account + HCS topic, `trench.created` HCS message.
- `POST /api/trenches/[id]/fund`: treasury funds escrow on the host's confirmation, status → `funded`, `trench.funded` HCS message.
- `/create` wizard (one long form, prize split with live sum, field-level errors), funding screen with escrow id + HashScan link.
- `/t/[slug]` page header rendered from the Arkiv entity: countdown, pool, assets, status pill, escrow line with HashScan + topic links.
- Worker job `activateTrenches`: `funded → live` at `startAt`, `live → ended` at `endAt`.

Done when: F1.1–F1.4 acceptance tests pass; the Trench page and a basic `/trenches` list read from Arkiv.
Needs from the builder: `DATABASE_URL` (Neon or local Docker).

Outcome (Fri 6 Nov): done. `pnpm smoke:f1` and `pnpm e2e` (F1.1–F1.4, mobile + desktop) pass against Neon + testnets. Host address is typed in until Privy lands in step 4.

## Step 4 — Join with World ID (F2)
**Goal:** one human, one slot, verified on the server.

Deliverables
- Privy login (email + external wallet, embedded wallets on, Base default); server-side session check on mutating routes.
- IDKit widget on the Trench page: Proof of Human, action `join-trench`, `signal = trenchId`.
- `POST /api/trenches/[id]/join`: verify with World, store `sha256(nullifier + TRENCH_SALT)`, 409 on duplicate, 401 on invalid, write `entry` + `profile` entities to Arkiv.
- Four paths in the UI: success, cancel (inline muted message), invalid (401 error copy), duplicate (409 copy). Join disabled with reason when draft/ended/settled.
- Entrant appears on the leaderboard at $0.00 with the human badge.

Done when: F2.1–F2.5 pass, including Playwright specs for all four paths in mocked mode.
Needs from the builder: Privy app id + secret, World app id, action created, mock-mode instructions from the booth.

Outcome (Sat 7 Nov, 03:10): done. F2.1–F2.5 green in `e2e/f2-join.spec.ts` (mobile); Privy login live; proofs mocked behind a server-signed nonce (no booth answer, no documented IDKit mock mode).

## Step 5 — Trade through Flash (F3, Market + DCA)
**Goal:** real fills from the trader's own wallet, fee attached, visible in the app.

Deliverables
- `POST /api/trenches/[id]/orders`: window + asset + entered checks, Flash quote → order with platform fee; client signs with Privy; errors from Flash shown verbatim.
- Order ticket: segmented type control (Market, DCA active; Bracket, Limit, TWAP wired but disabled until steps 7–8), asset select limited to allowed assets, amount with USDC suffix, quote line, sticky on mobile.
- Worker `pollOrders` every 15 s with backoff: ingest fills with tx hashes, write `fee_ledger` rows by `adminFeeShareBps`.
- Orders and fills list with Base explorer links.

Done when: F3.1, F3.3–F3.5 pass and a DCA with 3 legs ingests fills as they land.
Needs from the builder: nothing new beyond step 2.

## Step 6 — Live leaderboard on Arkiv (F4)
**Goal:** the loudest thing on the page, backed by a public query.

Deliverables
- Worker `recomputeLeaderboards` every 30 s for live Trenches: scoring from fills with mark prices from Flash quotes, write `lb` entities (rewrite strategy per Arkiv docs), HCS `leaderboard.snapshot` every 5 min and on rank change.
- Leaderboard table on `/t/[slug]` read from an Arkiv query in a server component, polled every 15 s; scoreboard figures, P&L coloured by sign, rank-change highlight, "You" row, polite live region, load stagger, reduced-motion respected.
- `GET /api/trenches/[id]/leaderboard` public.

Done when: F4.1–F4.5 pass; a logged-out browser shows the ranking from Arkiv within 30 s of a fill.
Needs from the builder: nothing.

## Step 7 — Settlement and payout on Hedera (F5) + Bracket orders
**Goal:** the prize pool pays itself out and the record is tamper-evident.

Deliverables
- Worker `settleTrenches` every 60 s: final ranking → HCS `leaderboard.final` → TransferTransaction from escrow to winners per `prizeSplit` (remainder to rank 1) → `payoutTxId` → HCS `trench.paid` → `payout` entities on Arkiv → status `settled`.
- Scheduled Transaction for the admin fee share (mechanism as the Hedera docs allow; documented truthfully).
- Mirror Node: escrow balance before/after, payout status on the Trench page; HashScan links for every tx, the topic, and the schedule.
- `POST /api/dev/fast-forward` behind `DEMO_MODE=true` + `DEMO_SECRET`.
- Bracket order type (entry + stop loss + take profit) through the same ticket.
- Trench page "Settled · paid HH:MM" state with per-winner payout links.

Done when: F5.1–F5.4 pass; `grep -r "pragma solidity"` is empty.
Needs from the builder: `DEMO_WINNER_ACCOUNTS` map and an admin Hedera account associated with the prize token.

## Step 8 — Dashboard, profile, discovery, sponsor (F6–F9) + Limit, TWAP, share card
**Goal:** all nine features present.

Deliverables
- `/dashboard`: host's Trenches with status, entrants, volume, fees earned, HCS link; Share sheet (copy link, "Post to X" composer with top 3).
- `/u/[address]`: profile from Arkiv `profile` + `lb` entities, human badge, past results table, empty state.
- `/trenches`: discovery from Arkiv query, filter chips (status, asset), sorted by pool, countdowns.
- `/sponsor/[slug]`: sponsor funds a draft Trench, proposes an asset, admin accept/keep; `sponsorship` entity; sponsor name/logo on Trench page.
- Limit and TWAP order types enabled in the ticket.
- `/t/[slug]/share` OG image (1200×630) with `@vercel/og`.

Done when: F6–F9 acceptance tests pass.
Needs from the builder: nothing.

## Step 9 — Verification, hardening, deploy
**Goal:** a judge can run it and so can we, from a phone.

Deliverables
- Playwright specs per feature (F1–F9) against `DEMO_MODE=true`.
- `scripts/e2e-demo.ts`: create Trench, join two traders (mock proofs), two orders, fast-forward, settle, print every explorer link.
- `scripts/verify.ts` = unit + smoke + e2e + Solidity grep + `docs/judging.md` status; `pnpm verify` green.
- `docs/judging.md`: requirement → file:line → link, per sponsor, complete.
- Screenshots at 390 px and 1280 px for every page, reviewed against DESIGN_SYSTEM; fix tells.
- Deploy web to Vercel and worker + Postgres to Railway; live URL checked on a phone.

Done when: `pnpm verify` green locally and against the deployed URL.
Needs from the builder: Vercel and Railway projects with env set. Point `jointrenches.xyz` at Vercel **today** (even to a placeholder) so DNS propagation is not a Friday-evening surprise.

## Step 10 — Paperwork, video, submission
**Goal:** every sponsor checklist line is satisfied and findable in under five minutes.

Deliverables
- `arkiv/schema.md`, `friction.md`, `reach.md`, `why-arkiv.md`, `how-you-use-arkiv.md` with real queries, numbers, links.
- `docs/worldid-debrief.md` with time to first success, friction, missing docs, one improvement.
- `README.md`: what it does, demo links, Mermaid architecture, judges' map per sponsor, writer wallet + runnable Arkiv query, Hedera tx IDs + HCS topic with HashScan links, World trust-moment + "proofs mocked" statement, setup, security and trust assumptions, how AI was used, what's next (Zolt, once), MIT.
- Demo script (≤ 3 min) as a shot list; post text for X (@DefinitiveFi) and the Definitive Discord.
- Final `PROGRESS.md` entry "Ready to submit" with every link the ETHGlobal form needs.

Done when: the submission checklist in PRD §9 is fully ticked.
Needs from the builder: confirm the ETHGlobal submission deadline at the venue today. If it closes before Fri 20:00 IST, steps 9–10 move forward and step 8 is shortened: Limit/TWAP and the sponsor flow are the first cuts. Then record the video, post it, fill the ETHGlobal showcase with three partner picks.

---

## Suggested pacing

The builder is away at workshops (Hedera 15:30, World 17:30, evening side event). Batch steps before leaving: "go step 2" at ~15:15; "go steps 3 and 4, then stop" at ~17:30; "go steps 5 and 6, then stop" before the evening event.

| When (IST) | Steps |
|---|---|
| Thu 13:00–15:00 | 1 |
| Thu 15:00–17:00 | 2 (Flash gate at 17:00) |
| Thu 17:00–21:00 | 3, 4 |
| Thu 21:00–01:00 | 5, 6 |
| Fri 07:00–12:00 | 7 |
| Fri 12:00–16:00 | 8 |
| Fri 16:00–18:00 | 9 |
| Fri 18:00–20:00 | 10 |
