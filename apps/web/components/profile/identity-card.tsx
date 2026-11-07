"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { copy } from "@/lib/copy";
import { useSession } from "@/lib/session";
import type { IdentityLite } from "@/lib/identity";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/ui/field";
import { Toast } from "@/components/ui/toast";

/** Handle, title, level bar, clan tag; a claim-handle form when it's the viewer's own address without a handle. */
export function IdentityCard({ address, identity, nextXp, progress }: { address: string; identity: IdentityLite | null; nextXp: number | null; progress: number }) {
  const session = useSession();
  const router = useRouter();
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const mine = session.ready && session.authenticated && session.address?.toLowerCase() === address.toLowerCase();

  async function claim(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const headers = { "content-type": "application/json", ...(await session.authHeaders()) };
      const res = await fetch("/api/profile/handle", { method: "POST", headers, body: JSON.stringify({ handle }) });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? copy.clans.handle.taken);
        return;
      }
      setToast(copy.clans.handle.toast);
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const level = identity?.level ?? 1;
  const title = identity?.title ?? "Recruit";
  const xp = identity?.xp ?? 0;
  return (
    <div className="panel px-4 py-3 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="font-semibold">{identity?.handle ? `@${identity.handle}` : "No handle yet"}</div>
          <div className="text-small text-muted">
            {copy.clans.level(level, title)}
            {identity?.tag && (
              <>
                {" · "}
                <Link href={`/c/${identity.tag}`} className="font-mono">[{identity.tag}]</Link>
              </>
            )}
          </div>
        </div>
        <div className="text-small text-muted tabular">{copy.clans.xp(xp, nextXp)}</div>
      </div>
      <div className="h-2 w-full bg-sunken rounded-pill overflow-hidden" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Level progress">
        <div className="h-full bg-accent" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      {mine && !identity?.handle && (
        <form onSubmit={claim} noValidate className="flex flex-col gap-2 max-w-[360px]">
          <Field label={copy.clans.handle.label} htmlFor="handle" helper={copy.clans.handle.helper} error={error}>
            <input id="handle" className={inputClass} value={handle} onChange={(e) => setHandle(e.target.value)} maxLength={16} />
          </Field>
          <div>
            <Button type="submit" size="sm" loading={busy}>{copy.clans.handle.submit}</Button>
          </div>
        </form>
      )}
      <Toast message={toast} />
    </div>
  );
}
