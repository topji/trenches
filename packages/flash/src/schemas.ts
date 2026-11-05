import { z } from "zod";

/** Enums — docs/integrations/flash.md §3.0 */
export const flashOrderTypeSchema = z.enum([
  "market", "limit", "twap", "stop", "stop-loss", "take-profit", "bracket", "trailing-stop", "trailing-stop-limit",
]);
export type FlashOrderType = z.infer<typeof flashOrderTypeSchema>;

export const flashSideSchema = z.enum(["buy", "sell"]);
export const flashOrderStatusSchema = z.enum([
  "ORDER_STATUS_UNSPECIFIED", "ORDER_STATUS_PENDING", "ORDER_STATUS_ACCEPTED", "ORDER_STATUS_PARTIALLY_FILLED",
  "ORDER_STATUS_FILLED", "ORDER_STATUS_CANCELLED", "ORDER_STATUS_REJECTED", "ORDER_STATUS_TERMINATED",
]);
export type FlashOrderStatus = z.infer<typeof flashOrderStatusSchema>;

export const flashChainStatusSchema = z.enum([
  "CHAIN_STATUS_UNSPECIFIED", "CHAIN_STATUS_PROCESSED", "CHAIN_STATUS_REORGED", "CHAIN_STATUS_FINALIZED",
]);

const decimalString = z.string().regex(/^-?\d+(\.\d+)?$/, "decimal string");

export const priceTriggerSchema = z.object({
  notionalPrice: z.string().optional(),
  crossPrice: z.string().optional(),
  triggerType: z.enum(["upper", "lower"]),
  limitPrice: z.string().optional(),
});

export const attachedBracketLegSchema = z.object({
  notionalPrice: z.string().optional(),
  crossPrice: z.string().optional(),
  limitPrice: z.string().optional(),
});

/** §3.1 QuoteRequest — the subset Trenches sends. */
export const quoteRequestSchema = z.object({
  targetChain: z.string(),
  contraChain: z.string(),
  targetAsset: z.string().min(1),
  contraAsset: z.string().min(1),
  side: flashSideSchema,
  qty: decimalString,
  orderType: flashOrderTypeSchema,
  maxSlippage: z.string().optional(),
  maxPriceImpact: z.string().optional(),
  limitNotionalPrice: z.string().optional(),
  funderAddress: z.string().optional(),
  evmUsePermit2: z.boolean().optional(),
  flashIntegratorFeeBps: z.string().optional(),
  expireTime: z.string().optional(),
  startTime: z.string().optional(),
  durationSeconds: z.number().int().min(300).optional(),
  twapBucketCount: z.number().int().min(2).max(2560).optional(),
  triggers: z.array(priceTriggerSchema).max(2).optional(),
  attachedBracket: z
    .object({ takeProfit: attachedBracketLegSchema, stopLoss: attachedBracketLegSchema, expireTime: z.string().optional() })
    .optional(),
});
export type QuoteRequest = z.infer<typeof quoteRequestSchema>;

const quoteLegSchema = z.object({ asset: z.enum(["target", "contra"]), amount: z.string(), notional: z.string() });

/** `""` and null both mean "absent" (observed live when funderAddress is omitted). */
const optionalPayload = z.string().nullable().optional().transform((v) => (v ? v : null));

export const quoteEvmActionsSchema = z.object({
  approveTx: z.object({ to: z.string(), data: z.string() }).nullable().optional(),
  permitTypedData: optionalPayload,
  orderTypedData: optionalPayload,
});

/** §3.2 QuoteResponse */
export const quoteResponseSchema = z.object({
  quoteId: z.string(),
  bridgeQuoteId: z.string().nullable().optional(),
  orderType: flashOrderTypeSchema,
  side: flashSideSchema,
  targetAsset: z.string(),
  contraAsset: z.string(),
  from: quoteLegSchema,
  to: quoteLegSchema,
  fees: z.object({ estimatedFeeNotional: z.string() }),
  estimatedPriceImpact: z.string().nullable(),
  recommendedSlippage: z.string().nullable().optional(),
  wrap: z
    .object({
      nativeAsset: z.string().optional(),
      wrappedAsset: z.string().optional(),
      evmTx: z.object({ to: z.string(), data: z.string(), value: z.string() }).nullable().optional(),
    })
    .nullable(),
  evm: quoteEvmActionsSchema.nullable(),
  svm: z.unknown().nullable().optional(),
  attachedBracket: z
    .object({
      evm: quoteEvmActionsSchema.nullable(),
      salt: z.string().nullable(),
      deadline: z.string(),
      signedMaxFromAmount: z.string(),
    })
    .optional(),
  setupTxs: z.array(z.string()).nullable().optional(),
});
export type QuoteResponse = z.infer<typeof quoteResponseSchema>;

