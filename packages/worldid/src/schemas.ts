import { z } from "zod";

/** IDKit 4.x result shapes (docs/integrations/world.md §2.2). Forwarded to the verify endpoint unchanged. */
const responseItemV4 = z.object({
  identifier: z.string(),
  signal_hash: z.string().optional(),
  proof: z.array(z.string()),
  nullifier: z.string(),
  issuer_schema_id: z.number(),
  expires_at_min: z.number(),
  sybil_score: z.number().optional(),
}).passthrough();

const responseItemV3 = z.object({
  identifier: z.string(),
  signal_hash: z.string().optional(),
  proof: z.string(),
  merkle_root: z.string(),
  nullifier: z.string(),
}).passthrough();

export const idkitResultV4Schema = z.object({
  protocol_version: z.literal("4.0"),
  nonce: z.string(),
  action: z.string(),
  responses: z.array(responseItemV4).min(1),
  environment: z.string(),
}).passthrough();

export const idkitResultV3Schema = z.object({
  protocol_version: z.literal("3.0"),
  nonce: z.string(),
  action: z.string().optional(),
  responses: z.array(responseItemV3).min(1),
  environment: z.string(),
}).passthrough();

export const idkitResultSchema = z.discriminatedUnion("protocol_version", [idkitResultV4Schema, idkitResultV3Schema]);
export type IdKitResult = z.infer<typeof idkitResultSchema>;

/** §4.1 verify responses */
export const verifySuccessSchema = z.object({
  success: z.literal(true),
  action: z.string().optional(),
  nullifier: z.string().optional(),
  environment: z.string().optional(),
  results: z.array(z.object({ identifier: z.string().optional(), success: z.boolean(), nullifier: z.string().optional(), code: z.string().optional(), detail: z.string().optional() })),
  message: z.string().optional(),
}).passthrough();

export const verifyErrorSchema = z.object({
  success: z.literal(false),
  code: z.string(),
  detail: z.string(),
  results: z.array(z.object({ identifier: z.string().optional(), success: z.boolean(), code: z.string().optional(), detail: z.string().optional() })).optional(),
}).passthrough();

export const ACCEPTED_IDENTIFIERS = new Set(["proof_of_human", "orb"]);
