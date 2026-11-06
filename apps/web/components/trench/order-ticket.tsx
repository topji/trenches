"use client";
import type { AllowedAsset, OrderType } from "@trenches/core";
import { useWallets } from "@privy-io/react-auth";
import { clsx } from "clsx";
import { useEffect, useRef, useState } from "react";
import { copy } from "@/lib/copy";
import { formatUsd } from "@/lib/format";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/ui/field";
import { InlineError } from "@/components/ui/inline-error";
import { Toast } from "@/components/ui/toast";

interface Quote {
  quoteId: string;
  symbol: string;
  from: { amount: string; notional: string };
  to: { amount: string; notional: string };
  feeUsd: string;
  priceUsd: number;
  needsApproval: boolean;
  approveTx: { to: string; data: string } | null;
  orderTypedData: string | null;
  permitTypedData: string | null;
}

const ACTIVE_TYPES: OrderType[] = ["market", "dca"];
const ALL_TYPES: OrderType[] = ["market", "dca", "bracket", "limit", "twap"];
const BASE_CHAIN_ID = 8453;

type Step = "idle" | "quoting" | "approving" | "signing" | "submitting";

/**
 * F3 order ticket: segmented type control, asset select, side, amount, live quote line, one button.
 * Signing happens in the trader's wallet (Privy EIP-1193 provider): optional approve tx, then
 * eth_signTypedData_v4 over Flash's orderTypedData. Sticky at the bottom on mobile.
 */
