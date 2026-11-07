/**
 * Clans + identity (steps 11–13). Postgres is the write path and mirror; Arkiv holds the public
 * `trenches.clan`, `trenches.clan_member`, `trenches.clan_score` entities and the extended profile.
 */
import {
  CLAN_JOIN_XP,
  HANDLE_RE,
  MAX_CLAN_MEMBERS,
  TAG_RE,
  levelFor,
  newId,
  newInviteCode,
  xpFor,
  type Address,
  type Clan,
  type Profile,
} from "@trenches/core";
import { and, clanMembers, clanMemberships, clans, desc, entries, eq, inArray, isNull, leaderboard, profiles, sql, trenches, worldVerifications } from "@trenches/db";
import { z } from "zod";
import { log, services } from "./context.js";
import { ServiceError, badRequest, conflict, forbidden, notFound } from "./errors.js";
import { withArkivRetry } from "./trenches.js";

export const FEATURE_CLANS = process.env.FEATURE_CLANS !== "false";

export interface Identity {
  trader: Address;
  handle: string | null;
  title: string;
  level: number;
  xp: number;
  clanId: string | null;
  tag: string | null;
}

/** Handle / title / clan tag for a set of wallets (leaderboard rows, members tables). */
export async function identitiesFor(traders: string[]): Promise<Record<string, Identity>> {
  const out: Record<string, Identity> = {};
  if (!FEATURE_CLANS || traders.length === 0) return out;
  const { db } = services();
  const keys = [...new Set(traders.map((t) => t.toLowerCase()))];
  const rows = await db
    .select({ trader: profiles.trader, handle: profiles.handle, title: profiles.title, level: profiles.level, xp: profiles.xp, clanId: profiles.clanId, tag: clans.tag })
    .from(profiles)
    .leftJoin(clans, eq(clans.id, profiles.clanId))
    .where(inArray(profiles.trader, keys));
  for (const r of rows) out[r.trader] = { trader: r.trader as Address, handle: r.handle, title: r.title, level: r.level, xp: r.xp, clanId: r.clanId, tag: r.tag };
  return out;
}

/** Verified = joined at least one Trench through World ID (a world_verifications row). */
async function requireVerified(trader: Address): Promise<string> {
  const { db } = services();
  const [v] = await db.select({ nullifierHash: worldVerifications.nullifierHash }).from(worldVerifications).where(eq(worldVerifications.trader, trader.toLowerCase())).orderBy(desc(worldVerifications.verifiedAt)).limit(1);
  if (!v) throw forbidden("Join a battle and verify with World ID first.");
  return v.nullifierHash;
}

async function ensureProfileRow(trader: Address): Promise<void> {
  const { db } = services();
  await db.insert(profiles).values({ trader: trader.toLowerCase(), updatedAt: new Date().toISOString() }).onConflictDoNothing();
}

/* ---------- handle ---------- */

export async function setHandle(trader: Address, raw: unknown): Promise<Identity> {
  const { db } = services();
  const handle = z.string().trim().parse((raw as { handle?: unknown })?.handle ?? "");
  if (!HANDLE_RE.test(handle)) throw badRequest("Handle must be 3–16 letters, numbers or underscores.", "handle");
  const nullifierHash = await requireVerified(trader);
  await ensureProfileRow(trader);
  const [mine] = await db.select().from(profiles).where(eq(profiles.trader, trader.toLowerCase())).limit(1);
  if (mine?.handle) throw conflict("Your handle is already set.");
  try {
    await db.update(profiles).set({ handle, nullifierHash, updatedAt: new Date().toISOString() }).where(eq(profiles.trader, trader.toLowerCase()));
  } catch (e) {
    if (/unique|duplicate/i.test((e as Error).message)) throw conflict("Handle taken.");
    throw e;
  }
  await syncProfileToArkiv(trader).catch((e) => log.warn({ trader, err: (e as Error).message }, "profile arkiv sync failed"));
  return (await identitiesFor([trader]))[trader.toLowerCase()]!;
}

/* ---------- clans ---------- */

export const createClanSchema = z.object({
  name: z.string().trim().min(3, "Clan name needs at least 3 characters.").max(40),
  tag: z.string().trim().toUpperCase(),
  description: z.string().trim().max(300).default(""),
  open: z.boolean().default(true),
});

