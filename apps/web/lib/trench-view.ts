import { deriveStatus, isEndingSoon, type Trench } from "@trenches/core";
import type { PillStatus } from "@/components/ui/status-pill";

/** Status pill for any Trench, time-aware (COPY.md Trench page). */
export function pillFor(t: Pick<Trench, "status" | "startAt" | "endAt">, now = new Date()): PillStatus {
  if (t.status === "draft") return "upcoming";
  const s = deriveStatus(t, now);
  if (s === "settled") return "settled";
  if (s === "ended") return "ended";
  if (s === "live") return isEndingSoon(t, now) ? "endingSoon" : "live";
  return "upcoming";
}

/** Presets for the create form (Base mainnet, Flash-supported). DECISIONS.md: WETH + liquid memecoins. */
export const ASSET_PRESETS = [
  { chainId: 8453, address: "0x4200000000000000000000000000000000000006", symbol: "WETH" },
  { chainId: 8453, address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", symbol: "cbBTC" },
  { chainId: 8453, address: "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed", symbol: "DEGEN" },
  { chainId: 8453, address: "0x532f27101965dd16442E59d40670FaF5eBB142E4", symbol: "BRETT" },
] as const;
