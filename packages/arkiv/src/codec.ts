import { hexToString, stringToBytes, type Hex } from "viem";

/** JSON payload → bytes column (bare Uint8Array on write; hex on read). */
export function encodeJson(value: unknown): Uint8Array {
  return stringToBytes(JSON.stringify(value));
}

export function decodeJson<T>(hex: Hex | string): T {
  return JSON.parse(hexToString(hex as Hex)) as T;
}

/** ISO string → u64 epoch seconds (bigint for the u64 column). */
export function isoToU64(iso: string): bigint {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error(`Bad ISO timestamp: ${iso}`);
  return BigInt(Math.floor(ms / 1000));
}

export function u64ToIso(secs: bigint | number): string {
  return new Date(Number(secs) * 1000).toISOString();
}

/** Numbers → dec("...") strings. Keeps ≤ 6 dp to match our money model. */
export function toDec(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`Bad decimal: ${n}`);
  return n.toFixed(6).replace(/\.?0+$/, "") || "0";
}
