/**
 * Arkiv entity schemas for Trenches (SDK 1.0.x, docs/integrations/arkiv.md §3.1).
 * Named schemas are namespaced ("trenches.*") because the tag is global and anyone can write it;
 * readers trust rows by `$owner` = our writer wallet, not by the tag alone.
 *
 * Column notes: `str` ≤ 128 bytes, only `.indexed()` columns are filterable, `bytes` never indexed.
 * Timestamps are u64 epoch seconds (a bare number would be i32 and overflow). Money is `dec`.
 */
import { addr, bool, bytes, dec, defineSchema, i32, str, u64 } from "@arkiv-network/sdk/schema";

export const TrenchSchema = defineSchema("trenches.trench", {
  trenchId: str().indexed(),
  slug: str().indexed(),
  status: str().indexed(),
  admin: addr().indexed(),
  asset1: str().indexed(),
  asset2: str().indexed().optional(),
  asset3: str().indexed().optional(),
  startAt: u64().indexed(),
  endAt: u64().indexed(),
  poolUsdc: dec().indexed(),
  name: str(),
  payload: bytes(), // full Trench JSON
});

export const EntrySchema = defineSchema("trenches.entry", {
  trenchId: str().indexed(),
  trader: addr().indexed(),
  joinedAt: u64().indexed(),
  payload: bytes(), // Entry JSON minus the nullifier hash
});

export const LeaderboardSchema = defineSchema("trenches.lb", {
  trenchId: str().indexed(),
  trader: addr().indexed(),
  rank: i32().indexed(),
  pnlUsd: dec().indexed(),
  roiPct: dec(),
  volumeUsd: dec(),
  winRate: dec(),
  fills: i32(),
  computedAt: u64(),
});

export const PayoutSchema = defineSchema("trenches.payout", {
  trenchId: str().indexed(),
  trader: addr().indexed(),
  rank: i32().indexed(),
  amountUsdc: dec(),
  hederaTxId: str(),
  paidAt: u64(),
});

export const ProfileSchema = defineSchema("trenches.profile", {
  address: addr().indexed(),
  verifiedHuman: bool().indexed(),
  trenchesJoined: i32(),
  bestFinish: i32().optional(),
  totalVolumeUsd: dec(),
  totalPnlUsd: dec(),
  // identity layer (clans)
  handle: str().indexed().optional(),
  clanId: str().indexed().optional(),
  xp: i32().optional(),
  level: i32().optional(),
  title: str().optional(),
});

export const ClanSchema = defineSchema("trenches.clan", {
  clanId: str().indexed(),
  tag: str().indexed(),
  leader: addr().indexed(),
  name: str(),
  open: bool(),
  memberCount: i32(),
  createdAt: u64(),
});

export const ClanMemberSchema = defineSchema("trenches.clan_member", {
  clanId: str().indexed(),
  trader: addr().indexed(),
  joinedAt: u64(),
});

export const ClanScoreSchema = defineSchema("trenches.clan_score", {
  clanId: str().indexed(),
  season: str().indexed(),
  score: dec().indexed(),
  rank: i32().indexed(),
  podiums: i32(),
  members: i32(),
  computedAt: u64(),
});

export const SponsorshipSchema = defineSchema("trenches.sponsorship", {
  trenchId: str().indexed(),
  sponsor: addr().indexed(),
  name: str(),
  amountUsdc: dec(),
  fundingTxId: str(),
  payload: bytes(), // Sponsorship JSON (logoUrl may exceed 128 bytes)
});

export const SCHEMA_NAMES = {
  trench: "trenches.trench",
  entry: "trenches.entry",
  lb: "trenches.lb",
  payout: "trenches.payout",
  profile: "trenches.profile",
  sponsorship: "trenches.sponsorship",
  clan: "trenches.clan",
  clanMember: "trenches.clan_member",
  clanScore: "trenches.clan_score",
} as const;
