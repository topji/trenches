import { z } from "zod";
import { toMirrorTxId, type HederaNetwork } from "./ids.js";

/** Mirror Node REST (docs/integrations/hedera.md §6). Cached 10 s by callers (DECISIONS.md). */
export function mirrorBase(network: HederaNetwork = "testnet") {
  return `https://${network}.mirrornode.hedera.com`;
}

const accountSchema = z.object({
  account: z.string(),
  balance: z.object({ balance: z.number(), timestamp: z.string(), tokens: z.array(z.object({ token_id: z.string(), balance: z.number() })) }),
  deleted: z.boolean().optional(),
  memo: z.string().optional(),
}).passthrough();

const tokenSchema = z.object({ token_id: z.string(), name: z.string(), symbol: z.string(), decimals: z.string(), total_supply: z.string().optional() }).passthrough();

const txSchema = z.object({
  transactions: z.array(
    z.object({
      transaction_id: z.string(),
      result: z.string(),
      name: z.string(),
      consensus_timestamp: z.string(),
      entity_id: z.string().nullable().optional(),
      scheduled: z.boolean().optional(),
      token_transfers: z.array(z.object({ token_id: z.string(), account: z.string(), amount: z.number() })).optional().default([]),
      transfers: z.array(z.object({ account: z.string(), amount: z.number() })).optional().default([]),
    }).passthrough(),
  ),
});

const topicMessagesSchema = z.object({
  messages: z.array(z.object({ consensus_timestamp: z.string(), message: z.string(), sequence_number: z.number(), topic_id: z.string(), payer_account_id: z.string().optional() }).passthrough()),
  links: z.object({ next: z.string().nullable() }).optional(),
});

const scheduleSchema = z.object({
  schedule_id: z.string(),
  executed_timestamp: z.string().nullable(),
  expiration_time: z.string().nullable(),
  wait_for_expiry: z.boolean(),
  deleted: z.boolean(),
  memo: z.string().optional(),
}).passthrough();

export class MirrorNode {
  constructor(private readonly network: HederaNetwork = "testnet", private readonly fetchImpl: typeof fetch = fetch) {}

  private async get<T>(path: string, schema: z.ZodType<T>): Promise<T | null> {
    const res = await this.fetchImpl(`${mirrorBase(this.network)}${path}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Mirror node ${res.status} for ${path}`);
    return schema.parse(await res.json());
  }

  account(id: string) {
    return this.get(`/api/v1/accounts/${id}?transactions=false`, accountSchema);
  }

  /** Token balance in base units for an account (0n if not associated / unknown). */
  async tokenBalance(accountId: string, tokenId: string): Promise<bigint> {
    const a = await this.account(accountId);
    const row = a?.balance.tokens.find((t) => t.token_id === tokenId);
    return row ? BigInt(row.balance) : 0n;
  }

  token(id: string) {
    return this.get(`/api/v1/tokens/${id}`, tokenSchema);
  }

  /** Accepts the SDK "@" form or mirror form; pass scheduled=true for the inner scheduled execution. */
  async transaction(txId: string, scheduled?: boolean) {
    const q = scheduled === undefined ? "" : `?scheduled=${scheduled}`;
    const r = await this.get(`/api/v1/transactions/${toMirrorTxId(txId)}${q}`, txSchema);
    return r?.transactions[0] ?? null;
  }

  async topicMessages(topicId: string, opts: { limit?: number; order?: "asc" | "desc"; afterSequence?: number } = {}) {
    const q = new URLSearchParams({ limit: String(opts.limit ?? 25), order: opts.order ?? "asc" });
    if (opts.afterSequence !== undefined) q.set("sequencenumber", `gt:${opts.afterSequence}`);
    const r = await this.get(`/api/v1/topics/${topicId}/messages?${q}`, topicMessagesSchema);
    return (r?.messages ?? []).map((m) => ({
      sequenceNumber: m.sequence_number,
      consensusTimestamp: m.consensus_timestamp,
      text: Buffer.from(m.message, "base64").toString("utf8"),
    }));
  }

  schedule(id: string) {
    return this.get(`/api/v1/schedules/${id}`, scheduleSchema);
  }
}