export function OrderTicket({ trenchId, assets, onPlaced }: { trenchId: string; assets: AllowedAsset[]; onPlaced?: () => void }) {
  const session = useSession();
  const { wallets } = useWallets();
  const [type, setType] = useState<OrderType>("market");
  const [asset, setAsset] = useState(assets[0]?.address ?? "");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("3");
  const [legs, setLegs] = useState("3");
  const [interval, setInterval_] = useState("60");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("idle");
  const [toast, setToast] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const symbol = assets.find((a) => a.address === asset)?.symbol ?? "";
  const wallet = wallets.find((w) => w.address.toLowerCase() === session.address?.toLowerCase());

  function params(): Record<string, unknown> {
    if (type === "dca") return { legs: Number(legs), intervalSeconds: Number(interval) };
    return {};
  }

  async function fetchQuote(preview: boolean): Promise<Quote | null> {
    const headers = { "content-type": "application/json", ...(await session.authHeaders()) };
    const res = await fetch(`/api/trenches/${trenchId}/orders/quote`, {
      method: "POST",
      headers,
      body: JSON.stringify({ type, asset, side, amount, params: params(), preview }),
    });
    const body = (await res.json()) as Quote & { error?: string };
    if (!res.ok) throw new Error(body.error ?? "Couldn't get a quote.");
    return body;
  }

  // Live quote line, debounced; informational only (the order re-quotes at signing time).
  useEffect(() => {
    if (!session.authenticated || !asset || !(Number(amount) > 0)) {
      setQuote(null);
      return;
    }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      setQuoteError(null);
      fetchQuote(true)
        .then(setQuote)
        .catch((e: Error) => {
          setQuote(null);
          setQuoteError(e.message);
        });
    }, 600);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, asset, side, amount, legs, interval, session.authenticated]);

  async function waitForReceipt(provider: { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> }, hash: string): Promise<void> {
    for (let i = 0; i < 60; i++) {
      const r = (await provider.request({ method: "eth_getTransactionReceipt", params: [hash] })) as { status?: string } | null;
      if (r?.status === "0x1") return;
      if (r?.status === "0x0") throw new Error("Approval transaction reverted.");
      await new Promise((res) => setTimeout(res, 2000));
    }
    throw new Error("Approval is taking too long. Try again in a minute.");
  }

  async function place() {
    setError(null);
    if (!wallet || !session.address) {
      setError(copy.order.noWallet);
      return;
    }
    try {
      setStep("quoting");
      const q = await fetchQuote(false);
      if (!q?.orderTypedData) throw new Error("Flash returned nothing to sign.");
      await wallet.switchChain(BASE_CHAIN_ID);
      const provider = await wallet.getEthereumProvider();

      if (q.approveTx) {
        setStep("approving");
        const hash = (await provider.request({ method: "eth_sendTransaction", params: [{ from: session.address, to: q.approveTx.to, data: q.approveTx.data }] })) as string;
        await waitForReceipt(provider, hash);
      }

      setStep("signing");
      const userSignature = (await provider.request({ method: "eth_signTypedData_v4", params: [session.address, q.orderTypedData] })) as string;
      let evmPermitSignature: string | undefined;
      if (q.permitTypedData) {
        evmPermitSignature = (await provider.request({ method: "eth_signTypedData_v4", params: [session.address, q.permitTypedData] })) as string;
      }

      setStep("submitting");
      const headers = { "content-type": "application/json", ...(await session.authHeaders()) };
      const res = await fetch(`/api/trenches/${trenchId}/orders`, { method: "POST", headers, body: JSON.stringify({ quoteId: q.quoteId, userSignature, evmPermitSignature }) });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Order rejected.");
      setToast(copy.order.placed);
      onPlaced?.();
    } catch (e) {
      const msg = (e as { message?: string }).message ?? "Order failed.";
      setError(/user rejected|denied/i.test(msg) ? "Signature cancelled in your wallet." : msg);
    } finally {
      setStep("idle");
    }
  }

  const f = copy.order.fields;
  const busy = step !== "idle";
  return (
    <section aria-labelledby="ticket-title" className="bg-sunken border border-line rounded-panel p-4 flex flex-col gap-4 lg:max-w-[480px]">
      <h2 id="ticket-title" className="text-h2">{copy.order.title}</h2>

      <div role="radiogroup" aria-label="Order type" className="flex gap-1 p-1 bg-raised rounded border border-line">
        {ALL_TYPES.map((t) => {
          const active = ACTIVE_TYPES.includes(t);
          return (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={type === t}
              disabled={!active}
              title={active ? undefined : copy.order.comingSoon}
              onClick={() => setType(t)}
              className={clsx("flex-1 h-10 lg:h-[36px] rounded text-small", type === t ? "bg-bg text-text border border-line" : "text-muted", !active && "opacity-40")}
            >
              {copy.order.types[t]}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label={f.asset} htmlFor="asset">
          <select id="asset" className={inputClass} value={asset} onChange={(e) => setAsset(e.target.value)}>
            {assets.map((a) => (
              <option key={a.address} value={a.address}>{a.symbol}</option>
            ))}
          </select>
        </Field>
        <Field label={f.side}>
          <div className="flex gap-1 p-1 bg-raised rounded border border-line h-11 lg:h-10" role="radiogroup" aria-label={f.side}>
            {(["buy", "sell"] as const).map((s) => (
              <button key={s} type="button" role="radio" aria-checked={side === s} onClick={() => setSide(s)} className={clsx("flex-1 rounded text-small", side === s ? "bg-bg text-text border border-line" : "text-muted")}>
                {s === "buy" ? f.buy : f.sell}
              </button>
            ))}
          </div>
        </Field>
      </div>

      <Field label={side === "buy" ? f.amountUsdc : `${f.amount} (${symbol})`} htmlFor="amount">
        <div className="relative">
          <input id="amount" type="number" inputMode="decimal" min="0" step="any" className={clsx(inputClass, "tabular pr-16")} value={amount} onChange={(e) => setAmount(e.target.value)} />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-small text-muted">{side === "buy" ? "USDC" : symbol}</span>
        </div>
      </Field>

      {type === "dca" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label={f.legs} htmlFor="legs">
            <input id="legs" type="number" inputMode="numeric" min="2" max="20" className={clsx(inputClass, "tabular")} value={legs} onChange={(e) => setLegs(e.target.value)} />
          </Field>
          <Field label={f.interval} htmlFor="interval">
            <input id="interval" type="number" inputMode="numeric" min="1" className={clsx(inputClass, "tabular")} value={interval} onChange={(e) => setInterval_(e.target.value)} />
          </Field>
        </div>
      )}

      <p className="text-small text-muted tabular min-h-[20px]" aria-live="polite">
        {quote
          ? copy.order.quoteLine(side === "buy" ? Number(quote.to.amount).toPrecision(5) : formatUsd(Number(quote.to.notional)), side === "buy" ? quote.symbol : "USDC", formatUsd(quote.priceUsd), Number(quote.feeUsd).toFixed(4))
          : quoteError
            ? ""
            : session.authenticated && Number(amount) > 0
              ? copy.order.quoting
              : ""}
      </p>
      <InlineError>{quoteError}</InlineError>

      <div>
        <Button onClick={place} loading={busy} disabled={!session.ready || !(Number(amount) > 0)} className="w-full lg:w-auto">
          {copy.cta.place}
        </Button>
      </div>
      {busy && step !== "quoting" && <p className="text-small text-muted">{copy.order.steps[step as keyof typeof copy.order.steps]}</p>}
      {!wallet && session.ready && <p className="text-small text-muted">{copy.order.noWallet}</p>}
      <InlineError>{error}</InlineError>
      <Toast message={toast} />
    </section>
  );
}
