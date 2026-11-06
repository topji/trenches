/** Read helpers for pages and GET routes. Arkiv first; Postgres only while an Arkiv write is pending. */
import type { Trench } from "@trenches/core";
import { rowToTrench, type TrenchRow } from "@trenches/db";
export { arkivReader, escrowBalance, getTrenchRow, getTrenchRowBySlug, listHcs, notFound } from "@trenches/services";

export function rowToTrenchSafe(row: TrenchRow): Trench & { entityKey?: `0x${string}` } {
  return rowToTrench(row);
}
