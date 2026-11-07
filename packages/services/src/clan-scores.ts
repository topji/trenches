/**
 * Step 12: clan ladder. Season = UTC month. For every battle whose startAt falls in the season and
 * that is live / ended / settled, take the `leaderboard` rows → per member: season P&L, deployed
 * capital (≈ Σ volume / 2, since volume counts both legs), podiums (rank ≤ 3 in settled battles) →
 * clamp(ROI, ±50) + 20 × podiums → Σ per clan → rank (ties: fewer members first).
 */
import { clanSeasonScore, computeLeaderboard, rankClans, seasonOf, type Address, type ClanScore, type Fill, type Side } from "@trenches/core";
import { and, clanMembers, clanMemberships, clanScores, clans, eq, fills, gte, inArray, leaderboard, lt, sql, trenches } from "@trenches/db";
import { markPrice } from "./leaderboard.js";
import { log, services } from "./context.js";
import { FEATURE_CLANS } from "./clans.js";
import { withArkivRetry } from "./trenches.js";

export interface MemberSeason {
  trader: Address;
  pnlUsd: number;
  volumeUsd: number;
  roiPct: number;
  podiums: number;
  contribution: number;
}

function seasonBounds(season: string): { from: string; to: string } {
  const [y, m] = season.split("-").map(Number);
  const from = new Date(Date.UTC(y!, m! - 1, 1)).toISOString();
  const to = new Date(Date.UTC(y!, m!, 1)).toISOString();
  return { from, to };
}

export interface MembershipWindow {
  clanId: string;
  trader: string;
  from: string;
  to: string | null;
}

/**
 * Per-member season stats **for one Trench**, windowed by membership: only fills placed while the trader
 * was in this Trench count, and only settled battles that ended while they were a member count as podiums.
 * P&L / peak capital come from the same average-cost scoring used for battle boards, run over the window.
 */
export async function memberSeasonsFor(clanId: string, season = seasonOf()): Promise<Map<string, MemberSeason>> {
  const { db } = services();
  const out = new Map<string, MemberSeason>();
  const { from: sFrom, to: sTo } = seasonBounds(season);
  const windows = await db.select().from(clanMemberships).where(eq(clanMemberships.clanId, clanId));
  if (!windows.length) return out;
  const traders = [...new Set(windows.map((w) => w.trader))];
  const allFills = await db.select().from(fills).where(and(inArray(fills.trader, traders), gte(fills.filledAt, sFrom), lt(fills.filledAt, sTo)));
  const settledRows = await db
    .select({ trader: leaderboard.trader, rank: leaderboard.rank, endAt: trenches.endAt })
    .from(leaderboard)
    .innerJoin(trenches, eq(trenches.id, leaderboard.trenchId))
    .where(and(inArray(leaderboard.trader, traders), eq(trenches.status, "settled"), gte(trenches.endAt, sFrom), lt(trenches.endAt, sTo), sql`${leaderboard.rank} <= 3`));
  const marks: Record<string, number> = {};
  for (const a of new Set(allFills.map((f) => f.asset.toLowerCase()))) {
    const p = await markPrice(a);
    if (p !== null) marks[a] = p;
  }
  for (const trader of traders) {
    const mine = windows.filter((w) => w.trader === trader);
    const inWindow = (t: string) => mine.some((w) => Date.parse(t) >= Date.parse(String(w.joinedAt)) && (!w.leftAt || Date.parse(t) < Date.parse(String(w.leftAt))));
    const myFills = allFills.filter((f) => f.trader === trader && inWindow(String(f.filledAt)));
    const domainFills: Fill[] = myFills.map((f) => ({
      id: f.id, orderId: f.orderId, trenchId: f.trenchId, trader: f.trader as Address, asset: f.asset as Address, side: f.side as Side,
      qty: Number(f.qty), priceUsd: Number(f.priceUsd), feeUsd: Number(f.feeUsd), txHash: f.txHash as Address, filledAt: new Date(f.filledAt).toISOString(),
    }));
    const assets = [...new Set(domainFills.map((f) => f.asset.toLowerCase()))].map((a) => ({ chainId: 8453, address: a as Address, symbol: a }));
    const [row] = domainFills.length
      ? computeLeaderboard({ trench: { id: `season:${season}`, startAt: sFrom, endAt: sTo, allowedAssets: assets }, entries: [{ trader: trader as Address, joinedAt: sFrom }], fills: domainFills, markPrices: marks, computedAt: new Date().toISOString() })
      : [];
    const podiums = settledRows.filter((r) => r.trader === trader && inWindow(String(r.endAt))).length;
    const pnlUsd = row?.pnlUsd ?? 0;
    const volumeUsd = row?.volumeUsd ?? 0;
    const roiPct = row?.roiPct ?? 0;
    const contribution = Math.round((Math.min(50, Math.max(-50, roiPct)) + 20 * podiums) * 100) / 100;
    out.set(trader, { trader: trader as Address, pnlUsd, volumeUsd, roiPct, podiums, contribution });
  }
  return out;
}

