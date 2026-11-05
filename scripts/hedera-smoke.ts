/**
 * Hedera smoke (no Solidity): create an escrow account, a topic, submit an HCS message, transfer the
 * prize token into escrow, create a long-term Scheduled Transaction (HIP-423) and read everything back
 * from the Mirror Node. Prints a HashScan link for every step.
 *
 *   pnpm smoke:hedera
 *
 * Env: HEDERA_OPERATOR_ID, HEDERA_OPERATOR_KEY (DER from the portal), HEDERA_PRIZE_TOKEN_ID (optional:
 *      blank → creates TRENCH-USDC once and prints the id to put in .env).
 * Exit codes: 0 PASS · 1 FAIL · 2 NEEDS ENV.
 */
import "dotenv/config";
import {
  MirrorNode,
  buildMessage,
  createDemoPrizeToken,
  createEscrowAccount,
  createTopic,
  fundFromOperator,
  getScheduleInfo,
  hashscan,
  hederaFromEnv,
  parsePrivateKey,
  scheduleTokenTransfer,
  submitMessage,
  transferToken,
} from "../packages/hedera/src/index.js";

const log = (...a: unknown[]) => console.log("[hedera-smoke]", ...a);

async function main() {
  const mirror = new MirrorNode("testnet");
  const usdc = await mirror.token("0.0.429274");
  log("mirror ok:", usdc ? `${usdc.symbol} ${usdc.token_id} decimals=${usdc.decimals}` : "testnet USDC not found");

  const ctx = hederaFromEnv();
  if (!ctx) {
    log("NEEDS ENV: HEDERA_OPERATOR_ID / HEDERA_OPERATOR_KEY not set.");
    process.exit(2);
  }
  const hs = hashscan(ctx.network);
  log("operator", ctx.operatorId.toString(), hs.account(ctx.operatorId.toString()));

  // 0. Prize token
  let tokenId = process.env.HEDERA_PRIZE_TOKEN_ID?.trim() || "";
  if (!tokenId) {
    const t = await createDemoPrizeToken(ctx);
    tokenId = t.tokenId;
    log(`created demo prize token ${tokenId} → put HEDERA_PRIZE_TOKEN_ID=${tokenId} in .env`, hs.tx(t.txId));
  }
  log("prize token", tokenId, hs.token(tokenId));
  const operatorBal = await mirror.tokenBalance(ctx.operatorId.toString(), tokenId);
  log(`operator token balance (mirror): ${operatorBal}`);

  // 1. Escrow account
  const escrow = await createEscrowAccount(ctx, "trenches smoke escrow");
  log("escrow account", escrow.accountId, hs.account(escrow.accountId), hs.tx(escrow.txId));
  const escrowKey = parsePrivateKey(escrow.privateKeyDer);

  // 2. Topic + message
  const topic = await createTopic(ctx, "trenches smoke topic");
  log("topic", topic.topicId, hs.topic(topic.topicId));
  const msg = await submitMessage(ctx, topic.topicId, buildMessage("trench.created", "SMOKE", { escrow: escrow.accountId }));
  log("hcs message seq", msg.sequenceNumber, hs.tx(msg.txId));

  // 3. Fund escrow with 1.000000 token, then pay 0.600000 back as a "payout" signed by the escrow key
  const amount = 1_000_000n;
  const fundTx = await fundFromOperator(ctx, tokenId, escrow.accountId, amount, "smoke fund");
  log("funded escrow", hs.tx(fundTx));
  const payoutTx = await transferToken(ctx, tokenId, [
    { accountId: escrow.accountId, amount: -600_000n },
    { accountId: ctx.operatorId.toString(), amount: 600_000n },
  ], [escrowKey], "smoke payout");
  log("payout from escrow", hs.tx(payoutTx));

  // 4. Long-term scheduled transfer of the remaining 0.4 back to the operator in 3 minutes (HIP-423)
  let scheduleOk = false;
  try {
    const sched = await scheduleTokenTransfer(ctx, tokenId, [
      { accountId: escrow.accountId, amount: -400_000n },
      { accountId: ctx.operatorId.toString(), amount: 400_000n },
    ], new Date(Date.now() + 3 * 60_000), { signers: [escrowKey], memo: "smoke scheduled fee share", waitForExpiry: true });
    log("schedule", sched.scheduleId, hs.schedule(sched.scheduleId), "scheduled tx id", sched.scheduledTxId);
    const info = await getScheduleInfo(ctx, sched.scheduleId);
    log("schedule info", info);
    scheduleOk = true;
  } catch (e) {
    log("scheduled transaction FAILED (fallback per DECISIONS.md: plain TransferTransaction at settlement):", (e as Error).message);
  }

  // 5. Mirror readback (a few seconds of lag is normal)
  await new Promise((r) => setTimeout(r, 6000));
  const [escrowBal, messages, payoutRec] = await Promise.all([
    mirror.tokenBalance(escrow.accountId, tokenId),
    mirror.topicMessages(topic.topicId),
    mirror.transaction(payoutTx),
  ]);
  log(`mirror: escrow balance=${escrowBal} (expect 400000), messages=${messages.length}, payout result=${payoutRec?.result ?? "not yet indexed"}`);

  if (escrowBal !== 400_000n || messages.length < 1) {
    log("FAIL: mirror state does not reconcile");
    process.exit(1);
  }
  log(scheduleOk ? "PASS (incl. Scheduled Transaction)" : "PASS (Scheduled Transaction unavailable, see above)");
}

main().catch((e) => {
  console.error("[hedera-smoke] FAIL", e);
  process.exit(1);
});
