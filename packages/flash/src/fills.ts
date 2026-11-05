import type { Address, Fill, Side } from "@trenches/core";
import type { FlashFill, FlashOrderStatus } from "./schemas.js";
import type { OrderStatus } from "@trenches/core";

/**
 * Flash fill → domain Fill. Quantities are in the target asset; price is USD per target unit,
 * derived from `notional / targetAmount` so it works for both buys and sells regardless of
 * how `fillPrice` is denominated. Fee is the fill's total fee notional (USD).
 */
export function toDomainFill(
  f: FlashFill,
  ctx: { orderId: string; trenchId: string; trader: Address; asset: Address; side: Side },
): Fill {
  const qty = Number(f.targetAmount);
  const notional = Number(f.notional);
  const priceUsd = qty > 0 ? notional / qty : Number(f.fillPrice);
  return {
    id: `${f.rootOrderId}:${f.transactionId}`,
    orderId: ctx.orderId,
    trenchId: ctx.trenchId,
    trader: ctx.trader,
    asset: ctx.asset,
    side: ctx.side,
    qty,
    priceUsd,
    feeUsd: Number(f.feeNotional),
    txHash: f.transactionId as Address,
    filledAt: f.filledAt,
  };
}

export function toDomainOrderStatus(s: FlashOrderStatus): OrderStatus {
  switch (s) {
    case "ORDER_STATUS_PENDING":
    case "ORDER_STATUS_UNSPECIFIED":
      return "pending";
    case "ORDER_STATUS_ACCEPTED":
      return "open";
    case "ORDER_STATUS_PARTIALLY_FILLED":
      return "partial";
    case "ORDER_STATUS_FILLED":
      return "filled";
    case "ORDER_STATUS_CANCELLED":
      return "cancelled";
    case "ORDER_STATUS_REJECTED":
    case "ORDER_STATUS_TERMINATED":
      return "failed";
  }
}
