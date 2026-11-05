import "dotenv/config";
import cron from "node-cron";
import pino from "pino";

/**
 * Worker process: pollers, scoring, settlement.
 * Jobs are registered here as steps land:
 *   step 3  activateTrenches   (every 30 s)
 *   step 5  pollOrders         (every 15 s)
 *   step 6  recomputeLeaderboards (every 30 s)
 *   step 7  settleTrenches     (every 60 s)
 *   step 8  refreshProfiles    (every 5 min)
 */
const log = pino({ level: process.env.LOG_LEVEL ?? "info" });

const jobs: { name: string; schedule: string; run: () => Promise<void> }[] = [];

for (const job of jobs) {
  cron.schedule(job.schedule, async () => {
    const started = Date.now();
    try {
      await job.run();
      log.info({ job: job.name, ms: Date.now() - started }, "job ok");
    } catch (err) {
      log.error({ job: job.name, err }, "job failed");
    }
  });
}

log.info({ jobs: jobs.map((j) => j.name) }, "worker started");
