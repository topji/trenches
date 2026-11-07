/**
 * Step 12: clan ladder. Season = UTC month. For every battle whose startAt falls in the season and
 * that is live / ended / settled, take the `leaderboard` rows → per member: season P&L, deployed
 * capital (≈ Σ volume / 2, since volume counts both legs), podiums (rank ≤ 3 in settled battles) →
 * clamp(ROI, ±50) + 20 × podiums → Σ per clan → rank (ties: fewer members first).
 */
import { clanSeasonScore, rankClans, seasonOf, type Address, type ClanScore } from "@trenches/core";
import { and, clanMembers, clanScores, clans, eq, gte, inArray, leaderboard, lt, sql, trenches } from "@trenches/db";
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

/** Per-trader season stats for the given traders (any clan). */
export async function memberSeasons(traders: string[], season = seasonOf()): Promise<Map<string, MemberSeason>> {
  const { db } = services();
  const out = new Map<string, MemberSeason>();
  if (!traders.length) return out;
  const { from, to } = seasonBounds(season);
  const rows = await db
    .select({ trader: leaderboard.trader, pnl: leaderboard.pnlUsd, vol: leaderboard.volumeUsd, rank: leaderboard.rank, status: trenches.status })
    .from(leaderboard)
    .innerJoin(trenches, eq(trenches.id, leaderboard.trenchId))
    .where(and(inArray(leaderboard.trader, traders.map((t) => t.toLowerCase())), gte(trenches.startAt, from), lt(trenches.startAt, to), inArray(trenches.status, ["live", "ended", "settled"])));
  for (const r of rows) {
    const m = out.get(r.trader) ?? { trader: r.trader as Address, pnlUsd: 0, volumeUsd: 0, roiPct: 0, podiums: 0, contribution: 0 };
    m.pnlUsd += Number(r.pnl);
    m.volumeUsd += Number(r.vol);
    if (r.status === "settled" && r.rank <= 3) m.podiums += 1;
    out.set(r.trader, m);
  }
  for (const m of out.values()) {
    const capital = Math.max(m.volumeUsd / 2, 1);
    m.roiPct = Math.round(((m.pnlUsd / capital) * 100) * 100) / 100;
    m.contribution = Math.round((Math.min(50, Math.max(-50, m.roiPct)) + 20 * m.podiums) * 100) / 100;
  }
  return out;
}

export async function recomputeClanScores(season = seasonOf()): Promise<{ season: string; clans: number; arkivTx?: string; arkivError?: string }> {
  if (!FEATURE_CLANS) return { season, clans: 0 };
  const { db, arkiv } = services();
  const allClans = await db.select().from(clans);
  if (!allClans.length) return { season, clans: 0 };
  const members = await db.select({ clanId: clanMembers.clanId, trader: clanMembers.trader }).from(clanMembers);
  const stats = await memberSeasons(members.map((m) => m.trader), season);
  const computedAt = new Date().toISOString();
  const unranked = allClans.map((c) => {
    const mine = members.filter((m) => m.clanId === c.id).map((m) => stats.get(m.trader) ?? { trader: m.trader as Address, roiPct: 0, podiums: 0 });
    const { score, podiums } = clanSeasonScore(mine.map((m) => ({ trader: m.trader, roiPct: m.roiPct, podiums: m.podiums })));
    return { id: c.id, score, podiums, members: c.memberCount, createdAt: new Date(c.createdAt).toISOString() };
  });
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
  return scores
    .filter((s) => clansById.has(s.clanId))
    .sort((a, b) => a.rank - b.rank)
    .map((s) => {
      const c = clansById.get(s.clanId)!;
      return { ...s, name: c.name, tag: c.tag, leader: c.leader as Address };
    });
}

export const seasonBoundsOf = seasonBounds;
export const clanCount = async () => (await services().db.select({ n: sql<number>`count(*)::int` }).from(clans))[0]?.n ?? 0;
