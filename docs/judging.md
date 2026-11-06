# Judging map — requirement → proof

Filled in as each step lands. Every row needs a file:line and, where applicable, an on-chain link.

## Definitive Flash
| Requirement | Proof | Status |
|---|---|---|
| Market, DCA (TWAP) and Bracket orders through Flash with `flashIntegratorFeeBps` | `packages/flash/src/orders.ts` buildQuoteRequest; live quotes parsed (read-only) | code ready; first live fill in step 5 via the UI |
| On-chain fills (Base tx hashes) | step 5 | pending |
| Demo video posted on Discord and X tagging @DefinitiveFi | step 10 | pending |

## Arkiv
| Requirement | Proof | Status |
|---|---|---|
| Writes via `@arkiv-network/sdk` to Rabdi testnet | `packages/arkiv/src/repo.ts`; create tx [0x70b0…1d87](https://rabdi.explorer.arkiv.network/tx/0x70b04fad99f6af2113c1287b60c821b3e348926fb38d80b5663e645b49811d87), patch tx [0x8574…3faf](https://rabdi.explorer.arkiv.network/tx/0x8574b3d3f826a24b4de64f9f7049cc2d3ae755bf017e426c9905ccef92583faf), [entity](https://rabdi.explorer.arkiv.network/entity/0x95277f9af5d962e24418a2bc789cf8b8d49c86da108b0c000cb1823cb23d8ac0) | ✓ live |
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
| HTS + HCS + Scheduled Transactions + Mirror Node used | `packages/hedera/src/tokens.ts`, `topics.ts`, `schedules.ts`, `mirror.ts`; [token 0.0.11337181](https://hashscan.io/testnet/token/0.0.11337181), [topic 0.0.11337184](https://hashscan.io/testnet/topic/0.0.11337184), [fund tx](https://hashscan.io/testnet/transaction/0.0.11330265-1793957724-380422235), [payout tx](https://hashscan.io/testnet/transaction/0.0.11330265-1793957727-888524131), [schedule 0.0.11337186](https://hashscan.io/testnet/schedule/0.0.11337186) | ✓ live |
| README: funding tx, payout tx, HCS topic with HashScan links | step 10 | pending |
| Demo video ≤ 5 min covers escrow funding and payout | step 10 | pending |

## ETHGlobal
| Requirement | Proof | Status |
|---|---|---|
| Public repo, steady commits | github.com/topji/trenches | in progress |
| Live demo link, showcase, three partner picks | step 9 / 10 | pending |
