import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { arkivReader, escrowBalance, getTrenchRowBySlug, identitiesFor, listHcs, services } from "@trenches/services";
import { clans, eq } from "@trenches/db";
import { paidAtOf, rowToTrench } from "@trenches/db";
import { copy } from "@/lib/copy";
import { canJoin, canTrade } from "@trenches/core";
import { TrenchHeader } from "@/components/trench/header";
import { JoinPanel } from "@/components/trench/join-panel";
import { LiveBoard } from "@/components/trench/live-board";
import { TradePanel } from "@/components/trench/trade-panel";
import { mergeBoard } from "@/lib/board";
import { EscrowLine } from "@/components/trench/escrow-line";
import { HcsLog } from "@/components/trench/hcs-log";
import { Payouts } from "@/components/trench/payouts";

export const dynamic = "force-dynamic";

async function load(slug: string) {
  const reader = arkivReader();
  const onArkiv = await reader.getTrenchBySlug(slug).catch(() => null);
  const row = await getTrenchRowBySlug(slug);
  const trench = onArkiv ?? (row ? rowToTrench(row) : null);
  if (!trench) return null;
  const [entries, lb, balance, hcs, payouts] = await Promise.all([
    reader.listEntries(trench.id).catch(() => []),
    reader.getLeaderboard(trench.id).catch(() => []),
    escrowBalance(trench.hedera.escrowAccountId),
    listHcs(trench.id),
    trench.status === "settled" ? reader.listPayouts(trench.id).catch(() => []) : Promise.resolve([]),
  ]);
  const identities = await identitiesFor(entries.map((e) => e.trader)).catch(() => ({}));
  const clanTag = trench.clanId ? (await services().db.select({ tag: clans.tag }).from(clans).where(eq(clans.id, trench.clanId)).limit(1))[0]?.tag ?? null : null;
  return { trench, entries, lb, balance, hcs, payouts, identities, clanTag, paidAt: row ? paidAtOf(row) : undefined, arkivEntityKey: onArkiv?.entityKey ?? row?.arkivEntityKey ?? null, source: onArkiv ? "arkiv" : "postgres" };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await load(slug);
  return { title: data?.trench.name ?? copy.app.name };
}

/** Trench page. The Trench entity is read from Arkiv (public source of truth); Postgres only fills in while an Arkiv write is pending. */
export default async function TrenchPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await load(slug);
  if (!data) notFound();
  const { trench, entries, lb, balance, hcs, payouts, identities, clanTag, paidAt, arkivEntityKey } = data;
  const gate = canJoin(trench);
  const live = canTrade(trench).ok;
  const rows = mergeBoard(lb, entries);

  return (
    <div className="flex flex-col gap-8 lg:gap-12">
      <TrenchHeader trench={trench} entrants={entries.length} paidAt={paidAt} clanTag={clanTag} />

      <JoinPanel trenchId={trench.id} entrants={entries.map((e) => e.trader)} disabledReason={gate.ok ? null : gate.reason} />
      <TradePanel trenchId={trench.id} assets={trench.allowedAssets} entrants={entries.map((e) => e.trader)} live={live} />

      <section aria-labelledby="board-heading">
        <h2 id="board-heading" className="sr-only">Leaderboard</h2>
        <LiveBoard trenchId={trench.id} initialRows={rows} initialIdentities={identities} settled={trench.status === "settled"} live={live} />
      </section>

      {trench.status === "settled" && <Payouts rows={payouts} />}
      <EscrowLine trench={trench} balance={balance} arkivEntityKey={arkivEntityKey} />
      <HcsLog rows={hcs} />
    </div>
  );
}
