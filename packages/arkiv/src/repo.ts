/**
 * Entity repository: domain types ↔ Arkiv rows. Every public page reads through these queries.
 * Queries: docs/integrations/arkiv.md §4 (no IN / NOT → or(eq, eq); one orderBy; limit ≤ 100).
 */
import type { Entry, LeaderboardRow, Payout, Profile, Sponsorship, Trench, TrenchStatus, Address } from "@trenches/core";
import { asc, desc, eq, or } from "@arkiv-network/sdk/query";
import { addr, dec, u64 } from "@arkiv-network/sdk/schema";
import type { Hex } from "viem";
import { decodeJson, encodeJson, isoToU64, toDec, u64ToIso } from "./codec.js";
import { expiryForTrench, expiryLong } from "./expiry.js";
import type { ArkivPublicClient, ArkivWalletClient } from "./client.js";
import { EntrySchema, LeaderboardSchema, PayoutSchema, ProfileSchema, SponsorshipSchema, TrenchSchema } from "./schemas.js";

export interface WriteResult {
  entityKey: Hex;
  txHash: Hex;
}

/* ---------- value mappers (pure, unit-tested) ---------- */

export function trenchToValues(t: Trench) {
  const [a1, a2, a3] = t.allowedAssets.map((a) => a.symbol.toUpperCase());
  if (!a1) throw new Error("Trench needs at least one allowed asset");
  return {
    trenchId: t.id,
    slug: t.slug,
    status: t.status,
    admin: addr(t.adminAddress),
    asset1: a1,
    ...(a2 ? { asset2: a2 } : {}),
    ...(a3 ? { asset3: a3 } : {}),
    startAt: u64(isoToU64(t.startAt)),
    endAt: u64(isoToU64(t.endAt)),
    poolUsdc: dec(toDec(t.prizePoolUsdc)),
    name: t.name.slice(0, 60),
    payload: encodeJson(t),
  };
}

export function lbToValues(r: LeaderboardRow) {
  return {
    trenchId: r.trenchId,
    trader: addr(r.trader),
    rank: r.rank,
    pnlUsd: dec(toDec(r.pnlUsd)),
    roiPct: dec(toDec(r.roiPct)),
    volumeUsd: dec(toDec(r.volumeUsd)),
    winRate: dec(toDec(r.winRate)),
    fills: r.fills,
    computedAt: u64(isoToU64(r.computedAt)),
  };
}

export function lbFromRow(row: {
  trenchId: { value: string }; trader: { value: string }; rank: { value: number }; pnlUsd: { value: string };
  roiPct: { value: string }; volumeUsd: { value: string }; winRate: { value: string }; fills: { value: number }; computedAt: { value: bigint };
}): LeaderboardRow {
  return {
    trenchId: row.trenchId.value,
    trader: row.trader.value as Address,
    rank: row.rank.value,
    pnlUsd: Number(row.pnlUsd.value),
    roiPct: Number(row.roiPct.value),
    volumeUsd: Number(row.volumeUsd.value),
    winRate: Number(row.winRate.value),
    fills: row.fills.value,
    computedAt: u64ToIso(row.computedAt.value),
  };
}

export function profileToValues(p: Profile) {
  return {
    address: addr(p.address),
    verifiedHuman: p.verifiedHuman,
    trenchesJoined: p.trenchesJoined,
    ...(p.bestFinish !== undefined ? { bestFinish: p.bestFinish } : {}),
    totalVolumeUsd: dec(toDec(p.totalVolumeUsd)),
    totalPnlUsd: dec(toDec(p.totalPnlUsd)),
  };
}

/** `status IN (...)` is not supported by the query language; build the OR. */
export function statusFilter(statuses: TrenchStatus[]) {
  const exprs = statuses.map((s) => eq("status", s));
  return exprs.length === 1 ? exprs[0]! : or(...exprs);
}

/* ---------- repository ---------- */

export class ArkivRepo {
  constructor(
    private readonly pub: ArkivPublicClient,
    private readonly wallet: ArkivWalletClient | null,
    /** The writer wallet address; readers filter on `$owner` so foreign rows with our tag are ignored. */
    public readonly writer: Hex | null,
  ) {}

  private w(): ArkivWalletClient {
    if (!this.wallet) throw new Error("Arkiv writer not configured (ARKIV_WRITER_KEY)");
    return this.wallet;
  }

  private owned<T extends { ownedBy(a: Hex): T }>(q: T): T {
    return this.writer ? q.ownedBy(this.writer) : q;
  }

  /* Trench */

  async createTrench(t: Trench): Promise<WriteResult> {
    const r = await this.w().createEntity(TrenchSchema, trenchToValues(t), { expiration: expiryForTrench(t.endAt) });
    return { entityKey: r.entityKey, txHash: r.txHash };
  }

  async findTrenchKey(trenchId: string): Promise<Hex | null> {
    const r = await this.owned(this.pub.select({ $key: true }).from(TrenchSchema).where(eq("trenchId", trenchId)).limit(1)).fetch();
    return r.entities[0]?.$key ?? null;
  }

