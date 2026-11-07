import Link from "next/link";
import { clsx } from "clsx";
import { seasonLabel, seasonOf } from "@trenches/core";
import { arkivReader, ladder, services } from "@trenches/services";
import { entries, fills, sql, trenches } from "@trenches/db";
import { copy } from "@/lib/copy";
import { formatCompactUsd, formatShortDuration, formatUsd } from "@/lib/format";
import { pillFor } from "@/lib/trench-view";
import { mergeBoard } from "@/lib/board";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { Leaderboard } from "@/components/trench/leaderboard";
import { Podium } from "@/components/clans/podium";

export const dynamic = "force-dynamic";

const rankTone = ["text-accent", "text-rank-2", "text-rank-3"];

async function stats() {
  try {
    const { db } = services();
    const [b] = await db.select({ n: sql<number>`count(*)::int` }).from(trenches);
    const [h] = await db.select({ n: sql<number>`count(distinct ${entries.trader})::int` }).from(entries);
    const [v] = await db.select({ v: sql<string>`coalesce(sum(${fills.qty} * ${fills.priceUsd}), 0)` }).from(fills);
    const [p] = await db.select({ p: sql<string>`coalesce(sum(${trenches.prizePoolUsdc}), 0)` }).from(trenches).where(sql`${trenches.status} = 'settled' and ${trenches.payoutTxId} is not null`);
    return { seasons: b?.n ?? 0, humans: h?.n ?? 0, volume: Number(v?.v ?? 0), paid: Number(p?.p ?? 0) };
  } catch {
    return null;
  }
}

export default async function LandingPage() {
  const season = seasonOf();
  const reader = arkivReader();
  const [top, liveSeasons, st] = await Promise.all([
    ladder(season).then((r) => r.slice(0, 3)).catch(() => []),
    reader.listTrenches({ statuses: ["live", "funded"], limit: 20 }).then((r) => r.sort((a, b) => b.prizePoolUsdc - a.prizePoolUsdc).slice(0, 4)).catch(() => []),
    stats(),
  ]);
  // Board preview: the richest live season, else the most recently settled one.
  const preview = liveSeasons[0] ?? (await reader.listTrenches({ statuses: ["settled"], limit: 5 }).then((r) => r[0] ?? null).catch(() => null));
  const previewRows = preview
    ? await Promise.all([reader.getLeaderboard(preview.id).catch(() => []), reader.listEntries(preview.id).catch(() => [])]).then(([lb, en]) => mergeBoard(lb, en).slice(0, 5))
    : [];
  const now = Date.now();

  return (
    <div className="flex flex-col gap-12 lg:gap-16">
      {/* Hero */}
      <section className="grid lg:grid-cols-[1.1fr_1fr] gap-8 lg:gap-12 items-start">
        <div className="flex flex-col gap-6">
          <p className="eyebrow inline-flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-pill bg-accent live-dot" aria-hidden />
            ETHGlobal Mumbai · {seasonLabel(season)}
          </p>
          <h1 className="text-display max-w-[14ch]">{copy.app.tagline}</h1>
          <p className="text-muted text-[17px] max-w-[52ch]">{copy.app.sub}</p>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/create">{copy.cta.create}</ButtonLink>
            <ButtonLink href="/create-trench" variant="secondary">{copy.clans.create}</ButtonLink>
            <ButtonLink href="/seasons" variant="secondary">{copy.cta.browse}</ButtonLink>
          </div>
          {st && (
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                ["Seasons", String(st.seasons)],
                ["Humans", String(st.humans)],
                ["Volume", formatCompactUsd(st.volume)],
                ["Paid out", formatUsd(st.paid)],
              ].map(([k, v], i) => (
                <div key={k} className="panel-sunken px-4 py-3 stat">
                  <dt className="eyebrow">{k}</dt>
                  <dd className={clsx("stat-figure", i === 3 && "text-gain")}>{v}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
        <div className="panel p-4 lg:p-5 flex flex-col gap-4 hairline-top">
          {preview ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="eyebrow">{preview.status === "settled" ? copy.leaderboard.settled : copy.landing.liveHeading}</p>
                  <Link href={`/t/${preview.slug}`} className="font-semibold text-[18px] truncate block">{preview.name}</Link>
                </div>
                <StatusPill status={pillFor(preview, new Date(now))} />
              </div>
              <Leaderboard rows={previewRows} />
              <div className="flex items-center justify-between text-small text-muted">
                <span className="tabular">{copy.discovery.pool(formatUsd(preview.prizePoolUsdc).replace("$", ""))}</span>
                <Link href={`/t/${preview.slug}`}>Open the season</Link>
              </div>
            </>
          ) : (
            <EmptyState action={<ButtonLink href="/create" size="sm">{copy.cta.create}</ButtonLink>}>{copy.landing.liveEmpty}</EmptyState>
          )}
        </div>
      </section>

      <div className="grid lg:grid-cols-2 gap-10 lg:gap-12">
        <section aria-labelledby="clans-heading" className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="clans-heading" className="text-h2">{copy.clans.heroHeading}</h2>
            <Link href="/trenches" className="text-small text-muted">All Trenches</Link>
          </div>
          {top.length === 0 ? (
            <EmptyState action={<ButtonLink href="/create-trench" size="sm">{copy.clans.create}</ButtonLink>}>{copy.clans.empty}</EmptyState>
          ) : (
            <Podium rows={top.map((r) => ({ rank: r.rank, tag: r.tag, name: r.name, score: r.score, members: r.members }))} />
          )}
        </section>

        <section aria-labelledby="live-heading" className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="live-heading" className="text-h2">{copy.landing.liveHeading}</h2>
            <Link href="/seasons" className="text-small text-muted">All seasons</Link>
          </div>
          {liveSeasons.length === 0 ? (
            <EmptyState action={<ButtonLink href="/create" size="sm">{copy.cta.create}</ButtonLink>}>{copy.landing.liveEmpty}</EmptyState>
          ) : (
            <ol className="border-t border-line">
              {liveSeasons.map((t) => {
                const start = Date.parse(t.startAt);
                const end = Date.parse(t.endAt);
                const timing = now < start ? copy.discovery.startsIn(formatShortDuration(start - now)) : copy.discovery.left(formatShortDuration(end - now));
                return (
                  <li key={t.id} className="border-b border-line row-hover">
                    <Link href={`/t/${t.slug}`} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 py-3 hover:no-underline">
                      <span className="font-semibold truncate">{t.name}</span>
                      <StatusPill status={pillFor(t, new Date(now))} className="row-start-1 col-start-2" />
                      <span className="text-small text-muted col-span-2 tabular">{t.allowedAssets.map((a) => a.symbol).join(", ")} · {copy.discovery.pool(formatUsd(t.prizePoolUsdc).replace("$", ""))} · {timing}</span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>

      <section aria-labelledby="how-heading" className="flex flex-col gap-6">
        <h2 id="how-heading" className="text-h2">{copy.landing.howHeading}</h2>
        <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {copy.landing.how.map((step, i) => (
            <li key={step.title} className="panel p-4 flex flex-col gap-3 hairline-top">
              <span className={clsx("font-scoreboard text-[28px]", i === 0 ? "text-accent" : "text-muted")}>{i + 1}</span>
              <h3 className="font-semibold text-[17px]">{step.title}</h3>
              <p className="text-muted text-small leading-[1.5]">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
