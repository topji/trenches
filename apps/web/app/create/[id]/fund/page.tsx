import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTrenchRow } from "@trenches/services";
import { rowToTrench } from "@trenches/db";
import { copy } from "@/lib/copy";
import { explorers } from "@/lib/explorers";
import { formatLocalTime, formatUsd } from "@/lib/format";
import { toMirrorId } from "@/lib/server/links";
import { ButtonLink } from "@/components/ui/button";
import { ExplorerLink } from "@/components/ui/explorer-link";
import { Toast } from "@/components/ui/toast";
import { FundButton } from "@/components/create/fund-button";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: copy.funding.h1 };

/** Funding step: its own screen with the escrow id and one button (DESIGN_SYSTEM §4). */
export default async function FundPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const q = await searchParams;
  const row = await getTrenchRow(id);
  if (!row) notFound();
  const t = rowToTrench(row);
  const funded = t.status !== "draft";
  const toast = q.funded ? copy.toast.funded : q.created ? copy.toast.created : null;

  return (
    <div className="max-w-[560px] flex flex-col gap-6">
      <h1 className="text-h1">{copy.funding.h1}</h1>
      <p className="text-muted">{copy.funding.body(formatUsd(t.prizePoolUsdc))}</p>

      <dl className="flex flex-col gap-4">
        <div>
          <dt className="text-small text-muted mb-1">{copy.funding.escrowLabel}</dt>
          <dd className="hash-block flex items-center justify-between gap-4">
            <span>{t.hedera.escrowAccountId}</span>
            <ExplorerLink href={explorers.hashscanAccount(t.hedera.escrowAccountId)} label="HashScan" className="shrink-0" />
          </dd>
        </div>
        <div>
          <dt className="text-small text-muted mb-1">{copy.funding.topicLabel}</dt>
          <dd className="hash-block flex items-center justify-between gap-4">
            <span>{t.hedera.topicId}</span>
            <ExplorerLink href={explorers.hashscanTopic(t.hedera.topicId)} label="HashScan" className="shrink-0" />
          </dd>
        </div>
        <div>
          <dt className="text-small text-muted mb-1">{copy.funding.arkivLabel}</dt>
          <dd className="hash-block flex items-center justify-between gap-4">
            {row.arkivEntityKey ? (
              <>
                <span className="truncate min-w-0">{row.arkivEntityKey}</span>
                <ExplorerLink href={explorers.arkivEntity(row.arkivEntityKey)} label="Arkiv" className="shrink-0 whitespace-nowrap" />
              </>
            ) : (
              <span className="text-warn">{copy.funding.arkivPending}</span>
            )}
          </dd>
        </div>
      </dl>

      {funded ? (
        <div className="flex flex-col gap-4">
          <p>{copy.funding.done(formatLocalTime(t.startAt))}</p>
          {t.hedera.fundingTxId && (
            <ExplorerLink href={explorers.hashscanTx(toMirrorId(t.hedera.fundingTxId))} label="Funding tx" hash={toMirrorId(t.hedera.fundingTxId)} />
          )}
          <div>
            <ButtonLink href={`/t/${t.slug}`}>{copy.funding.openTrench}</ButtonLink>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <FundButton trenchId={t.id} />
          <p className="text-small text-faint">{copy.funding.demoNote}</p>
        </div>
      )}
      <Toast message={toast} />
    </div>
  );
}
