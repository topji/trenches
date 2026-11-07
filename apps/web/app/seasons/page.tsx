import type { Metadata } from "next";
import Link from "next/link";
import { clsx } from "clsx";
import type { TrenchStatus } from "@trenches/core";
import { arkivReader } from "@trenches/services";
import { copy } from "@/lib/copy";
import { formatShortDuration, formatUsd } from "@/lib/format";
import { pillFor } from "@/lib/trench-view";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: copy.nav.trenches };

const CHIPS: { key: string; label: string; statuses: TrenchStatus[] }[] = [
  { key: "all", label: copy.discovery.chips.all, statuses: ["funded", "live"] },
  { key: "live", label: copy.discovery.chips.live, statuses: ["live"] },
  { key: "upcoming", label: copy.discovery.chips.upcoming, statuses: ["funded"] },
  { key: "ended", label: copy.discovery.chips.ended, statuses: ["ended", "settled"] },
];

function href(status: string, asset: string | null, scope: "global" | "internal" = "global") {
  const q = new URLSearchParams();
  if (scope !== "global") q.set("scope", scope);
  if (status !== "all") q.set("status", status);
  if (asset) q.set("asset", asset);
  const s = q.toString();
  return s ? `/seasons?${s}` : "/seasons";
}

/**
 * F8 discovery: rows, not cards. `trenches.trench` where status in (…) [and asset = X] from Arkiv
 * (TECH_SPEC §3.3 query 1), sorted by pool. Entrant counts come from `trenches.entry`.
 */
export default async function TrenchesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const chip = CHIPS.find((c) => c.key === q.status) ?? CHIPS[0]!;
  const asset = q.asset?.toUpperCase() || null;
  const scope: "global" | "internal" = q.scope === "internal" ? "internal" : "global";
  const reader = arkivReader();
  const rows = (await reader.listTrenches({ statuses: chip.statuses, ...(asset ? { asset } : {}), limit: 100 })).filter((t) => (scope === "internal" ? !!t.clanId : !t.clanId));
  rows.sort((a, b) => b.prizePoolUsdc - a.prizePoolUsdc);
  const entrantCounts = await Promise.all(rows.slice(0, 40).map((t) => reader.listEntries(t.id).then((e) => e.length).catch(() => 0)));
  const assetChips = [...new Set(rows.flatMap((t) => t.allowedAssets.map((a) => a.symbol.toUpperCase())))].sort();
  if (asset && !assetChips.includes(asset)) assetChips.push(asset);
  const now = Date.now();

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <h1 className="text-h1">{copy.discovery.h1}</h1>
        <ButtonLink href="/create" size="sm">{copy.cta.create}</ButtonLink>
      </div>
      <div role="tablist" aria-label="Scope" className="flex gap-1 p-1 bg-raised rounded border border-line w-fit">
        {(["global", "internal"] as const).map((sc) => (
          <Link
            key={sc}
            role="tab"
            aria-selected={scope === sc}
            href={href(chip.key, asset, sc)}
            className={clsx("h-9 px-4 inline-flex items-center rounded text-small hover:no-underline", scope === sc ? "bg-bg text-text border border-line" : "text-muted")}
          >
            {copy.discovery.scopes[sc]}
          </Link>
        ))}
      </div>
      <p className="text-small text-muted -mt-2">{copy.discovery.scopeHelper[scope]}</p>
      <nav className="flex gap-2 overflow-x-auto" aria-label="Filters">
        {CHIPS.map((c) => (
          <Link
            key={c.key}
            href={href(c.key, asset, scope)}
            aria-current={c.key === chip.key ? "page" : undefined}
            className={clsx("chip hover:no-underline", c.key === chip.key && "chip-active")}
          >
            {c.label}
          </Link>
        ))}
        {assetChips.length > 0 && <span className="w-px bg-line mx-1 self-stretch" aria-hidden />}
        {assetChips.map((sym) => (
          <Link
            key={sym}
            href={href(chip.key, asset === sym ? null : sym, scope)}
            aria-pressed={asset === sym}
            className={clsx("chip hover:no-underline", asset === sym && "chip-active")}
          >
            {sym}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <EmptyState action={<ButtonLink href="/create" size="sm">{copy.cta.create}</ButtonLink>}>{copy.discovery.empty}</EmptyState>
      ) : (
        <ol className="border-t border-line">
          {rows.map((t, i) => {
            const start = Date.parse(t.startAt);
            const end = Date.parse(t.endAt);
            const timing = now < start ? copy.discovery.startsIn(formatShortDuration(start - now)) : now < end ? copy.discovery.left(formatShortDuration(end - now)) : copy.trench.countdown.ended;
            return (
              <li key={t.id} className="border-b border-line row-hover">
                <Link href={`/t/${t.slug}`} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 py-4 hover:no-underline">
                  <span className="font-semibold">
                    {t.name}
                    {t.sponsor && <span className="text-small text-muted font-normal"> · {copy.trench.sponsor(t.sponsor.name)}</span>}
                  </span>
                  <StatusPill status={pillFor(t, new Date(now))} className="row-start-1 col-start-2" />
                  <span className="text-small text-muted col-span-2 tabular">
                    {t.allowedAssets.map((a) => a.symbol).join(", ")} · {copy.discovery.pool(formatUsd(t.prizePoolUsdc).replace("$", ""))} · {copy.discovery.entrants(entrantCounts[i] ?? 0)} · {timing}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
