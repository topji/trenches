/**
 * F1 smoke through the services layer (no HTTP): create → fund → activate(now=startAt) → Arkiv readback.
 * Prints every explorer link. Exit 0 PASS · 1 FAIL · 2 NEEDS ENV.
 *   pnpm smoke:f1
 */
import "dotenv/config";
import type { Address } from "../packages/core/src/index.js";
import { activateTrenches, arkivReader, createTrench, fundTrench, listHcs } from "../packages/services/src/index.js";
import { hashscan, toMirrorTxId } from "../packages/hedera/src/index.js";
import { arkivExplorer } from "../packages/arkiv/src/index.js";

const log = (...a: unknown[]) => console.log("[f1-smoke]", ...a);
const hs = hashscan("testnet");

async function main() {
  for (const k of ["DATABASE_URL", "ARKIV_WRITER_KEY", "HEDERA_OPERATOR_ID", "HEDERA_OPERATOR_KEY", "HEDERA_PRIZE_TOKEN_ID", "ESCROW_KEY_ENCRYPTION_SECRET"]) {
    if (!process.env[k]) {
      log(`NEEDS ENV: ${k}`);
      process.exit(2);
    }
  }
  const admin = "0xE5B3DB4a3D4F88C21CF85492222c8B4dDcdc1e87" as Address;
  const now = Date.now();
  const t0 = Date.now();
  const created = await createTrench(
    {
      name: "F1 smoke Trench",
      description: "scripts/f1-smoke.ts",
      startAt: new Date(now + 60_000).toISOString(),
      endAt: new Date(now + 4 * 60_000).toISOString(),
      allowedAssets: [{ chainId: 8453, address: "0x4200000000000000000000000000000000000006", symbol: "WETH" }],
      prizePoolUsdc: 1.5,
      prizeSplit: [50, 30, 20],
      entryRule: "open",
      adminFeeShareBps: 5000,
    },
    admin,
  );
  const t = created.trench;
  log(`created ${t.id} /t/${t.slug} in ${Date.now() - t0} ms`);
  log("escrow", t.hedera.escrowAccountId, hs.account(t.hedera.escrowAccountId));
  log("topic", t.hedera.topicId, hs.topic(t.hedera.topicId));
  if ("entityKey" in created.arkiv) log("arkiv entity", arkivExplorer.entity(created.arkiv.entityKey), "tx", arkivExplorer.tx(created.arkiv.txHash));
  else log("ARKIV FAILED:", created.arkiv.error);
  if ("txId" in created.hedera.createdMsg) log("hcs trench.created", hs.tx(created.hedera.createdMsg.txId));
  else log("HCS FAILED:", created.hedera.createdMsg.error);

  const funded = await fundTrench(t.id, admin);
  log("funded", hs.tx(funded.fundingTxId), funded.arkivTxHash ? arkivExplorer.tx(funded.arkivTxHash) : `ARKIV FAILED: ${funded.arkivError}`);
  if ("txId" in funded.fundedMsg) log("hcs trench.funded", hs.tx(funded.fundedMsg.txId));

  const transitions = await activateTrenches(new Date(now + 61_000));
  const mine = transitions.find((x) => x.trenchId === t.id);
  log("activate →", mine ? `${mine.from} → ${mine.to}` : "no transition (FAIL)", mine?.arkivTxHash ? arkivExplorer.tx(mine.arkivTxHash) : mine?.arkivError ?? "");

  const back = await arkivReader().getTrenchById(t.id);
  const bySlug = await arkivReader().getTrenchBySlug(t.slug);
  const hcs = await listHcs(t.id);
  log(`arkiv readback: byId=${back?.status ?? "missing"} bySlug=${bySlug?.status ?? "missing"} hcs messages=${hcs.length}`, hcs.map((m) => `${m.event}#${m.sequenceNumber} ${hs.tx(toMirrorTxId(m.txId))}`));

  const ok = !!mine && mine.to === "live" && back?.status === "live" && bySlug?.status === "live" && hcs.length >= 3 && "entityKey" in created.arkiv;
  log(ok ? "PASS" : "FAIL");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error("[f1-smoke] FAIL", e);
  process.exit(1);
});
