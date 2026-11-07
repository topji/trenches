/**
 * F3: quote → sign (client, Privy) → submit → poll fills. Non-custodial: the server only builds the
 * quote with the platform fee, stores it, and forwards the trader's signature to Flash.
 */
import { canTrade, newId, splitFee, type Address, type Fill, type Order, type OrderType, type Side } from "@trenches/core";
import { and, desc, eq, feeLedger, fills, inArray, isNotNull, orders, quotes, rowToTrench } from "@trenches/db";
import {
  BASE,
  FlashError,
  buildQuoteRequest,
  orderParamsSchemas,
  toDomainFill,
  toDomainOrderStatus,
  toSubmitFields,
  type QuoteRequest,
} from "@trenches/flash";
import { z } from "zod";
import { log, services } from "./context.js";
import { ServiceError, badRequest, forbidden, notFound } from "./errors.js";
import { listEntryAddresses } from "./join.js";
import { recomputeLeaderboard } from "./leaderboard.js";
import { getTrenchRow } from "./trenches.js";

export const MIN_ORDER_USDC = 1;

export const quoteInputSchema = z.object({
  type: z.enum(["market", "dca", "bracket", "limit", "twap"]),
  asset: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  side: z.enum(["buy", "sell"]),
  /** USDC on buy; asset units on sell. */
  amount: z.string().regex(/^\d+(\.\d+)?$/),
  params: z.record(z.unknown()).default({}),
  /** Preview quotes are not persisted (the ticket's live quote line). */
  preview: z.boolean().optional(),
});
export type QuoteInput = z.infer<typeof quoteInputSchema>;

export interface QuoteSummary {
  quoteId: string;
  type: OrderType;
  side: Side;
  symbol: string;
  asset: Address;
  from: { asset: "target" | "contra"; amount: string; notional: string };
  to: { asset: "target" | "contra"; amount: string; notional: string };
  feeUsd: string;
  priceUsd: number;
  recommendedSlippage: string | null;
  needsApproval: boolean;
  approveTx: { to: string; data: string } | null;
  orderTypedData: string | null;
  permitTypedData: string | null;
  /** Bracket entry: the attached stop/take-profit order is a second EIP-712 signature. */
  bracket: { orderTypedData: string | null; permitTypedData: string | null; approveTx: { to: string; data: string } | null; deadline: string; signedMaxFromAmount: string; salt: string | null } | null;
  expiresAt: string;
}

function flashMessage(e: unknown): string {
  if (e instanceof FlashError) return e.message;
  return (e as Error).message ?? "Flash request failed";
}