  /** Update in place (patchEntity): status + full payload. */
  async updateTrench(t: Trench, entityKey?: Hex | null): Promise<WriteResult> {
    const key = entityKey ?? (await this.findTrenchKey(t.id));
    if (!key) throw new Error(`Trench ${t.id} not on Arkiv`);
    const r = await this.w().patchEntity(TrenchSchema, key, { set: { status: t.status, poolUsdc: dec(toDec(t.prizePoolUsdc)), payload: encodeJson(t) } });
    return { entityKey: r.entityKey, txHash: r.txHash };
  }

  async getTrenchBySlug(slug: string): Promise<(Trench & { entityKey: Hex }) | null> {
    const r = await this.owned(this.pub.select({ $key: true, payload: true }).from(TrenchSchema).where(eq("slug", slug)).limit(1)).fetch();
    const row = r.entities[0];
    return row ? { ...decodeJson<Trench>(row.payload.value), entityKey: row.$key } : null;
  }

  async getTrenchById(trenchId: string): Promise<(Trench & { entityKey: Hex }) | null> {
    const r = await this.owned(this.pub.select({ $key: true, payload: true }).from(TrenchSchema).where(eq("trenchId", trenchId)).limit(1)).fetch();
    const row = r.entities[0];
    return row ? { ...decodeJson<Trench>(row.payload.value), entityKey: row.$key } : null;
  }

  /** Discovery: status filter (+ optional asset symbol), newest start first; sort by pool in JS. */
  async listTrenches(opts: { statuses: TrenchStatus[]; asset?: string; limit?: number } ): Promise<(Trench & { entityKey: Hex })[]> {
    // Repeated .where() calls AND together; keeps the schema-typed predicate path.
    let q = this.pub.select({ $key: true, payload: true }).from(TrenchSchema).where(statusFilter(opts.statuses));
    if (opts.asset) {
      const sym = opts.asset.toUpperCase();
      q = q.where(or(eq("asset1", sym), eq("asset2", sym), eq("asset3", sym)));
    }
    q = q.orderBy(desc("startAt")).limit(Math.min(opts.limit ?? 50, 100));
    const r = await this.owned(q).fetch();
    return r.entities.map((row) => ({ ...decodeJson<Trench>(row.payload.value), entityKey: row.$key }));
  }

  async listTrenchesByAdmin(admin: Address): Promise<(Trench & { entityKey: Hex })[]> {
    const r = await this.owned(this.pub.select({ $key: true, payload: true }).from(TrenchSchema).where(eq("admin", addr(admin))).orderBy(desc("startAt")).limit(100)).fetch();
    return r.entities.map((row) => ({ ...decodeJson<Trench>(row.payload.value), entityKey: row.$key }));
  }

  /* Entry */

  async createEntry(e: Entry, trenchEndAt: string): Promise<WriteResult> {
    const { worldIdNullifier: _n, ...publicEntry } = e;
    void _n;
    const r = await this.w().createEntity(
      EntrySchema,
      { trenchId: e.trenchId, trader: addr(e.trader), joinedAt: u64(isoToU64(e.joinedAt)), payload: encodeJson(publicEntry) },
      { expiration: expiryForTrench(trenchEndAt) },
    );
    return { entityKey: r.entityKey, txHash: r.txHash };
  }

  async listEntries(trenchId: string): Promise<Omit<Entry, "worldIdNullifier">[]> {
    const r = await this.owned(this.pub.select({ trenchId: true, trader: true, joinedAt: true }).from(EntrySchema).where(eq("trenchId", trenchId)).orderBy(asc("joinedAt")).limit(100)).fetch();
    return r.entities.map((row) => ({ trenchId: row.trenchId.value, trader: row.trader.value as Address, joinedAt: u64ToIso(row.joinedAt.value) }));
  }

  /* Leaderboard */

  async getLeaderboard(trenchId: string): Promise<(LeaderboardRow & { entityKey: Hex })[]> {
    const r = await this.owned(this.pub.select().from(LeaderboardSchema).where(eq("trenchId", trenchId)).orderBy(asc("rank")).limit(100)).fetch();
    return r.entities.map((row) => ({ ...lbFromRow(row), entityKey: row.$key }));
  }

