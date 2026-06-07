import "dotenv/config";
import {
  getAutoApplyWorkerWaitMs,
  processDueAutoApplyJobs,
  syncAutoApplyJobsFromLatestRun,
} from "../src/lib/auto-apply.ts";
import { ensureDatabase } from "../src/lib/db.ts";

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const run = async () => {
  await ensureDatabase();
  await syncAutoApplyJobsFromLatestRun();

  while (true) {
    try {
      await processDueAutoApplyJobs();
    } catch (error) {
      console.error("[auto-apply-worker] process cycle failed", error);
    }

    let waitMs = 60 * 60 * 1000;

    try {
      waitMs = await getAutoApplyWorkerWaitMs();
    } catch (error) {
      console.error("[auto-apply-worker] failed to compute next wait", error);
    }

    await sleep(waitMs);
  }
};

run().catch((error) => {
  console.error("[auto-apply-worker] fatal", error);
  process.exit(1);
});
