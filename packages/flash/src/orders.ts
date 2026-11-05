import type { OrderType, Side } from "@trenches/core";
import { z } from "zod";
import { CHAIN_NAMES, TWAP_MIN_DURATION_S, TWAP_BUCKETS } from "./constants.js";
import type { QuoteRequest } from "./schemas.js";

/**
 * Trenches order params (validated at the API) → Flash QuoteRequest.
 * Mapping (docs/integrations/flash.md §5): market → market; dca → twap (duration/buckets);
 * bracket → market entry with attachedBracket; limit → limit; twap → twap.
 */
export const marketParamsSchema = z.object({ maxSlippage: z.string().optional() });
export const dcaParamsSchema = z.object({
  legs: z.number().int().min(TWAP_BUCKETS.min).max(TWAP_BUCKETS.max),
  intervalSeconds: z.number().int().min(1),
});
export const twapParamsSchema = z.object({
  durationSeconds: z.number().int().min(TWAP_MIN_DURATION_S),
  buckets: z.number().int().min(TWAP_BUCKETS.min).max(TWAP_BUCKETS.max).optional(),
  limitNotionalPrice: z.string().optional(),
});
export const bracketParamsSchema = z.object({
  takeProfitPrice: z.string(),
  stopLossPrice: z.string(),
  maxSlippage: z.string().optional(),
});
export const limitParamsSchema = z.object({ limitNotionalPrice: z.string(), expireTime: z.string().optional() });

export const orderParamsSchemas: Record<OrderType, z.ZodTypeAny> = {
  market: marketParamsSchema,
  dca: dcaParamsSchema,
  twap: twapParamsSchema,
  bracket: bracketParamsSchema,
  limit: limitParamsSchema,
};

export interface BuildQuoteInput {
  chainId: number;
  /** token the trader wants exposure to */
  asset: string;
  /** quote/settlement token (USDC on Base) */
  quoteAsset: string;
  side: Side;
  /** spent-asset units as a decimal string: USDC on buy, asset units on sell */
  qty: string;
  type: OrderType;
  params: Record<string, unknown>;
  funderAddress: string;
  feeBps: number;
}

export function buildQuoteRequest(input: BuildQuoteInput): QuoteRequest {
  const chain = CHAIN_NAMES[input.chainId];
  if (!chain) throw new Error(`Unsupported trading chain ${input.chainId}`);
  const base: QuoteRequest = {
    targetChain: chain,
    contraChain: chain,
    targetAsset: input.asset,
    contraAsset: input.quoteAsset,
    side: input.side,
    qty: input.qty,
    orderType: "market",
    funderAddress: input.funderAddress,
    flashIntegratorFeeBps: String(input.feeBps),
    evmUsePermit2: false,
  };

  switch (input.type) {
    case "market": {
      const p = marketParamsSchema.parse(input.params);
      return { ...base, orderType: "market", ...(p.maxSlippage ? { maxSlippage: p.maxSlippage } : {}) };
    }
    case "dca": {
      const p = dcaParamsSchema.parse(input.params);
      const durationSeconds = Math.max(TWAP_MIN_DURATION_S, p.legs * p.intervalSeconds);
      return { ...base, orderType: "twap", durationSeconds, twapBucketCount: p.legs };
    }
    case "twap": {
      const p = twapParamsSchema.parse(input.params);
      return {
        ...base,
        orderType: "twap",
        durationSeconds: p.durationSeconds,
        ...(p.buckets ? { twapBucketCount: p.buckets } : {}),
        ...(p.limitNotionalPrice ? { limitNotionalPrice: p.limitNotionalPrice } : {}),
      };
    }
    case "bracket": {
      const p = bracketParamsSchema.parse(input.params);
      if (input.side !== "buy") throw new Error("Bracket entry must be a buy (take profit and stop loss sell the asset).");
      if (Number(p.takeProfitPrice) <= Number(p.stopLossPrice)) throw new Error("Take profit must be above stop loss.");
      return {
        ...base,
        orderType: "market",
        ...(p.maxSlippage ? { maxSlippage: p.maxSlippage } : {}),
        attachedBracket: {
          takeProfit: { notionalPrice: p.takeProfitPrice },
          stopLoss: { notionalPrice: p.stopLossPrice },
        },
      };
    }
    case "limit": {
      const p = limitParamsSchema.parse(input.params);
      return { ...base, orderType: "limit", limitNotionalPrice: p.limitNotionalPrice, ...(p.expireTime ? { expireTime: p.expireTime } : {}) };
    }
  }
}

/**
 * Fields that must NOT be echoed on POST /order (flash-mcp orderTradeFieldsFromQuote).
 * `attachedBracket` is also dropped: the submit shape carries its own signature fields.
 */
export function toSubmitFields(q: QuoteRequest) {
  const { durationSeconds: _d, expireTime: _e, evmUsePermit2: _p, attachedBracket: _b, ...rest } = q;
  void _d; void _e; void _p; void _b;
  return rest;
}

/** Bracket demo defaults from DECISIONS.md: stop −3 %, take profit +3 % of the current price. */
export function bracketPricesAround(priceUsd: number, pct = 0.03): { takeProfitPrice: string; stopLossPrice: string } {
  return {
    takeProfitPrice: (priceUsd * (1 + pct)).toFixed(6),
    stopLossPrice: (priceUsd * (1 - pct)).toFixed(6),
  };
}