  /**
   * Rewrite the board atomically: patch rows whose trader already has an entity, create the rest,
   * delete rows for traders no longer present. One executeBatch → one tx.
   */
  async upsertLeaderboard(trenchId: string, rows: LeaderboardRow[], trenchEndAt: string): Promise<{ txHash: Hex; created: number; patched: number; deleted: number }> {
    const existing = await this.getLeaderboard(trenchId);
    const byTrader = new Map(existing.map((e) => [e.trader.toLowerCase(), e.entityKey]));
    const seen = new Set<string>();
    const creates: { schema: typeof LeaderboardSchema; values: ReturnType<typeof lbToValues>; expiration: ReturnType<typeof expiryForTrench> }[] = [];
    const patches: { schema: typeof LeaderboardSchema; entityKey: Hex; set: ReturnType<typeof lbToValues> }[] = [];
    for (const row of rows) {
      const k = row.trader.toLowerCase();
      seen.add(k);
      const key = byTrader.get(k);
      if (key) patches.push({ schema: LeaderboardSchema, entityKey: key, set: lbToValues(row) });
      else creates.push({ schema: LeaderboardSchema, values: lbToValues(row), expiration: expiryForTrench(trenchEndAt) });
    }
    const deletes = existing.filter((e) => !seen.has(e.trader.toLowerCase())).map((e) => ({ entityKey: e.entityKey }));
    if (!creates.length && !patches.length && !deletes.length) return { txHash: "0x" as Hex, created: 0, patched: 0, deleted: 0 };
    const r = await this.w().executeBatch({ creates, patches, deletes });
    return { txHash: r.txHash, created: creates.length, patched: patches.length, deleted: deletes.length };
  }

  async listLeaderboardRowsForTrader(trader: Address): Promise<LeaderboardRow[]> {
    const r = await this.owned(this.pub.select().from(LeaderboardSchema).where(eq("trader", addr(trader))).orderBy(desc("computedAt")).limit(100)).fetch();
    return r.entities.map(lbFromRow);
  }

  /* Payouts */

  async createPayouts(payouts: Payout[]): Promise<{ txHash: Hex; entityKeys: Hex[] }> {
    if (!payouts.length) return { txHash: "0x" as Hex, entityKeys: [] };
    const r = await this.w().executeBatch({
      creates: payouts.map((p) => ({
        schema: PayoutSchema,
        values: { trenchId: p.trenchId, trader: addr(p.trader), rank: p.rank, amountUsdc: dec(toDec(p.amountUsdc)), hederaTxId: p.hederaTxId, paidAt: u64(isoToU64(p.paidAt)) },
        expiration: expiryLong(),
      })),
    });
    return { txHash: r.txHash, entityKeys: r.createdEntities };
  }

  async listPayouts(trenchId: string): Promise<Payout[]> {
    const r = await this.owned(this.pub.select().from(PayoutSchema).where(eq("trenchId", trenchId)).orderBy(asc("rank")).limit(100)).fetch();
    return r.entities.map((row) => ({
      trenchId: row.trenchId.value, trader: row.trader.value as Address, rank: row.rank.value,
      amountUsdc: Number(row.amountUsdc.value), hederaTxId: row.hederaTxId.value, paidAt: u64ToIso(row.paidAt.value),
    }));
  }

  /* Profile */

  async getProfile(address: Address): Promise<(Profile & { entityKey: Hex }) | null> {
    const r = await this.owned(this.pub.select().from(ProfileSchema).where(eq("address", addr(address))).limit(1)).fetch();
    const row = r.entities[0];
    if (!row) return null;
    return {
      entityKey: row.$key,
      address: row.address.value as Address,
      verifiedHuman: row.verifiedHuman.value,
      trenchesJoined: row.trenchesJoined.value,
      bestFinish: row.bestFinish?.value,
      totalVolumeUsd: Number(row.totalVolumeUsd.value),
      totalPnlUsd: Number(row.totalPnlUsd.value),
    };
  }

  async upsertProfile(p: Profile): Promise<WriteResult> {
    const existing = await this.getProfile(p.address);
    if (existing) {
      const r = await this.w().patchEntity(ProfileSchema, existing.entityKey, { set: profileToValues(p) });
      return { entityKey: r.entityKey, txHash: r.txHash };
    }
    const r = await this.w().createEntity(ProfileSchema, profileToValues(p), { expiration: expiryLong() });
    return { entityKey: r.entityKey, txHash: r.txHash };
  }

  /* Sponsorship */

  async createSponsorship(s: Sponsorship, trenchEndAt: string): Promise<WriteResult> {
    const r = await this.w().createEntity(
      SponsorshipSchema,
      { trenchId: s.trenchId, sponsor: addr(s.sponsor), name: s.name.slice(0, 60), amountUsdc: dec(toDec(s.amountUsdc)), fundingTxId: s.fundingTxId, payload: encodeJson(s) },
      { expiration: expiryForTrench(trenchEndAt) },
    );
    return { entityKey: r.entityKey, txHash: r.txHash };
  }

  async getSponsorship(trenchId: string): Promise<Sponsorship | null> {
    const r = await this.owned(this.pub.select({ payload: true }).from(SponsorshipSchema).where(eq("trenchId", trenchId)).limit(1)).fetch();
    const row = r.entities[0];
    return row ? decodeJson<Sponsorship>(row.payload.value) : null;
  }

  /** Delete by key (used by the smoke script's cleanup and by tests). */
  async deleteEntity(entityKey: Hex): Promise<Hex> {
    const r = await this.w().deleteEntity({ entityKey });
    return r.txHash;
  }

  async getBlockTiming() {
    return this.pub.getBlockTiming();
  }
}
