import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { arkivReader, escrowBalance, getTrenchRowBySlug, listHcs } from "@trenches/services";
import { rowToTrench } from "@trenches/db";
import { copy } from "@/lib/copy";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { TrenchHeader } from "@/components/trench/header";
import { EscrowLine } from "@/components/trench/escrow-line";
import { HcsLog } from "@/components/trench/hcs-log";

export const dynamic = "force-dynamic";

async function load(slug: string) {
  const reader = arkivReader();
  const onArkiv = await reader.getTrenchBySlug(slug).catch(() => null);
  const row = await getTrenchRowBySlug(slug);
  const trench = onArkiv ?? (row ? rowToTrench(row) : null);
  if (!trench) return null;
  const [entries, balance, hcs] = await Promise.all([
    reader.listEntries(trench.id).catch(() => []),
    escrowBalance(trench.hedera.escrowAccountId),
    listHcs(trench.id),
  ]);
  return { trench, entries, balance, hcs, arkivEntityKey: onArkiv?.entityKey ?? row?.arkivEntityKey ?? null, source: onArkiv ? "arkiv" : "postgres" };
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
  const { trench, entries, balance, hcs, arkivEntityKey } = data;

  return (
    <div className="flex flex-col gap-8 lg:gap-12">
      <TrenchHeader trench={trench} entrants={entries.length} />

      <section aria-label="Join">
        <Button disabled title={copy.trench.joinSoon}>
          {copy.cta.join}
        </Button>
        <p className="text-small text-muted mt-2">{trench.status === "draft" ? copy.trench.notFunded : copy.trench.joinHelper}</p>
      </section>

      <section aria-labelledby="board-heading">
        <h2 id="board-heading" className="sr-only">Leaderboard</h2>
        <EmptyState>{copy.leaderboard.empty}</EmptyState>
      </section>

      <EscrowLine trench={trench} balance={balance} arkivEntityKey={arkivEntityKey} />
      <HcsLog rows={hcs} />
    </div>
  );
}
