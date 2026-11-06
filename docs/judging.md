# Judging map — requirement → proof

Filled in as each step lands. Every row needs a file:line and, where applicable, an on-chain link.

## Definitive Flash
| Requirement | Proof | Status |
|---|---|---|
| Market, DCA (TWAP) and Bracket orders through Flash with `flashIntegratorFeeBps` | `packages/flash/src/orders.ts` `buildQuoteRequest` (fee on every quote); `packages/services/src/orders.ts` `quoteOrder`/`submitOrder`; ticket `apps/web/components/trench/order-ticket.tsx`; live quotes with fee in `e2e/f3-orders.spec.ts` | Market + DCA wired, live fill pending builder wallet; Bracket step 7 |
| On-chain fills (Base tx hashes) | step 5 | pending |
| Demo video posted on Discord and X tagging @DefinitiveFi | step 10 | pending |

## Arkiv
| Requirement | Proof | Status |
|---|---|---|
| Writes via `@arkiv-network/sdk` to Rabdi testnet | `packages/arkiv/src/repo.ts`; create tx [0x70b0…1d87](https://rabdi.explorer.arkiv.network/tx/0x70b04fad99f6af2113c1287b60c821b3e348926fb38d80b5663e645b49811d87), patch tx [0x8574…3faf](https://rabdi.explorer.arkiv.network/tx/0x8574b3d3f826a24b4de64f9f7049cc2d3ae755bf017e426c9905ccef92583faf), [entity](https://rabdi.explorer.arkiv.network/entity/0x95277f9af5d962e24418a2bc789cf8b8d49c86da108b0c000cb1823cb23d8ac0) | ✓ live |
| Leaderboard, discovery and profile pages read from Arkiv queries | discovery: `apps/web/app/trenches/page.tsx` (`listTrenches` → `trenches.trench` where status in funded/live); Trench page: `apps/web/app/t/[slug]/page.tsx` (`getTrenchBySlug`); leaderboard/profile in step 6 / 8 | partial |
| README: writer wallet + one runnable query | step 10 | pending |
| `arkiv/schema.md`, `friction.md`, `reach.md`, `why-arkiv.md`, `how-you-use-arkiv.md` | step 10 | pending |
| MIT licence; "How AI was used" | `LICENSE` ✓ / step 10 | partial |

## World ID
| Requirement | Proof | Status |
|---|---|---|
| IDKit in a functioning flow; Proof of Human verified server-side | widget: `apps/web/components/trench/join-panel.tsx` (`IDKitRequestWidget`, `proofOfHuman`); server: `packages/worldid/src/verify.ts` + `packages/services/src/join.ts` (`POST /api/trenches/[id]/join`); entry entity [0x5baa…2d53](https://rabdi.explorer.arkiv.network/entity/0x5baa662724a84121df1672e1d872e4606437943e652a568ac51f21de55342d53), `entry.joined` [HCS tx](https://hashscan.io/testnet/transaction/0.0.11330265-1793999918-164082358) | ✓ (mocked proofs, see README) |
| README: trust moment and minimum sufficient credential | text in `docs/worldid-debrief.md` §1; README in step 10 | partial |
| Success + cancel + invalid + duplicate paths | `e2e/f2-join.spec.ts` F2.1–F2.4 green (mobile), screenshots in `test-results/` | ✓ |
| `docs/worldid-debrief.md` | written (time to first success, friction, missing docs, one improvement) | ✓ draft |
| README states proofs are mocked during the hackathon | `docs/worldid-debrief.md` §3; README in step 10 | partial |

## Hedera (No Solidity)
| Requirement | Proof | Status |
|---|---|---|
| Zero Solidity (grep in `pnpm verify`) | no `.sol` files, no `pragma solidity` (checked at each step) | ✓ so far |
| HTS + HCS + Scheduled Transactions + Mirror Node used | `packages/hedera/src/tokens.ts`, `topics.ts`, `schedules.ts`, `mirror.ts`; [token 0.0.11337181](https://hashscan.io/testnet/token/0.0.11337181), [topic 0.0.11337184](https://hashscan.io/testnet/topic/0.0.11337184), [fund tx](https://hashscan.io/testnet/transaction/0.0.11330265-1793957724-380422235), [payout tx](https://hashscan.io/testnet/transaction/0.0.11330265-1793957727-888524131), [schedule 0.0.11337186](https://hashscan.io/testnet/schedule/0.0.11337186) | ✓ live |
| README: funding tx, payout tx, HCS topic with HashScan links | funding tx [0.0.11330265-1793974478-382116623](https://hashscan.io/testnet/transaction/0.0.11330265-1793974478-382116623), topic [0.0.11340201](https://hashscan.io/testnet/topic/0.0.11340201); payout in step 7; README in step 10 | partial |
| Demo video ≤ 5 min covers escrow funding and payout | step 10 | pending |

## ETHGlobal
| Requirement | Proof | Status |
|---|---|---|
| Public repo, steady commits | github.com/topji/trenches | in progress |
| Live demo link, showcase, three partner picks | step 9 / 10 | pending |
