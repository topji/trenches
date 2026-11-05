import { ulid } from "ulid";
import { randomBytes } from "node:crypto";

export function newId(): string {
  return ulid();
}

const SLUG_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export function randomSuffix(len = 4): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += SLUG_ALPHABET[bytes[i]! % SLUG_ALPHABET.length];
  return out;
}

/** "ETH Week Trench" → "eth-week-trench-k3x9" */
export function slugify(name: string, suffix = randomSuffix()): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return `${base || "trench"}-${suffix}`;
}

const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

/** 8-char URL-safe invite code. */
export function newInviteCode(): string {
  const bytes = randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) out += INVITE_ALPHABET[bytes[i]! % INVITE_ALPHABET.length];
  return out;
}
