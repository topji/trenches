"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { copy } from "@/lib/copy";
import { useSession } from "@/lib/session";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, inputClass } from "@/components/ui/field";
import { InlineError } from "@/components/ui/inline-error";
import { Toast } from "@/components/ui/toast";

/** Join / Leave / Create clan season, depending on who is signed in. */
export function ClanActions({ clanId, open, members, leader }: { clanId: string; open: boolean; members: string[]; leader: string }) {
  const session = useSession();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const me = session.address?.toLowerCase();
  const member = !!me && members.includes(me);
  const isLeader = !!me && leader.toLowerCase() === me;

  async function call(path: string, body: Record<string, unknown>, ok: string) {
    setBusy(true);
    setError(null);
    try {
      const headers = { "content-type": "application/json", ...(await session.authHeaders()) };
      const res = await fetch(path, { method: "POST", headers, body: JSON.stringify(body) });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Something didn't work. Try again.");
        return;
      }
      setToast(ok);
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!session.ready) return null;
  if (!session.authenticated) return <Button onClick={() => session.login()}>{copy.nav.signIn}</Button>;
  return (
    <div className="flex flex-col gap-3">
      {member ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-small text-muted">{copy.clans.joined}</span>
          {isLeader ? (
            <ButtonLink href={`/create?clan=${clanId}`} size="sm">{copy.clans.createSeason}</ButtonLink>
          ) : (
            <Button size="sm" variant="secondary" loading={busy} onClick={() => call(`/api/clans/${clanId}/leave`, {}, "Left the clan")}>{copy.clans.leave}</Button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3 max-w-[360px]">
          {!open && (
            <Field label={copy.clans.inviteCode} htmlFor="invite" helper={copy.clans.inviteHelper}>
              <input id="invite" className={`${inputClass} font-mono`} value={code} onChange={(e) => setCode(e.target.value)} />
            </Field>
          )}
          <div>
            <Button loading={busy} onClick={() => call(`/api/clans/${clanId}/join`, { inviteCode: code }, "Joined the clan")}>{copy.clans.join}</Button>
          </div>
        </div>
      )}
      <InlineError>{error}</InlineError>
      <Toast message={toast} />
    </div>
  );
}
