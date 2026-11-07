"use client";
import type { Address, Trench } from "@trenches/core";
import { useCallback, useEffect, useState } from "react";
import { copy } from "@/lib/copy";
import { explorers } from "@/lib/explorers";
import { formatCompactUsd, formatUsd, shortAddress } from "@/lib/format";
import { pillFor } from "@/lib/trench-view";
import { useSession } from "@/lib/session";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ExplorerLink } from "@/components/ui/explorer-link";
import { StatusPill } from "@/components/ui/status-pill";
import { Toast } from "@/components/ui/toast";
import Link from "next/link";

interface Row {
  trench: Trench;
  entrants: number;
  volumeUsd: number;
  feesEarnedUsd: number;
  pendingAsset: { symbol: string; address: Address; sponsor: Address } | null;
  links: { topic: string; escrow: string; arkivEntity: string | null };
}

/** F6: the host's Trenches, one primary action per row ("Share"), pending sponsor proposals inline. */
export function HostTable() {
  const session = useSession();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [share, setShare] = useState<{ row: Row; url: string; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session.authenticated) return;
    const res = await fetch("/api/me/trenches", { headers: await session.authHeaders(), cache: "no-store" });
    if (!res.ok) {
      setError(((await res.json()) as { error?: string }).error ?? "Couldn't load your Trenches.");
      return;
    }
    setRows(((await res.json()) as { trenches: Row[] }).trenches);
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openShare(row: Row) {
    const url = `${window.location.origin}/t/${row.trench.slug}`;
    let top: string[] = [];
    try {
      const res = await fetch(`/api/trenches/${row.trench.id}/leaderboard`, { cache: "no-store" });
      if (res.ok) top = ((await res.json()) as { rows: { trader: string }[] }).rows.slice(0, 3).map((r) => shortAddress(r.trader));
    } catch {
      /* no board yet */
    }
    setShare({ row, url, text: copy.dashboard.xPost(row.trench.name, row.entrants, formatUsd(row.trench.prizePoolUsdc).replace("$", ""), top, url) });
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setToast(copy.dashboard.copied);
    } catch {
      /* clipboard unavailable */
    }
  }

  async function decide(row: Row, accept: boolean) {
    const headers = { "content-type": "application/json", ...(await session.authHeaders()) };
    const res = await fetch(`/api/trenches/${row.trench.id}/sponsor/decide`, { method: "POST", headers, body: JSON.stringify({ accept }) });
    if (res.ok) {
      setToast(accept ? "Asset accepted" : "Kept current assets");
      void load();
    } else setError(((await res.json()) as { error?: string }).error ?? "Couldn't save the decision.");
  }

  if (!session.ready) return null;
  if (!session.authenticated) {
    return (
      <EmptyState action={<Button size="sm" onClick={() => session.login()}>{copy.nav.signIn}</Button>}>{copy.dashboard.signIn}</EmptyState>
    );
  }
  if (rows && rows.length === 0) return <EmptyState action={<ButtonLink href="/create" size="sm">{copy.cta.create}</ButtonLink>}>{copy.dashboard.empty}</EmptyState>;
  const c = copy.dashboard.columns;
  return (
    <div className="flex flex-col gap-4">
      {error && <p role="alert" className="text-small text-loss">{error}</p>}
      {rows && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-t border-line">
            <thead>
              <tr className="text-small text-muted text-left">
                <th scope="col" className="py-2 pr-2">{c.trench}</th>
                <th scope="col" className="py-2 pr-2">{c.status}</th>
                <th scope="col" className="py-2 pr-2 text-right">{c.entrants}</th>
                <th scope="col" className="py-2 pr-2 text-right">{c.volume}</th>
                <th scope="col" className="py-2 pr-2 text-right">{c.fees}</th>
                <th scope="col" className="py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.trench.id} className="border-t border-line align-top">
                  <td className="py-3 pr-2">
                    <Link href={`/t/${r.trench.slug}`} className="font-semibold">{r.trench.name}</Link>
                    <div className="text-small text-muted mt-1 flex flex-wrap gap-x-3">
                      <span>{r.trench.allowedAssets.map((a) => a.symbol).join(", ")} · {formatUsd(r.trench.prizePoolUsdc)} pool</span>
                      <ExplorerLink href={r.links.topic} label={copy.trench.resultsLog} />
                      <ExplorerLink href={r.links.escrow} label="Escrow" />
                    </div>
                    {r.pendingAsset && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-small">
                        <span className="text-warn">{copy.dashboard.pending(shortAddress(r.pendingAsset.sponsor), r.pendingAsset.symbol)}</span>
                        <Button size="sm" onClick={() => decide(r, true)}>{copy.dashboard.accept}</Button>
                        <Button size="sm" variant="secondary" onClick={() => decide(r, false)}>{copy.dashboard.keep}</Button>
                      </div>
                    )}
                  </td>
                  <td className="py-3 pr-2"><StatusPill status={pillFor(r.trench)} /></td>
                  <td className="py-3 pr-2 text-right tabular">{r.entrants}</td>
                  <td className="py-3 pr-2 text-right tabular">{formatCompactUsd(r.volumeUsd)}</td>
                  <td className="py-3 pr-2 text-right tabular font-scoreboard text-[16px]">{formatUsd(r.feesEarnedUsd)}</td>
                  <td className="py-3 text-right">
                    <Button size="sm" variant="secondary" onClick={() => openShare(r)}>{copy.dashboard.share}</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {share && (
        <div role="dialog" aria-label={copy.dashboard.share} className="panel p-4 flex flex-col gap-3 max-w-[560px]">
          <p className="font-semibold">{share.row.trench.name}</p>
          <p className="hash-block text-small whitespace-pre-wrap break-words">{share.text}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => copyLink(share.url)}>{copy.dashboard.copyLink}</Button>
            <a
              className="inline-flex items-center h-10 lg:h-[36px] px-3 rounded bg-raised border border-line text-small font-semibold hover:no-underline"
              href={`https://x.com/intent/post?text=${encodeURIComponent(share.text)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {copy.dashboard.postToX}
            </a>
            <Button size="sm" variant="secondary" onClick={() => setShare(null)}>Close</Button>
          </div>
        </div>
      )}
      <Toast message={toast} />
    </div>
  );
}
