import { AccountCreateTransaction, AccountId, Hbar, PrivateKey } from "@hiero-ledger/sdk";
import type { HederaContext } from "./client.js";

export interface EscrowAccount {
  accountId: string;
  /** DER-encoded private key; encrypt before storing (keys.ts encryptSecret). */
  privateKeyDer: string;
  publicKeyDer: string;
  txId: string;
}

/**
 * One escrow account per Trench. Unlimited auto-association so the prize token can land without
 * a separate TokenAssociate step. Key generated server-side (hackathon trust assumption; see README).
 */
export async function createEscrowAccount(ctx: HederaContext, memo: string, initialHbar = 1): Promise<EscrowAccount> {
  const key = PrivateKey.generateECDSA();
  const tx = new AccountCreateTransaction()
    .setKey(key.publicKey)
    .setInitialBalance(new Hbar(initialHbar))
    .setMaxAutomaticTokenAssociations(-1)
    .setAccountMemo(memo.slice(0, 100));
  const resp = await tx.execute(ctx.client);
  const receipt = await resp.getReceipt(ctx.client);
  const accountId = receipt.accountId;
  if (!accountId) throw new Error("AccountCreate receipt had no accountId");
  return {
    accountId: accountId.toString(),
    privateKeyDer: key.toStringDer(),
    publicKeyDer: key.publicKey.toStringDer(),
    txId: resp.transactionId.toString(),
  };
}

export function accountIdOf(s: string): AccountId {
  return AccountId.fromString(s);
}
