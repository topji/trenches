import type { Fill, Entry } from "../src/types.js";

export const WETH = "0x4200000000000000000000000000000000000006" as const;
export const ZOLT = "0x1111111111111111111111111111111111111111" as const;
export const DOGE = "0x2222222222222222222222222222222222222222" as const; // not allowed

export const A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
export const B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;
export const C = "0xcccccccccccccccccccccccccccccccccccccccc" as const;

export const trench = {
  id: "01TRENCH",
  startAt: "2026-11-06T10:00:00.000Z",
  endAt: "2026-11-06T12:00:00.000Z",
  allowedAssets: [
    { chainId: 8453, address: WETH, symbol: "WETH" },
    { chainId: 8453, address: ZOLT, symbol: "ZOLT" },
  ],
};

export const entries: Entry[] = [
  { trenchId: trench.id, trader: A, worldIdNullifier: "h1", joinedAt: "2026-11-06T09:00:00.000Z" },
  { trenchId: trench.id, trader: B, worldIdNullifier: "h2", joinedAt: "2026-11-06T09:30:00.000Z" },
  { trenchId: trench.id, trader: C, worldIdNullifier: "h3", joinedAt: "2026-11-06T09:45:00.000Z" },
];

let n = 0;
export function fill(p: Partial<Fill> & Pick<Fill, "trader" | "asset" | "side" | "qty" | "priceUsd">): Fill {
  n += 1;
  return {
    id: `F${String(n).padStart(3, "0")}`,
    orderId: `O${n}`,
    trenchId: trench.id,
    feeUsd: 0,
    txHash: `0x${n.toString(16).padStart(64, "0")}`,
    filledAt: `2026-11-06T10:${String(n).padStart(2, "0")}:00.000Z`,
    ...p,
  };
}
