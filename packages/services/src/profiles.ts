/**
 * F7: a trader's public profile = Arkiv `trenches.profile` (verifiedHuman, counts) + their `trenches.lb`
 * rows. `refreshProfiles` (worker, 5 min) recomputes totals and best finish from the Postgres mirror
 * and patches the profile entity when something changed.
 */
import type { Address, LeaderboardRow, Profile, Trench } from "@trenches/core";
import { entries, leaderboard, sql, trenches } from "@trenches/db";
import { arkivReader, log, services } from "./context.js";
import { withArkivRetry } from "./trenches.js";

export interface ProfileView {
  address: Address;
  profile: Profile | null;
  results: (LeaderboardRow & { trenchName: string; trenchSlug: string; status: Trench["status"] })[];
  totals: { trenchesJoined: number; bestFinish: number | null; totalVolumeUsd: number; totalPnlUsd: number; verifiedHuman: boolean };
}

/** Public read, Arkiv only: profile entity + every lb row for the wallet, joined to the Trench names. */
export async function profileFor(address: Address): Promise<ProfileView> {
  const reader = arkivReader();
  const [profile, rows] = await Promise.all([reader.getProfile(address).catch(() => null), reader.listLeaderboardRowsForTrader(address).catch(() => [])]);
  const byTrench = new Map<string, Trench & { entityKey: `0x${string}` }>();
  await Promise.all(
    [...new Set(rows.map((r) => r.trenchId))].slice(0, 25).map(async (id) => {
      const t = await reader.getTrenchById(id).catch(() => null);
      if (t) byTrench.set(id, t);
    }),
  );
  const results = rows
    .filter((r) => byTrench.has(r.trenchId))
    .map((r) => {
      const t = byTrench.get(r.trenchId)!;
      return { ...r, trenchName: t.name, trenchSlug: t.slug, status: t.status };
    })
    .sort((a, b) => Date.parse(b.computedAt) - Date.parse(a.computedAt));
  const finished = results.filter((r) => r.status === "settled" || r.status === "ended");
  const totals = {
    trenchesJoined: profile?.trenchesJoined ?? results.length,
    bestFinish: finished.length ? Math.min(...finished.map((r) => r.rank)) : (profile?.bestFinish ?? null),
    totalVolumeUsd: results.reduce((a, r) => a + r.volumeUsd, 0),
    totalPnlUsd: results.reduce((a, r) => a + r.pnlUsd, 0),
    verifiedHuman: profile?.verifiedHuman ?? false,
  };
  return { address: address.toLowerCase() as Address, profile: profile ? { ...profile } : null, results, totals };
}

/** Worker job (every 5 min): patch profile entities whose totals moved. */
export async function refreshProfiles(): Promise<{ checked: number; updated: number }> {
  const { db, arkiv } = services();
  const traders = await db.select({ trader: entries.trader }).from(entries).groupBy(entries.trader);
  let updated = 0;
  for (const { trader } of traders) {
    try {
      const [agg] = await db
        .select({
          joined: sql<number>`(select count(*)::int from ${entries} e where e.trader = ${trader})`,
          volume: sql<string>`coalesce(sum(${leaderboard.volumeUsd}), 0)`,
          pnl: sql<string>`coalesce(sum(${leaderboard.pnlUsd}), 0)`,
          best: sql<number | null>`min(case when ${trenches.status} in ('ended','settled') then ${leaderboard.rank} end)`,
        })
        .from(leaderboard)
        .innerJoin(trenches, sql`${trenches.id} = ${leaderboard.trenchId}`)
        .where(sql`${leaderboard.trader} = ${trader}`);
      const existing = await arkiv.getProfile(trader as Address);
      const next: Profile = {
        address: trader as Address,
        verifiedHuman: existing?.verifiedHuman ?? true,
        trenchesJoined: agg?.joined ?? 0,
        ...(agg?.best != null ? { bestFinish: Number(agg.best) } : {}),
        totalVolumeUsd: Math.round(Number(agg?.volume ?? 0) * 100) / 100,
        totalPnlUsd: Math.round(Number(agg?.pnl ?? 0) * 100) / 100,
      };
      const same =
        existing &&
        existing.trenchesJoined === next.trenchesJoined &&
        (existing.bestFinish ?? null) === (next.bestFinish ?? null) &&
        Math.abs(existing.totalVolumeUsd - next.totalVolumeUsd) < 0.01 &&
        Math.abs(existing.totalPnlUsd - next.totalPnlUsd) < 0.01;
      if (same) continue;
      await withArkivRetry("upsertProfile", () => arkiv.upsertProfile(next));
      updated += 1;
    } catch (e) {
      log.warn({ trader, err: (e as Error).message }, "refreshProfiles: trader skipped");
    }
  }
  return { checked: traders.length, updated };
}
