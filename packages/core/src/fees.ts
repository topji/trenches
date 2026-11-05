export const DEFAULT_PLATFORM_FEE_BPS = 30;
export const DEFAULT_ADMIN_FEE_SHARE_BPS = 5000;

/** Platform fee on a fill's notional, in USD, rounded to 6 dp. */
export function platformFeeUsd(notionalUsd: number, feeBps = DEFAULT_PLATFORM_FEE_BPS): number {
  return Math.round(notionalUsd * feeBps * 100) / 1e6; // notional × bps / 10000, kept at 6 dp
}

/** Split a fee between the platform and the admin by the admin's share in bps. */
export function splitFee(
  feeUsd: number,
  adminFeeShareBps = DEFAULT_ADMIN_FEE_SHARE_BPS,
): { platformUsd: number; adminUsd: number } {
  if (adminFeeShareBps < 0 || adminFeeShareBps > 10_000) throw new Error("adminFeeShareBps out of range");
  const adminUsd = Math.round(feeUsd * adminFeeShareBps * 100) / 1e6;
  const platformUsd = Math.round((feeUsd - adminUsd) * 1e6) / 1e6;
  return { platformUsd, adminUsd };
}
