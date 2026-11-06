/**
 * F4: score fills → rank → write `trenches.lb` entities on Arkiv (the public leaderboard) → HCS
 * `leaderboard.snapshot` every 5 min and on every rank change. Postgres keeps the previous ranking
 * so rank changes can be detected and so the page can fall back while an Arkiv write is pending.
 */
import { computeLeaderboard, rankChanges, type Address, type Fill, type LeaderboardRow, type Side } from "@trenches/core";
import { and, entries, eq, fills, inArray, leaderboard, notInArray, orders, rowToTrench, trenches } from "@trenches/db";
import { BASE } from "@trenches/flash";
import { log, services } from "./context.js";
import { recordHcs, withArkivRetry } from "./trenches.js";

const MARK_TTL_MS = 20_000; // DECISIONS.md: Flash quote mid for $100 notional, cached 20 s
const SNAPSHOT_EVERY_MS = 5 * 60_000;
const markCache = new Map<string, { price: number; at: number }>();
const lastSnapshot = new Map<string, number>();

/** USD mark price for an asset: Flash market quote for $100 (buy side) → notional / amount. */
export async function markPrice(asset: string): Promise<number | null> {
  const key = asset.toLowerCase();
  const hit = markCache.get(key);
  if (hit && Date.now() - hit.at < MARK_TTL_MS) return hit.price;
  const { flash, config } = services();
  if (!config.flashApiKey) return null;
  try {
    const q = await flash.quote({ targetChain: "base", contraChain: "base", targetAsset: asset, contraAsset: BASE.USDC, side: "buy", qty: "100", orderType: "market" });
    const amt = Number(q.to.amount);
    if (!(amt > 0)) return null;
    const price = Number(q.to.notional) / amt;
    markCache.set(key, { price, at: Date.now() });
    return price;
  } catch (e) {
    log.warn({ asset, err: (e as Error).message }, "mark price quote failed");
    return hit?.price ?? null;
  }
}

export interface RecomputeResult {
  trenchId: string;
  rows: LeaderboardRow[];
  changed: boolean;
  rankChanges: number;
  arkivTxHash?: string;
  arkivError?: string;
  snapshot?: "rank-change" | "interval" | null;
}

