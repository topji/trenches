"use client";
import { createTrenchSchema, type Address } from "@trenches/core";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { clsx } from "clsx";
import { copy } from "@/lib/copy";
import { ASSET_PRESETS } from "@/lib/trench-view";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/ui/field";
import { InlineError } from "@/components/ui/inline-error";

type Errors = Partial<Record<string, string>>;

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const ADMIN_STORAGE_KEY = "trenches.admin";

/** One long form (DESIGN_SYSTEM §4). Field-level errors come from the same zod schema the API uses. */
export function CreateForm({ demoMode }: { demoMode: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startAt, setStartAt] = useState(() => toLocalInput(new Date(Date.now() + (demoMode ? 2 : 10) * 60_000)));
  const [endAt, setEndAt] = useState(() => toLocalInput(new Date(Date.now() + (demoMode ? 12 : 70) * 60_000)));
  const [assets, setAssets] = useState<string[]>(["WETH"]);
  const [pool, setPool] = useState("100");
  const [split, setSplit] = useState<string[]>(["50", "30", "20"]);
  const [entryRule, setEntryRule] = useState<"open" | "invite">("open");
  const [feeShare, setFeeShare] = useState("50");
  const [admin, setAdmin] = useState("");
  useEffect(() => {
    // Remembered host address (DEMO shim until Privy lands in step 4); read after mount, never during SSR.
    try {
      const saved = window.sessionStorage.getItem(ADMIN_STORAGE_KEY);
      if (saved) setAdmin(saved);
    } catch {
      /* storage unavailable */
    }
  }, []);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const splitSum = useMemo(() => split.reduce((a, b) => a + (Number(b) || 0), 0), [split]);

  function payload() {
    return {
      name,
      description,
      startAt: new Date(startAt).toISOString(),
      endAt: new Date(endAt).toISOString(),
      allowedAssets: ASSET_PRESETS.filter((a) => assets.includes(a.symbol)).map((a) => ({ ...a })),
      prizePoolUsdc: Number(pool),
      prizeSplit: split.map((s) => Number(s) || 0),
      entryRule,
      adminFeeShareBps: Math.round(Number(feeShare) * 100),
      adminAddress: admin.trim() as Address,
    };
  }

  function validate(): boolean {
    const r = createTrenchSchema({ demoMode }).safeParse(payload());
    const next: Errors = {};
    if (!r.success) {
      for (const issue of r.error.issues) {
        const key = issue.path[0] ? String(issue.path[0]) : "form";
        if (!next[key]) next[key] = issue.message;
      }
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(admin.trim())) next.adminAddress = "Enter the host wallet address.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      try {
        window.sessionStorage.setItem(ADMIN_STORAGE_KEY, admin.trim());
      } catch {
        /* storage unavailable */
      }
      const res = await fetch("/api/trenches", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload()) });
      const body = (await res.json()) as { error?: string; field?: string; trench?: { id: string } };
      if (!res.ok || !body.trench) {
        if (body.field) setErrors({ [body.field]: body.error ?? "Invalid value." });
        else setFormError(body.error ?? copy.create.networkError);
        return;
      }
      router.push(`/create/${body.trench.id}/fund?created=1`);
    } catch {
      setFormError(copy.create.networkError);
    } finally {
      setSubmitting(false);
    }
  }

  const f = copy.create.fields;
  return (
    <form onSubmit={onSubmit} noValidate className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-x-12">
      <Field label={f.name} htmlFor="name" error={errors.name} className="lg:col-span-2">
        <input id="name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="off" />
      </Field>
      <Field label={f.description} htmlFor="description" className="lg:col-span-2">
        <textarea id="description" className={clsx(inputClass, "h-auto min-h-[88px] py-2")} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
      </Field>
      <Field label={f.startAt} htmlFor="startAt" error={errors.startAt}>
        <input id="startAt" type="datetime-local" className={inputClass} value={startAt} onChange={(e) => setStartAt(e.target.value)} />
      </Field>
      <Field label={f.endAt} htmlFor="endAt" error={errors.endAt}>
        <input id="endAt" type="datetime-local" className={inputClass} value={endAt} onChange={(e) => setEndAt(e.target.value)} />
      </Field>
      <Field label={f.assets} helper={copy.create.helpers.assets} error={errors.allowedAssets} className="lg:col-span-2">
        <div className="flex flex-wrap gap-2" role="group" aria-label={f.assets}>
          {ASSET_PRESETS.map((a) => {
            const on = assets.includes(a.symbol);
            return (
              <button
                key={a.symbol}
                type="button"
                aria-pressed={on}
                onClick={() => setAssets((s) => (on ? s.filter((x) => x !== a.symbol) : s.length < 3 ? [...s, a.symbol] : s))}
                className={clsx("h-10 px-3 rounded-pill border text-small", on ? "border-accent text-text" : "border-line text-muted")}
              >
                {a.symbol}
              </button>
            );
          })}
        </div>
      </Field>
      <Field label={f.pool} htmlFor="pool" error={errors.prizePoolUsdc}>
        <input id="pool" type="number" inputMode="decimal" min="0" step="0.01" className={clsx(inputClass, "tabular")} value={pool} onChange={(e) => setPool(e.target.value)} />
      </Field>
      <Field label={f.split} helper={copy.create.helpers.split} error={errors.prizeSplit}>
        <div className="flex items-center gap-2">
          {split.map((v, i) => (
            <input
              key={i}
              aria-label={`Rank ${i + 1} share`}
              type="number"
              inputMode="numeric"
              min="0"
              max="100"
              className={clsx(inputClass, "tabular w-[80px]")}
              value={v}
              onChange={(e) => setSplit((s) => s.map((x, j) => (j === i ? e.target.value : x)))}
            />
          ))}
          <span className={clsx("text-small tabular ml-2 whitespace-nowrap", splitSum === 100 ? "text-muted" : "text-warn")}>{copy.create.helpers.splitSum(splitSum)}</span>
        </div>
      </Field>
      <Field label={f.entryRule} error={errors.entryRule}>
        <div className="flex gap-4" role="radiogroup" aria-label={f.entryRule}>
          {(["open", "invite"] as const).map((v) => (
            <label key={v} className="inline-flex items-center gap-2 text-small">
              <input type="radio" name="entryRule" value={v} checked={entryRule === v} onChange={() => setEntryRule(v)} className="accent-[var(--accent)]" />
              {v === "open" ? f.entryOpen : f.entryInvite}
            </label>
          ))}
        </div>
      </Field>
      <Field label={f.feeShare} htmlFor="feeShare" helper={copy.create.helpers.feeShare} error={errors.adminFeeShareBps}>
        <input id="feeShare" type="number" inputMode="numeric" min="0" max="100" className={clsx(inputClass, "tabular")} value={feeShare} onChange={(e) => setFeeShare(e.target.value)} />
      </Field>
      <Field label={f.admin} htmlFor="admin" helper={copy.create.helpers.admin} error={errors.adminAddress} className="lg:col-span-2">
        <input id="admin" className={clsx(inputClass, "font-mono text-[13px]")} value={admin} onChange={(e) => setAdmin(e.target.value)} placeholder="0x…" spellCheck={false} autoComplete="off" />
      </Field>
      <div className="lg:col-span-2 flex flex-col gap-2">
        <div>
          <Button type="submit" loading={submitting}>
            {copy.cta.createSubmit}
          </Button>
        </div>
        <InlineError>{formError}</InlineError>
      </div>
    </form>
  );
}
