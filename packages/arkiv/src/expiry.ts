import { ExpirationTime } from "@arkiv-network/sdk";

/** Rabdi block time is 2 s; max lifetime 7,884,000 blocks (~182.5 days). docs/integrations/arkiv.md §3.3 */
export const BLOCK_SECONDS = 2;
export const MAX_LIFETIME_BLOCKS = 7_884_000n;
export const RETENTION_DAYS = 30;

export function blocksForSeconds(seconds: number): bigint {
  return BigInt(Math.ceil(seconds / BLOCK_SECONDS));
}

/**
 * Expiry for Trench-scoped entities: Trench end + 30 days, counted from now, capped at the max lifetime,
 * and never shorter than 1 day so a just-ended Trench's rows are still readable while it settles.
 */
export function lifetimeBlocksUntil(endAtIso: string, now: Date = new Date()): bigint {
  const target = Date.parse(endAtIso) + RETENTION_DAYS * 86_400_000;
  const seconds = Math.max((target - now.getTime()) / 1000, 86_400);
  const blocks = blocksForSeconds(seconds);
  return blocks > MAX_LIFETIME_BLOCKS ? MAX_LIFETIME_BLOCKS : blocks;
}

export function expiryForTrench(endAtIso: string, now: Date = new Date()) {
  return ExpirationTime.fromBlocks(Number(lifetimeBlocksUntil(endAtIso, now)));
}

/** Profiles and payouts: as long as the network allows (~182 days), refreshed on write. */
export function expiryLong() {
  return ExpirationTime.max();
}
