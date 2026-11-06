import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { arkivReader, escrowBalance, getTrenchRowBySlug, listHcs } from "@trenches/services";
import { rowToTrench } from "@trenches/db";
import { copy } from "@/lib/copy";
import { canJoin } from "@trenches/core";
import { TrenchHeader } from "@/components/trench/header";
import { JoinPanel } from "@/components/trench/join-panel";
import { Leaderboard } from "@/components/trench/leaderboard";
import { mergeBoard } from "@/lib/board";
import { EscrowLine } from "@/components/trench/escrow-line";
import { HcsLog } from "@/components/trench/hcs-log";

export const dynamic = "force-dynamic";

async function load(slug: string) {
  const reader = arkivReader();
  const onArkiv = await reader.getTrenchBySlug(slug).catch(() => null);
  const row = await getTrenchRowBySlug(slug);
  const trench = onArkiv ?? (row ? rowToTrench(row) : null);
  if (!trench) return null;
  const [entries, lb, balance, hcs] = await Promise.all([
    reader.listEntries(trench.id).catch(() => []),
    reader.getLeaderboard(trench.id).catch(() => []),
    escrowBalance(trench.hedera.escrowAccountId),
    listHcs(trench.id),
  ]);
  return { trench, entries, lb, balance, hcs, arkivEntityKey: onArkiv?.entityKey ?? row?.arkivEntityKey ?? null, source: onArkiv ? "arkiv" : "postgres" };
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
  const { trench, entries, lb, balance, hcs, arkivEntityKey } = data;
  const gate = canJoin(trench);
  const rows = mergeBoard(lb, entries);

  return (
    <div className="flex flex-col gap-8 lg:gap-12">
      <TrenchHeader trench={trench} entrants={entries.length} />

      <JoinPanel trenchId={trench.id} entrants={entries.map((e) => e.trader)} disabledReason={gate.ok ? null : gate.reason} />

      <section aria-labelledby="board-heading">
        <h2 id="board-heading" className="sr-only">Leaderboard</h2>
        <Leaderboard rows={rows} settled={trench.status === "settled"} />
      </section>

      <EscrowLine trench={trench} balance={balance} arkivEntityKey={arkivEntityKey} />
      <HcsLog rows={hcs} />
    </div>
  );
}