export async function createClan(leader: Address, raw: unknown): Promise<Clan & { arkivTx?: string; arkivError?: string }> {
  const { db, arkiv } = services();
  const parsed = createClanSchema.safeParse(raw);
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "Invalid input.", String(parsed.error.issues[0]?.path?.[0] ?? ""));
  const input = parsed.data;
  if (!TAG_RE.test(input.tag)) throw badRequest("Tag must be 3–5 letters or numbers.", "tag");
  await requireVerified(leader);
  await ensureProfileRow(leader);
  const [existing] = await db.select({ clanId: clanMembers.clanId, tag: clans.tag }).from(clanMembers).innerJoin(clans, eq(clans.id, clanMembers.clanId)).where(eq(clanMembers.trader, leader.toLowerCase())).limit(1);
  if (existing) throw conflict(`You're already in [${existing.tag}].`);
  const now = new Date().toISOString();
  const clan: Clan = { id: newId(), name: input.name, tag: input.tag, description: input.description, leader: leader.toLowerCase() as Address, open: input.open, ...(input.open ? {} : { inviteCode: newInviteCode() }), memberCount: 1, createdAt: now };
  try {
    await db.transaction(async (tx) => {
      await tx.insert(clans).values({ id: clan.id, name: clan.name, tag: clan.tag, description: clan.description, leader: clan.leader, open: clan.open, inviteCode: clan.inviteCode ?? null, memberCount: 1, createdAt: now });
      await tx.insert(clanMembers).values({ trader: clan.leader, clanId: clan.id, joinedAt: now });
      await tx.insert(clanMemberships).values({ clanId: clan.id, trader: clan.leader, joinedAt: now });
      await tx.update(profiles).set({ clanId: clan.id, updatedAt: now }).where(eq(profiles.trader, clan.leader));
    });
  } catch (e) {
    if (/clans_tag_idx|unique|duplicate/i.test((e as Error).message)) throw conflict("Tag taken.");
    throw e;
  }
  const out: Clan & { arkivTx?: string; arkivError?: string } = { ...clan };
  try {
    const r = await withArkivRetry("createClan", () => arkiv.createClan(clan));
    await db.update(clans).set({ arkivEntityKey: r.entityKey }).where(eq(clans.id, clan.id));
    const m = await withArkivRetry("createClanMember", () => arkiv.createClanMember({ clanId: clan.id, trader: clan.leader, joinedAt: now }));
    await db.update(clanMembers).set({ arkivEntityKey: m.entityKey }).where(eq(clanMembers.trader, clan.leader));
    out.arkivTx = r.txHash;
  } catch (e) {
    out.arkivError = (e as Error).message;
    log.error({ clanId: clan.id, err: out.arkivError }, "arkiv clan write failed");
  }
  await recomputeXp(leader).catch(() => undefined);
  return out;
}

export async function joinClan(trader: Address, clanId: string, inviteCode?: string): Promise<{ clan: Clan; arkivTx?: string; arkivError?: string }> {
  const { db, arkiv } = services();
  await requireVerified(trader);
  await ensureProfileRow(trader);
  const [clanRow] = await db.select().from(clans).where(eq(clans.id, clanId)).limit(1);
  if (!clanRow) throw notFound("That Trench doesn't exist.");
  const [existing] = await db.select({ tag: clans.tag }).from(clanMembers).innerJoin(clans, eq(clans.id, clanMembers.clanId)).where(eq(clanMembers.trader, trader.toLowerCase())).limit(1);
  if (existing) throw conflict(`You're already in [${existing.tag}].`);
  if (!clanRow.open && (inviteCode ?? "").trim() !== clanRow.inviteCode) throw forbidden("That invite code isn't right.");
  if (clanRow.memberCount >= MAX_CLAN_MEMBERS) throw conflict("This Trench is full.");
  const now = new Date().toISOString();
  await db.transaction(async (tx) => {
    await tx.insert(clanMembers).values({ trader: trader.toLowerCase(), clanId, joinedAt: now });
    await tx.insert(clanMemberships).values({ clanId, trader: trader.toLowerCase(), joinedAt: now });
    await tx.update(clans).set({ memberCount: sql`${clans.memberCount} + 1` }).where(eq(clans.id, clanId));
    await tx.update(profiles).set({ clanId, updatedAt: now }).where(eq(profiles.trader, trader.toLowerCase()));
  });
  const [after] = await db.select().from(clans).where(eq(clans.id, clanId)).limit(1);
  const clan = toClan(after!);
  const out: { clan: Clan; arkivTx?: string; arkivError?: string } = { clan };
  try {
    const m = await withArkivRetry("createClanMember", () => arkiv.createClanMember({ clanId, trader: trader.toLowerCase() as Address, joinedAt: now }));
    await db.update(clanMembers).set({ arkivEntityKey: m.entityKey }).where(eq(clanMembers.trader, trader.toLowerCase()));
    if (after!.arkivEntityKey) await withArkivRetry("patchClan", () => arkiv.patchClan(after!.arkivEntityKey as `0x${string}`, { memberCount: after!.memberCount }));
    out.arkivTx = m.txHash;
  } catch (e) {
    out.arkivError = (e as Error).message;
  }
  await recomputeXp(trader).catch(() => undefined);
  return out;
}

