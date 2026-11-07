import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTrenchRowBySlug } from "@trenches/services";
import { rowToTrench } from "@trenches/db";
import { copy } from "@/lib/copy";
import { formatUsd } from "@/lib/format";
import { SponsorForm } from "@/components/sponsor/sponsor-form";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const row = await getTrenchRowBySlug(slug);
  return { title: row ? copy.sponsor.h1(row.name) : copy.app.name };
}

/** F9: sponsor a draft (or funded, not yet started) Trench. */
export default async function SponsorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const row = await getTrenchRowBySlug(slug);
  if (!row) notFound();
  const t = rowToTrench(row);
  const closed = !(t.status === "draft" || t.status === "funded");
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-h1">{copy.sponsor.h1(t.name)}</h1>
      <p className="text-muted max-w-[60ch]">{copy.sponsor.body}</p>
      <p className="text-small text-muted">
        {t.allowedAssets.map((a) => a.symbol).join(", ")} · {formatUsd(t.prizePoolUsdc)} pool · by <span className="font-mono">{t.adminAddress.slice(0, 6)}…{t.adminAddress.slice(-4)}</span>
      </p>
      <SponsorForm trenchId={t.id} slug={t.slug} currentAssets={t.allowedAssets} closed={closed} />
    </div>
  );
}
