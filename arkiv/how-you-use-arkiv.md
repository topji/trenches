# How Trenches uses Arkiv

**Source of truth for everything public.** A Trench exists publicly the moment its `trenches.trench` entity lands (`packages/services/src/trenches.ts` → `ArkivRepo.createTrench`). Status changes are `patchEntity` calls on the same entity (update in place, SDK 1.0), so one link follows a Trench from draft to settled: https://rabdi.explorer.arkiv.network/entity/0x2cc8f30c2654069c1a45197e37163bd9b67fd17af4fe0a4b54168747ec0f72d7.

**Reads happen in server components, straight from the SDK.** Discovery (`/trenches`), the Trench page (`/t/[slug]`), the public leaderboard route, the profile (`/u/[address]`) and the clan ladder (`/clans`) call `createPublicClient().select()`; Postgres is consulted only while an Arkiv write is pending, and the page says so.

**Leaderboard rewrites are one transaction.** `upsertLeaderboard` diffs the existing `trenches.lb` rows against the new ranking and sends creates, patches and deletes in a single `executeBatch` — one tx per recompute, only when something moved. Same pattern for the clan ladder (`upsertClanScores`).

**Ownership.** One backend writer wallet owns every entity; entries, profiles and sponsorships are tagged with the trader or sponsor address. Per-wallet ownership (the trader signing their own `entry` from Privy) was the stretch goal and did not make the cut; documented here rather than claimed.

**Expiry.** Trench-scoped entities expire 30 days after the Trench ends (converted to blocks at 2 s, capped at the chain maximum); profiles, payouts and clans one year.

**Numbers from the build (Nov 6–7).** ~60 Trenches, ~90 entries, ~70 `lb` rows, 12 payouts, 20+ profiles, 6 clans written during development and test runs; every e2e spec writes real entities and reads them back.
