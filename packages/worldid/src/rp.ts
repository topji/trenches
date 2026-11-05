import { signRequest } from "@worldcoin/idkit-core/signing";

/** rp_context the widget needs (docs/integrations/world.md §3). Signed server-side, 300 s TTL. */
export interface RpContext {
  rp_id: string;
  nonce: string;
  created_at: number;
  expires_at: number;
  signature: string;
}

export function signRpContext(opts: { rpId: string; signingKeyHex: string; action: string; ttl?: number }): RpContext {
  const { sig, nonce, createdAt, expiresAt } = signRequest({ signingKeyHex: opts.signingKeyHex, action: opts.action, ttl: opts.ttl ?? 300 });
  return { rp_id: opts.rpId, nonce, created_at: createdAt, expires_at: expiresAt, signature: sig };
}

/**
 * Issued-nonce registry. Used (a) to reject results whose nonce we never issued and (b) as the only
 * thing WORLD_MOCK mode trusts: a mocked result must carry a nonce this server signed within its TTL.
 * In-memory is fine for one API process; swap for the DB `issued_nonces` table in step 4 if the API scales out.
 */
export class NonceRegistry {
  private readonly issued = new Map<string, { action: string; expiresAt: number }>();

  issue(ctx: RpContext, action: string): void {
    this.issued.set(ctx.nonce, { action, expiresAt: ctx.expires_at });
    this.sweep();
  }

  /** Consumes the nonce (single use). */
  consume(nonce: string, action: string, nowSec = Math.floor(Date.now() / 1000)): boolean {
    const rec = this.issued.get(nonce);
    if (!rec) return false;
    this.issued.delete(nonce);
    return rec.action === action && rec.expiresAt >= nowSec;
  }

  private sweep(nowSec = Math.floor(Date.now() / 1000)) {
    for (const [n, r] of this.issued) if (r.expiresAt < nowSec) this.issued.delete(n);
  }
}
