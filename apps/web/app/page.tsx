import { copy } from "@/lib/copy";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function LandingPage() {
  return (
    <div className="flex flex-col gap-8 lg:gap-12">
      <section className="max-w-[640px]">
        <h1 className="text-h1">{copy.app.tagline}</h1>
        <p className="mt-4 text-muted max-w-[60ch]">{copy.app.sub}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink href="/create">{copy.cta.create}</ButtonLink>
          <ButtonLink href="/trenches" variant="secondary">{copy.cta.browse}</ButtonLink>
        </div>
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
