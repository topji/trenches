/**
 * WORLD_MOCK=true: the client builds a well-formed IDKit 4.0 result instead of opening the widget.
 * Browser-safe (no node:crypto). The server still demands a nonce it signed, the right action,
 * environment and signal hash, so an unsolicited payload is rejected (verify.ts).
 *
 * The mock "human" is `identity` (defaults to the wallet). Same identity → same nullifier → 409 on a
 * second join of the same Trench, which is the duplicate path the bounty wants demonstrated.
 */
import { hashSignal } from "@worldcoin/idkit-core/hashing";

export interface MockResultInput {
  nonce: string;
  action: string;
  environment: string;
  signal: string;
  identity: string;
}

export function buildMockIdKitResult(i: MockResultInput) {
  const nullifier = hashSignal(`mock-human:${i.identity.trim().toLowerCase()}`);
  return {
    protocol_version: "4.0" as const,
    nonce: i.nonce,
    action: i.action,
    environment: i.environment,
    responses: [
      {
        identifier: "proof_of_human",
        signal_hash: hashSignal(i.signal),
        proof: ["0x0", "0x0", "0x0", "0x0", "0x0"],
        nullifier,
        issuer_schema_id: 1,
        expires_at_min: Math.floor(Date.now() / 1000) + 3600,
      },
    ],
    mocked: true,
  };
}
