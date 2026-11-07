# Trenches

**Trading competitions your community can't fake.** Traders group into **Trenches**; a host opens a **battle** with a prize pool escrowed on Hedera. Entrants verify once with World ID, trade from their own wallet through Definitive Flash, and the leaderboard, written to Arkiv, settles it. At the deadline the escrow pays the winners on its own. Trenches compete on a monthly ladder from their members' results.

Built solo at ETHGlobal Mumbai, 5–7 Nov 2026. Live: **https://jointrenches.xyz** · Repo: https://github.com/topji/trenches · MIT.

## What a judge can verify in five minutes

| Sponsor | Requirement | Where | Proof |
|---|---|---|---|
| Definitive Flash | Market, DCA (TWAP), Bracket, Limit, TWAP orders with `flashIntegratorFeeBps=30` | `packages/flash/src/orders.ts`, `packages/services/src/orders.ts`, ticket `apps/web/components/trench/order-ticket.tsx` | Fills on Base from the builder's wallet: [market buy](https://basescan.org/tx/0x9a1708462e0b7f29ee4b730e4233c1db05494f3c5529982ffcdce75009a0a7b2), [market sell](https://basescan.org/tx/0x90b526ebf80b87cd1bdd2ecc7785b1940d25be45e9e0fbf39bb7d648f454fbd8), DCA legs [1](https://basescan.org/tx/0x2da38a2c625e02b8d73a7a915b67621f96d36f6471d23748a90a8db2f2ee5f66) [2](https://basescan.org/tx/0xb713b147b753ddeb2a6862049e1d34dea74eab407208b5217bb05ca13b59b630) [3](https://basescan.org/tx/0xa19d575d069660a4eba83d6417201d6f2061172dc8f1b07f7c8ca56e8a5d44e9) |
| Arkiv | Writes via `@arkiv-network/sdk` 1.0 to Rabdi; leaderboard, discovery, profile, Trench ladder read from Arkiv queries | `packages/arkiv/src/repo.ts`; pages under `apps/web/app/{battles,t,u,trenches}` | Trench [entity](https://rabdi.explorer.arkiv.network/entity/0x2cc8f30c2654069c1a45197e37163bd9b67fd17af4fe0a4b54168747ec0f72d7), `lb` [entity](https://rabdi.explorer.arkiv.network/entity/0x0435dde4e4516a309c7f7c10714e106d55d1bc058d880aaa66ffff5a0afbd7d4), entry [entity](https://rabdi.explorer.arkiv.network/entity/0x5baa662724a84121df1672e1d872e4606437943e652a568ac51f21de55342d53), payouts [batch tx](https://rabdi.explorer.arkiv.network/tx/0xe36931913e6f3f814aa4cb6d50fde7d99899e291c9ac2b0471cc240c1163aaa3). Docs: [`arkiv/`](arkiv/) |
| World ID | IDKit 4 in a working flow, Proof of Human verified server-side; success, cancel, invalid, duplicate paths | `apps/web/components/trench/join-panel.tsx`, `packages/worldid/src/verify.ts`, `e2e/f2-join.spec.ts` | [`docs/worldid-debrief.md`](docs/worldid-debrief.md). **Proofs are mocked during the hackathon** (see below) |
| Hedera (no Solidity) | HTS escrow + payout, HCS audit log, HIP-423 Scheduled Transaction, Mirror Node; zero `.sol` | `packages/hedera/src/*`, `packages/services/src/{trenches,settlement}.ts` | Escrow [0.0.11346340](https://hashscan.io/testnet/account/0.0.11346340), topic [0.0.11346342](https://hashscan.io/testnet/topic/0.0.11346342), funding [tx](https://hashscan.io/testnet/transaction/0.0.11330265-1793974478-382116623), payout [tx](https://hashscan.io/testnet/transaction/0.0.11330265-1794009690-444552754), fee-share schedule [0.0.11347292](https://hashscan.io/testnet/schedule/0.0.11347292) (executed by the network at expiry). `pnpm verify` greps for Solidity |

Full requirement → proof table: [`docs/judging.md`](docs/judging.md). Build log with every link and decision: [`PROGRESS.md`](PROGRESS.md).

## How it works

```mermaid
flowchart LR
  subgraph Client[Next.js 15 client]
    UI[Scoreboard UI]
    IDKit[World IDKit 4]
    Privy[Privy wallet]
  end
  subgraph Server[Next.js route handlers + worker]
    API[/api/*]
    W[Worker: pollOrders · recomputeLeaderboards · settleTrenches · recomputeClanScores]
    PG[(Postgres mirror, Neon)]
  end
  Flash[Definitive Flash]
  Arkiv[(Arkiv Rabdi: trench · entry · lb · payout · profile · clan · clan_score)]
  Hedera[(Hedera testnet: HTS · HCS · Scheduled Tx · Mirror)]
  World[World Developer Portal /api/v4/verify]
  UI --> API
  IDKit --> API --> World
  Privy -- EIP-712 signature --> API --> Flash
  API --> Arkiv
  API --> Hedera
  W --> Flash
  W --> Arkiv
  W --> Hedera
  W --> PG
  API --> PG
  UI -. public reads .-> Arkiv
```

- **Arkiv is the public source of truth.** Battle (`trench` entity), entry, leaderboard row, payout, profile, sponsorship, Trench (`clan`), member and season score are entities on Rabdi. The battle page, discovery, profile and Trench ladder read Arkiv queries in server components; Postgres only mirrors them for joins and holds what Arkiv must not (escrow keys, nullifier hashes, fee ledger).
- **Hedera holds the money and the audit log.** One escrow account and one HCS topic per battle. Every state change (`trench.created`, `trench.funded`, `trench.live`, `entry.joined`, `leaderboard.snapshot`, `leaderboard.final`, `trench.paid`, `fee_share.scheduled`) is an HCS message you can read on HashScan. Payout is one HTS transfer from the escrow signed with the Trench's own key. The host's fee share is a HIP-423 long-term Scheduled Transaction that the network executes on its own three minutes after settlement.
- **Flash owns execution.** The server builds the quote with the platform fee; the trader signs Flash's EIP-712 payload in their Privy wallet; the server forwards the signature. No trader key ever touches the server.
- **World ID gates entry.** One Proof of Human per battle, verified server-side, nullifier stored as a salted hash with a unique index.

## Trenches and battles

A **Trench** is a group with one leader and up to 50 traders; a **battle** is a competition. Battles are either **Trench battles** (members only, created by the leader) or **world battles** (any verified human). Traders join and leave Trenches freely; a trader's fills and podiums count for the Trench they were in at the time (membership windows in `clan_memberships`). Each season (calendar month) a Trench's score is Σ over members of clamp(season ROI, −50 %, +50 %) + 20 × podium finishes; the cap stops one whale carrying a Trench. Traders carry a handle, XP and a title (Recruit → Grunt → Veteran → Captain → Warlord) shown as `[TAG] handle · title` on every board. Pages: `/trenches` (ladder), `/trench/[tag]`, `/create-trench`, `/battles` (discovery), `/t/[slug]` (battle). Maths in `packages/core/src/clans.ts` (unit-tested), scoring in `packages/services/src/clan-scores.ts`; code identifiers keep the `clan*` names, the UI says Trench. Entities `trenches.clan`, `trenches.clan_member`, `trenches.clan_score` on Arkiv.

## World ID: the trust moment

The one thing a fake identity buys is a second leaderboard slot, so the gated event is **joining a battle**. Proof of Human is the minimum sufficient credential: it is the only World ID credential with sybil resistance, and we need nothing about who the person is. Passport or Selfie Check would add friction without closing the hole.

**Proofs are mocked during the hackathon.** There was no phone with World App at the booth and no documented IDKit mock mode, so `WORLD_MOCK=true` skips only the Developer Portal call. The result must still carry a nonce this server signed in the last 300 s, the right action, environment and signal hash, so an unsolicited payload is rejected (covered by `e2e/f2-join.spec.ts`). With `WORLD_MOCK=false` the same code path opens the real `IDKitRequestWidget` and calls `POST /api/v4/verify/{rp_id}`. Debrief: [`docs/worldid-debrief.md`](docs/worldid-debrief.md).

## Arkiv: writer wallet and a runnable query

Writer wallet (owner of every entity): `0xE5B3DB4a3D4F88C21CF85492222c8B4dDcdc1e87` ([explorer](https://rabdi.explorer.arkiv.network/address/0xE5B3DB4a3D4F88C21CF85492222c8B4dDcdc1e87)).

```ts
import { createPublicClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { http } from "viem";
import { eq, or, asc } from "@arkiv-network/sdk/query";
import { TrenchSchema, LeaderboardSchema } from "@trenches/arkiv"; // packages/arkiv/src/schemas.ts

const pub = createPublicClient({ chain: rabdi({ accessKey: "" }), transport: http() });
const writer = "0xE5B3DB4a3D4F88C21CF85492222c8B4dDcdc1e87";

// Discovery: funded or live Trenches
const live = await pub.select().from(TrenchSchema).where(or(eq("status", "funded"), eq("status", "live"))).ownedBy(writer).limit(50).fetch();

// Leaderboard of one Trench, by rank
const board = await pub.select().from(LeaderboardSchema).where(eq("trenchId", live.entities[0].trenchId.value)).ownedBy(writer).orderBy(asc("rank")).fetch();
```

Schemas, queries, friction and the reach note: [`arkiv/schema.md`](arkiv/schema.md), [`arkiv/how-you-use-arkiv.md`](arkiv/how-you-use-arkiv.md), [`arkiv/why-arkiv.md`](arkiv/why-arkiv.md), [`arkiv/friction.md`](arkiv/friction.md), [`arkiv/reach.md`](arkiv/reach.md).

## Hedera ids

| What | Id |
|---|---|
| Operator / treasury | [0.0.11330265](https://hashscan.io/testnet/account/0.0.11330265) |
| Prize token TRENCH-USDC (6 dp) | [0.0.11337181](https://hashscan.io/testnet/token/0.0.11337181) |
| Host fee-share account | [0.0.11337182](https://hashscan.io/testnet/account/0.0.11337182) |
| Flash gate Trench: escrow / topic / funding / payout / schedule | [0.0.11346340](https://hashscan.io/testnet/account/0.0.11346340) · [0.0.11346342](https://hashscan.io/testnet/topic/0.0.11346342) · [funding](https://hashscan.io/testnet/transaction/0.0.11330265-1793974478-382116623) · [payout](https://hashscan.io/testnet/transaction/0.0.11330265-1794009690-444552754) · [0.0.11347292](https://hashscan.io/testnet/schedule/0.0.11347292) |

## Run it

```bash
pnpm install
cp .env.example .env            # fill in: Neon DATABASE_URL, Flash key, Arkiv writer + access key, Hedera operator, Privy, World
pnpm db:migrate
pnpm smoke:hedera               # creates the demo prize token + admin account once, prints ids for .env
pnpm dev                        # web on :3000
pnpm dev:worker                 # pollers, scoring, settlement
pnpm test · pnpm e2e · pnpm verify · pnpm demo
```

Deploy: web on Vercel (root `apps/web`, env from `.env.example`), worker anywhere that runs a container (`Dockerfile.worker`, `railway.json`).

## Security and trust assumptions

- Trader funds never leave the trader's wallet except through Flash orders they sign. Approvals go to Flash's settlement contract.
- Escrow keys are generated per battle and held AES-256-GCM-encrypted by the backend for the hackathon; production would use Hedera's native multi-sig with the host and the platform as signers.
- Winner payout accounts are created by the platform when the trader has none (demo); production collects a Hedera account at join.
- World ID proofs are verified server-side; nullifiers are stored salted; proofs are mocked during the event as described above.
- `DEMO_MODE=true` exposes `/api/dev/*` (fast-forward, tick) behind `DEMO_SECRET`; off in production.
- No analytics, no trackers.

## How AI was used

Claude Code built the repository end to end from the product, technical and design documents, under step-gated instructions from the builder: it fetched the sponsor docs before each integration (`docs/integrations/*.md`), wrote the code and tests, ran them against the live testnets, and logged every decision and link in `PROGRESS.md`. The builder set the scope, supplied keys and a funded wallet, placed the live Flash orders in the browser, and reviewed each step.

## What's next

Trenches is a focused experiment by the Zolt team; if it validates it becomes a tab inside the Zolt app, with execution moving to Zolt's own rails and Flash staying for uncovered assets. Trench treasuries, Trench-vs-Trench challenges and season archives are the next three features.

MIT.
