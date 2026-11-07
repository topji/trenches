import type { Trench } from "@trenches/core";
import { copy } from "@/lib/copy";
import { formatUsd, shortAddress } from "@/lib/format";
import { pillFor } from "@/lib/trench-view";
import { StatusPill } from "@/components/ui/status-pill";
import { Countdown } from "./countdown";
import Link from "next/link";

/** Trench page header: countdown is the hero, pool beside it (DESIGN_SYSTEM §4 skeleton). */
export function TrenchHeader({ trench, entrants, paidAt, clanTag }: { trench: Trench; entrants: number; paidAt?: string; clanTag?: string | null }) {
  const pill = pillFor(trench);
  return (
    <header className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-3">
          <StatusPill status={pill} />
          <Countdown startAt={trench.startAt} endAt={trench.endAt} status={trench.status} paidAt={paidAt} />
        </div>
        <div className="text-right">
          <div className="text-small text-muted">{copy.trench.pool}</div>
          <div className="font-scoreboard text-figure lg:text-[32px] mt-1 tabular">{formatUsd(trench.prizePoolUsdc)}</div>
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
            <Link href={clanTag ? `/c/${clanTag}` : "/clans"} className="text-text">{copy.clans.clanBattle}{clanTag ? ` [${clanTag}]` : ""}</Link>
          ) : (
            copy.clans.worldBattle
          )}
          {" · "}
          {trench.allowedAssets.map((a) => a.symbol).join(", ")} · {trench.prizeSplit.join("/")} · {copy.discovery.entrants(entrants)}
        </p>
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
