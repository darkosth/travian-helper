import "dotenv/config";

import {
  getAutoApplyWorkerWaitMs,
  maybeRefreshAutoApplyState,
  processDueAutoApplyJobs,
  refreshAutoApplyState,
} from "../src/lib/auto-apply.ts";
import { normalizeAutoApplyError } from "../src/lib/auto-apply-errors.ts";
import { ensureDatabase } from "../src/lib/db.ts";
import { removeProfilePm2Processes } from "../src/lib/profile-runtime.ts";

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

const stopWorkerWithoutRestart = async (message: string) => {
  console.error(`${logPrefix} ${message}`);

  try {
    await removeProfilePm2Processes(PROFILE_ID);
  } catch (error) {
    console.error(`${logPrefix} failed to deregister PM2 process`, error);
  }

  process.exit(0);
};

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

const handleRefreshFailure = async (label: string, error: unknown) => {
  const normalized = normalizeAutoApplyError(error, "AUTO_APPLY_WORKER_REFRESH_FAILED");

  if (normalized.kind === "terminal") {
    await stopWorkerWithoutRestart(
      `${label} stopped the worker permanently: ${normalized.message}`,
    );
    return;
  }

  if (normalized.kind === "connectivity") {
    const retryAfterMs = normalized.retryAfterMs ?? 15 * 60 * 1000;
    console.error(
      `${logPrefix} ${label} hit connectivity cooldown for ${formatDuration(retryAfterMs)}: ${normalized.message}`,
    );
    await sleep(retryAfterMs);
    return;
  }

  console.error(`${logPrefix} ${label} failed`, normalized);
};

const run = async () => {
  await ensureDatabase();

  if (STARTUP_DELAY_MS > 0) {
    console.log(`${logPrefix} startup delay ${formatDuration(STARTUP_DELAY_MS)}`);
    await sleep(STARTUP_DELAY_MS);
  }

  try {
    await refreshState("initial account refresh");
  } catch (error) {
    await handleRefreshFailure("initial account refresh", error);
  }

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
        await handleRefreshFailure("post-action account refresh", error);
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

    try {
      await maybeRefreshAutoApplyState(PROFILE_ID);
    } catch (error) {
      await handleRefreshFailure("scheduled account refresh", error);
    }
  }
};

run().catch((error) => {
  const normalized = normalizeAutoApplyError(error, "AUTO_APPLY_WORKER_FATAL");

  if (normalized.kind === "terminal") {
    void stopWorkerWithoutRestart(`fatal terminal failure: ${normalized.message}`);
    return;
  }

  console.error(`${logPrefix} fatal`, normalized);
  process.exit(1);
});
