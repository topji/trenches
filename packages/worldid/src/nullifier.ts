import { createHash } from "node:crypto";

/** Hex or decimal nullifier → canonical decimal string (NUMERIC(78,0) friendly). */
export function canonicalNullifier(n: string): string {
  const s = n.trim();
  if (!/^(0x[0-9a-fA-F]+|\d+)$/.test(s)) throw new Error("Bad nullifier");
  return BigInt(s).toString(10);
}

/** DECISIONS.md: store sha256(nullifier + TRENCH_SALT), never the raw nullifier. */
export function nullifierKey(nullifier: string, salt: string): string {
  if (!salt) throw new Error("TRENCH_SALT is required");
  return createHash("sha256").update(canonicalNullifier(nullifier) + salt).digest("hex");
}

export { WORLD_ACTION, joinSignal } from "./signal.js";