/**
 * Anyone may leave. The membership row is closed (left_at = now) so past contributions stay with this
 * Trench; future ones go to the next one. A leaving leader hands leadership to the longest-standing
 * member; the last member leaving deletes the Trench.
 */
export async function leaveClan(trader: Address): Promise<{ left: boolean; newLeader?: Address; deleted?: boolean }> {
  const { db, arkiv } = services();
  const key = trader.toLowerCase();
  const [m] = await db.select().from(clanMembers).where(eq(clanMembers.trader, key)).limit(1);
  if (!m) return { left: false };
  const [clanRow] = await db.select().from(clans).where(eq(clans.id, m.clanId)).limit(1);
  if (!clanRow) return { left: false };
  const now = new Date().toISOString();
  const others = (await db.select().from(clanMembers).where(and(eq(clanMembers.clanId, m.clanId), sql`${clanMembers.trader} <> ${key}`))).sort((a, b) => Date.parse(String(a.joinedAt)) - Date.parse(String(b.joinedAt)));
  const newLeader = clanRow.leader === key ? (others[0]?.trader as Address | undefined) : undefined;
  const deleted = others.length === 0;
  await db.transaction(async (tx) => {
    await tx.delete(clanMembers).where(eq(clanMembers.trader, key));
    await tx.update(clanMemberships).set({ leftAt: now }).where(and(eq(clanMemberships.trader, key), eq(clanMemberships.clanId, m.clanId), isNull(clanMemberships.leftAt)));
    await tx.update(profiles).set({ clanId: null, updatedAt: now }).where(eq(profiles.trader, key));
    if (deleted) {
      await tx.delete(clans).where(eq(clans.id, m.clanId));
    } else {
      await tx.update(clans).set({ memberCount: sql`greatest(${clans.memberCount} - 1, 0)`, ...(newLeader ? { leader: newLeader } : {}) }).where(eq(clans.id, m.clanId));
    }
  });
  try {
    if (m.arkivEntityKey) await arkiv.deleteEntity(m.arkivEntityKey as `0x${string}`);
    if (clanRow.arkivEntityKey) {
      if (deleted) await arkiv.deleteEntity(clanRow.arkivEntityKey as `0x${string}`);
      else await arkiv.patchClan(clanRow.arkivEntityKey as `0x${string}`, { memberCount: Math.max(0, clanRow.memberCount - 1) });
    }
  } catch (e) {
    log.warn({ trader, err: (e as Error).message }, "arkiv leave sync failed");
  }
  await recomputeXp(trader).catch(() => undefined);
  return { left: true, ...(newLeader ? { newLeader } : {}), ...(deleted ? { deleted: true } : {}) };
}

export function toClan(r: typeof clans.$inferSelect): Clan {
  return { id: r.id, name: r.name, tag: r.tag, description: r.description, leader: r.leader as Address, open: r.open, ...(r.inviteCode ? { inviteCode: r.inviteCode } : {}), memberCount: r.memberCount, createdAt: new Date(r.createdAt).toISOString() };
}

export async function clanByTag(tag: string) {
  const { db } = services();
  const [r] = await db.select().from(clans).where(eq(clans.tag, tag.toUpperCase())).limit(1);
  return r ?? null;
}

