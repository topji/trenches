/**
 * Postgres mirror of the domain (TECH_SPEC §3.4). Arkiv is the public source of truth; these tables
 * exist for joins, fill ingestion, job state and the secrets Arkiv must never hold (escrow keys,
 * nullifier hashes, fee ledger). Money is numeric(18,6) as strings (DECISIONS.md).
 */
import { index, integer, jsonb, numeric, pgTable, primaryKey, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

const money = (name: string) => numeric(name, { precision: 18, scale: 6 });
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });

export const trenches = pgTable(
  "trenches",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    adminAddress: text("admin_address").notNull(),
    startAt: ts("start_at").notNull(),
    endAt: ts("end_at").notNull(),
    allowedAssets: jsonb("allowed_assets").notNull().$type<{ chainId: number; address: `0x${string}`; symbol: string }[]>(),
    prizePoolUsdc: money("prize_pool_usdc").notNull(),
    prizeSplit: jsonb("prize_split").notNull().$type<number[]>(),
    entryRule: text("entry_rule").notNull().default("open"),
    inviteCode: text("invite_code"),
    adminFeeShareBps: integer("admin_fee_share_bps").notNull().default(5000),
    status: text("status").notNull().default("draft"),
    escrowAccountId: text("escrow_account_id").notNull(),
    topicId: text("topic_id").notNull(),
    fundingTxId: text("funding_tx_id"),
    payoutTxId: text("payout_tx_id"),
    scheduleId: text("schedule_id"),
    sponsor: jsonb("sponsor").$type<{ address: `0x${string}`; name: string; logoUrl?: string }>(),
    arkivEntityKey: text("arkiv_entity_key"),
    arkivTxHash: text("arkiv_tx_hash"),
    createdAt: ts("created_at").notNull(),
    updatedAt: ts("updated_at").notNull(),
  },
  (t) => ({
    slugIdx: uniqueIndex("trenches_slug_idx").on(t.slug),
    statusIdx: index("trenches_status_idx").on(t.status),
    adminIdx: index("trenches_admin_idx").on(t.adminAddress),
  }),
);

/** Per-Trench escrow key, AES-256-GCM envelope (packages/hedera keys.ts). Never leaves the server. */
export const escrowKeys = pgTable("escrow_keys", {
  trenchId: text("trench_id").primaryKey().references(() => trenches.id),
  accountId: text("account_id").notNull(),
  encryptedKey: text("encrypted_key").notNull(),
  publicKeyDer: text("public_key_der").notNull(),
  createdAt: ts("created_at").notNull(),
});

export const entries = pgTable(
  "entries",
  {
    trenchId: text("trench_id").notNull().references(() => trenches.id),
    trader: text("trader").notNull(),
    nullifierHash: text("nullifier_hash").notNull(),
    joinedAt: ts("joined_at").notNull(),
    arkivEntityKey: text("arkiv_entity_key"),
  },
  (t) => ({ pk: primaryKey({ columns: [t.trenchId, t.trader] }) }),
);

/** Uniqueness key for "one human per Trench" (F2.4). */
export const worldVerifications = pgTable(
  "world_verifications",
  {
    id: serial("id").primaryKey(),
    trenchId: text("trench_id").notNull().references(() => trenches.id),
    nullifierHash: text("nullifier_hash").notNull(),
    trader: text("trader").notNull(),
    verifiedAt: ts("verified_at").notNull(),
  },
  (t) => ({ uniq: uniqueIndex("world_verifications_trench_nullifier_idx").on(t.trenchId, t.nullifierHash) }),
);

export const orders = pgTable(
  "orders",
  {
    id: text("id").primaryKey(),
    flashOrderId: text("flash_order_id"),
    trenchId: text("trench_id").notNull().references(() => trenches.id),
    trader: text("trader").notNull(),
    type: text("type").notNull(),
    asset: text("asset").notNull(),
    side: text("side").notNull(),
    params: jsonb("params").notNull().$type<Record<string, unknown>>(),
    status: text("status").notNull().default("pending"),
    error: text("error"),
    createdAt: ts("created_at").notNull(),
    updatedAt: ts("updated_at").notNull(),
  },
  (t) => ({
    trenchIdx: index("orders_trench_idx").on(t.trenchId),
    statusIdx: index("orders_status_idx").on(t.status),
    flashIdx: uniqueIndex("orders_flash_id_idx").on(t.flashOrderId),
  }),
);

