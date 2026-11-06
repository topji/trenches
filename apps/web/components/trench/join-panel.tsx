"use client";
import type { Address } from "@trenches/core";
import { buildMockIdKitResult, joinSignal } from "@trenches/worldid/client";
import { IDKitRequestWidget, proofOfHuman, type RpContext } from "@worldcoin/idkit";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { copy } from "@/lib/copy";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/ui/field";
import { InlineError } from "@/components/ui/inline-error";

interface RpResponse {
  rp_context: RpContext;
  action: string;
  app_id: `app_${string}`;
  environment: "production" | "staging" | "sandbox";
  mock: boolean;
}

type Phase = "idle" | "loading" | "mock" | "widget" | "verifying" | "joined";

/**
 * F2 join flow. Real mode: IDKitRequestWidget (Proof of Human, signal = trenchId:wallet) with the
 * server verifying inside handleVerify. Mock mode (WORLD_MOCK): an in-page sheet stands in for the
 * widget so all four paths (success, cancel, invalid, duplicate) stay demonstrable without a phone.
 */
export function JoinPanel({ trenchId, entrants, disabledReason }: { trenchId: string; entrants: Address[]; disabledReason: string | null }) {
  const router = useRouter();
  const session = useSession();
  const [phase, setPhase] = useState<Phase>("idle");
  const [rp, setRp] = useState<RpResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [identity, setIdentity] = useState("");

  const me = session.address?.toLowerCase();
  const entered = phase === "joined" || (!!me && entrants.some((a) => a.toLowerCase() === me));

  async function begin() {
    setError(null);
    setNote(null);
    if (!session.authenticated || !session.address) {
      session.login();
      return;
    }
    setPhase("loading");
    try {
      const res = await fetch(`/api/world/rp-context?trenchId=${encodeURIComponent(trenchId)}`);
      const body = (await res.json()) as RpResponse & { error?: string };
      if (!res.ok) throw new Error(body.error ?? copy.trench.joinErrors.network);
      setRp(body);
      setIdentity((i) => i || session.address!);
      setPhase(body.mock ? "mock" : "widget");
    } catch (e) {
      setError((e as Error).message || copy.trench.joinErrors.network);
      setPhase("idle");
    }
  }

  /** POST the result; throws with the server's copy so the widget (real mode) shows its error state. */
  async function submit(result: unknown): Promise<void> {
    setPhase("verifying");
    const headers = { "content-type": "application/json", ...(await session.authHeaders()) };
    let res: Response;
    try {
      res = await fetch(`/api/trenches/${trenchId}/join`, { method: "POST", headers, body: JSON.stringify({ result }) });
    } catch {
      setPhase("idle");
      setError(copy.trench.joinErrors.network);
      throw new Error(copy.trench.joinErrors.network);
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      const msg = body.error ?? (res.status === 409 ? copy.trench.joinErrors.duplicate : copy.trench.joinErrors.failed);
      setPhase("idle");
      setError(msg);
      throw new Error(msg);
    }
    setPhase("joined");
    router.refresh();
  }

  function cancel() {
    setPhase("idle");
    setNote(copy.trench.joinCancelled);
  }

  async function mockVerify() {
    if (!rp || !session.address) return;
    const result = buildMockIdKitResult({
      nonce: rp.rp_context.nonce,
      action: rp.action,
      environment: rp.environment,
      signal: joinSignal(trenchId, session.address),
      identity: identity || session.address,
    });
    await submit(result).catch(() => undefined);
  }

  if (entered) {
    return (
      <section aria-label="Join">
        <p className="font-semibold">{copy.trench.joined}</p>
      </section>
    );
  }

  return (
    <section aria-label="Join" className="flex flex-col gap-3">
      <div>
        <Button onClick={begin} loading={phase === "loading" || phase === "verifying"} disabled={!!disabledReason || !session.ready} title={disabledReason ?? undefined}>
          {session.ready && !session.authenticated ? copy.trench.joinSignIn : copy.trench.join}
        </Button>
      </div>
      <p className="text-small text-muted">{disabledReason ?? copy.trench.joinHelper}</p>
      {note && <p className="text-small text-muted">{note}</p>}
      <InlineError>{error}</InlineError>

      {phase === "mock" && rp && (
        <div role="dialog" aria-labelledby="mock-title" className="panel p-4 flex flex-col gap-4 max-w-[480px]">
          <h2 id="mock-title" className="text-h2">{copy.trench.mock.title}</h2>
          <p className="text-small text-muted">{copy.trench.mock.body}</p>
          <Field label={copy.trench.mock.identity} htmlFor="mock-identity" helper={copy.trench.mock.identityHelper}>
            <input id="mock-identity" className={`${inputClass} font-mono text-[13px]`} value={identity} onChange={(e) => setIdentity(e.target.value)} spellCheck={false} />
          </Field>
          <div className="flex gap-3">
            <Button onClick={mockVerify}>{copy.trench.mock.verify}</Button>
            <Button variant="secondary" onClick={cancel}>{copy.trench.mock.cancel}</Button>
          </div>
        </div>
      )}

      {phase === "widget" && rp && session.address && (
        <IDKitRequestWidget
          open
          onOpenChange={(open) => {
            if (!open && phase === "widget") cancel();
          }}
          app_id={rp.app_id}
          action={rp.action}
          rp_context={rp.rp_context}
          allow_legacy_proofs={true}
          preset={proofOfHuman({ signal: joinSignal(trenchId, session.address) })}
          environment={rp.environment}
          handleVerify={(result) => submit(result)}
          onSuccess={() => undefined}
          onError={(code) => {
            if (code === "user_rejected" || code === "verification_rejected" || code === "cancelled") cancel();
            else if (code !== "failed_by_host_app") {
              setPhase("idle");
              setError(`${copy.trench.joinErrors.failed} (${code})`);
            }
          }}
        />
      )}
    </section>
  );
}
