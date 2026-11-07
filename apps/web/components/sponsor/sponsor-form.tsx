"use client";
import type { AllowedAsset } from "@trenches/core";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { clsx } from "clsx";
import { copy } from "@/lib/copy";
import { formatUsd } from "@/lib/format";
import { ASSET_PRESETS } from "@/lib/trench-view";
import { useSession } from "@/lib/session";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, inputClass } from "@/components/ui/field";
import { InlineError } from "@/components/ui/inline-error";
import { Toast } from "@/components/ui/toast";

/** F9: sponsor name, logo, amount, optional asset proposal → POST /sponsor; treasury funds the escrow in the demo. */
export function SponsorForm({ trenchId, slug, currentAssets, closed }: { trenchId: string; slug: string; currentAssets: AllowedAsset[]; closed: boolean }) {
  const session = useSession();
  const router = useRouter();
  const [name, setName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [amount, setAmount] = useState("5");
  const [propose, setPropose] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ pool: number } | null>(null);
  const f = copy.sponsor.fields;
  const current = new Set(currentAssets.map((a) => a.symbol));
  const proposable = ASSET_PRESETS.filter((a) => !current.has(a.symbol));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    if (!session.authenticated) {
      session.login();
      return;
    }
    const next: Record<string, string> = {};
    if (name.trim().length < 2) next.name = "Sponsor name needs at least 2 characters.";
    if (!(Number(amount) > 0)) next.amountUsdc = "Amount must be more than 0.";
    if (Object.keys(next).length) {
      setErrors(next);
      return;
    }
    setBusy(true);
    try {
      const proposed = proposable.find((a) => a.symbol === propose);
      const headers = { "content-type": "application/json", ...(await session.authHeaders()) };
      const res = await fetch(`/api/trenches/${trenchId}/sponsor`, {
        method: "POST",
        headers,
        body: JSON.stringify({ name: name.trim(), logoUrl: logoUrl.trim(), amountUsdc: Number(amount), ...(proposed ? { proposedAsset: { ...proposed } } : {}) }),
      });
      const body = (await res.json()) as { error?: string; field?: string; trench?: { prizePoolUsdc: number } };
      if (!res.ok || !body.trench) {
        if (body.field) setErrors({ [body.field]: body.error ?? "Invalid value." });
        else setFormError(body.error ?? "Couldn't fund the pool. Try again.");
        return;
      }
      setDone({ pool: body.trench.prizePoolUsdc });
      router.refresh();
    } catch {
      setFormError("Couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (closed) return <p className="text-muted">{copy.sponsor.closed}</p>;
  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <p>{copy.sponsor.done(formatUsd(done.pool).replace("$", ""))}</p>
        <div>
          <ButtonLink href={`/t/${slug}`}>{copy.sponsor.open}</ButtonLink>
        </div>
        <Toast message={copy.sponsor.toast} />
      </div>
    );
  }
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6 max-w-[560px]">
      <Field label={f.name} htmlFor="sponsor-name" error={errors.name}>
        <input id="sponsor-name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
      </Field>
      <Field label={f.logo} htmlFor="sponsor-logo" error={errors.logoUrl}>
        <input id="sponsor-logo" className={inputClass} value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://" />
      </Field>
      <Field label={f.amount} htmlFor="sponsor-amount" error={errors.amountUsdc}>
        <input id="sponsor-amount" type="number" inputMode="decimal" min="0" step="0.01" className={clsx(inputClass, "tabular")} value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field label={f.propose} htmlFor="sponsor-asset">
        <select id="sponsor-asset" className={inputClass} value={propose} onChange={(e) => setPropose(e.target.value)}>
          <option value="">{f.none}</option>
          {proposable.map((a) => (
            <option key={a.symbol} value={a.symbol}>{a.symbol}</option>
          ))}
        </select>
      </Field>
      <div className="flex flex-col gap-2">
        <div>
          <Button type="submit" loading={busy} disabled={!session.ready}>
            {session.ready && !session.authenticated ? copy.sponsor.signIn : copy.sponsor.submit}
          </Button>
        </div>
        <InlineError>{formError}</InlineError>
      </div>
    </form>
  );
}
