/**
 * Flash smoke: quote + tiny market buy (USDC → WETH on Base) from the demo trader wallet,
 * then poll until a fill lands and print the Basescan link.
 *
 *   pnpm smoke:flash
 *
 * Env: FLASH_API_KEY (falls back to the public dev key with a warning), DEMO_TRADER_A_KEY,
 *      FLASH_PLATFORM_FEE_BPS (default 30), FLASH_SMOKE_QTY (USDC, default "2"), BASE_RPC_URL (optional).
 * Exit codes: 0 PASS · 1 FAIL · 2 NEEDS ENV.
 */
import "dotenv/config";
import { createPublicClient, createWalletClient, erc20Abi, formatUnits, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import {
  BASE,
  FLASH_PUBLIC_DEV_KEY,
  FlashClient,
  FlashError,
  TERMINAL_STATUSES,
  buildQuoteRequest,
  toSubmitFields,
  toViemTypedData,
} from "../packages/flash/src/index.js";

const log = (...a: unknown[]) => console.log("[flash-smoke]", ...a);

async function main() {
  const traderKey = process.env.DEMO_TRADER_A_KEY;
  if (!traderKey) {
    log("NEEDS ENV: DEMO_TRADER_A_KEY is not set (funded Base wallet, ~$30 USDC + gas).");
    process.exit(2);
  }
  let apiKey = process.env.FLASH_API_KEY;
  if (!apiKey) {
    log("WARNING: FLASH_API_KEY not set; using the public dev key. Integrator fees from this run go to Definitive.");
    apiKey = FLASH_PUBLIC_DEV_KEY;
  }
  const feeBps = Number(process.env.FLASH_PLATFORM_FEE_BPS ?? 30);
  const qty = process.env.FLASH_SMOKE_QTY ?? "2";

  const account = privateKeyToAccount(traderKey as Hex);
  const transport = http(process.env.BASE_RPC_URL ?? "https://mainnet.base.org");
  const pub = createPublicClient({ chain: base, transport });
  const wallet = createWalletClient({ account, chain: base, transport });
  const flash = new FlashClient({ apiKey });

  log("trader", account.address);
  const [eth, usdc] = await Promise.all([
    pub.getBalance({ address: account.address }),
    pub.readContract({ address: BASE.USDC, abi: erc20Abi, functionName: "balanceOf", args: [account.address] }),
  ]);
  log(`balances: ${formatUnits(eth, 18)} ETH, ${formatUnits(usdc, 6)} USDC`);
  if (usdc < BigInt(Math.ceil(Number(qty) * 1e6))) {
    log(`FAIL: need at least ${qty} USDC on Base`);
    process.exit(1);
  }

  // 1. Quote
  const quoteReq = buildQuoteRequest({
    chainId: BASE.chainId, asset: BASE.WETH, quoteAsset: BASE.USDC, side: "buy", qty, type: "market", params: {},
    funderAddress: account.address, feeBps,
  });
  const quote = await flash.quote(quoteReq);
  log("quote", { quoteId: quote.quoteId, receive: `${quote.to.amount} WETH ($${quote.to.notional})`, fee: quote.fees.estimatedFeeNotional, slippage: quote.recommendedSlippage });
  if (!quote.evm?.orderTypedData) {
    log("FAIL: quote returned no orderTypedData (funderAddress missing?)");
    process.exit(1);
  }

  // 2. One-time approval
  if (quote.evm.approveTx) {
    log("sending ERC-20 approve to", quote.evm.approveTx.to);
    const hash = await wallet.sendTransaction({ to: quote.evm.approveTx.to as Hex, data: quote.evm.approveTx.data as Hex, value: 0n });
    log("approve tx", BASE.explorerTx(hash));
    await pub.waitForTransactionReceipt({ hash });
  }

  // 3. Sign the order (EIP-712)
  const td = toViemTypedData(quote.evm.orderTypedData);
  const userSignature = await account.signTypedData({
    domain: td.domain as never, types: td.types as never, primaryType: td.primaryType as never, message: td.message as never,
  });
  let permitFields = {};
  if (quote.evm.permitTypedData) {
    const ptd = toViemTypedData(quote.evm.permitTypedData);
    const evmPermitSignature = await account.signTypedData({ domain: ptd.domain as never, types: ptd.types as never, primaryType: ptd.primaryType as never, message: ptd.message as never });
    permitFields = { evmPermitTypedData: quote.evm.permitTypedData, evmPermitSignature };
  }

  // 4. Submit
  let orderId: string;
  try {
    const res = await flash.submitOrder({
      ...toSubmitFields(quoteReq),
      funderAddress: account.address,
      quoteId: quote.quoteId,
      userSignature,
      evmOrderTypedData: quote.evm.orderTypedData,
      ...permitFields,
    });
    orderId = res.orderId;
  } catch (e) {
    if (e instanceof FlashError) log("submit error", e.status, e.code, e.message, e.details ?? "");
    else log("submit error", e);
    // Flash can create the order and still answer 4xx; check the most recent order before failing.
    const recent = await flash.listOrders({ funderAddress: account.address, pageSize: 1 });
    const candidate = recent.orders[0];
    if (candidate && Date.now() - Date.parse(candidate.placedAt) < 60_000) {
      log("found a just-placed order despite the error; continuing with", candidate.orderId);
      orderId = candidate.orderId;
    } else {
      log("FAIL: order not created");
      process.exit(1);
    }
  }
  log("order", orderId);

  // 5. Poll
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const { order, fills } = await flash.getOrder(orderId, account.address);
    log("status", order.status, order.closeReason ?? "", `fills=${fills.length}`);
    if (fills.length) {
      for (const f of fills) log(`FILL ${f.targetAmount} WETH for ${f.contraAmount} USDC, fee ${f.integratorFeeNotional} → ${BASE.explorerTx(f.transactionId)}`);
    }
    if (TERMINAL_STATUSES.has(order.status)) {
      if (fills.length) {
        log("PASS");
        process.exit(0);
      }
      log("FAIL: terminal without fills:", order.status, order.closeReason);
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  log("FAIL: timed out after 180 s without a terminal status");
  process.exit(1);
}

main().catch((e) => {
  console.error("[flash-smoke] FAIL", e);
  process.exit(1);
});