/** Score one Trench now. Writes only when something moved (rank, P&L ≥ 1 cent, volume, fills). */
export async function recomputeLeaderboard(trenchId: string, now = new Date()): Promise<RecomputeResult | null> {
  const { db, arkiv } = services();
  const [row] = await db.select().from(trenches).where(eq(trenches.id, trenchId)).limit(1);
  if (!row) return null;
  const trench = rowToTrench(row);

  const entrants = await db.select({ trader: entries.trader, joinedAt: entries.joinedAt }).from(entries).where(eq(entries.trenchId, trenchId));
  const fillRows = await db.select().from(fills).where(eq(fills.trenchId, trenchId));
  const domainFills: Fill[] = fillRows.map((f) => ({
    id: f.id,
    orderId: f.orderId,
    trenchId: f.trenchId,
    trader: f.trader as Address,
    asset: f.asset as Address,
    side: f.side as Side,
    qty: Number(f.qty),
    priceUsd: Number(f.priceUsd),
    feeUsd: Number(f.feeUsd),
    txHash: f.txHash as Address,
    filledAt: new Date(f.filledAt).toISOString(),
  }));

  // Mark prices only for assets that actually have fills; fallback inside scoring is the last fill price.
  const assets = [...new Set(domainFills.map((f) => f.asset.toLowerCase()))];
  const markPrices: Record<string, number> = {};
  for (const a of assets) {
    const p = await markPrice(a);
    if (p !== null) markPrices[a] = p;
  }

  const computedAt = now.toISOString();
  const rows = computeLeaderboard({
    trench,
    entries: entrants.map((e) => ({ trader: e.trader as Address, joinedAt: new Date(e.joinedAt).toISOString() })),
    fills: domainFills,
    markPrices,
    computedAt,
  });

  const prev = await db.select().from(leaderboard).where(eq(leaderboard.trenchId, trenchId));
  const prevByTrader = new Map(prev.map((p) => [p.trader.toLowerCase(), p]));
  const moved = rankChanges(
    prev.map((p) => ({ trader: p.trader as Address, rank: p.rank })),
    rows.map((r) => ({ trader: r.trader, rank: r.rank })),
  );
  const valueChanged =
    rows.length !== prev.length ||
    rows.some((r) => {
      const p = prevByTrader.get(r.trader.toLowerCase());
      return !p || Math.abs(Number(p.pnlUsd) - r.pnlUsd) >= 0.01 || Number(p.volumeUsd) !== r.volumeUsd || p.fills !== r.fills;
    });
  const changed = moved.length > 0 || valueChanged;

  const out: RecomputeResult = { trenchId, rows, changed, rankChanges: moved.length, snapshot: null };
  if (!changed) {
    // Interval snapshot still happens on a quiet board.
    await maybeSnapshot(trench.id, trench.hedera.topicId, rows, now, false, out);
    return out;
  }

  // Postgres mirror: upsert every row, delete traders no longer on the board. Safe under concurrent runs.
  await db.transaction(async (tx) => {
    for (const r of rows) {
      const values = {
        trenchId,
        trader: r.trader.toLowerCase(),
        rank: r.rank,
        pnlUsd: r.pnlUsd.toFixed(6),
        roiPct: r.roiPct.toFixed(6),
        volumeUsd: r.volumeUsd.toFixed(6),
        winRate: r.winRate.toFixed(6),
        fills: r.fills,
        computedAt,
      };
      await tx.insert(leaderboard).values(values).onConflictDoUpdate({ target: [leaderboard.trenchId, leaderboard.trader], set: values });
    }
    const keep = rows.map((r) => r.trader.toLowerCase());
    if (keep.length) await tx.delete(leaderboard).where(and(eq(leaderboard.trenchId, trenchId), notInArray(leaderboard.trader, keep)));
    else await tx.delete(leaderboard).where(eq(leaderboard.trenchId, trenchId));
  });

  // Public record: one executeBatch (create/patch/delete)
  try {
    const r = await withArkivRetry("upsertLeaderboard", () => arkiv.upsertLeaderboard(trenchId, rows, trench.endAt));
    out.arkivTxHash = r.txHash;
  } catch (e) {
    out.arkivError = (e as Error).message;
    log.error({ trenchId, err: out.arkivError }, "arkiv upsertLeaderboard failed");
  }

  await maybeSnapshot(trench.id, trench.hedera.topicId, rows, now, moved.length > 0, out);
  log.info({ trenchId, rows: rows.length, rankChanges: moved.length, arkivTx: out.arkivTxHash, snapshot: out.snapshot }, "leaderboard recomputed");
  return out;
}

/** HCS `leaderboard.snapshot`: on rank change, and at least every 5 minutes while live. Top 20, ≤ 1 KB. */
async function maybeSnapshot(trenchId: string, topicId: string, rows: LeaderboardRow[], now: Date, rankChanged: boolean, out: RecomputeResult): Promise<void> {
  const last = lastSnapshot.get(trenchId) ?? 0;
  const due = now.getTime() - last >= SNAPSHOT_EVERY_MS;
  if (!rankChanged && !due) return;
  if (rows.length === 0 && !rankChanged) return;
  const payload = {
    n: rows.length,
    rows: rows.slice(0, 20).map((r) => ({ r: r.rank, t: r.trader.slice(0, 10), p: Math.round(r.pnlUsd * 100) / 100 })),
  };
  const res = await recordHcs(trenchId, topicId, "leaderboard.snapshot", payload);
  if ("txId" in res) {
    lastSnapshot.set(trenchId, now.getTime());
    out.snapshot = rankChanged ? "rank-change" : "interval";
  }
}

/** Worker job: every 30 s for live Trenches (and ended ones until settled, so the final board is current). */
export async function recomputeLeaderboards(now = new Date()): Promise<RecomputeResult[]> {
  const { db } = services();
  const live = await db.select({ id: trenches.id }).from(trenches).where(inArray(trenches.status, ["live", "ended"]));
  const out: RecomputeResult[] = [];
  for (const t of live) {
    try {
      const r = await recomputeLeaderboard(t.id, now);
      if (r) out.push(r);
    } catch (e) {
      log.error({ trenchId: t.id, err: (e as Error).message }, "recomputeLeaderboard failed");
    }
  }
  return out;
}

/** Trench ids that have at least one open order (used by pollOrders to recompute right after a fill). */
export async function trenchesWithOrders(ids: string[]): Promise<string[]> {
  if (!ids.length) return [];
  const { db } = services();
  const rows = await db.select({ trenchId: orders.trenchId }).from(orders).where(and(inArray(orders.id, ids)));
  return [...new Set(rows.map((r) => r.trenchId))];
}
