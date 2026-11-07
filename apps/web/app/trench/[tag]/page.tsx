import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { seasonLabel, seasonOf } from "@trenches/core";
import { clanByTag, identitiesFor, ladder, memberSeasons, services } from "@trenches/services";
import { clanMembers, eq, rowToTrench, trenches, desc } from "@trenches/db";
import { copy } from "@/lib/copy";
import { displayName } from "@/lib/identity";
import { formatPct, formatUsd, shortAddress } from "@/lib/format";
import { pillFor } from "@/lib/trench-view";
import { ClanActions } from "@/components/clans/clan-actions";
import { HumanBadge } from "@/components/ui/human-badge";
import { StatusPill } from "@/components/ui/status-pill";
import { Bar, Medal, TagBadge, TitleChip } from "@/components/ui/medal";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ tag: string }> }): Promise<Metadata> {
  const { tag } = await params;
  const c = await clanByTag(tag);
  return { title: c ? `[${c.tag}] ${c.name}` : copy.app.name };
}

/** Clan page: header, members with season ROI and contribution, clan seasons, join / leave / create season. */
export default async function ClanPage({ params }: { params: Promise<{ tag: string }> }) {
  const { tag } = await params;
  const clan = await clanByTag(tag);
  if (!clan) notFound();
  const { db } = services();
  const season = seasonOf();
  const [members, scores, seasonRows] = await Promise.all([
    db.select().from(clanMembers).where(eq(clanMembers.clanId, clan.id)),
    ladder(season),
    db.select().from(trenches).where(eq(trenches.clanId, clan.id)).orderBy(desc(trenches.createdAt)).limit(20),
  ]);
  const traders = members.map((m) => m.trader);
  const [ids, stats] = await Promise.all([identitiesFor(traders), memberSeasons(traders, season)]);
  const mine = scores.find((s) => s.clanId === clan.id);
  const t = copy.clans.membersTable;
  const maxContribution = Math.max(1, ...[...stats.values()].map((m) => Math.abs(m.contribution)));
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2"><TagBadge tag={clan.tag} />{mine && <Medal rank={mine.rank} />}</p>
            <h1 className="text-h1 mt-2">{clan.name}</h1>
            {clan.description && <p className="text-muted mt-2 max-w-[60ch]">{clan.description}</p>}
          </div>
          <div className="text-right">
            <div className="text-small text-muted">{copy.clans.score}</div>
            <div className="font-scoreboard text-figure lg:text-[32px] tabular">{mine ? mine.score.toFixed(1) : "0.0"}</div>
            <div className="text-small text-muted mt-1">{mine ? `${copy.clans.rank} #${mine.rank}` : copy.clans.season(seasonLabel(season))}</div>
          </div>
        </div>
        <p className="text-small text-muted">
          {copy.clans.leader} <Link href={`/u/${clan.leader}`} className="font-mono">{displayName(clan.leader, ids[clan.leader])}</Link> · {clan.memberCount} {copy.clans.members.toLowerCase()} · {clan.open ? copy.clans.form.open : copy.clans.form.invite}
        </p>
        <ClanActions clanId={clan.id} open={clan.open} members={traders} leader={clan.leader} />
      </header>

      <section aria-labelledby="members-heading">
        <h2 id="members-heading" className="text-h2 mb-4">{copy.clans.members}</h2>
        <table className="w-full border-t border-line">
          <thead>
            <tr className="text-small text-muted text-left">
              <th scope="col" className="py-2 pr-2">{t.handle}</th>
              <th scope="col" className="py-2 pr-2">{t.title}</th>
              <th scope="col" className="py-2 pr-2 text-right">{t.roi}</th>
              <th scope="col" className="py-2 text-right">{t.contribution}</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const id = ids[m.trader];
              const s = stats.get(m.trader);
              return (
                <tr key={m.trader} className="h-14 border-t border-line">
                  <td className="pr-2">
                    <Link href={`/u/${m.trader}`} className="font-mono text-[13px] inline-flex items-center gap-2">
                      {displayName(m.trader, id)} <HumanBadge />
                    </Link>
                  </td>
                  <td className="pr-2"><TitleChip level={id?.level ?? 1} title={id?.title ?? "Recruit"} /></td>
                  <td className="pr-2 text-right tabular">{s ? formatPct(s.roiPct) : "0.0%"}</td>
                  <td className="text-right">
                    <span className="tabular font-scoreboard text-[16px]">{s ? s.contribution.toFixed(1) : "0.0"}</span>
                    <Bar value={(s?.contribution ?? 0) / maxContribution} tone={(s?.contribution ?? 0) < 0 ? "loss" : "accent"} className="mt-1 ml-auto max-w-[96px]" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="seasons-heading">
        <h2 id="seasons-heading" className="text-h2 mb-4">{copy.clans.seasons}</h2>
        {seasonRows.length === 0 ? (
          <p className="text-muted">{copy.clans.noSeasons}</p>
        ) : (
          <ol className="border-t border-line">
            {seasonRows.map((r) => {
              const b = rowToTrench(r);
              return (
                <li key={b.id} className="border-b border-line">
                  <Link href={`/t/${b.slug}`} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 py-4 hover:no-underline">
                    <span className="font-semibold">{b.name}</span>
                    <StatusPill status={pillFor(b)} className="row-start-1 col-start-2" />
                    <span className="text-small text-muted col-span-2">{b.allowedAssets.map((a) => a.symbol).join(", ")} · {formatUsd(b.prizePoolUsdc)} pool · by {shortAddress(b.adminAddress)}</span>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
