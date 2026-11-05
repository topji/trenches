import { PrivateKey } from "@hiero-ledger/sdk";
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

/**
 * Key parsing rule (docs/integrations/hedera.md §1): never feed a raw hex key to PrivateKey.fromString,
 * it silently assumes ED25519. DER strings are self-describing; raw hex needs the type.
 */
export function parsePrivateKey(text: string, type: "ECDSA" | "ED25519" | "DER" = "DER"): PrivateKey {
  const t = text.trim();
  if (type === "ECDSA") return PrivateKey.fromStringECDSA(t);
  if (type === "ED25519") return PrivateKey.fromStringED25519(t);
  if (t.startsWith("30")) return PrivateKey.fromStringDer(t);
  // Raw hex without a DER prefix: portal keys are ECDSA by default.
  return PrivateKey.fromStringECDSA(t);
}

export function generateEscrowKey(): PrivateKey {
  return PrivateKey.generateECDSA();
}

/* ---- AES-256-GCM envelope for per-Trench escrow keys at rest (DECISIONS.md) ---- */

function deriveKey(secret: string): Buffer {
  if (!secret || secret.length < 16) throw new Error("ESCROW_KEY_ENCRYPTION_SECRET must be at least 16 chars");
  return createHash("sha256").update(secret).digest();
}

/** Returns "v1:<iv hex>:<tag hex>:<ciphertext hex>". */
export function encryptSecret(plaintext: string, secret: string): string {
  const key = deriveKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `v1:${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${ct.toString("hex")}`;
}

export function decryptSecret(blob: string, secret: string): string {
  const [v, ivHex, tagHex, ctHex] = blob.split(":");
  if (v !== "v1" || !ivHex || !tagHex || !ctHex) throw new Error("Bad encrypted blob");
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(ctHex, "hex")), decipher.final()]).toString("utf8");
}
