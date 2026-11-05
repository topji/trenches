import { FLASH_BASE_URL } from "./constants.js";
import {
  cancelResponseSchema,
  errorResponseSchema,
  getOrderResponseSchema,
  listOrdersResponseSchema,
  quoteRequestSchema,
  quoteResponseSchema,
  searchResponseSchema,
  balancesResponseSchema,
  submitOrderRequestSchema,
  submitOrderResponseSchema,
  type QuoteRequest,
  type QuoteResponse,
  type SubmitOrderRequest,
  type GetOrderResponse,
  type FlashOrderStatus,
} from "./schemas.js";

/** Structural parser type so differing zod copies across packages still typecheck. */
type Parser<T> = { safeParse(data: unknown): { success: true; data: T } | { success: false; error: { message: string } } };

export class FlashError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "FlashError";
  }
}

export interface FlashClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

/** Thin, zod-validated wrapper over the Flash REST API (docs/integrations/flash.md). */
export class FlashClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: FlashClientOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? FLASH_BASE_URL).replace(/\/$/, "");
    this.fetchImpl = opts.fetch ?? fetch;
  }

  private async request<T>(method: string, path: string, body: unknown, schema: Parser<T>): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: { "content-type": "application/json", "x-definitive-api-key": this.apiKey },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      throw new FlashError(res.status, "BAD_JSON", `Flash returned non-JSON (${res.status}): ${text.slice(0, 200)}`);
    }
    if (!res.ok) {
      const parsed = errorResponseSchema.safeParse(json);
      if (parsed.success) {
        throw new FlashError(res.status, parsed.data.error.code, parsed.data.error.message, parsed.data.error.details);
      }
      throw new FlashError(res.status, "UNKNOWN", `Flash ${res.status}: ${text.slice(0, 200)}`);
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new FlashError(res.status, "SCHEMA_MISMATCH", `Flash response did not match schema: ${parsed.error.message}`, json);
    }
    return parsed.data;
  }

  quote(req: QuoteRequest): Promise<QuoteResponse> {
    return this.request("POST", "/quote", quoteRequestSchema.parse(req), quoteResponseSchema);
  }

  submitOrder(req: SubmitOrderRequest) {
    return this.request("POST", "/order", submitOrderRequestSchema.parse(req), submitOrderResponseSchema);
  }

  getOrder(orderId: string, funderAddress: string): Promise<GetOrderResponse> {
    const q = new URLSearchParams({ funderAddress });
    return this.request("GET", `/orders/${orderId}?${q}`, undefined, getOrderResponseSchema);
  }

  listOrders(params: { funderAddress?: string; statuses?: FlashOrderStatus[]; pageSize?: number; pageToken?: string } = {}) {
    const q = new URLSearchParams();
    if (params.funderAddress) q.set("funderAddress", params.funderAddress);
    if (params.statuses?.length) q.set("statuses", params.statuses.join(","));
    if (params.pageSize) q.set("pageSize", String(params.pageSize));
    if (params.pageToken) q.set("pageToken", params.pageToken);
    const qs = q.toString();
    return this.request("GET", `/orders${qs ? `?${qs}` : ""}`, undefined, listOrdersResponseSchema);
  }

  cancelOrder(orderId: string, cancelMessage: string, userSignature: string) {
    return this.request("POST", `/orders/${orderId}/cancel`, { cancelMessage, userSignature }, cancelResponseSchema);
  }

  search(query: string, chain?: string, limit = 10) {
    const q = new URLSearchParams({ query, limit: String(limit) });
    if (chain) q.set("chain", chain);
    return this.request("GET", `/search?${q}`, undefined, searchResponseSchema);
  }

  balances(address: string) {
    return this.request("GET", `/balances/${address}`, undefined, balancesResponseSchema);
  }
}
