import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { arkivReader, getTrenchRowBySlug } from "@trenches/services";
import { rowToTrench } from "@trenches/db";
import { copy } from "@/lib/copy";
import { ShareActions } from "@/components/trench/share-actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: copy.share.h1 };

/** Share page: OG preview (the same image X / Telegram unfurl) + copy link + Post to X. */
export default async function SharePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const onArkiv = await arkivReader().getTrenchBySlug(slug).catch(() => null);
  const row = onArkiv ? null : await getTrenchRowBySlug(slug);
  const trench = onArkiv ?? (row ? rowToTrench(row) : null);
  if (!trench) notFound();
  return (
    <div className="flex flex-col gap-6 max-w-[720px]">
      <h1 className="text-h1">{copy.share.h1}</h1>
      <p className="text-muted">{copy.share.body}</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/t/${slug}/opengraph-image`} alt={`${trench.name} share card`} width={1200} height={630} className="w-full h-auto rounded-panel border border-line" />
      <ShareActions slug={slug} name={trench.name} pool={trench.prizePoolUsdc} />
    </div>
  );
}
