import { toBaseUnits } from "./money.js";

export const DEFAULT_PRIZE_SPLIT = [50, 30, 20];
export const MAX_PRIZE_PLACES = 5;

/**
 * Split a prize pool (base units, 6 dp) across ranked places.
 *
 * - `split` is whole percentages summing to 100 (validated upstream).
 * - Each place gets floor(pool × pct / 100).
 * - Rounding remainder goes to rank 1.
 * - If there are fewer winners than places, the unfilled places' shares also go to rank 1
 *   (DECISIONS.md: remainder to rank 1; keeps the pool fully paid out, nothing stranded).
 * - Zero winners → empty array (pool stays in escrow; sponsor refund path handles it).
 */
export function splitPrize(poolBaseUnits: bigint, split: number[], winners: number): bigint[] {
  if (poolBaseUnits < 0n) throw new Error("pool must be ≥ 0");
  const places = Math.min(split.length, Math.max(0, Math.floor(winners)));
  if (places === 0) return [];
  const amounts: bigint[] = [];
  let allocated = 0n;
  for (let i = 0; i < places; i++) {
    const pct = BigInt(Math.round(split[i]!));
    const amt = (poolBaseUnits * pct) / 100n;
    amounts.push(amt);
    allocated += amt;
  }
  amounts[0] = amounts[0]! + (poolBaseUnits - allocated);
  return amounts;
}

/** Convenience for USDC numbers: returns whole-USDC numbers (6 dp exact via base units). */
export function splitPrizeUsdc(poolUsdc: number | string, split: number[], winners: number): number[] {
  return splitPrize(toBaseUnits(poolUsdc), split, winners).map((u) => Number(u) / 1e6);
}

export function isValidPrizeSplit(split: number[]): boolean {
  if (split.length === 0 || split.length > MAX_PRIZE_PLACES) return false;
  if (split.some((p) => !Number.isInteger(p) || p < 0)) return false;
  return split.reduce((a, b) => a + b, 0) === 100;
}