export async function clanOf(trader: Address): Promise<(Clan & { isLeader: boolean }) | null> {
  const { db } = services();
  const [r] = await db.select({ c: clans }).from(clanMembers).innerJoin(clans, eq(clans.id, clanMembers.clanId)).where(eq(clanMembers.trader, trader.toLowerCase())).limit(1);
  return r ? { ...toClan(r.c), isLeader: r.c.leader === trader.toLowerCase() } : null;
}

export async function isClanMember(trader: Address, clanId: string): Promise<boolean> {
  const { db } = services();
  const [r] = await db.select({ trader: clanMembers.trader }).from(clanMembers).where(and(eq(clanMembers.trader, trader.toLowerCase()), eq(clanMembers.clanId, clanId))).limit(1);
  return !!r;
}

/* ---------- XP ---------- */

/** XP from volume (all fills), podiums (settled battles) and clan membership; level/title derived. */
export async function recomputeXp(trader: Address): Promise<Identity | null> {
  if (!FEATURE_CLANS) return null;
  const { db } = services();
  const key = trader.toLowerCase();
  const [agg] = await db
    .select({
      volume: sql<string>`coalesce((select sum(f.qty * f.price_usd) from fills f where f.trader = ${key}), 0)`,
      podiums: sql<string>`coalesce((select string_agg(l.rank::text, ',') from leaderboard l join trenches t on t.id = l.trench_id where l.trader = ${key} and t.status = 'settled' and l.rank <= 3), '')`,
      inClan: sql<boolean>`exists(select 1 from clan_members m where m.trader = ${key})`,
    })
    .from(sql`(select 1) as one`);
  const podiumRanks = (agg?.podiums ?? "").split(",").filter(Boolean).map(Number);
  const xp = xpFor({ volumeUsd: Number(agg?.volume ?? 0), podiumRanks, inClan: !!agg?.inClan });
  const lv = levelFor(xp);
  await ensureProfileRow(trader);
  await db.update(profiles).set({ xp, level: lv.level, title: lv.title, updatedAt: new Date().toISOString() }).where(eq(profiles.trader, key));
  await syncProfileToArkiv(trader).catch((e) => log.warn({ trader, err: (e as Error).message }, "profile arkiv sync failed"));
  return (await identitiesFor([trader]))[key] ?? null;
}

/** Recompute XP for every trader with a fill or a podium (worker, after fills and settlements). */
export async function recomputeXpAll(): Promise<number> {
  if (!FEATURE_CLANS) return 0;
  const { db } = services();
  const traders = await db.select({ trader: entries.trader }).from(entries).groupBy(entries.trader);
  let n = 0;
  for (const { trader } of traders) {
    try {
      await recomputeXp(trader as Address);
      n += 1;
    } catch (e) {
      log.warn({ trader, err: (e as Error).message }, "recomputeXp failed");
    }
  }
  return n;
}

/** Push the Postgres identity fields onto the Arkiv profile entity (keeps the step-4 fields). */
export async function syncProfileToArkiv(trader: Address): Promise<void> {
  const { db, arkiv } = services();
  const [p] = await db.select().from(profiles).where(eq(profiles.trader, trader.toLowerCase())).limit(1);
  if (!p) return;
  const existing = await arkiv.getProfile(trader);
  const [joined] = await db.select({ n: sql<number>`count(*)::int` }).from(entries).where(eq(entries.trader, trader.toLowerCase()));
  const next: Profile = {
    address: trader.toLowerCase() as Address,
    verifiedHuman: existing?.verifiedHuman ?? true,
    trenchesJoined: joined?.n ?? existing?.trenchesJoined ?? 0,
    ...(existing?.bestFinish !== undefined ? { bestFinish: existing.bestFinish } : {}),
    totalVolumeUsd: existing?.totalVolumeUsd ?? 0,
    totalPnlUsd: existing?.totalPnlUsd ?? 0,
    ...(p.handle ? { handle: p.handle } : {}),
    ...(p.clanId ? { clanId: p.clanId } : {}),
    xp: p.xp,
    level: p.level,
    title: p.title,
  };
  await withArkivRetry("upsertProfile", () => arkiv.upsertProfile(next));
}

export { ServiceError };
