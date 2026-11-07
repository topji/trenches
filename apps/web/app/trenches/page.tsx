import type { Metadata } from "next";
import Link from "next/link";
import { clsx } from "clsx";
import { seasonLabel, seasonOf } from "@trenches/core";
import { ladder } from "@trenches/services";
import { copy } from "@/lib/copy";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Podium } from "@/components/clans/podium";
import { Bar, Medal, TagBadge } from "@/components/ui/medal";
import { PixelBanner } from "@/components/ui/pixel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: copy.clans.h1 };

const rankTone = ["text-accent", "text-rank-2", "text-rank-3"];

/** Global clan ladder for a season, from Arkiv `trenches.clan_score` + `trenches.clan`. */
export default async function ClansPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const season = /^\d{4}-\d{2}$/.test(q.season ?? "") ? q.season! : seasonOf();
  const rows = await ladder(season);
  const prev = (() => {
    const [y, m] = season.split("-").map(Number);
    const d = new Date(Date.UTC(y!, m! - 2, 1));
    return seasonOf(d);
  })();
  const c = copy.clans.columns;
  const maxScore = Math.max(1, ...rows.map((r) => Math.abs(r.score)));
  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-h1">{copy.clans.h1}</h1>
          <p className="text-muted mt-1">{seasonLabel(season)}</p>
        </div>
        <ButtonLink href="/create-trench" size="sm">{copy.clans.create}</ButtonLink>
      </div>
      <nav className="flex gap-2" aria-label="Season">
        {[seasonOf(), prev].filter((s, i, a) => a.indexOf(s) === i).map((s) => (
          <Link key={s} href={`/trenches?season=${s}`} aria-current={s === season ? "page" : undefined} className={clsx("chip hover:no-underline", s === season && "chip-active")}>
            {seasonLabel(s)}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <EmptyState action={<ButtonLink href="/create-trench" size="sm">{copy.clans.create}</ButtonLink>}>{copy.clans.empty}</EmptyState>
      ) : (
        <>
        <Podium rows={rows.slice(0, 3).map((r) => ({ clanId: r.clanId, rank: r.rank, tag: r.tag, name: r.name, score: r.score, members: r.members }))} />
        <table className="w-full border-t border-line">
          <thead>
            <tr className="text-small text-muted text-left">
              <th scope="col" className="py-2 pr-2 w-[40px]">{c.rank}</th>
              <th scope="col" className="py-2 pr-2">{c.clan}</th>
              <th scope="col" className="py-2 pr-2 text-right">{c.members}</th>
              <th scope="col" className="py-2 pr-2 text-right">{c.score}</th>
              <th scope="col" className="py-2 text-right hidden sm:table-cell">{c.podiums}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.clanId} className="h-14 border-t border-line row-in row-hover" style={{ animationDelay: `${Math.min(i, 10) * 120}ms` }}>
                <td className="pr-2"><Medal rank={r.rank} /></td>
                <td className="pr-2">
                  <Link href={`/trench/${r.tag}`} className="font-semibold inline-flex items-center gap-3 flex-wrap">
                    <PixelBanner seed={r.clanId} width={56} height={28} /> <TagBadge tag={r.tag} /> {r.name}
                  </Link>
                  <Bar value={r.score / maxScore} className="mt-2 max-w-[220px]" tone={r.score < 0 ? "loss" : "accent"} />
                </td>
                <td className="pr-2 text-right tabular text-muted">{r.members}</td>
                <td className={clsx("pr-2 text-right font-scoreboard text-figure tabular", r.rank === 1 && "text-accent")}>{r.score.toFixed(1)}</td>
                <td className="text-right tabular text-muted hidden sm:table-cell">{r.podiums}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </>
      )}
    </div>
  );
}
