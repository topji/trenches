/** F6: the host's Trenches with entrants, volume, fees earned and the on-chain links. */
import type { Address, Trench } from "@trenches/core";
import { desc, entries, eq, feeLedger, fills, inArray, rowToTrench, sql, trenches } from "@trenches/db";
import { services } from "./context.js";

export interface HostTrenchRow {
  trench: Trench;
  entrants: number;
  volumeUsd: number;
  feesEarnedUsd: number;
  arkivEntityKey: string | null;
  pendingAsset: { symbol: string; address: Address; sponsor: Address } | null;
}

export async function hostTrenches(admin: Address): Promise<HostTrenchRow[]> {
  const { db } = services();
  const rows = await db.select().from(trenches).where(eq(trenches.adminAddress, admin.toLowerCase())).orderBy(desc(trenches.createdAt)).limit(100);
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [entrantCounts, volumes, fees] = await Promise.all([
    db.select({ trenchId: entries.trenchId, n: sql<number>`count(*)::int` }).from(entries).where(inArray(entries.trenchId, ids)).groupBy(entries.trenchId),
    db.select({ trenchId: fills.trenchId, v: sql<string>`coalesce(sum(${fills.qty} * ${fills.priceUsd}), 0)` }).from(fills).where(inArray(fills.trenchId, ids)).groupBy(fills.trenchId),
    db.select({ trenchId: feeLedger.trenchId, f: sql<string>`coalesce(sum(${feeLedger.adminUsd}), 0)` }).from(feeLedger).where(inArray(feeLedger.trenchId, ids)).groupBy(feeLedger.trenchId),
  ]);
  const e = new Map(entrantCounts.map((x) => [x.trenchId, x.n]));
  const v = new Map(volumes.map((x) => [x.trenchId, Number(x.v)]));
  const f = new Map(fees.map((x) => [x.trenchId, Number(x.f)]));
  return rows.map((r) => ({
    trench: rowToTrench(r),
    entrants: e.get(r.id) ?? 0,
    volumeUsd: v.get(r.id) ?? 0,
    feesEarnedUsd: f.get(r.id) ?? 0,
    arkivEntityKey: r.arkivEntityKey,
    pendingAsset: r.pendingAsset ? { symbol: r.pendingAsset.symbol, address: r.pendingAsset.address, sponsor: r.pendingAsset.sponsor } : null,
  }));
}