/** Flash quotes we issued for a trader, so the submit step trusts server-side fields (fee, asset, qty), not the client. */
export const quotes = pgTable(
  "quotes",
  {
    id: text("id").primaryKey(), // Flash quoteId
    trenchId: text("trench_id").notNull().references(() => trenches.id),
    trader: text("trader").notNull(),
    type: text("type").notNull(),
    asset: text("asset").notNull(),
    symbol: text("symbol").notNull(),
    side: text("side").notNull(),
    params: jsonb("params").notNull().$type<Record<string, unknown>>(),
    request: jsonb("request").notNull().$type<Record<string, unknown>>(), // Flash QuoteRequest as sent
    summary: jsonb("summary").notNull().$type<Record<string, unknown>>(), // from/to/fees for the UI + order row
    orderTypedData: text("order_typed_data"),
    permitTypedData: text("permit_typed_data"),
    createdAt: ts("created_at").notNull(),
  },
  (t) => ({ traderIdx: index("quotes_trader_idx").on(t.trenchId, t.trader) }),
);

export const fills = pgTable(
  "fills",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id").notNull().references(() => orders.id),
    trenchId: text("trench_id").notNull().references(() => trenches.id),
    trader: text("trader").notNull(),
    asset: text("asset").notNull(),
    side: text("side").notNull(),
    qty: numeric("qty", { precision: 36, scale: 18 }).notNull(),
    priceUsd: money("price_usd").notNull(),
    feeUsd: money("fee_usd").notNull(),
    txHash: text("tx_hash").notNull(),
    filledAt: ts("filled_at").notNull(),
  },
  (t) => ({ trenchIdx: index("fills_trench_idx").on(t.trenchId), txIdx: uniqueIndex("fills_tx_idx").on(t.txHash, t.orderId) }),
);

export const leaderboard = pgTable(
  "leaderboard",
  {
    trenchId: text("trench_id").notNull().references(() => trenches.id),
    trader: text("trader").notNull(),
    rank: integer("rank").notNull(),
    pnlUsd: money("pnl_usd").notNull(),
    roiPct: money("roi_pct").notNull(),
    volumeUsd: money("volume_usd").notNull(),
    winRate: money("win_rate").notNull(),
    fills: integer("fills").notNull(),
    computedAt: ts("computed_at").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.trenchId, t.trader] }) }),
);

export const payouts = pgTable(
  "payouts",
  {
    trenchId: text("trench_id").notNull().references(() => trenches.id),
    trader: text("trader").notNull(),
    rank: integer("rank").notNull(),
    amountUsdc: money("amount_usdc").notNull(),
    hederaTxId: text("hedera_tx_id").notNull(),
    paidAt: ts("paid_at").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.trenchId, t.trader] }) }),
);

export const feeLedger = pgTable("fee_ledger", {
  id: serial("id").primaryKey(),
  trenchId: text("trench_id").notNull().references(() => trenches.id),
  fillId: text("fill_id").notNull().references(() => fills.id),
  admin: text("admin").notNull(),
  platformUsd: money("platform_usd").notNull(),
  adminUsd: money("admin_usd").notNull(),
  createdAt: ts("created_at").notNull(),
});

/** Every HCS message we submit, so the UI can list the results log without a Mirror round-trip. */
export const hcsMessages = pgTable(
  "hcs_messages",
  {
    id: serial("id").primaryKey(),
    trenchId: text("trench_id").notNull().references(() => trenches.id),
    topicId: text("topic_id").notNull(),
    event: text("event").notNull(),
    sequenceNumber: integer("sequence_number").notNull(),
    txId: text("tx_id").notNull(),
    at: ts("at").notNull(),
  },
  (t) => ({ trenchIdx: index("hcs_messages_trench_idx").on(t.trenchId) }),
);

/** RP-context nonces we signed (World ID). Single use; the only thing WORLD_MOCK trusts. */
export const issuedNonces = pgTable("issued_nonces", {
  nonce: text("nonce").primaryKey(),
  action: text("action").notNull(),
  trenchId: text("trench_id"),
  expiresAt: ts("expires_at").notNull(),
  consumedAt: ts("consumed_at"),
  createdAt: ts("created_at").notNull(),
});

export const jobs = pgTable("jobs", {
  name: text("name").primaryKey(),
  lastRunAt: ts("last_run_at"),
  cursor: text("cursor"),
});

export type TrenchRow = typeof trenches.$inferSelect;
export type NewTrenchRow = typeof trenches.$inferInsert;
export type OrderRow = typeof orders.$inferSelect;
export type FillRow = typeof fills.$inferSelect;
