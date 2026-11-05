# Judging map — requirement → proof

Filled in as each step lands. Every row needs a file:line and, where applicable, an on-chain link.

## Definitive Flash
| Requirement | Proof | Status |
|---|---|---|
| Market, DCA (TWAP) and Bracket orders through Flash with `flashIntegratorFeeBps` | `packages/flash/src/orders.ts` buildQuoteRequest; `scripts/flash-smoke.ts` | code ready, fill pending env |
| On-chain fills (Base tx hashes) | step 5 | pending |
| Demo video posted on Discord and X tagging @DefinitiveFi | step 10 | pending |

## Arkiv
| Requirement | Proof | Status |
|---|---|---|
| Writes via `@arkiv-network/sdk` to Rabdi testnet | `packages/arkiv/src/repo.ts` (createEntity / patchEntity / executeBatch); `scripts/arkiv-smoke.ts` | code ready, tx pending env |
| Leaderboard, discovery and profile pages read from Arkiv queries | step 6 / 8 | pending |
| README: writer wallet + one runnable query | step 10 | pending |
| `arkiv/schema.md`, `friction.md`, `reach.md`, `why-arkiv.md`, `how-you-use-arkiv.md` | step 10 | pending |
| MIT licence; "How AI was used" | `LICENSE` ✓ / step 10 | partial |

## World ID
| Requirement | Proof | Status |
|---|---|---|
| IDKit in a functioning flow; Proof of Human verified server-side | server: `packages/worldid/src/verify.ts` (POST /api/v4/verify); widget in step 4 | server ready |
| README: trust moment and minimum sufficient credential | step 10 | pending |
| Success + cancel + invalid + duplicate paths | step 4 | pending |
| `docs/worldid-debrief.md` | step 10 | pending |
| README states proofs are mocked during the hackathon | step 10 | pending |

## Hedera (No Solidity)
| Requirement | Proof | Status |
|---|---|---|
| Zero Solidity (grep in `pnpm verify`) | step 9 | pending |
| HTS + HCS + Scheduled Transactions + Mirror Node used | `packages/hedera/src/tokens.ts`, `topics.ts`, `schedules.ts`, `mirror.ts`; `scripts/hedera-smoke.ts` | code ready, tx pending env |
| README: funding tx, payout tx, HCS topic with HashScan links | step 10 | pending |
| Demo video ≤ 5 min covers escrow funding and payout | step 10 | pending |

## ETHGlobal
| Requirement | Proof | Status |
|---|---|---|
| Public repo, steady commits | github.com/topji/trenches | in progress |
| Live demo link, showcase, three partner picks | step 9 / 10 | pending |
