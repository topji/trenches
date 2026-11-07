import type { Trench, TrenchStatus } from "./types.js";

/**
 * Time-derived status for a funded Trench. Persisted status is the source of truth for
 * draft/funded/settled; this helper tells the worker when funded → live → ended should flip.
 */
export function deriveStatus(
  t: Pick<Trench, "status" | "startAt" | "endAt">,
  now: Date = new Date(),
): TrenchStatus {
  if (t.status === "draft" || t.status === "settled") return t.status;
  const n = now.getTime();
  if (n >= Date.parse(t.endAt)) return "ended";
  if (n >= Date.parse(t.startAt)) return "live";
  return "funded";
}

export const ENDING_SOON_MS = 10 * 60 * 1000;

export function isEndingSoon(t: Pick<Trench, "endAt">, now: Date = new Date()): boolean {
  const left = Date.parse(t.endAt) - now.getTime();
  return left > 0 && left < ENDING_SOON_MS;
}

export function canJoin(t: Pick<Trench, "status" | "startAt" | "endAt">, now = new Date()): { ok: true } | { ok: false; reason: string } {
  const s = deriveStatus(t, now);
  if (s === "draft") return { ok: false, reason: "This season hasn't been funded yet." };
  if (s === "ended" || s === "settled") return { ok: false, reason: "This season has ended." };
  return { ok: true };
}

export function canTrade(t: Pick<Trench, "status" | "startAt" | "endAt">, now = new Date()): { ok: true } | { ok: false; reason: string } {
  return deriveStatus(t, now) === "live" ? { ok: true } : { ok: false, reason: "This season isn't live." };
}
