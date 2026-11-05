/** Shapes copied from docs/integrations/flash.md (docs examples + live probes 2026-11-05). */
export const quoteNoFunder = {
  quoteId: "a1b2c3d4-0000-4000-8000-000000000001",
  orderType: "market",
  side: "buy",
  targetAsset: "0x4200000000000000000000000000000000000006",
  contraAsset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  from: { asset: "contra", amount: "3", notional: "3" },
  to: { asset: "target", amount: "0.00091", notional: "2.99" },
  fees: { estimatedFeeNotional: "0" },
  estimatedPriceImpact: "-0.0001",
  recommendedSlippage: "0.15",
  wrap: null,
  evm: { approveTx: null, permitTypedData: "", orderTypedData: "" },
  svm: null,
};

export const orderTypedDataJson = JSON.stringify({
  domain: { name: "DefinitiveFlash", version: "1", chainId: "8453", verifyingContract: "0x5d00000873b6BF41539e6f5365B0Ff7d3c368f78" },
  types: {
    EIP712Domain: [
      { name: "name", type: "string" },
      { name: "version", type: "string" },
      { name: "chainId", type: "uint256" },
      { name: "verifyingContract", type: "address" },
    ],
    FlashOrder: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  },
  primaryType: "FlashOrder",
  message: { token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", amount: "3000000", deadline: "1762350000" },
});

export const quoteWithFunder = {
  ...quoteNoFunder,
  evm: { approveTx: { to: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", data: "0x095ea7b3" }, permitTypedData: null, orderTypedData: orderTypedDataJson },
};

export const getOrderFilled = {
  order: {
    orderId: "887ccf13-1111-4111-8111-111111111111",
    orderType: "market",
    side: "buy",
    status: "ORDER_STATUS_FILLED",
    closeReason: "REASON_FULLY_FILLED",
    funderAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    recipientAddress: null,
    integratorFeeBps: "30",
    tradeFeeBps: null,
    targetAsset: { id: "base:0x4200…", name: "Wrapped Ether", address: "0x4200000000000000000000000000000000000006", ticker: "WETH", chain: { id: "8453", name: "base", namespace: "eip155" } },
    contraAsset: { id: "base:0x8335…", name: "USD Coin", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", ticker: "USDC", chain: { id: "8453", name: "base", namespace: "eip155" } },
    qty: "3",
    filled: { targetAmount: "0.00091", contraAmount: "3", averagePrice: "3296.70", averageNotionalPrice: "3296.70" },
    limitNotionalPrice: null,
    limitCrossPrice: null,
    trigger: null,
    brackets: null,
    maxPriceImpact: null,
    twapBucketCount: null,
    placedAt: "2026-11-05T09:00:00Z",
    acceptedAt: "2026-11-05T09:00:01Z",
    closedAt: "2026-11-05T09:00:09Z",
    expiresAt: null,
  },
  fills: [
    {
      status: "CHAIN_STATUS_PROCESSED",
      notional: "3",
      venues: ["uniswap-v3"],
      filledAt: "2026-11-05T09:00:08Z",
      rootOrderId: "887ccf13-1111-4111-8111-111111111111",
      orderId: "887ccf13-1111-4111-8111-111111111111",
      parentOrderId: "887ccf13-1111-4111-8111-111111111111",
      transactionId: "0x" + "ab".repeat(32),
      fillPrice: "3296.70",
      feeAmount: "0.009",
      feeTicker: "USDC",
      integratorFeeAmount: "0.009",
      feeNotional: "0.009",
      integratorFeeNotional: "0.009",
      contraAmount: "3",
      targetAmount: "0.00091",
    },
  ],
};

export const notFound = { error: { code: "NOT_FOUND", message: "flash get order failed: order x not found" } };
