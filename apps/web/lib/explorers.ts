/** Explorer link builders. Every on-chain action in the UI goes through one of these. */
export const explorers = {
  baseTx: (hash: string) => `https://basescan.org/tx/${hash}`,
  baseAddress: (addr: string) => `https://basescan.org/address/${addr}`,
  hashscanTx: (txId: string) => `https://hashscan.io/testnet/transaction/${txId}`,
  hashscanAccount: (id: string) => `https://hashscan.io/testnet/account/${id}`,
  hashscanTopic: (id: string) => `https://hashscan.io/testnet/topic/${id}`,
  hashscanToken: (id: string) => `https://hashscan.io/testnet/token/${id}`,
  hashscanSchedule: (id: string) => `https://hashscan.io/testnet/schedule/${id}`,
  arkivTx: (hash: string) => `https://rabdi.explorer.arkiv.network/tx/${hash}`,
  arkivAddress: (addr: string) => `https://rabdi.explorer.arkiv.network/address/${addr}`,
  arkivEntity: (key: string) => `https://rabdi.explorer.arkiv.network/entity/${key}`,
} as const;
