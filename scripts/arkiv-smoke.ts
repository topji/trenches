/**
 * Arkiv smoke: create one `trenches.trench` entity on Rabdi, query it back by trenchId and slug,
 * patch its status in place, read it again, and print explorer links. The entity is left in place
 * (30-day expiry) so the link keeps working for judges.
 *
 *   pnpm smoke:arkiv
 *
 * Env: ARKIV_WRITER_KEY (0x…, funded from https://hub.arkiv.network/faucet), ARKIV_ACCESS_KEY (recommended).
 * Exit codes: 0 PASS · 1 FAIL · 2 NEEDS ENV.
 */
import "dotenv/config";
import type { Trench } from "../packages/core/src/index.js";
import { newId, slugify } from "../packages/core/src/index.js";
import { ArkivRepo, arkivExplorer, arkivFromEnv } from "../packages/arkiv/src/index.js";

const log = (...a: unknown[]) => console.log("[arkiv-smoke]", ...a);

async function main() {
  const { pub, wallet } = arkivFromEnv();
  const timing = await pub.getBlockTiming();
  log("rpc ok: block", timing.currentBlock.toString(), `(${timing.blockDuration}s blocks)`);

  if (!wallet) {
    log("NEEDS ENV: ARKIV_WRITER_KEY is not set. Read path works; nothing written.");
    process.exit(2);
  }
  log("writer", wallet.address, arkivExplorer.address(wallet.address));
  const repo = new ArkivRepo(pub, wallet.client, wallet.address);

  const now = Date.now();
  const trench: Trench = {
    id: newId(),
    slug: slugify("Smoke Trench"),
    name: "Smoke Trench",
    description: "arkiv-smoke.ts",
    adminAddress: wallet.address,
    startAt: new Date(now + 10 * 60_000).toISOString(),
    endAt: new Date(now + 70 * 60_000).toISOString(),
    allowedAssets: [{ chainId: 8453, address: "0x4200000000000000000000000000000000000006", symbol: "WETH" }],
    prizePoolUsdc: 1,
    prizeSplit: [50, 30, 20],
    entryRule: "open",
    adminFeeShareBps: 5000,
    status: "draft",
    hedera: { escrowAccountId: "0.0.0", topicId: "0.0.0" },
    createdAt: new Date(now).toISOString(),
  };

  const created = await repo.createTrench(trench);
  log("created", created.entityKey, arkivExplorer.tx(created.txHash));

  const byId = await repo.getTrenchById(trench.id);
  const bySlug = await repo.getTrenchBySlug(trench.slug);
  if (!byId || !bySlug || byId.entityKey !== created.entityKey) {
    log("FAIL: entity not readable by trenchId/slug", { byId: !!byId, bySlug: !!bySlug });
    process.exit(1);
  }
  log("query by trenchId ok, by slug ok");

  const patched = await repo.updateTrench({ ...trench, status: "funded" }, created.entityKey);
  const again = await repo.getTrenchById(trench.id);
  if (!again || again.status !== "funded") {
    log("FAIL: patch did not apply", again?.status);
    process.exit(1);
  }
  log("patched status → funded", arkivExplorer.tx(patched.txHash));

  const listed = await repo.listTrenches({ statuses: ["funded", "live"], asset: "WETH" });
  log(`discovery query returned ${listed.length} funded/live WETH trench(es)`);
  if (!listed.some((t) => t.id === trench.id)) {
    log("FAIL: discovery query missed the entity");
    process.exit(1);
  }

  log("entity", arkivExplorer.entity(created.entityKey));
  log("PASS");
}

main().catch((e) => {
  console.error("[arkiv-smoke] FAIL", e);
  process.exit(1);
});
