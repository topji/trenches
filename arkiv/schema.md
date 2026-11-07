# Arkiv schema

SDK `@arkiv-network/sdk` 1.0.1, chain Rabdi (7794095), writer `0xE5B3DB4a3D4F88C21CF85492222c8B4dDcdc1e87`. Source: `packages/arkiv/src/schemas.ts`. Named schemas are namespaced `trenches.*`; readers filter `ownedBy(writer)` because the tag is global.

| Schema | Indexed columns | Other columns | Expiry |
|---|---|---|---|
| `trenches.trench` | trenchId, slug, status, admin (addr), asset1, asset2?, asset3?, startAt (u64), endAt (u64), poolUsdc (dec) | name, payload (bytes: full Trench JSON) | endAt + 30 d |
| `trenches.entry` | trenchId, trader (addr), joinedAt (u64) | payload | endAt + 30 d |
| `trenches.lb` | trenchId, trader, rank (i32), pnlUsd (dec) | roiPct, volumeUsd, winRate, fills, computedAt | endAt + 30 d, rewritten in one `executeBatch` on change |
| `trenches.payout` | trenchId, trader, rank | amountUsdc, hederaTxId, paidAt | 1 year |
| `trenches.profile` | address, verifiedHuman, handle?, clanId? | trenchesJoined, bestFinish?, totalVolumeUsd, totalPnlUsd, xp?, level?, title? | 1 year, refreshed |
| `trenches.sponsorship` | trenchId, sponsor | name, amountUsdc, fundingTxId, payload | endAt + 30 d |
| `trenches.clan` | clanId, tag, leader | name, open, memberCount, createdAt | 1 year |
| `trenches.clan_member` | clanId, trader | joinedAt | 1 year |
| `trenches.clan_score` | clanId, season, score (dec), rank | podiums, members, computedAt | 1 year, rewritten per recompute |

Queries the app runs (`packages/arkiv/src/repo.ts`):

```ts
// 1. Discovery (status IN is not in the language → OR)
select().from(TrenchSchema).where(or(eq("status","funded"), eq("status","live"))).where(or(eq("asset1","WETH"), eq("asset2","WETH"), eq("asset3","WETH"))).ownedBy(writer).orderBy(desc("startAt")).limit(50)
// 2. Leaderboard
select().from(LeaderboardSchema).where(eq("trenchId", id)).ownedBy(writer).orderBy(asc("rank")).limit(100)
// 3. Profile
select().from(LeaderboardSchema).where(eq("trader", addr(a))).ownedBy(writer).orderBy(desc("computedAt"))
select().from(ProfileSchema).where(eq("address", addr(a))).ownedBy(writer).limit(1)
// 4. Payouts
select().from(PayoutSchema).where(eq("trenchId", id)).ownedBy(writer).orderBy(asc("rank"))
// 5. Clan ladder
select().from(ClanScoreSchema).where(eq("season","2026-11")).ownedBy(writer).orderBy(asc("rank"))
```

Kept off Arkiv on purpose: raw Flash orders and signatures, World ID proofs and nullifiers (only a salted hash in Postgres), escrow keys, the fee ledger.