/** Window + asset + entered checks, then a Flash quote with the platform fee attached. */
export async function quoteOrder(trenchId: string, trader: Address, raw: unknown): Promise<QuoteSummary> {
  const { db, flash, config } = services();
  if (!config.flashApiKey) throw new ServiceError(502, "Flash API key is not configured.");
  const parsed = quoteInputSchema.safeParse(raw);
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "Invalid order.", String(parsed.error.issues[0]?.path?.[0] ?? ""));
  const input = parsed.data;

  const row = await getTrenchRow(trenchId);
  if (!row) throw notFound();
  const trench = rowToTrench(row);
  const gate = canTrade(trench);
  if (!gate.ok) throw new ServiceError(409, gate.reason);
  const entrants = await listEntryAddresses(trenchId);
  if (!entrants.some((a) => a.toLowerCase() === trader.toLowerCase())) throw forbidden("Join the season before trading.");
  const allowed = trench.allowedAssets.find((a) => a.address.toLowerCase() === input.asset.toLowerCase());
  if (!allowed) throw badRequest(`${symbolFor(input.asset)} isn't an allowed asset in this Trench.`, "asset");
  if (input.side === "buy" && Number(input.amount) < MIN_ORDER_USDC) throw badRequest(`Minimum order is ${MIN_ORDER_USDC} USDC.`, "amount");

  const paramsSchema = orderParamsSchemas[input.type];
  const p = paramsSchema.safeParse(input.params);
  if (!p.success) throw badRequest(p.error.issues[0]?.message ?? "Invalid order parameters.", "params");

  let request: QuoteRequest;
  try {
    request = buildQuoteRequest({
      chainId: config.tradingChainId,
      asset: allowed.address,
      quoteAsset: BASE.USDC,
      side: input.side,
      qty: input.amount,
      type: input.type,
      params: p.data as Record<string, unknown>,
      funderAddress: trader,
      feeBps: config.feeBps,
    });
  } catch (e) {
    throw badRequest((e as Error).message, "params");
  }

  let q;
  try {
    q = await flash.quote(request);
  } catch (e) {
    log.warn({ trenchId, trader, err: flashMessage(e) }, "flash quote failed");
    throw new ServiceError(400, flashMessage(e));
  }
  if (input.side === "sell" && Number(q.from.notional) < MIN_ORDER_USDC) throw badRequest(`Minimum order is ${MIN_ORDER_USDC} USDC.`, "amount");

  const toAmt = Number(q.to.amount);
  const fromAmt = Number(q.from.amount);
  const priceUsd = input.side === "buy" ? (toAmt > 0 ? Number(q.to.notional) / toAmt : 0) : fromAmt > 0 ? Number(q.from.notional) / fromAmt : 0;
  const summary: QuoteSummary = {
    quoteId: q.quoteId,
    type: input.type,
    side: input.side,
    symbol: allowed.symbol,
    asset: allowed.address,
    from: q.from,
    to: q.to,
    feeUsd: q.fees.estimatedFeeNotional,
    priceUsd,
    recommendedSlippage: q.recommendedSlippage ?? null,
    needsApproval: !!q.evm?.approveTx,
    approveTx: q.evm?.approveTx ?? null,
    orderTypedData: q.evm?.orderTypedData ?? null,
    permitTypedData: q.evm?.permitTypedData ?? null,
    bracket: q.attachedBracket
      ? {
          orderTypedData: q.attachedBracket.evm?.orderTypedData ?? null,
          permitTypedData: q.attachedBracket.evm?.permitTypedData ?? null,
          approveTx: q.attachedBracket.evm?.approveTx ?? null,
          deadline: q.attachedBracket.deadline,
          signedMaxFromAmount: q.attachedBracket.signedMaxFromAmount,
          salt: q.attachedBracket.salt,
        }
      : null,
    expiresAt: new Date(Date.now() + 4 * 60_000).toISOString(),
  };

  if (!input.preview) {
    await db.insert(quotes).values({
      id: q.quoteId,
      trenchId,
      trader: trader.toLowerCase(),
      type: input.type,
      asset: allowed.address.toLowerCase(),
      symbol: allowed.symbol,
      side: input.side,
      params: p.data as Record<string, unknown>,
      request: request as unknown as Record<string, unknown>,
      summary: { from: q.from, to: q.to, feeUsd: summary.feeUsd, priceUsd, amount: input.amount, ...(summary.bracket ? { bracket: summary.bracket } : {}) },
      orderTypedData: summary.orderTypedData,
      permitTypedData: summary.permitTypedData,
      createdAt: new Date().toISOString(),
    });
  }
  return summary;
}

