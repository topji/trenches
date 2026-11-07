import Link from "next/link";
import { clsx } from "clsx";
import { seasonLabel, seasonOf } from "@trenches/core";
import { ladder } from "@trenches/services";
import { copy } from "@/lib/copy";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

const rankTone = ["text-accent", "text-rank-2", "text-rank-3"];

export default async function LandingPage() {
  const season = seasonOf();
  const top = (await ladder(season).catch(() => [])).slice(0, 3);
  return (
    <div className="flex flex-col gap-8 lg:gap-12">
      <section className="max-w-[640px]">
        <h1 className="text-h1">{copy.app.tagline}</h1>
        <p className="mt-4 text-muted max-w-[60ch]">{copy.app.sub}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink href="/create">{copy.cta.create}</ButtonLink>
          <ButtonLink href="/battles" variant="secondary">{copy.cta.browse}</ButtonLink>
        </div>
      </section>

      <section aria-labelledby="clans-heading">
        <div className="flex items-baseline justify-between gap-4 mb-4">
          <h2 id="clans-heading" className="text-h2">{copy.clans.heroHeading}</h2>
          <Link href="/trenches" className="text-small text-muted">{copy.clans.season(seasonLabel(season))}</Link>
        </div>
        {top.length === 0 ? (
          <EmptyState action={<ButtonLink href="/create-trench" size="sm">{copy.clans.create}</ButtonLink>}>{copy.clans.empty}</EmptyState>
        ) : (
          <ol className="border-t border-line">
            {top.map((r, i) => (
              <li key={r.clanId} className="grid grid-cols-[48px_1fr_auto] items-center gap-x-4 h-14 border-b border-line row-in" style={{ animationDelay: `${i * 120}ms` }}>
                <span className={clsx("font-scoreboard text-figure", rankTone[i])}>{r.rank}</span>
                <Link href={`/trench/${r.tag}`} className="font-semibold"><span className="font-mono text-[13px] text-muted">[{r.tag}]</span> {r.name}</Link>
                <span className="font-scoreboard text-figure tabular">{r.score.toFixed(1)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="live-heading">
        <h2 id="live-heading" className="text-h2 mb-4">{copy.landing.liveHeading}</h2>
        <EmptyState action={<ButtonLink href="/create" size="sm">{copy.cta.create}</ButtonLink>}>
          {copy.landing.liveEmpty}
        </EmptyState>
      </section>

      <section aria-labelledby="how-heading">
        <h2 id="how-heading" className="text-h2 mb-4">{copy.landing.howHeading}</h2>
        <ol className="border-t border-line">
          {copy.landing.how.map((step, i) => (
            <li key={step.title} className="grid grid-cols-[48px_1fr] lg:grid-cols-[64px_240px_1fr] gap-x-4 py-4 border-b border-line">
              <span className="font-scoreboard text-figure text-muted">{i + 1}</span>
              <h3 className="font-semibold">{step.title}</h3>
              <p className="text-muted col-start-2 lg:col-start-3">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
