# Judging map — requirement → proof

Filled in as each step lands. Every row needs a file:line and, where applicable, an on-chain link.

## Definitive Flash
| Requirement | Proof | Status |
|---|---|---|
| Market, DCA (TWAP) and Bracket orders through Flash with `flashIntegratorFeeBps` | `packages/flash/src/orders.ts` `buildQuoteRequest` (fee on every quote); `packages/services/src/orders.ts` `quoteOrder`/`submitOrder`; ticket `apps/web/components/trench/order-ticket.tsx`; live quotes with fee in `e2e/f3-orders.spec.ts` | Market + DCA live-filled; Bracket wired + live-quoted (`attachedBracket`), `e2e/f3-orders.spec.ts` |
| On-chain fills (Base tx hashes) | market buy [0x9a17…a7b2](https://basescan.org/tx/0x9a1708462e0b7f29ee4b730e4233c1db05494f3c5529982ffcdce75009a0a7b2); market sell [0x90b5…fbd8](https://basescan.org/tx/0x90b526ebf80b87cd1bdd2ecc7785b1940d25be45e9e0fbf39bb7d648f454fbd8); DCA (TWAP, 3 legs) [0x2da3…5f66](https://basescan.org/tx/0x2da38a2c625e02b8d73a7a915b67621f96d36f6471d23748a90a8db2f2ee5f66), [0xb713…b630](https://basescan.org/tx/0xb713b147b753ddeb2a6862049e1d34dea74eab407208b5217bb05ca13b59b630), [0xa19d…44e9](https://basescan.org/tx/0xa19d575d069660a4eba83d6417201d6f2061172dc8f1b07f7c8ca56e8a5d44e9); all with `flashIntegratorFeeBps=30`, fee ledger rows per fill | ✓ live |
| Demo video posted on Discord and X tagging @DefinitiveFi | post text in `docs/submission.md`; builder posts after recording | pending (builder) |

## Arkiv
| Requirement | Proof | Status |
|---|---|---|
| Writes via `@arkiv-network/sdk` to Rabdi testnet | `packages/arkiv/src/repo.ts`; create tx [0x70b0…1d87](https://rabdi.explorer.arkiv.network/tx/0x70b04fad99f6af2113c1287b60c821b3e348926fb38d80b5663e645b49811d87), patch tx [0x8574…3faf](https://rabdi.explorer.arkiv.network/tx/0x8574b3d3f826a24b4de64f9f7049cc2d3ae755bf017e426c9905ccef92583faf), [entity](https://rabdi.explorer.arkiv.network/entity/0x95277f9af5d962e24418a2bc789cf8b8d49c86da108b0c000cb1823cb23d8ac0) | ✓ live |
| Leaderboard, discovery and profile pages read from Arkiv queries | leaderboard: `apps/web/app/api/trenches/[id]/leaderboard/route.ts` + `packages/arkiv/src/repo.ts` `getLeaderboard` (`trenches.lb` where trenchId, order by rank), live row [0x0435…d7d4](https://rabdi.explorer.arkiv.network/entity/0x0435dde4e4516a309c7f7c10714e106d55d1bc058d880aaa66ffff5a0afbd7d4); discovery: `apps/web/app/trenches/page.tsx`; Trench page: `apps/web/app/t/[slug]/page.tsx`; profile in step 8 | ✓ (profile pending) |
| README: writer wallet + one runnable query | README "Arkiv: writer wallet and a runnable query" | ✓ |
| `arkiv/schema.md`, `friction.md`, `reach.md`, `why-arkiv.md`, `how-you-use-arkiv.md` | written | ✓ |
| MIT licence; "How AI was used" | `LICENSE`; README "How AI was used" | ✓ |

## World ID
| Requirement | Proof | Status |
|---|---|---|
| IDKit in a functioning flow; Proof of Human verified server-side | widget: `apps/web/components/trench/join-panel.tsx` (`IDKitRequestWidget`, `proofOfHuman`); server: `packages/worldid/src/verify.ts` + `packages/services/src/join.ts` (`POST /api/trenches/[id]/join`); entry entity [0x5baa…2d53](https://rabdi.explorer.arkiv.network/entity/0x5baa662724a84121df1672e1d872e4606437943e652a568ac51f21de55342d53), `entry.joined` [HCS tx](https://hashscan.io/testnet/transaction/0.0.11330265-1793999918-164082358) | ✓ (mocked proofs, see README) |
| README: trust moment and minimum sufficient credential | README "World ID: the trust moment" | ✓ |
| Success + cancel + invalid + duplicate paths | `e2e/f2-join.spec.ts` F2.1–F2.4 green (mobile), screenshots in `test-results/` | ✓ |
| `docs/worldid-debrief.md` | written (time to first success, friction, missing docs, one improvement) | ✓ draft |
| README states proofs are mocked during the hackathon | README "World ID: the trust moment" (bold) | ✓ |

## Hedera (No Solidity)
| Requirement | Proof | Status |
|---|---|---|
| Zero Solidity (grep in `pnpm verify`) | `e2e/f5-settlement.spec.ts` F5.4 greps the repo; `pnpm verify` in step 9 | ✓ |
| HTS + HCS + Scheduled Transactions + Mirror Node used | `packages/hedera/src/tokens.ts`, `topics.ts`, `schedules.ts`, `mirror.ts`; [token 0.0.11337181](https://hashscan.io/testnet/token/0.0.11337181), [topic 0.0.11337184](https://hashscan.io/testnet/topic/0.0.11337184), [fund tx](https://hashscan.io/testnet/transaction/0.0.11330265-1793957724-380422235), [payout tx](https://hashscan.io/testnet/transaction/0.0.11330265-1793957727-888524131), [schedule 0.0.11337186](https://hashscan.io/testnet/schedule/0.0.11337186); HCS in-app: `trench.*`, `entry.joined`, `leaderboard.snapshot` on [topic 0.0.11346342](https://hashscan.io/testnet/topic/0.0.11346342) | ✓ live |
| README: funding tx, payout tx, HCS topic with HashScan links | funding tx [0.0.11330265-1793974478-382116623](https://hashscan.io/testnet/transaction/0.0.11330265-1793974478-382116623), payout tx [0.0.11330265-1794009690-444552754](https://hashscan.io/testnet/transaction/0.0.11330265-1794009690-444552754), topic [0.0.11346342](https://hashscan.io/testnet/topic/0.0.11346342), fee-share schedule [0.0.11347292](https://hashscan.io/testnet/schedule/0.0.11347292); README "Hedera ids" | ✓ |
| Demo video ≤ 5 min covers escrow funding and payout | shot list in `docs/submission.md` | pending (builder) |

## ETHGlobal
| Requirement | Proof | Status |
|---|---|---|
| Public repo, steady commits | github.com/topji/trenches | in progress |
| Live demo link, showcase, three partner picks | showcase text + picks in `docs/submission.md`; deploy steps in `docs/deploy.md` | pending (accounts) |
