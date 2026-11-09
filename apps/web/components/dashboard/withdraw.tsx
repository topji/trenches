"use client";
import { useWallets } from "@privy-io/react-auth";
import { useCallback, useEffect, useState } from "react";
import { encodeFunctionData, erc20Abi, formatUnits, isAddress, parseUnits, type Address } from "viem";
import { copy } from "@/lib/copy";
import { explorers } from "@/lib/explorers";
import { shortAddress } from "@/lib/format";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/ui/field";
import { InlineError } from "@/components/ui/inline-error";

const BASE_CHAIN_ID = 8453;
/** ETH kept back on "Max" so the transfer itself can pay Base gas plus the L1 data fee. */
const ETH_GAS_RESERVE = parseUnits("0.00002", 18);

const ASSETS = [
  { symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address, decimals: 6 },
  { symbol: "WETH", address: "0x4200000000000000000000000000000000000006" as Address, decimals: 18 },
  { symbol: "cbBTC", address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf" as Address, decimals: 8 },
  { symbol: "ETH", address: null, decimals: 18 },
] as const;
type Symbol = (typeof ASSETS)[number]["symbol"];

type Provider = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };

async function waitForReceipt(provider: Provider, hash: string): Promise<void> {
  for (let i = 0; i < 60; i++) {
    const r = (await provider.request({ method: "eth_getTransactionReceipt", params: [hash] })) as { status?: string } | null;
    if (r?.status === "0x1") return;
    if (r?.status === "0x0") throw new Error("The transfer reverted on Base.");
    await new Promise((res) => setTimeout(res, 2000));
  }
  throw new Error("The transfer is taking a while. Check Basescan before trying again.");
}

/** Send USDC, WETH, cbBTC or ETH from the embedded wallet to any Base address. */
export function Withdraw() {
  if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID) return null;
  return <WithdrawInner />;
}

