import "dotenv/config";
import cron from "node-cron";
import pino from "pino";
import { activateTrenches } from "@trenches/services";

/**
 * Worker process: pollers, scoring, settlement.
 * Jobs are registered here as steps land:
 *   step 3  activateTrenches   (every 30 s)        ✓
 *   step 5  pollOrders         (every 15 s)
 *   step 6  recomputeLeaderboards (every 30 s)
 *   step 7  settleTrenches     (every 60 s)
 *   step 8  refreshProfiles    (every 5 min)
 */
const log = pino({ level: process.env.LOG_LEVEL ?? "info" });

const jobs: { name: string; schedule: string; run: () => Promise<unknown> }[] = [
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
for (const job of jobs) {
  cron.schedule(job.schedule, async () => {
    if (running.has(job.name)) return; // never overlap a slow run with the next tick
    running.add(job.name);
    const started = Date.now();
    try {
      const result = await job.run();
      log.debug({ job: job.name, ms: Date.now() - started, result }, "job ok");
    } catch (err) {
      log.error({ job: job.name, err: (err as Error).message }, "job failed");
    } finally {
      running.delete(job.name);
    }
  });
}

log.info({ jobs: jobs.map((j) => j.name) }, "worker started");
