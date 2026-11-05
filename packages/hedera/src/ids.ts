/** Transaction id and HashScan helpers (docs/integrations/hedera.md §6.3, §7, §8). */
export type HederaNetwork = "testnet" | "mainnet" | "previewnet";

/** "0.0.123@1699999999.123456789[?scheduled][/nonce]" → "0.0.123-1699999999-123456789" */
export function toMirrorTxId(sdkId: string): string {
  const base = sdkId.split("?")[0]!.split("/")[0]!;
  if (base.includes("-") && !base.includes("@")) return base; // already mirror form
  const [payer, ts] = base.split("@");
  if (!payer || !ts) throw new Error(`Bad transaction id: ${sdkId}`);
  const [sec, nanos = "0"] = ts.split(".");
  return `${payer}-${sec}-${nanos.padEnd(9, "0")}`;
}

export function isScheduledTxId(sdkId: string): boolean {
  return sdkId.includes("?scheduled");
}

export function hashscan(network: HederaNetwork = "testnet") {
  const base = `https://hashscan.io/${network}`;
  return {
    tx: (sdkOrMirrorId: string) => `${base}/transaction/${toMirrorTxId(sdkOrMirrorId)}`,
    account: (id: string) => `${base}/account/${id}`,
    token: (id: string) => `${base}/token/${id}`,
    topic: (id: string) => `${base}/topic/${id}`,
    schedule: (id: string) => `${base}/schedule/${id}`,
  };
}