function symbolFor(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export const submitInputSchema = z.object({
  quoteId: z.string().min(1),
  userSignature: z.string().regex(/^0x[0-9a-fA-F]+$/),
  evmPermitSignature: z.string().regex(/^0x[0-9a-fA-F]+$/).optional(),
  bracketSignature: z.string().regex(/^0x[0-9a-fA-F]+$/).optional(),
  bracketPermitSignature: z.string().regex(/^0x[0-9a-fA-F]+$/).optional(),
});

export interface SubmittedOrder {
  order: Order;
  flashOrderId: string;
}

/** Forward the trader's signature with the server-side quote fields. A Flash rejection is stored as a failed order and returned verbatim. */
export async function submitOrder(trenchId: string, trader: Address, raw: unknown): Promise<SubmittedOrder> {
  const { db, flash } = services();
  const parsed = submitInputSchema.safeParse(raw);
  if (!parsed.success) throw badRequest("Invalid submission.");
  const input = parsed.data;

  const [q] = await db.select().from(quotes).where(and(eq(quotes.id, input.quoteId), eq(quotes.trenchId, trenchId), eq(quotes.trader, trader.toLowerCase()))).limit(1);
  if (!q) throw notFound("That quote has expired. Get a new one.");
  if (!q.orderTypedData) throw badRequest("Quote carries nothing to sign.");

  const row = await getTrenchRow(trenchId);
  if (!row) throw notFound();
  const gate = canTrade(rowToTrench(row));
  if (!gate.ok) throw new ServiceError(409, gate.reason);

  const request = q.request as unknown as QuoteRequest;
  const now = new Date().toISOString();
  const id = newId();
  const base = {
    id,
    trenchId,
    trader: trader.toLowerCase(),
    type: q.type,
    asset: q.asset,
    side: q.side,
    params: { ...q.params, quoteId: q.id, symbol: q.symbol, summary: q.summary },
    createdAt: now,
    updatedAt: now,
  };

  // Bracket entry (docs/integrations/flash.md §3.3): the attached bracket is re-sent with its own signature.
  const bracketInfo = (q.summary as { bracket?: NonNullable<QuoteSummary["bracket"]> }).bracket;
  let attachedBracket: Record<string, unknown> | undefined;
  if (q.type === "bracket") {
    if (!bracketInfo || !request.attachedBracket) throw badRequest("Quote carries no bracket to sign.");
    if (!input.bracketSignature) throw badRequest("Bracket signature is missing.");
    attachedBracket = {
      takeProfit: request.attachedBracket.takeProfit,
      stopLoss: request.attachedBracket.stopLoss,
      userSignature: input.bracketSignature,
      ...(bracketInfo.salt ? { salt: bracketInfo.salt } : {}),
      deadline: bracketInfo.deadline,
      signedMaxFromAmount: bracketInfo.signedMaxFromAmount,
      ...(bracketInfo.permitTypedData && input.bracketPermitSignature ? { evmPermitTypedData: bracketInfo.permitTypedData, evmPermitSignature: input.bracketPermitSignature } : {}),
    };
  }

  try {
    const res = await flash.submitOrder({
      ...toSubmitFields(request),
      funderAddress: trader,
      quoteId: q.id,
      userSignature: input.userSignature,
      evmOrderTypedData: q.orderTypedData,
      ...(q.permitTypedData && input.evmPermitSignature ? { evmPermitTypedData: q.permitTypedData, evmPermitSignature: input.evmPermitSignature } : {}),
      ...(attachedBracket ? { attachedBracket } : {}),
    } as Parameters<typeof flash.submitOrder>[0]);
    await db.insert(orders).values({ ...base, flashOrderId: res.orderId, status: "open" });
    log.info({ trenchId, trader, orderId: id, flashOrderId: res.orderId, type: q.type }, "order placed");
    return {
      flashOrderId: res.orderId,
      order: { id, flashOrderId: res.orderId, trenchId, trader: base.trader as Address, type: q.type as OrderType, asset: q.asset as Address, side: q.side as Side, params: base.params, status: "open", createdAt: now },
    };
  } catch (e) {
    const message = flashMessage(e);
    log.warn({ trenchId, trader, err: message }, "flash submit failed");
    await db.insert(orders).values({ ...base, flashOrderId: null, status: "failed", error: message });
    throw new ServiceError(400, message);
  }
}

export interface OrderView {
  order: Order & { error?: string | null; symbol: string; summary: Record<string, unknown> };
  fills: Fill[];
}

export async function listOrdersForTrader(trenchId: string, trader: Address): Promise<OrderView[]> {
  const { db } = services();
  const rows = await db.select().from(orders).where(and(eq(orders.trenchId, trenchId), eq(orders.trader, trader.toLowerCase()))).orderBy(desc(orders.createdAt)).limit(50);
  if (!rows.length) return [];
  const fillRows = await db.select().from(fills).where(inArray(fills.orderId, rows.map((r) => r.id)));
  return rows.map((r) => ({
    order: {
      id: r.id,
      flashOrderId: r.flashOrderId ?? "",
      trenchId: r.trenchId,
      trader: r.trader as Address,
      type: r.type as OrderType,
      asset: r.asset as Address,
      side: r.side as Side,
      params: r.params,
      status: r.status as Order["status"],
      createdAt: new Date(r.createdAt).toISOString(),
      error: r.error,
      symbol: String((r.params as { symbol?: string }).symbol ?? ""),
      summary: ((r.params as { summary?: Record<string, unknown> }).summary ?? {}) as Record<string, unknown>,
    },
    fills: fillRows
      .filter((f) => f.orderId === r.id)
      .map((f) => ({
        id: f.id,
        orderId: f.orderId,
        trenchId: f.trenchId,
        trader: f.trader as Address,
        asset: f.asset as Address,
        side: f.side as Side,
        qty: Number(f.qty),
        priceUsd: Number(f.priceUsd),
        feeUsd: Number(f.feeUsd),
        txHash: f.txHash as Address,
        filledAt: new Date(f.filledAt).toISOString(),
      })),
  }));
}

/* ---------- worker: pollOrders ---------- */

const OPEN_STATUSES = ["pending", "open", "partial"];

/** "REASON_ORDER_REJECTED_AT_VENUE" → "Order rejected at venue". */
export function humanReason(reason: string | null | undefined): string | null {
  if (!reason) return null;
  const words = reason.replace(/^REASON_/, "").toLowerCase().split("_");
  return words.length ? words[0]!.charAt(0).toUpperCase() + words[0]!.slice(1) + (words.length > 1 ? " " + words.slice(1).join(" ") : "") : null;
}
let backoffUntil = 0;
let backoffMs = 0;

export interface PollResult {
  polled: number;
  newFills: number;
  closed: number;
  skipped?: string;
}

/** Every 15 s: refresh open orders from Flash, ingest fills (deduped by tx+order), write fee_ledger, exponential backoff to 60 s on errors. */
export async function pollOrders(): Promise<PollResult> {
  const { db, flash, config } = services();
  if (!config.flashApiKey) return { polled: 0, newFills: 0, closed: 0, skipped: "no FLASH_API_KEY" };
  if (Date.now() < backoffUntil) return { polled: 0, newFills: 0, closed: 0, skipped: `backoff ${Math.round((backoffUntil - Date.now()) / 1000)}s` };

  const open = await db.select().from(orders).where(and(inArray(orders.status, OPEN_STATUSES), isNotNull(orders.flashOrderId))).limit(100);
  let newFills = 0;
  let closed = 0;
  let hadError = false;
  const touched = new Set<string>();
  const touchedTraders = new Set<string>();

  for (const o of open) {
    try {
      const { order, fills: flashFills } = await flash.getOrder(o.flashOrderId!, o.trader);
      const t = await getTrenchRow(o.trenchId);
      const adminFeeShareBps = t?.adminFeeShareBps ?? 5000;
      const admin = t?.adminAddress ?? "";

      for (const ff of flashFills) {
        if (!ff.transactionId) continue;
        const fill = toDomainFill(ff, { orderId: o.id, trenchId: o.trenchId, trader: o.trader as Address, asset: o.asset as Address, side: o.side as Side });
        const inserted = await db
          .insert(fills)
          .values({
            id: fill.id,
            orderId: fill.orderId,
            trenchId: fill.trenchId,
            trader: fill.trader,
            asset: fill.asset,
            side: fill.side,
            qty: fill.qty.toFixed(18),
            priceUsd: fill.priceUsd.toFixed(6),
            feeUsd: fill.feeUsd.toFixed(6),
            txHash: fill.txHash,
            filledAt: fill.filledAt,
          })
          .onConflictDoNothing()
          .returning({ id: fills.id });
        if (inserted.length) {
          newFills += 1;
          touched.add(o.trenchId);
          touchedTraders.add(o.trader);
          // Our integrator fee on this fill, split between platform and host by adminFeeShareBps (F3.5).
          const { platformUsd, adminUsd } = splitFee(Number(ff.integratorFeeNotional), adminFeeShareBps);
          await db.insert(feeLedger).values({ trenchId: o.trenchId, fillId: fill.id, admin, platformUsd: platformUsd.toFixed(6), adminUsd: adminUsd.toFixed(6), createdAt: new Date().toISOString() });
          log.info({ orderId: o.id, tx: fill.txHash, qty: fill.qty, priceUsd: fill.priceUsd, integratorFee: ff.integratorFeeNotional }, "fill ingested");
        }
      }

      const status = toDomainOrderStatus(order.status);
      // Only a failed / cancelled order carries its close reason as the user-facing error.
      const error = status === "failed" || status === "cancelled" ? humanReason(order.closeReason) : null;
      if (status !== o.status || error !== o.error) {
        await db.update(orders).set({ status, error, updatedAt: new Date().toISOString() }).where(eq(orders.id, o.id));
        if (!OPEN_STATUSES.includes(status)) closed += 1;
      }
    } catch (e) {
      hadError = true;
      log.error({ orderId: o.id, err: flashMessage(e) }, "pollOrders: getOrder failed");
    }
  }

  if (hadError) {
    backoffMs = Math.min(60_000, backoffMs ? backoffMs * 2 : 15_000);
    backoffUntil = Date.now() + backoffMs;
  } else {
    backoffMs = 0;
  }
  // F4.1: the board reflects a fill within 30 s → recompute right away for the Trenches that got one.
  for (const trenchId of touched) {
    try {
      await recomputeLeaderboard(trenchId);
    } catch (e) {
      log.error({ trenchId, err: (e as Error).message }, "recompute after fill failed");
    }
  }
  if (touchedTraders.size) {
    const { recomputeXp } = await import("./clans.js");
    for (const t of touchedTraders) await recomputeXp(t as Address).catch(() => undefined);
  }
  return { polled: open.length, newFills, closed };
}
