import { createPublicClient, createWalletClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { http, isHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const ARKIV_CHAIN_ID = 7794095;
export const ARKIV_EXPLORER = "https://rabdi.explorer.arkiv.network";

export interface ArkivConfig {
  /** Access key from https://hub.arkiv.network/access-keys; empty string = rate-limited public endpoint. */
  accessKey?: string;
  /** Writer private key (0x…); omit for a read-only client. */
  writerKey?: string;
}

export type ArkivPublicClient = ReturnType<typeof createPublicClient>;
export type ArkivWalletClient = ReturnType<typeof createWalletClient>;

export function arkivChain(accessKey = "") {
  return rabdi({ accessKey });
}

export function createArkivPublic(cfg: ArkivConfig = {}): ArkivPublicClient {
  return createPublicClient({ chain: arkivChain(cfg.accessKey ?? ""), transport: http() });
}

export function createArkivWallet(cfg: ArkivConfig): { client: ArkivWalletClient; address: Hex } {
  if (!cfg.writerKey || !isHex(cfg.writerKey)) throw new Error("ARKIV_WRITER_KEY must be a 0x-prefixed hex private key");
  const account = privateKeyToAccount(cfg.writerKey as Hex);
  const client = createWalletClient({ chain: arkivChain(cfg.accessKey ?? ""), transport: http(), account });
  return { client, address: account.address };
}

export function arkivFromEnv(env: NodeJS.ProcessEnv = process.env) {
  const accessKey = env.ARKIV_ACCESS_KEY ?? "";
  const pub = createArkivPublic({ accessKey });
  const wallet = env.ARKIV_WRITER_KEY ? createArkivWallet({ accessKey, writerKey: env.ARKIV_WRITER_KEY }) : null;
  return { pub, wallet };
}

export const arkivExplorer = {
  tx: (hash: string) => `${ARKIV_EXPLORER}/tx/${hash}`,
  address: (a: string) => `${ARKIV_EXPLORER}/address/${a}`,
  entity: (key: string) => `${ARKIV_EXPLORER}/entity/${key}`,
};
