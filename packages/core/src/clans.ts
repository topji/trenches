/**
 * Clans + identity maths (pure, unit-tested).
 * XP: +1 per $100 of fill volume, +100 / +60 / +40 for 1st / 2nd / 3rd in any battle, +25 for being in a clan.
 * Clan season score = Σ over members of clamp(member season ROI %, −50, +50) + 20 × podiums by members.
 */

export const LEVELS: { level: number; title: string; minXp: number }[] = [
  { level: 1, title: "Recruit", minXp: 0 },
  { level: 2, title: "Grunt", minXp: 200 },
  { level: 3, title: "Veteran", minXp: 600 },
  { level: 4, title: "Captain", minXp: 1500 },
  { level: 5, title: "Warlord", minXp: 4000 },
];

export const PODIUM_XP: Record<number, number> = { 1: 100, 2: 60, 3: 40 };
export const CLAN_JOIN_XP = 25;
export const ROI_CLAMP_PCT = 50;
export const PODIUM_SCORE = 20;
export const MAX_CLAN_MEMBERS = 50;

export function xpFor(input: { volumeUsd: number; podiumRanks: number[]; inClan: boolean }): number {
  const volume = Math.floor(Math.max(0, input.volumeUsd) / 100);
  const podiums = input.podiumRanks.reduce((a, r) => a + (PODIUM_XP[r] ?? 0), 0);
  return volume + podiums + (input.inClan ? CLAN_JOIN_XP : 0);
}

export function levelFor(xp: number): { level: number; title: string; nextXp: number | null; progress: number } {
  let current = LEVELS[0]!;
  for (const l of LEVELS) if (xp >= l.minXp) current = l;
  const next = LEVELS.find((l) => l.minXp > current.minXp) ?? null;
  const progress = next ? Math.min(1, (xp - current.minXp) / (next.minXp - current.minXp)) : 1;
  return { level: current.level, title: current.title, nextXp: next?.minXp ?? null, progress };
}

export interface ClanMemberSeason {
  trader: string;
  /** season P&L / peak capital deployed, in percent */
  roiPct: number;
  /** podium finishes (rank ≤ 3) in settled battles this season */
  podiums: number;
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function memberContribution(m: ClanMemberSeason): number {
  return clamp(m.roiPct, -ROI_CLAMP_PCT, ROI_CLAMP_PCT) + PODIUM_SCORE * m.podiums;
}

export function clanSeasonScore(members: ClanMemberSeason[]): { score: number; podiums: number } {
  const score = members.reduce((a, m) => a + memberContribution(m), 0);
  const podiums = members.reduce((a, m) => a + m.podiums, 0);
  return { score: Math.round(score * 100) / 100, podiums };
}

/** Ladder: score desc, then fewer members first, then earlier createdAt, then id. */
export function rankClans<T extends { id: string; score: number; members: number; createdAt: string }>(rows: T[]): (T & { rank: number })[] {
  return [...rows]
    .sort((a, b) => b.score - a.score || a.members - b.members || Date.parse(a.createdAt) - Date.parse(b.createdAt) || (a.id < b.id ? -1 : 1))
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

export function seasonOf(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function seasonLabel(season: string): string {
  const [y, m] = season.split("-").map(Number);
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][(m ?? 1) - 1]} ${y}`;
}

export const HANDLE_RE = /^[a-z0-9_]{3,16}$/i;
export const TAG_RE = /^[A-Z0-9]{3,5}$/;
