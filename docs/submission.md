# Submission kit

## ETHGlobal showcase

**Project name:** Trenches
**Tagline:** Trading competitions your community can't fake. Clans, one human per slot, prizes that pay themselves out.

**Description.**
Trenches turns a community's trading into a sport. A host opens a battle with a prize pool locked in escrow on Hedera. Entrants prove they are a unique human once with World ID, then trade from their own wallet through Definitive Flash: market, DCA, bracket, limit and TWAP orders, with a 0.3 % platform fee the host shares in. Every fill is scored into a public leaderboard written to Arkiv, so anyone can check the ranking with one query. At the deadline the escrow pays the winners by itself, the host's fee share goes out as a Hedera Scheduled Transaction, and the whole history sits on an HCS topic.

Traders group into clans: one leader, up to fifty members, a shared season score with a per-member ROI cap so a whale cannot carry the clan, and a monthly ladder. Battles are clan-only or open to the world. Handles, XP and titles (Recruit to Warlord) show as `[TAG] handle · title` on every board.

**How it's made.**
pnpm monorepo, Next.js 15 App Router, TypeScript strict, Tailwind with the design tokens, Vitest and Playwright. `packages/core` is pure maths (average-cost P&L, prize split, clan score, XP) with unit tests. `packages/flash` wraps Definitive Flash's REST API with zod: the server builds the quote with `flashIntegratorFeeBps`, the trader signs Flash's EIP-712 payload in a Privy embedded wallet, the server forwards the signature; a worker polls fills every 15 s. `packages/arkiv` defines nine `trenches.*` schemas on SDK 1.0 and rewrites leaderboards and the clan ladder in single `executeBatch` transactions; every public page is a server component reading Arkiv queries. `packages/hedera` uses `@hiero-ledger/sdk` native services only: an escrow account and HCS topic per battle, HTS transfers for funding and payout signed by the battle's own key, a HIP-423 long-term Scheduled Transaction for the host's fee share, Mirror Node for balances. `packages/worldid` signs IDKit 4 request contexts, verifies results server-side and stores salted nullifiers behind a unique index; proofs are mocked during the event behind a server-signed nonce. Postgres on Neon mirrors the public entities and holds secrets. Zero Solidity. Built with Claude Code from a written spec, step by step, every step tested against the live testnets.

**Partner picks:** Definitive, Arkiv, Hedera (World ID as a fourth where the form allows).

## Demo shot list (≤ 3 min)

1. Landing: top clans, live battles. 10 s.
2. Create a clan, claim a handle. 20 s.
3. Create a clan battle, fund escrow: escrow id and HCS topic on HashScan. 25 s.
4. Join with World ID (mocked), entrant appears on the board with `[TAG] handle · title`. 20 s.
5. Place a market buy from the Privy wallet, fill appears with a Basescan link; DCA legs landing. 40 s.
6. Leaderboard moving, Arkiv entity link, the runnable query in the README. 20 s.
7. Fast-forward: final HCS message, payout tx on HashScan, Scheduled Transaction, settled page with payouts. 30 s.
8. Clan ladder moves; profile with XP and title. 15 s.

## Posts

**X (tag @DefinitiveFi):** Built Trenches at @ETHGlobal Mumbai: trading competitions your community can't fake. Clans, one human per slot via World ID, execution by @DefinitiveFi Flash, public leaderboards on Arkiv, escrow + payouts on Hedera with zero Solidity. Demo: <video> · Live: https://jointrenches.xyz · Code: https://github.com/topji/trenches

**Definitive Discord:** Shipped Trenches (ETHGlobal Mumbai): market, DCA, bracket, limit and TWAP orders through Flash with the integrator fee, signed from Privy wallets, fills polled into a live leaderboard. Five live fills from a real wallet are linked in the README. Repo: https://github.com/topji/trenches · video: <link>
