"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { clsx } from "clsx";
import { copy } from "@/lib/copy";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/ui/field";
import { InlineError } from "@/components/ui/inline-error";

export function CreateClanForm() {
  const session = useSession();
  const router = useRouter();
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [description, setDescription] = useState("");
  const [open, setOpen] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const f = copy.clans.form;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    if (!session.authenticated) {
      session.login();
      return;
    }
    setBusy(true);
    try {
      const headers = { "content-type": "application/json", ...(await session.authHeaders()) };
      const res = await fetch("/api/clans", { method: "POST", headers, body: JSON.stringify({ name, tag: tag.toUpperCase(), description, open }) });
      const body = (await res.json()) as { error?: string; field?: string; tag?: string };
      if (!res.ok || !body.tag) {
        if (body.field) setErrors({ [body.field]: body.error ?? "Invalid value." });
        else setFormError(body.error ?? "Couldn't create the clan.");
        return;
      }
      router.push(`/c/${body.tag}`);
    } catch {
      setFormError("Couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6 max-w-[560px]">
      <Field label={f.name} htmlFor="clan-name" error={errors.name}>
        <input id="clan-name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
      </Field>
      <Field label={f.tag} htmlFor="clan-tag" error={errors.tag}>
        <input id="clan-tag" className={clsx(inputClass, "font-mono uppercase")} value={tag} onChange={(e) => setTag(e.target.value.toUpperCase())} maxLength={5} />
      </Field>
      <Field label={f.description} htmlFor="clan-desc">
        <textarea id="clan-desc" className={clsx(inputClass, "h-auto min-h-[88px] py-2")} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />
      </Field>
      <div className="flex gap-4" role="radiogroup" aria-label="Who can join">
        {[true, false].map((v) => (
          <label key={String(v)} className="inline-flex items-center gap-2 text-small">
            <input type="radio" name="open" checked={open === v} onChange={() => setOpen(v)} className="accent-[var(--accent)]" />
            {v ? f.open : f.invite}
          </label>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <div>
          <Button type="submit" loading={busy} disabled={!session.ready}>
            {session.ready && !session.authenticated ? copy.nav.signIn : f.submit}
          </Button>
        </div>
        <InlineError>{formError}</InlineError>
      </div>
    </form>
  );
}
