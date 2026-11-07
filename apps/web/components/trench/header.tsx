import type { Trench } from "@trenches/core";
import { copy } from "@/lib/copy";
import { formatUsd, shortAddress } from "@/lib/format";
import { pillFor } from "@/lib/trench-view";
import { StatusPill } from "@/components/ui/status-pill";
import { Countdown } from "./countdown";
import { Bar } from "@/components/ui/medal";
import Link from "next/link";

/** Trench page header: countdown is the hero, pool beside it (DESIGN_SYSTEM §4 skeleton). */
export function TrenchHeader({ trench, entrants, paidAt, clanTag }: { trench: Trench; entrants: number; paidAt?: string; clanTag?: string | null }) {
  const pill = pillFor(trench);
  const start = Date.parse(trench.startAt);
  const end = Date.parse(trench.endAt);
  const elapsed = Math.max(0, Math.min(1, (Date.now() - start) / Math.max(1, end - start)));
  return (
    <header className="flex flex-col gap-6">
      <div className="panel p-4 lg:p-6 hairline-top flex items-start justify-between gap-4">
        <div className="flex flex-col gap-3 min-w-0 flex-1">
          <StatusPill status={pill} />
          <Countdown startAt={trench.startAt} endAt={trench.endAt} status={trench.status} paidAt={paidAt} />
          <Bar value={trench.status === "settled" || trench.status === "ended" ? 1 : elapsed} className="max-w-[320px]" />
        </div>
        <div className="text-right">
          <div className="eyebrow">{copy.trench.pool}</div>
          <div className="font-scoreboard text-[28px] lg:text-[40px] mt-1 tabular">{formatUsd(trench.prizePoolUsdc)}</div>
          <div className="text-small text-muted mt-1 tabular">{trench.prizeSplit.join(" / ")}</div>
        </div>
      </div>
      <div>
        <h1 className="text-h1">{trench.name}</h1>
        <p className="text-muted mt-2">
          {copy.trench.by}{" "}
          <Link href={`/u/${trench.adminAddress}`} className="font-mono text-[13px]">
            {shortAddress(trench.adminAddress)}
          </Link>
          {trench.sponsor && <span> · {copy.trench.sponsor(trench.sponsor.name)}</span>}
        </p>
        <p className="text-muted mt-1">
          {trench.clanId ? (
            <Link href={clanTag ? `/trench/${clanTag}` : "/trenches"} className="text-text">{copy.clans.clanSeason}{clanTag ? ` [${clanTag}]` : ""}</Link>
          ) : (
            copy.clans.worldSeason
          )}
          {" · "}
          {copy.discovery.entrants(entrants)}
        </p>
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Allowed assets">
          {trench.allowedAssets.map((a) => (
            <li key={a.address} className="chip">{a.symbol}</li>
          ))}
        </ul>
        {trench.description && <p className="mt-4 max-w-[60ch]">{trench.description}</p>}
        <p className="mt-3 text-small">
          <Link href={`/t/${trench.slug}/share`}>{copy.cta.share}</Link>
          {(trench.status === "draft" || trench.status === "funded") && (
            <>
              {" · "}
              <Link href={`/sponsor/${trench.slug}`}>Sponsor this Trench</Link>
            </>
          )}
        </p>
      </div>
    </header>
  );
}
