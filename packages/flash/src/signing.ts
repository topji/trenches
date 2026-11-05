/** EIP-712 helpers for Flash payloads. Pure; no wallet library here. docs/integrations/flash.md §6. */

export interface Eip712Payload {
  domain: Record<string, unknown>;
  types: Record<string, { name: string; type: string }[]>;
  primaryType: string;
  message: Record<string, unknown>;
}

/** Parse the JSON-stringified typed data exactly as Flash returns it (for eth_signTypedData_v4 via a provider). */
export function parseTypedData(json: string): Eip712Payload {
  const td = JSON.parse(json) as Eip712Payload;
  if (!td || typeof td !== "object" || !td.domain || !td.types || !td.primaryType || !td.message) {
    throw new Error("Flash typed data is missing domain/types/primaryType/message");
  }
  return td;
}

/**
 * viem-shaped typed data: strip `types.EIP712Domain` (viem rejects it) and coerce the string
 * `domain.chainId` to a number (viem drops a string chainId from the domain hash → bad signature).
 */
export function toViemTypedData(json: string): Eip712Payload {
  const td = parseTypedData(json);
  const { EIP712Domain: _ignored, ...types } = td.types;
  void _ignored;
  const domain = { ...td.domain };
  if (typeof domain.chainId === "string") domain.chainId = Number(domain.chainId);
  return { domain, types, primaryType: td.primaryType, message: td.message };
}

/** Byte-exact cancel message (em dash U+2014, single \n, no trailing newline). */
export function cancelMessage(orderId: string): string {
  return `Definitive Flash v1 — Cancel Order\nOrder: ${orderId}`;
}

export function batchCancelMessage(orderIds: string[]): string {
  return `Definitive Flash v1 — Cancel Orders\nOrders:\n${orderIds.join("\n")}`;
}