function WithdrawInner() {
  const session = useSession();
  const { wallets } = useWallets();
  const wallet = wallets.find((w) => w.walletClientType === "privy" && w.address.toLowerCase() === session.address?.toLowerCase());
  const w = copy.dashboard.withdraw;

  const [balances, setBalances] = useState<Record<Symbol, string> | null>(null);
  const [symbol, setSymbol] = useState<Symbol>("USDC");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ hash: string; label: string } | null>(null);

  const load = useCallback(async () => {
    if (!session.address) return;
    const tokens = ASSETS.filter((a) => a.address).map((a) => a.address).join(",");
    const res = await fetch(`/api/wallet/balances?address=${session.address}&assets=${tokens}`);
    if (!res.ok) return;
    const b = (await res.json()) as { eth: string; balances: Record<string, string> };
    const next = { ETH: b.eth } as Record<Symbol, string>;
    for (const a of ASSETS) if (a.address) next[a.symbol] = b.balances[a.address.toLowerCase()] ?? "0";
    setBalances(next);
  }, [session.address]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!wallet || !session.address) return null;

  const asset = ASSETS.find((a) => a.symbol === symbol)!;
  const balance = balances?.[symbol];

  function maxAmount(): string {
    if (balance === undefined) return "";
    if (asset.address) return balance;
    const raw = parseUnits(balance, 18) - ETH_GAS_RESERVE;
    return raw > 0n ? formatUnits(raw, 18) : "0";
  }

  function validate(): string | null {
    if (!isAddress(to)) return w.errors.address;
    if (to.toLowerCase() === session.address?.toLowerCase()) return w.errors.self;
    let raw: bigint;
    try {
      raw = parseUnits(amount, asset.decimals);
    } catch {
      return w.errors.amount;
    }
    if (raw <= 0n) return w.errors.amount;
    if (balance !== undefined && raw > parseUnits(balance, asset.decimals)) return w.errors.tooMuch;
    if (asset.address && balances && parseUnits(balances.ETH, 18) === 0n) return w.errors.noGas;
    return null;
  }

  async function send() {
    if (!wallet || !session.address) return;
    setBusy(true);
    setError(null);
    try {
      await wallet.switchChain(BASE_CHAIN_ID);
      const provider = (await wallet.getEthereumProvider()) as Provider;
      const raw = parseUnits(amount, asset.decimals);
      const tx = asset.address
        ? { from: session.address, to: asset.address, data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to as Address, raw] }) }
        : { from: session.address, to, value: `0x${raw.toString(16)}` };
      const hash = (await provider.request({ method: "eth_sendTransaction", params: [tx] })) as string;
      await waitForReceipt(provider, hash);
      setSent({ hash, label: `${amount} ${symbol} → ${shortAddress(to)}` });
      setAmount("");
      setConfirming(false);
      await load();
    } catch (e) {
      const msg = (e as { message?: string }).message ?? "Withdrawal failed.";
      setError(/user rejected|denied/i.test(msg) ? w.errors.cancelled : msg);
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label={w.title} className="panel p-4 flex flex-col gap-4 max-w-[560px]">
      <div className="flex flex-col gap-1">
        <h2 className="text-h2">{w.title}</h2>
        <p className="text-small text-muted">{w.body}</p>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label={w.asset}>
        {ASSETS.map((a) => (
          <button
            key={a.symbol}
            type="button"
            aria-pressed={symbol === a.symbol}
            onClick={() => {
              setSymbol(a.symbol);
              setAmount("");
              setConfirming(false);
            }}
            className={`chip ${symbol === a.symbol ? "chip-active" : ""}`}
          >
            {a.symbol}
            <span className="text-faint tabular ml-1">{balances ? Number(balances[a.symbol]).toFixed(a.decimals === 6 ? 2 : 6).replace(/\.?0+$/, "") || "0" : "…"}</span>
          </button>
        ))}
      </div>

      <Field label={w.to} htmlFor="withdraw-to" helper={w.toHelper}>
        <input id="withdraw-to" className={`${inputClass} font-mono text-[13px]`} placeholder="0x…" value={to} spellCheck={false} autoComplete="off" onChange={(e) => { setTo(e.target.value.trim()); setConfirming(false); }} />
      </Field>

      <Field label={`${w.amount} (${symbol})`} htmlFor="withdraw-amount">
        <div className="flex gap-2">
          <input id="withdraw-amount" inputMode="decimal" className={`${inputClass} tabular`} placeholder="0.0" value={amount} onChange={(e) => { setAmount(e.target.value.trim()); setConfirming(false); }} />
          <Button variant="secondary" size="sm" type="button" onClick={() => setAmount(maxAmount())} disabled={balance === undefined}>
            {w.max}
          </Button>
        </div>
      </Field>

      {!confirming ? (
        <div>
          <Button
            onClick={() => {
              setSent(null);
              const v = validate();
              setError(v);
              if (!v) setConfirming(true);
            }}
            disabled={busy}
          >
            {w.cta}
          </Button>
        </div>
      ) : (
        <div role="alertdialog" aria-labelledby="withdraw-confirm" className="panel-sunken p-3 flex flex-col gap-3">
          <p id="withdraw-confirm" className="text-small">
            {w.confirm(amount, symbol)} <span className="font-mono break-all">{to}</span>
          </p>
          <p className="text-small text-faint">{w.irreversible}</p>
          <div className="flex gap-2">
            <Button onClick={send} loading={busy}>{w.confirmCta}</Button>
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={busy}>{w.cancel}</Button>
          </div>
        </div>
      )}

      <InlineError>{error}</InlineError>
      {sent && (
        <p className="text-small">
          {w.sent} {sent.label} ·{" "}
          <a href={explorers.baseTx(sent.hash)} target="_blank" rel="noreferrer" className="underline">{w.viewTx}</a>
        </p>
      )}
      <p className="text-small text-faint">{w.gasNote}</p>
    </section>
  );
}
