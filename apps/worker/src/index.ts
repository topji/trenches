import "dotenv/config";
import http from "node:http";
import cron from "node-cron";
import pino from "pino";
import { activateTrenches, pollOrders, recomputeClanScores, recomputeLeaderboards, refreshProfiles, settleTrenches } from "@trenches/services";

/**
 * Worker process: pollers, scoring, settlement.
 * Jobs are registered here as steps land:
 *   step 3  activateTrenches   (every 30 s)        ✓
 *   step 5  pollOrders         (every 15 s)        ✓
 *   step 6  recomputeLeaderboards (every 30 s)   ✓
 *   step 7  settleTrenches     (every 60 s)        ✓
 *   step 8  refreshProfiles    (every 5 min)      ✓
 */
const log = pino({ level: process.env.LOG_LEVEL ?? "info" });

const jobs: { name: string; schedule: string; run: () => Promise<unknown> }[] = [
  {
    name: "pollOrders",
    schedule: "*/15 * * * * *",
    run: async () => {
      const r = await pollOrders();
      if (r.newFills || r.closed) log.info(r, "orders polled");
      return r;
    },
  },
  {
    name: "recomputeLeaderboards",
    schedule: "5,35 * * * * *",
    run: async () => {
      const r = await recomputeLeaderboards();
      const changed = r.filter((x) => x.changed);
      if (changed.length) log.info({ changed: changed.map((x) => ({ trenchId: x.trenchId, rows: x.rows.length, rankChanges: x.rankChanges, arkivTx: x.arkivTxHash, snapshot: x.snapshot })) }, "leaderboards updated");
      return r.length;
    },
  },
  {
    name: "settleTrenches",
    schedule: "20 * * * * *",
    run: async () => {
      const r = await settleTrenches();
      for (const s of r) log.info({ trenchId: s.trenchId, slug: s.slug, winners: s.winners, payoutTxId: s.payoutTxId, feeShare: s.feeShare, arkivPayoutsTx: s.arkivPayoutsTx }, "settled");
      return r.length;
    },
  },
  {
    name: "refreshProfiles",
    schedule: "40 */5 * * * *",
    run: async () => {
      const r = await refreshProfiles();
      if (r.updated) log.info(r, "profiles refreshed");
      return r;
    },
  },
  {
    name: "recomputeClanScores",
    schedule: "50 * * * * *",
    run: async () => {
      const r = await recomputeClanScores();
      if (r.clans && r.arkivTx) log.info(r, "clan ladder updated");
      return r;
    },
  },
  {
    name: "activateTrenches",
    schedule: "*/30 * * * * *",
    run: async () => {
      const transitions = await activateTrenches();
      for (const t of transitions) log.info(t, "transition");
      return transitions.length;
    },
  },
];

const running = new Set<string>();
const lastRun = new Map<string, { at: string; ms: number; ok: boolean; error?: string }>();
const startedAt = new Date().toISOString();
for (const job of jobs) {
  cron.schedule(job.schedule, async () => {
    if (running.has(job.name)) return; // never overlap a slow run with the next tick
    running.add(job.name);
    const started = Date.now();
    try {
      const result = await job.run();
      log.debug({ job: job.name, ms: Date.now() - started, result }, "job ok");
      lastRun.set(job.name, { at: new Date().toISOString(), ms: Date.now() - started, ok: true });
    } catch (err) {
      log.error({ job: job.name, err: (err as Error).message }, "job failed");
      lastRun.set(job.name, { at: new Date().toISOString(), ms: Date.now() - started, ok: false, error: (err as Error).message });
    } finally {
      running.delete(job.name);
    }
  });
}

log.info({ jobs: jobs.map((j) => j.name) }, "worker started");

/** Health endpoint (worker.jointrenches.xyz): which jobs run, when they last ran, and whether they succeeded. */
const port = Number(process.env.PORT ?? 8080);
http
  .createServer((req, res) => {
    const body = {
      ok: true,
      service: "trenches-worker",
      startedAt,
      uptimeSeconds: Math.round(process.uptime()),
      jobs: jobs.map((j) => ({ name: j.name, schedule: j.schedule, running: running.has(j.name), last: lastRun.get(j.name) ?? null })),
    };
    res.writeHead(req.url === "/" || req.url === "/health" ? 200 : 404, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify(body, null, 2));
  })
  .listen(port, () => log.info({ port }, "health endpoint listening"));
