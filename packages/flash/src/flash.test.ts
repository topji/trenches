import { describe, it, expect } from "vitest";
import { quoteResponseSchema, getOrderResponseSchema, errorResponseSchema } from "./schemas.js";
import { FlashClient, FlashError } from "./client.js";
import { toViemTypedData, parseTypedData, cancelMessage } from "./signing.js";
import { buildQuoteRequest, toSubmitFields, bracketPricesAround } from "./orders.js";
import { toDomainFill, toDomainOrderStatus } from "./fills.js";
import { quoteNoFunder, quoteWithFunder, getOrderFilled, notFound, orderTypedDataJson } from "../__fixtures__/responses.js";
import { BASE } from "./constants.js";

const A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;

describe("schemas", () => {
  it("treats empty typed data strings as absent", () => {
    const q = quoteResponseSchema.parse(quoteNoFunder);
    expect(q.evm?.orderTypedData).toBeNull();
    expect(q.evm?.permitTypedData).toBeNull();
    expect(q.recommendedSlippage).toBe("0.15");
  });
  it("parses a quote with signing payloads", () => {
    const q = quoteResponseSchema.parse(quoteWithFunder);
    expect(q.evm?.approveTx?.to).toBe(BASE.USDC);
    expect(q.evm?.orderTypedData).toBe(orderTypedDataJson);
  });
  it("parses order + fills and an error without details", () => {
    const o = getOrderResponseSchema.parse(getOrderFilled);
    expect(o.fills[0]!.integratorFeeNotional).toBe("0.009");
    expect(errorResponseSchema.parse(notFound).error.code).toBe("NOT_FOUND");
  });
});

describe("client", () => {
  const mk = (status: number, body: unknown) =>
    new FlashClient({
      apiKey: "k",
      fetch: (async (url: string, init: RequestInit) => {
        expect((init.headers as Record<string, string>)["x-definitive-api-key"]).toBe("k");
        expect(String(url)).toContain("flash.definitive.fi/v1");
        return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
      }) as unknown as typeof fetch,
    });
  it("surfaces Flash errors with code and message", async () => {
    await expect(mk(404, notFound).getOrder("x", A)).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 } satisfies Partial<FlashError>);
  });
  it("returns parsed orders", async () => {
    const r = await mk(200, getOrderFilled).getOrder("887ccf13-1111-4111-8111-111111111111", A);
    expect(r.order.status).toBe("ORDER_STATUS_FILLED");
  });
  it("flags schema mismatches instead of passing junk through", async () => {
    await expect(mk(200, { nope: 1 }).getOrder("x", A)).rejects.toMatchObject({ code: "SCHEMA_MISMATCH" });
  });
});

describe("signing", () => {
  it("normalises typed data for viem", () => {
    const td = toViemTypedData(orderTypedDataJson);
    expect(td.types.EIP712Domain).toBeUndefined();
    expect(td.domain.chainId).toBe(8453);
    expect(td.primaryType).toBe("FlashOrder");
    expect(parseTypedData(orderTypedDataJson).domain.chainId).toBe("8453");
  });
  it("builds the byte-exact cancel message", () => {
    expect(cancelMessage("abc")).toBe("Definitive Flash v1 — Cancel Order\nOrder: abc");
  });
});

describe("buildQuoteRequest", () => {
  const base = { chainId: 8453, asset: BASE.WETH, quoteAsset: BASE.USDC, side: "buy" as const, qty: "3", funderAddress: A, feeBps: 30 };
  it("market", () => {
    const q = buildQuoteRequest({ ...base, type: "market", params: {} });
    expect(q).toMatchObject({ targetChain: "base", orderType: "market", flashIntegratorFeeBps: "30", evmUsePermit2: false });
  });
  it("dca → twap with buckets and the 300 s floor", () => {
    const q = buildQuoteRequest({ ...base, type: "dca", params: { legs: 3, intervalSeconds: 60 } });
    expect(q).toMatchObject({ orderType: "twap", durationSeconds: 300, twapBucketCount: 3 });
    expect(toSubmitFields(q)).not.toHaveProperty("durationSeconds");
    expect(toSubmitFields(q)).toHaveProperty("twapBucketCount", 3);
  });
  it("bracket → market entry with attached bracket", () => {
    const q = buildQuoteRequest({ ...base, type: "bracket", params: bracketPricesAround(3000) });
    expect(q.orderType).toBe("market");
    expect(q.attachedBracket).toEqual({ takeProfit: { notionalPrice: "3090.000000" }, stopLoss: { notionalPrice: "2910.000000" } });
  });
  it("rejects a bracket sell entry and inverted levels", () => {
    expect(() => buildQuoteRequest({ ...base, side: "sell", type: "bracket", params: bracketPricesAround(3000) })).toThrow();
    expect(() => buildQuoteRequest({ ...base, type: "bracket", params: { takeProfitPrice: "1", stopLossPrice: "2" } })).toThrow();
  });
  it("limit and twap", () => {
    expect(buildQuoteRequest({ ...base, type: "limit", params: { limitNotionalPrice: "2500" } })).toMatchObject({ orderType: "limit", limitNotionalPrice: "2500" });
    expect(buildQuoteRequest({ ...base, type: "twap", params: { durationSeconds: 600, buckets: 4 } })).toMatchObject({ orderType: "twap", durationSeconds: 600, twapBucketCount: 4 });
    expect(() => buildQuoteRequest({ ...base, type: "twap", params: { durationSeconds: 60 } })).toThrow();
  });
  it("rejects unsupported chains", () => {
    expect(() => buildQuoteRequest({ ...base, chainId: 1, type: "market", params: {} })).toThrow(/Unsupported/);
  });
});

describe("fills", () => {
  it("maps a Flash fill to a domain fill", () => {
    const f = getOrderResponseSchema.parse(getOrderFilled).fills[0]!;
    const d = toDomainFill(f, { orderId: "o1", trenchId: "t1", trader: A, asset: BASE.WETH, side: "buy" });
    expect(d.qty).toBe(0.00091);
    expect(d.priceUsd).toBeCloseTo(3 / 0.00091, 6);
    expect(d.feeUsd).toBe(0.009);
    expect(d.txHash).toMatch(/^0x/);
  });
  it("maps statuses", () => {
    expect(toDomainOrderStatus("ORDER_STATUS_ACCEPTED")).toBe("open");
    expect(toDomainOrderStatus("ORDER_STATUS_PARTIALLY_FILLED")).toBe("partial");
    expect(toDomainOrderStatus("ORDER_STATUS_REJECTED")).toBe("failed");
  });
});