/** §3.3 SubmitOrderRequest */
export const submitOrderRequestSchema = quoteRequestSchema
  .omit({ durationSeconds: true, expireTime: true, evmUsePermit2: true })
  .extend({
    funderAddress: z.string(),
    quoteId: z.string().optional(),
    userSignature: z.string(),
    evmOrderTypedData: z.string(),
    evmPermitTypedData: z.string().optional(),
    evmPermitSignature: z.string().optional(),
    erc8021AttributionCode: z.string().regex(/^[a-zA-Z0-9_.-]{1,32}$/).optional(),
    attachedBracket: z
      .object({
        takeProfit: attachedBracketLegSchema,
        stopLoss: attachedBracketLegSchema,
        userSignature: z.string(),
        salt: z.string().optional(),
        deadline: z.string(),
        signedMaxFromAmount: z.string(),
        evmPermitSignature: z.string().optional(),
        evmPermitTypedData: z.string().optional(),
      })
      .optional(),
  });
export type SubmitOrderRequest = z.infer<typeof submitOrderRequestSchema>;

export const submitOrderResponseSchema = z.object({
  orderId: z.string(),
  attachedBracket: z.object({ status: z.string() }).optional(),
});

const assetRefSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string(),
  ticker: z.string(),
  chain: z.object({ id: z.string(), name: z.string(), namespace: z.string() }),
});

/** §3.5 FlashOrder */
export const flashOrderSchema = z.object({
  orderId: z.string(),
  orderType: flashOrderTypeSchema,
  side: flashSideSchema,
  status: flashOrderStatusSchema,
  closeReason: z.string().nullable().optional(),
  funderAddress: z.string(),
  recipientAddress: z.string().nullable().optional(),
  integratorFeeBps: z.string().nullable().optional(),
  tradeFeeBps: z.string().nullable().optional(),
  targetAsset: assetRefSchema,
  contraAsset: assetRefSchema,
  qty: z.string(),
  filled: z
    .object({
      targetAmount: z.string().nullable(),
      contraAmount: z.string().nullable(),
      averagePrice: z.string().nullable(),
      averageNotionalPrice: z.string().nullable(),
    })
    .nullable()
    .optional(),
  limitNotionalPrice: z.string().nullable().optional(),
  limitCrossPrice: z.string().nullable().optional(),
  trigger: priceTriggerSchema.nullable().optional(),
  brackets: z.array(priceTriggerSchema).nullable().optional(),
  attachedBracket: z
    .object({
      status: z.string(),
      bracketOrderId: z.string().nullable().optional(),
      takeProfit: z.unknown().nullable().optional(),
      stopLoss: z.unknown().nullable().optional(),
      signedMaxFromAmount: z.string().nullable().optional(),
      expiresAt: z.string().nullable().optional(),
    })
    .optional(),
  sourceEntryOrderId: z.string().optional(),
  maxPriceImpact: z.string().nullable().optional(),
  twapBucketCount: z.number().nullable().optional(),
  completedFillCount: z.number().optional(),
  placedAt: z.string(),
  acceptedAt: z.string().nullable().optional(),
  closedAt: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
});
export type FlashOrder = z.infer<typeof flashOrderSchema>;

/** §3.5 FlashFill */
export const flashFillSchema = z.object({
  status: flashChainStatusSchema,
  notional: z.string(),
  venues: z.array(z.string()).optional().default([]),
  filledAt: z.string(),
  rootOrderId: z.string(),
  orderId: z.string(),
  parentOrderId: z.string().optional(),
  transactionId: z.string(),
  fillPrice: z.string(),
  feeAmount: z.string(),
  feeTicker: z.string(),
  tradeFeeAmount: z.string().optional(),
  networkFeeAmount: z.string().optional(),
  integratorFeeAmount: z.string(),
  feeNotional: z.string(),
  tradeFeeNotional: z.string().optional(),
  networkFeeNotional: z.string().optional(),
  integratorFeeNotional: z.string(),
  contraAmount: z.string(),
  targetAmount: z.string(),
});
export type FlashFill = z.infer<typeof flashFillSchema>;

export const getOrderResponseSchema = z.object({ order: flashOrderSchema, fills: z.array(flashFillSchema) });
export type GetOrderResponse = z.infer<typeof getOrderResponseSchema>;

export const listOrdersResponseSchema = z.object({
  orders: z.array(flashOrderSchema),
  nextPageToken: z.string().nullable(),
});

export const cancelResponseSchema = z.object({ ok: z.boolean() });

/** §3.10 */
export const searchResponseSchema = z.object({
  assets: z.array(
    z.object({
      chain: z.string(),
      address: z.string(),
      symbol: z.string(),
      name: z.string(),
      decimals: z.number(),
      price: z.string(),
      marketCap: z.string().optional(),
      liquidity: z.string().optional(),
      volume24h: z.string().optional(),
      priceChange24h: z.string().optional(),
      holders: z.number().optional(),
      imageUrl: z.string().optional(),
      riskFlagged: z.boolean().optional(),
    }),
  ),
});
export type SearchResponse = z.infer<typeof searchResponseSchema>;

export const balancesResponseSchema = z.object({
  balances: z
    .array(
      z.object({
        chain: z.string(),
        address: z.string(),
        symbol: z.string(),
        tokenDecimals: z.number(),
        balance: z.string(),
        notional: z.string(),
        isNative: z.boolean().optional(),
      }),
    )
    .optional(),
}).passthrough();

/** §8 ErrorResponse — `details` may be absent entirely. */
export const errorResponseSchema = z.object({
  error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional().nullable() }),
});