/** Back-compat: stats for the traders' *current* Trench memberships. */
export async function memberSeasons(traders: string[], season = seasonOf()): Promise<Map<string, MemberSeason>> {
  const { db } = services();
  const out = new Map<string, MemberSeason>();
  if (!traders.length) return out;
  const current = await db.select().from(clanMembers).where(inArray(clanMembers.trader, traders.map((t) => t.toLowerCase())));
  for (const clanId of new Set(current.map((c) => c.clanId))) {
    for (const [t, m] of await memberSeasonsFor(clanId, season)) if (current.some((c) => c.trader === t && c.clanId === clanId)) out.set(t, m);
  }
  return out;
}

export async function recomputeClanScores(season = seasonOf()): Promise<{ season: string; clans: number; arkivTx?: string; arkivError?: string }> {
  if (!FEATURE_CLANS) return { season, clans: 0 };
  const { db, arkiv } = services();
  const allClans = await db.select().from(clans);
  if (!allClans.length) return { season, clans: 0 };
  const computedAt = new Date().toISOString();
  const unranked: { id: string; score: number; podiums: number; members: number; createdAt: string }[] = [];
  for (const c of allClans) {
    const stats = await memberSeasonsFor(c.id, season); // windowed: past members' time inside still counts here
    const { score, podiums } = clanSeasonScore([...stats.values()].map((m) => ({ trader: m.trader, roiPct: m.roiPct, podiums: m.podiums })));
    unranked.push({ id: c.id, score, podiums, members: c.memberCount, createdAt: new Date(c.createdAt).toISOString() });
  }
  const ranked = rankClans(unranked);
  const rows: ClanScore[] = ranked.map((r) => ({ clanId: r.id, season, score: r.score, rank: r.rank, podiums: r.podiums, members: r.members, computedAt }));
  await db.transaction(async (tx) => {
    for (const r of rows) {
      const values = { clanId: r.clanId, season, score: r.score.toFixed(6), rank: r.rank, podiums: r.podiums, members: r.members, computedAt };
      await tx.insert(clanScores).values(values).onConflictDoUpdate({ target: [clanScores.clanId, clanScores.season], set: values });
    }
  });
  const out: { season: string; clans: number; arkivTx?: string; arkivError?: string } = { season, clans: rows.length };
  try {
    const r = await withArkivRetry("upsertClanScores", () => arkiv.upsertClanScores(season, rows));
    if (r.txHash !== "0x") out.arkivTx = r.txHash;
  } catch (e) {
    out.arkivError = (e as Error).message;
    log.error({ season, err: out.arkivError }, "arkiv clan scores failed");
  }
  return out;
}

export interface LadderRow extends ClanScore {
  name: string;
  tag: string;
  leader: Address;
}

/** Ladder for a season: Arkiv `clan_score` rows joined to `clan` entities; Postgres fills in when Arkiv is behind. */
export async function ladder(season = seasonOf()): Promise<LadderRow[]> {
  const { db, arkiv } = services();
  const clansById = new Map((await db.select().from(clans)).map((c) => [c.id, c]));
  let scores: ClanScore[] = [];
  try {
    scores = await arkiv.listClanScores(season);
  } catch (e) {
    log.warn({ err: (e as Error).message }, "arkiv ladder read failed; using mirror");
  }
  if (!scores.length) {
    scores = (await db.select().from(clanScores).where(eq(clanScores.season, season))).map((r) => ({ clanId: r.clanId, season: r.season, score: Number(r.score), rank: r.rank, podiums: r.podiums, members: r.members, computedAt: new Date(r.computedAt).toISOString() }));
  }
  const scored = scores
    .filter((s) => clansById.has(s.clanId))
    .sort((a, b) => a.rank - b.rank)
    .map((s) => {
      const c = clansById.get(s.clanId)!;
      return { ...s, name: c.name, tag: c.tag, leader: c.leader as Address };
    });
  // Trenches without a score row yet (founded since the last recompute) sit at 0 after the scored ones.
  const seen = new Set(scored.map((s) => s.clanId));
  const fresh = [...clansById.values()]
    .filter((c) => !seen.has(c.id))
    .sort((a, b) => a.memberCount - b.memberCount || Date.parse(String(a.createdAt)) - Date.parse(String(b.createdAt)))
    .map((c, i) => ({ clanId: c.id, season, score: 0, rank: scored.length + i + 1, podiums: 0, members: c.memberCount, computedAt: new Date(c.createdAt).toISOString(), name: c.name, tag: c.tag, leader: c.leader as Address }));
  return [...scored, ...fresh];
}

export const seasonBoundsOf = seasonBounds;
export const clanCount = async () => (await services().db.select({ n: sql<number>`count(*)::int` }).from(clans))[0]?.n ?? 0;
