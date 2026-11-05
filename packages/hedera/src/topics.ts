import { TopicCreateTransaction, TopicMessageSubmitTransaction } from "@hiero-ledger/sdk";
import type { HederaContext } from "./client.js";

export interface CreatedTopic {
  topicId: string;
  txId: string;
}

/** Public topic (no submit key) so anyone can verify, memo names the Trench. */
export async function createTopic(ctx: HederaContext, memo: string): Promise<CreatedTopic> {
  const resp = await new TopicCreateTransaction().setTopicMemo(memo.slice(0, 100)).execute(ctx.client);
  const receipt = await resp.getReceipt(ctx.client);
  if (!receipt.topicId) throw new Error("TopicCreate receipt had no topicId");
  return { topicId: receipt.topicId.toString(), txId: resp.transactionId.toString() };
}

/** HCS message envelope (DECISIONS.md): JSON, payload ≤ 1 KB so it fits one chunk. */
export interface HcsMessage<T = unknown> {
  v: 1;
  event: string;
  trenchId: string;
  at: string;
  payload: T;
}

export const HCS_MAX_BYTES = 1024;

export function buildMessage<T>(event: string, trenchId: string, payload: T, at = new Date().toISOString()): string {
  const json = JSON.stringify({ v: 1, event, trenchId, at, payload } satisfies HcsMessage<T>);
  if (Buffer.byteLength(json, "utf8") > HCS_MAX_BYTES) {
    throw new Error(`HCS message for ${event} is ${Buffer.byteLength(json)} bytes (> ${HCS_MAX_BYTES}); trim the payload`);
  }
  return json;
}

export interface SubmittedMessage {
  txId: string;
  sequenceNumber: number;
}

export async function submitMessage(ctx: HederaContext, topicId: string, message: string): Promise<SubmittedMessage> {
  const resp = await new TopicMessageSubmitTransaction().setTopicId(topicId).setMessage(message).execute(ctx.client);
  const receipt = await resp.getReceipt(ctx.client);
  return { txId: resp.transactionId.toString(), sequenceNumber: receipt.topicSequenceNumber ? Number(receipt.topicSequenceNumber.toString()) : 0 };
}
