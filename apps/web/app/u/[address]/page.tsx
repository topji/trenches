import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { identitiesFor, profileFor, type Identity } from "@trenches/services";
import { levelFor } from "@trenches/core";
import { IdentityCard } from "@/components/profile/identity-card";
import { copy } from "@/lib/copy";
import { formatCompactUsd, formatPnl, shortAddress } from "@/lib/format";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { HumanBadge } from "@/components/ui/human-badge";
import { StatusPill } from "@/components/ui/status-pill";
import { pillFor } from "@/lib/trench-view";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ address: string }> }): Promise<Metadata> {
  const { address } = await params;
  return { title: shortAddress(address) };
}

/** F7: trader profile from Arkiv `profile` + `lb` entities. */
export default async function ProfilePage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) notFound();
  const view = await profileFor(address as `0x${string}`);
  const ids: Record<string, Identity> = await identitiesFor([address]).catch(() => ({}));
  const identity = ids[address.toLowerCase()] ?? null;
  const lv = levelFor(identity?.xp ?? 0);
  const s = copy.profile.stats;
  const c = copy.profile.columns;
  const stats = [
    { label: s.joined, value: String(view.totals.trenchesJoined) },
    { label: s.best, value: view.totals.bestFinish ? `#${view.totals.bestFinish}` : "—" },
    { label: s.volume, value: formatCompactUsd(view.totals.totalVolumeUsd) },
    { label: s.pnl, value: formatPnl(view.totals.totalPnlUsd), tone: view.totals.totalPnlUsd > 0 ? "text-gain" : view.totals.totalPnlUsd < 0 ? "text-loss" : "" },
  ];
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <h1 className={`text-h1 inline-flex items-center gap-3 ${identity?.handle ? "" : "font-mono"}`}>
          {identity?.handle ? `${identity.tag ? `[${identity.tag}] ` : ""}${identity.handle}` : shortAddress(address)}
          {view.totals.verifiedHuman ? <HumanBadge /> : <span className="text-small text-faint font-sans">{copy.profile.notVerified}</span>}
        </h1>
        <IdentityCard address={address} identity={identity} nextXp={lv.nextXp} progress={lv.progress} />
        <dl className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((st) => (
            <div key={st.label} className="panel px-4 py-3">
              <dt className="text-small text-muted">{st.label}</dt>
              <dd className={`font-scoreboard text-figure tabular mt-1 ${st.tone ?? ""}`}>{st.value}</dd>
            </div>
          ))}
        </dl>
      </header>
      {view.results.length === 0 ? (
        <EmptyState action={<ButtonLink href="/battles" size="sm">{copy.cta.browse}</ButtonLink>}>{copy.profile.empty}</EmptyState>
      ) : (
        <table className="w-full border-t border-line">
          <thead>
            <tr className="text-small text-muted text-left">
              <th scope="col" className="py-2 pr-2">{c.trench}</th>
              <th scope="col" className="py-2 pr-2 text-right">{c.finish}</th>
              <th scope="col" className="py-2 pr-2 text-right">{c.pnl}</th>
              <th scope="col" className="py-2 text-right">{c.volume}</th>
            </tr>
          </thead>
          <tbody>
            {view.results.map((r) => (
              <tr key={r.trenchId} className="h-14 border-t border-line">
                <td className="pr-2">
                  <Link href={`/t/${r.trenchSlug}`} className="font-semibold">{r.trenchName}</Link>
                  <span className="ml-2 align-middle"><StatusPill status={pillFor({ status: r.status, startAt: "1970-01-01T00:00:00Z", endAt: "1970-01-01T00:00:00Z" })} /></span>
                </td>
                <td className="pr-2 text-right font-scoreboard text-figure tabular">#{r.rank}</td>
                <td className={`pr-2 text-right tabular ${r.pnlUsd > 0 ? "text-gain" : r.pnlUsd < 0 ? "text-loss" : ""}`}>{formatPnl(r.pnlUsd)}</td>
                <td className="text-right tabular text-muted">{formatCompactUsd(r.volumeUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
