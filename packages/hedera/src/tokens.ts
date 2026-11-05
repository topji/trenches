import {
  Hbar,
  TokenAssociateTransaction,
  TokenCreateTransaction,
  TokenSupplyType,
  TokenType,
  TransferTransaction,
  type PrivateKey,
} from "@hiero-ledger/sdk";
import type { HederaContext } from "./client.js";

/** Circle's testnet USDC (docs/integrations/hedera.md §3.4). 6 dp. */
export const TESTNET_USDC_TOKEN_ID = "0.0.429274";

export interface CreatedToken {
  tokenId: string;
  txId: string;
}

/** Demo prize token when no USDC is available: TRENCH-USDC, 6 dp, 1,000,000 supply to the operator (treasury). */
export async function createDemoPrizeToken(ctx: HederaContext): Promise<CreatedToken> {
  const tx = await new TokenCreateTransaction()
    .setTokenName("Trenches USDC (demo)")
    .setTokenSymbol("TRENCH-USDC")
    .setTokenType(TokenType.FungibleCommon)
    .setDecimals(6)
    .setInitialSupply(1_000_000n * 1_000_000n)
    .setTreasuryAccountId(ctx.operatorId)
    .setSupplyType(TokenSupplyType.Infinite)
    .setSupplyKey(ctx.operatorKey.publicKey)
    .setTokenMemo("Trenches hackathon prize token")
    .setMaxTransactionFee(new Hbar(30))
    .freezeWith(ctx.client);
  const resp = await tx.execute(ctx.client); // operator is treasury + supply key → signed on execute
  const receipt = await resp.getReceipt(ctx.client);
  if (!receipt.tokenId) throw new Error("TokenCreate receipt had no tokenId");
  return { tokenId: receipt.tokenId.toString(), txId: resp.transactionId.toString() };
}

/** Associate an account we hold the key for (escrow / demo winners). */
export async function associateToken(ctx: HederaContext, accountId: string, accountKey: PrivateKey, tokenId: string): Promise<string> {
  const tx = await new TokenAssociateTransaction().setAccountId(accountId).setTokenIds([tokenId]).freezeWith(ctx.client);
  const signed = await tx.sign(accountKey);
  const resp = await signed.execute(ctx.client);
  await resp.getReceipt(ctx.client);
  return resp.transactionId.toString();
}

export interface TokenLeg {
  accountId: string;
  /** base units; negative = debit */
  amount: bigint;
}

/**
 * Multi-party HTS transfer. Legs must net to zero. Every debited account that is not the operator
 * must have its key in `signers`.
 */
export async function transferToken(
  ctx: HederaContext,
  tokenId: string,
  legs: TokenLeg[],
  signers: PrivateKey[] = [],
  memo?: string,
): Promise<string> {
  const sum = legs.reduce((a, l) => a + l.amount, 0n);
  if (sum !== 0n) throw new Error(`Token transfer legs must net to zero (got ${sum})`);
  if (legs.length > 10) throw new Error("At most 10 token adjustments per transfer");
  let tx = new TransferTransaction();
  for (const l of legs) tx = tx.addTokenTransfer(tokenId, l.accountId, l.amount);
  if (memo) tx.setTransactionMemo(memo.slice(0, 100));
  const frozen = await tx.freezeWith(ctx.client);
  let signed = frozen;
  for (const k of signers) signed = await signed.sign(k);
  const resp = await signed.execute(ctx.client);
  await resp.getReceipt(ctx.client);
  return resp.transactionId.toString();
}

/** Operator (treasury) → account, e.g. funding an escrow on the host's behalf in the demo. */
export function fundFromOperator(ctx: HederaContext, tokenId: string, to: string, amount: bigint, memo?: string) {
  return transferToken(ctx, tokenId, [{ accountId: ctx.operatorId.toString(), amount: -amount }, { accountId: to, amount }], [], memo);
}
