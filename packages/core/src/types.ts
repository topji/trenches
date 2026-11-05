export type Address = `0x${string}`;

export type TrenchStatus = "draft" | "funded" | "live" | "ended" | "settled";
export const TRENCH_STATUSES: readonly TrenchStatus[] = ["draft", "funded", "live", "ended", "settled"];

export interface AllowedAsset {
  chainId: number;
  address: Address;
  symbol: string;
}

export interface TrenchHedera {
  escrowAccountId: string;
  topicId: string;
  fundingTxId?: string;
  payoutTxId?: string;
  scheduleId?: string;
}

export interface TrenchSponsor {
  address: Address;
  name: string;
  logoUrl?: string;
}

export interface Trench {
  id: string; // ulid
  slug: string;
  name: string;
  description: string;
  adminAddress: Address;
  startAt: string; // ISO 8601 UTC
  endAt: string;
  allowedAssets: AllowedAsset[];
  prizePoolUsdc: number; // whole USDC as a number, 6 dp max
  prizeSplit: number[]; // e.g. [50, 30, 20], sums to 100
  entryRule: "open" | "invite";
  inviteCode?: string;
  adminFeeShareBps: number; // share of the platform fee, default 5000
  status: TrenchStatus;
  hedera: TrenchHedera;
  sponsor?: TrenchSponsor;
  createdAt: string;
}

export interface Entry {
  trenchId: string;
  trader: Address;
  worldIdNullifier: string; // hashed, never the raw nullifier
  joinedAt: string;
}

export type OrderType = "market" | "limit" | "dca" | "twap" | "bracket";
export const ORDER_TYPES: readonly OrderType[] = ["market", "limit", "dca", "twap", "bracket"];

export type OrderStatus = "pending" | "open" | "filled" | "partial" | "cancelled" | "failed";
export type Side = "buy" | "sell";

export interface Order {
  id: string;
  flashOrderId: string;
  trenchId: string;
  trader: Address;
  type: OrderType;
  asset: Address;
  side: Side;
  params: Record<string, unknown>;
  status: OrderStatus;
  createdAt: string;
}

export interface Fill {
  id: string;
  orderId: string;
  trenchId: string;
  trader: Address;
  asset: Address;
  side: Side;
  qty: number; // token units
  priceUsd: number; // per token
  feeUsd: number;
  txHash: Address;
  filledAt: string;
}

export interface LeaderboardRow {
  trenchId: string;
  trader: Address;
  rank: number;
  pnlUsd: number;
  roiPct: number;
  volumeUsd: number;
  winRate: number; // 0..1
  fills: number;
  computedAt: string;
}

export interface Payout {
  trenchId: string;
  trader: Address;
  rank: number;
  amountUsdc: number;
  hederaTxId: string;
  paidAt: string;
}

export interface Profile {
  address: Address;
  verifiedHuman: boolean;
  trenchesJoined: number;
  bestFinish?: number;
  totalVolumeUsd: number;
  totalPnlUsd: number;
}

export interface Sponsorship {
  trenchId: string;
  sponsor: Address;
  name: string;
  logoUrl?: string;
  amountUsdc: number;
  fundingTxId: string;
}
