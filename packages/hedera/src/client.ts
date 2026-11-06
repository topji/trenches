import { AccountId, Client, Hbar, type PrivateKey } from "@hiero-ledger/sdk";
import { parsePrivateKey } from "./keys.js";
import type { HederaNetwork } from "./ids.js";

export interface HederaConfig {
  network?: HederaNetwork;
  operatorId: string;
  operatorKey: string;
  operatorKeyType?: "ECDSA" | "ED25519" | "DER";
}

export interface HederaContext {
  client: Client;
  network: HederaNetwork;
  operatorId: AccountId;
  operatorKey: PrivateKey;
}

export function createHedera(cfg: HederaConfig): HederaContext {
  const network = cfg.network ?? "testnet";
  const client = network === "mainnet" ? Client.forMainnet() : network === "previewnet" ? Client.forPreviewnet() : Client.forTestnet();
  const operatorId = AccountId.fromString(cfg.operatorId);
  const operatorKey = parsePrivateKey(cfg.operatorKey, cfg.operatorKeyType ?? "DER");
  client.setOperator(operatorId, operatorKey);
  client.setDefaultMaxTransactionFee(new Hbar(10));
  client.setDefaultMaxQueryPayment(new Hbar(1));
  // Fail fast: a stuck node should surface as an error in ~1 min, not after 10 attempts × backoff.
  client.setMaxAttempts(4);
  client.setRequestTimeout(60_000);
  return { client, network, operatorId, operatorKey };
}

export function hederaFromEnv(env: NodeJS.ProcessEnv = process.env): HederaContext | null {
  if (!env.HEDERA_OPERATOR_ID || !env.HEDERA_OPERATOR_KEY) return null;
  return createHedera({
    network: (env.HEDERA_NETWORK as HederaNetwork) ?? "testnet",
    operatorId: env.HEDERA_OPERATOR_ID,
    operatorKey: env.HEDERA_OPERATOR_KEY,
    operatorKeyType: (env.HEDERA_OPERATOR_KEY_TYPE as "ECDSA" | "ED25519" | "DER") ?? "DER",
  });
}
