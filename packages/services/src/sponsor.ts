/**
 * F9: a sponsor funds a draft Trench's pool (treasury sends the prize token on their behalf in the demo),
 * gets a `trenches.sponsorship` entity and their name on the Trench, and may propose an asset that the
 * host accepts or keeps out. Until accepted the original assets stand.
 */
import { toBaseUnits, type Address, type AllowedAsset, type Sponsorship, type Trench, type TrenchStatus } from "@trenches/core";
import { and, eq, rowToTrench, sql, trenches } from "@trenches/db";
import { fundFromOperator } from "@trenches/hedera";
import { z } from "zod";
import { log, services } from "./context.js";
import { ServiceError, badRequest, conflict, forbidden, notFound } from "./errors.js";
import { getTrenchRow, recordHcs, withArkivRetry, type HcsRecord } from "./trenches.js";

export const sponsorInputSchema = z.object({
  name: z.string().trim().min(2, "Sponsor name needs at least 2 characters.").max(40),
  logoUrl: z.string().url().max(300).optional().or(z.literal("")),
  amountUsdc: z.number().positive("Amount must be more than 0.").max(1_000_000),
  proposedAsset: z
    .object({ chainId: z.number().int().positive(), address: z.string().regex(/^0x[0-9a-fA-F]{40}$/), symbol: z.string().min(1).max(16) })
    .optional(),
});

export interface SponsorResult {
  trench: Trench;
  fundingTxId: string;
  sponsorship: Sponsorship;
  arkivSponsorshipTx?: string;
  arkivTrenchTx?: string;
  arkivError?: string;
  hcs: HcsRecord | { error: string };
}

export async function sponsorTrench(trenchId: string, sponsor: Address, raw: unknown): Promise<SponsorResult> {
  const { db, arkiv, hedera, config } = services();
  const parsed = sponsorInputSchema.safeParse(raw);
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "Invalid input.", String(parsed.error.issues[0]?.path?.[0] ?? ""));
  const input = parsed.data;
  const row = await getTrenchRow(trenchId);
  if (!row) throw notFound();
  if (row.status !== "draft" && row.status !== "funded") throw conflict("This season can no longer be sponsored.");
  const trench = rowToTrench(row);

  const fundingTxId = await fundFromOperator(hedera, config.prizeTokenId, trench.hedera.escrowAccountId, toBaseUnits(input.amountUsdc), `trenches sponsor ${trench.slug}`);

  const nowIso = new Date().toISOString();
  const nextStatus: TrenchStatus = row.status === "draft" ? (Date.parse(trench.startAt) <= Date.now() ? "live" : "funded") : (row.status as TrenchStatus);
  const sponsorInfo = { address: sponsor.toLowerCase() as Address, name: input.name, ...(input.logoUrl ? { logoUrl: input.logoUrl } : {}) };
  const pending = input.proposedAsset
    ? { ...input.proposedAsset, address: input.proposedAsset.address as Address, sponsor: sponsor.toLowerCase() as Address, proposedAt: nowIso }
    : null;
  const [claimed] = await db
    .update(trenches)
    .set({
      status: nextStatus,
      prizePoolUsdc: sql`${trenches.prizePoolUsdc} + ${input.amountUsdc.toFixed(6)}::numeric`,
      fundingTxId: row.fundingTxId ?? fundingTxId,
      sponsor: sponsorInfo,
      ...(pending ? { pendingAsset: pending } : {}),
      updatedAt: nowIso,
    })
    .where(and(eq(trenches.id, trenchId), eq(trenches.status, row.status)))
    .returning();
  if (!claimed) throw conflict("This season changed while you were funding it. Reload and try again.");
  const updated = rowToTrench(claimed);

  const sponsorship: Sponsorship = { trenchId, sponsor: sponsorInfo.address, name: input.name, ...(input.logoUrl ? { logoUrl: input.logoUrl } : {}), amountUsdc: input.amountUsdc, fundingTxId };
  const out: SponsorResult = { trench: updated, fundingTxId, sponsorship, hcs: { error: "not sent" } };
  try {
    const r = await withArkivRetry("createSponsorship", () => arkiv.createSponsorship(sponsorship, trench.endAt));
    out.arkivSponsorshipTx = r.txHash;
    if (claimed.arkivEntityKey) {
      const t = await withArkivRetry("updateTrench", () => arkiv.updateTrench(updated, claimed.arkivEntityKey as `0x${string}`));
      out.arkivTrenchTx = t.txHash;
    }
  } catch (e) {
    out.arkivError = (e as Error).message;
    log.error({ trenchId, err: out.arkivError }, "arkiv sponsorship write failed");
  }
  out.hcs = await recordHcs(trenchId, trench.hedera.topicId, "trench.sponsored", {
    sponsor: sponsorInfo.address,
    name: input.name,
    amountUsdc: input.amountUsdc,
    fundingTxId,
    poolUsdc: updated.prizePoolUsdc,
    ...(pending ? { proposedAsset: pending.symbol } : {}),
  });
  if (nextStatus !== row.status) {
    await recordHcs(trenchId, trench.hedera.topicId, "trench.funded", { fundingTxId, amountUsdc: input.amountUsdc, bySponsor: sponsorInfo.address, tokenId: config.prizeTokenId, escrow: trench.hedera.escrowAccountId });
    if (nextStatus === "live") await recordHcs(trenchId, trench.hedera.topicId, "trench.live", { at: nowIso, startAt: trench.startAt, endAt: trench.endAt });
  }
  return out;
}

/** F9.2: the host accepts the proposed asset (it replaces the allowed list) or keeps the current one. */
export async function decideProposal(trenchId: string, admin: Address, accept: boolean): Promise<{ trench: Trench; accepted: boolean; arkivTx?: string; arkivError?: string }> {
  const { db, arkiv } = services();
  const row = await getTrenchRow(trenchId);
  if (!row) throw notFound();
  if (row.adminAddress !== admin.toLowerCase()) throw forbidden();
  if (!row.pendingAsset) throw new ServiceError(409, "Nothing is pending on this season.");
  if (row.status === "ended" || row.status === "settled") throw conflict("This season has ended.");
  const nowIso = new Date().toISOString();
  const nextAssets: AllowedAsset[] = accept ? [{ chainId: row.pendingAsset.chainId, address: row.pendingAsset.address, symbol: row.pendingAsset.symbol }] : row.allowedAssets;
  const [updatedRow] = await db
    .update(trenches)
    .set({ allowedAssets: nextAssets, pendingAsset: null, updatedAt: nowIso })
    .where(eq(trenches.id, trenchId))
    .returning();
  const trench = rowToTrench(updatedRow!);
  const out: { trench: Trench; accepted: boolean; arkivTx?: string; arkivError?: string } = { trench, accepted: accept };
  if (accept && updatedRow!.arkivEntityKey) {
    try {
      const r = await withArkivRetry("updateTrench", () => arkiv.updateTrench(trench, updatedRow!.arkivEntityKey as `0x${string}`));
      out.arkivTx = r.txHash;
    } catch (e) {
      out.arkivError = (e as Error).message;
    }
  }
  await recordHcs(trenchId, trench.hedera.topicId, accept ? "asset.accepted" : "asset.kept", { symbol: row.pendingAsset.symbol, proposedBy: row.pendingAsset.sponsor, assets: trench.allowedAssets.map((a) => a.symbol) });
  return out;
}

export function pendingAssetOf(row: { pendingAsset: { chainId: number; address: Address; symbol: string; sponsor: Address; proposedAt: string } | null }) {
  return row.pendingAsset ?? null;
}
