import "dotenv/config";

import {
  getAutoApplyWorkerWaitMs,
  processDueAutoApplyJobs,
  syncAutoApplyJobsFromLatestRun,
} from "../src/lib/auto-apply.ts";
import { ensureDatabase } from "../src/lib/db.ts";

const DEFAULT_WATCHDOG_MS = 8 * 60 * 1000;
const WATCHDOG_MS = Number(process.env.AUTO_APPLY_CYCLE_TIMEOUT_MS ?? DEFAULT_WATCHDOG_MS);

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const formatDuration = (ms: number) => `${Math.round(ms / 1000)}s`;

const runWithWatchdog = async (
  label: string,
  operation: () => Promise<void>,
) => {
  const startedAt = Date.now();

  console.log(`[auto-apply-worker] ${label} started`);

  const watchdog = setTimeout(() => {
    console.error(
      `[auto-apply-worker] ${label} exceeded ${formatDuration(WATCHDOG_MS)}. ` +
        "Exiting so PM2 can recover the worker.",
    );

    process.exit(1);
  }, WATCHDOG_MS);

  try {
    await operation();

    console.log(
      `[auto-apply-worker] ${label} completed in ${formatDuration(Date.now() - startedAt)}`,
    );
  } finally {
    clearTimeout(watchdog);
  }
};

const run = async () => {
  await ensureDatabase();

  await runWithWatchdog("initial sync", async () => {
    await syncAutoApplyJobsFromLatestRun();
  });

  while (true) {
    try {
      await runWithWatchdog("processing cycle", async () => {
        await processDueAutoApplyJobs();
      });
    } catch (error) {
      console.error("[auto-apply-worker] process cycle failed", error);
    }

    let waitMs = 60 * 60 * 1000;

    try {
      waitMs = await getAutoApplyWorkerWaitMs();
    } catch (error) {
      console.error("[auto-apply-worker] failed to compute next wait", error);
    }

    console.log(`[auto-apply-worker] sleeping for ${formatDuration(waitMs)}`);
    await sleep(waitMs);
  }
};

run().catch((error) => {
  console.error("[auto-apply-worker] fatal", error);
  process.exit(1);
});
