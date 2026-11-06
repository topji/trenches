/**
 * F4 smoke: score one Trench from its real fills, write `trenches.lb` to Arkiv, read the board back
 * through the public query, print HashScan/Arkiv links. Exit 0 PASS · 1 FAIL · 2 NEEDS ENV.
 *   pnpm smoke:f4 <trenchId>
 */
import "dotenv/config";
import { arkivReader, recomputeLeaderboard } from "../packages/services/src/index.js";
import { arkivExplorer } from "../packages/arkiv/src/index.js";

const log = (...a: unknown[]) => console.log("[f4-smoke]", ...a);

async function main() {
  const trenchId = process.argv[2];
  if (!trenchId) {
    log("usage: pnpm smoke:f4 <trenchId>");
    process.exit(2);
  }
  const r = await recomputeLeaderboard(trenchId);
  if (!r) {
    log("FAIL: trench not found");
    process.exit(1);
  }
  for (const row of r.rows) log(`#${row.rank} ${row.trader} pnl ${row.pnlUsd} roi ${row.roiPct}% vol ${row.volumeUsd} win ${row.winRate} fills ${row.fills}`);
  log("changed", r.changed, "rankChanges", r.rankChanges, "snapshot", r.snapshot, r.arkivTxHash ? arkivExplorer.tx(r.arkivTxHash) : r.arkivError ?? "(no write needed)");
  const back = await arkivReader().getLeaderboard(trenchId);
  log(`arkiv readback: ${back.length} lb entities`, back.map((b) => `#${b.rank} ${b.trader.slice(0, 10)} ${b.pnlUsd} → ${arkivExplorer.entity(b.entityKey)}`));
  const ok = back.length === r.rows.length && back.every((b) => r.rows.some((x) => x.trader.toLowerCase() === b.trader.toLowerCase() && x.rank === b.rank));
  log(ok ? "PASS" : "FAIL: Arkiv board does not match the computed board");
  process.exit(ok ? 0 : 1);
}
main().catch((e) => {
  console.error("[f4-smoke] FAIL", e);
  process.exit(1);
});
