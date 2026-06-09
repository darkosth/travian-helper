import "dotenv/config";

import {
  getAutoApplyWorkerWaitMs,
  processDueAutoApplyJobs,
  refreshAutoApplyState,
} from "../src/lib/auto-apply.ts";
import { ensureDatabase } from "../src/lib/db.ts";

const DEFAULT_WATCHDOG_MS = 8 * 60 * 1000;
const WATCHDOG_MS = Number(process.env.AUTO_APPLY_CYCLE_TIMEOUT_MS ?? DEFAULT_WATCHDOG_MS);
const MIN_LOOP_PAUSE_MS = 500;
const PROFILE_ID = process.env.TRAVIAN_PROFILE_ID?.trim() ?? "";
const STARTUP_DELAY_MS = Number(process.env.AUTO_APPLY_STARTUP_DELAY_MS ?? 0);

if (!PROFILE_ID) {
  throw new Error(
    "TRAVIAN_PROFILE_ID is required. Start one auto-apply worker per credential profile.",
  );
}

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const formatDuration = (ms: number) => `${Math.round(ms / 1000)}s`;
const logPrefix = `[auto-apply-worker:${PROFILE_ID}]`;

const runWithWatchdog = async <T>(
  label: string,
  operation: () => Promise<T>,
): Promise<T> => {
  const startedAt = Date.now();

  console.log(`${logPrefix} ${label} started`);

  const watchdog = setTimeout(() => {
    console.error(
      `${logPrefix} ${label} exceeded ${formatDuration(WATCHDOG_MS)}. ` +
        "Exiting so PM2 can recover the worker.",
    );

    process.exit(1);
  }, WATCHDOG_MS);

  try {
    const result = await operation();

    console.log(
      `${logPrefix} ${label} completed in ${formatDuration(Date.now() - startedAt)}`,
    );

    return result;
  } finally {
    clearTimeout(watchdog);
  }
};

const refreshState = async (label: string) => {
  await runWithWatchdog(label, async () => {
    await refreshAutoApplyState(PROFILE_ID);
  });
};

const run = async () => {
  await ensureDatabase();

  if (STARTUP_DELAY_MS > 0) {
    console.log(`${logPrefix} startup delay ${formatDuration(STARTUP_DELAY_MS)}`);
    await sleep(STARTUP_DELAY_MS);
  }

  await refreshState("initial account refresh");

  while (true) {
    let processedJobs = 0;

    try {
      processedJobs = await runWithWatchdog("processing one due job", async () =>
        processDueAutoApplyJobs(PROFILE_ID),
      );
    } catch (error) {
      console.error(`${logPrefix} process cycle failed`, error);
    }

    // Después de una acción, recapturamos una sola vez para observar el resultado,
    // generar la siguiente propuesta y programar el próximo job limpio.
    if (processedJobs > 0) {
      try {
        await refreshState("post-action account refresh");
      } catch (error) {
        console.error(`${logPrefix} post-action refresh failed`, error);
      }

      continue;
    }

    let waitMs = 5 * 60 * 1000;

    try {
      waitMs = await getAutoApplyWorkerWaitMs(PROFILE_ID);
    } catch (error) {
      console.error(`${logPrefix} failed to compute next wait`, error);
    }

    const safeWaitMs = Math.max(MIN_LOOP_PAUSE_MS, waitMs);
    console.log(`${logPrefix} sleeping for ${formatDuration(safeWaitMs)}`);
    await sleep(safeWaitMs);

    // Antes de intentar un job programado para el futuro, refrescamos el estado.
    // Así evitamos actuar sobre recursos o colas antiguas.
    try {
      await refreshState("scheduled account refresh");
    } catch (error) {
      console.error(`${logPrefix} scheduled refresh failed`, error);
    }
  }
};

run().catch((error) => {
  console.error(`${logPrefix} fatal`, error);
  process.exit(1);
});
