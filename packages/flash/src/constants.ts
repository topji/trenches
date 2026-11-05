/** Shapes from docs/integrations/flash.md (OpenAPI https://flash.definitive.fi/v1/openapi.json). */
export const FLASH_BASE_URL = "https://flash.definitive.fi/v1";

/** Public dev key from https://flash.definitive.fi/docs/for-agents.md. Read-only probes only: fees on it go to Definitive. */
export const FLASH_PUBLIC_DEV_KEY = "dpka_513a2bd7_57a2_46d2_927b_2a3857fe271b";

export const FLASH_SETTLEMENT_CONTRACT = "0x5d00000873b6BF41539e6f5365B0Ff7d3c368f78" as const;

/** chainId → Flash `Chain` name. Trenches trades on Base only. */
export const CHAIN_NAMES: Record<number, string> = { 8453: "base" };

export const BASE = {
  chainId: 8453,
  name: "base",
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const,
  WETH: "0x4200000000000000000000000000000000000006" as const,
  explorerTx: (hash: string) => `https://basescan.org/tx/${hash}`,
};

export const TERMINAL_STATUSES = new Set([
  "ORDER_STATUS_FILLED",
  "ORDER_STATUS_CANCELLED",
  "ORDER_STATUS_REJECTED",
  "ORDER_STATUS_TERMINATED",
]);

export const TWAP_MIN_DURATION_S = 300;
export const TWAP_BUCKETS = { min: 2, max: 2560 };
