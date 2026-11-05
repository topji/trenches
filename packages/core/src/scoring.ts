import type { Address, Fill, LeaderboardRow, Trench, Entry } from "./types.js";

/**
 * Deterministic leaderboard scoring. Same inputs → same rows.
 *
 * - Only fills inside [startAt, endAt] on allowed assets by entered traders count.
 * - Average-cost position tracking per trader per asset.
 * - Realized P&L on sells; unrealized on open positions marked at `markPrices`
 *   (fallback: the trader's last fill price on that asset).
 * - pnlUsd = realized + unrealized − fees.
 * - roiPct = pnlUsd / max(peakCapitalDeployedUsd, 1) × 100.
 * - winRate = closed round-trips with positive realized P&L / closed round-trips.
 * - Rank by pnlUsd desc, then lower volume, then earlier joinedAt, then address.
 */

export interface ScoringInput {
  trench: Pick<Trench, "id" | "startAt" | "endAt" | "allowedAssets">;
  entries: Pick<Entry, "trader" | "joinedAt">[];
  fills: Fill[];
  /** asset address (any case) → USD mark price */
  markPrices: Record<string, number>;
  computedAt: string;
}

interface Position {
  qty: number;
  cost: number; // total cost basis in USD
  tripPnl: number; // realized P&L accumulated during the current open round-trip
  lastPrice: number;
}

interface TraderState {
  positions: Map<string, Position>;
  realized: number;
  fees: number;
  volume: number;
  fills: number;
  closedTrips: number;
  winningTrips: number;
  capitalNow: number;
  peakCapital: number;
}

const EPS = 1e-9;

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

function newState(): TraderState {
  return {
    positions: new Map(),
    realized: 0,
    fees: 0,
    volume: 0,
    fills: 0,
    closedTrips: 0,
    winningTrips: 0,
    capitalNow: 0,
    peakCapital: 0,
  };
}

export function isFillEligible(
  fill: Fill,
  trench: ScoringInput["trench"],
  entrants: Set<string>,
): boolean {
  const t = Date.parse(fill.filledAt);
  if (Number.isNaN(t)) return false;
  if (t < Date.parse(trench.startAt) || t > Date.parse(trench.endAt)) return false;
  if (!trench.allowedAssets.some((a) => a.address.toLowerCase() === fill.asset.toLowerCase())) {
    return false;
  }
  return entrants.has(fill.trader.toLowerCase());
}

export function computeLeaderboard(input: ScoringInput): LeaderboardRow[] {
  const entrants = new Map<string, Pick<Entry, "trader" | "joinedAt">>();
  for (const e of input.entries) entrants.set(e.trader.toLowerCase(), e);
  const entrantSet = new Set(entrants.keys());

  const eligible = input.fills
    .filter((f) => isFillEligible(f, input.trench, entrantSet))
    .sort((a, b) => Date.parse(a.filledAt) - Date.parse(b.filledAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const states = new Map<string, TraderState>();
  for (const key of entrantSet) states.set(key, newState());

  for (const f of eligible) {
    const s = states.get(f.trader.toLowerCase())!;
    const asset = f.asset.toLowerCase();
    const pos = s.positions.get(asset) ?? { qty: 0, cost: 0, tripPnl: 0, lastPrice: f.priceUsd };
    const notional = f.qty * f.priceUsd;
    s.volume += notional;
    s.fees += f.feeUsd;
    s.fills += 1;
    pos.lastPrice = f.priceUsd;

    if (f.side === "buy") {
      pos.qty += f.qty;
      pos.cost += notional;
      s.capitalNow += notional;
      if (s.capitalNow > s.peakCapital) s.peakCapital = s.capitalNow;
    } else {
      // Sells only reduce a held position; selling more than held is ignored for P&L
      // (shorting is out of scope) but still counts toward volume.
      const sellQty = Math.min(f.qty, pos.qty);
      if (sellQty > EPS) {
        const avg = pos.cost / pos.qty;
        const realized = sellQty * (f.priceUsd - avg);
        s.realized += realized;
        pos.tripPnl += realized;
        pos.cost -= sellQty * avg;
        pos.qty -= sellQty;
        s.capitalNow -= sellQty * avg;
        if (pos.qty <= EPS) {
          s.closedTrips += 1;
          if (pos.tripPnl > EPS) s.winningTrips += 1;
          pos.qty = 0;
          pos.cost = 0;
          pos.tripPnl = 0;
        }
      }
    }
    s.positions.set(asset, pos);
  }

  const marks = new Map<string, number>();
  for (const [k, v] of Object.entries(input.markPrices)) marks.set(k.toLowerCase(), v);

  const rows: Omit<LeaderboardRow, "rank">[] = [];
  for (const [key, s] of states) {
    let unrealized = 0;
    for (const [asset, pos] of s.positions) {
      if (pos.qty <= EPS) continue;
      const mark = marks.get(asset) ?? pos.lastPrice;
      unrealized += pos.qty * mark - pos.cost;
    }
    const pnl = s.realized + unrealized - s.fees;
    const roi = (pnl / Math.max(s.peakCapital, 1)) * 100;
    rows.push({
      trenchId: input.trench.id,
      trader: entrants.get(key)!.trader,
      pnlUsd: round6(pnl),
      roiPct: round6(roi),
      volumeUsd: round6(s.volume),
      winRate: s.closedTrips === 0 ? 0 : round6(s.winningTrips / s.closedTrips),
      fills: s.fills,
      computedAt: input.computedAt,
    });
  }

  rows.sort((a, b) => {
    if (b.pnlUsd !== a.pnlUsd) return b.pnlUsd - a.pnlUsd;
    if (a.volumeUsd !== b.volumeUsd) return a.volumeUsd - b.volumeUsd;
    const ja = Date.parse(entrants.get(a.trader.toLowerCase())!.joinedAt);
    const jb = Date.parse(entrants.get(b.trader.toLowerCase())!.joinedAt);
    if (ja !== jb) return ja - jb;
    return a.trader.toLowerCase() < b.trader.toLowerCase() ? -1 : 1;
  });

  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

/** Compare two rankings and return traders whose rank changed. */
export function rankChanges(
  prev: Pick<LeaderboardRow, "trader" | "rank">[],
  next: Pick<LeaderboardRow, "trader" | "rank">[],
): { trader: Address; from: number | null; to: number }[] {
  const before = new Map(prev.map((r) => [r.trader.toLowerCase(), r.rank]));
  const out: { trader: Address; from: number | null; to: number }[] = [];
  for (const r of next) {
    const from = before.get(r.trader.toLowerCase()) ?? null;
    if (from !== r.rank) out.push({ trader: r.trader, from, to: r.rank });
  }
  return out;
}
