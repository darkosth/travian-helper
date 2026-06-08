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

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const formatDuration = (ms: number) => `${Math.round(ms / 1000)}s`;

const runWithWatchdog = async <T>(
  label: string,
  operation: () => Promise<T>,
): Promise<T> => {
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
    const result = await operation();

    console.log(
      `[auto-apply-worker] ${label} completed in ${formatDuration(Date.now() - startedAt)}`,
    );

    return result;
  } finally {
    clearTimeout(watchdog);
  }
};

const refreshState = async (label: string) => {
  await runWithWatchdog(label, async () => {
    await refreshAutoApplyState();
  });
};

const run = async () => {
  await ensureDatabase();
  await refreshState("initial account refresh");

  while (true) {
    let processedJobs = 0;

    try {
      processedJobs = await runWithWatchdog("processing one due job", async () =>
        processDueAutoApplyJobs(),
      );
    } catch (error) {
      console.error("[auto-apply-worker] process cycle failed", error);
    }

    // Después de una acción, recapturamos una sola vez para observar el resultado,
    // generar la siguiente propuesta y programar el próximo job limpio.
    if (processedJobs > 0) {
      try {
        await refreshState("post-action account refresh");
      } catch (error) {
        console.error("[auto-apply-worker] post-action refresh failed", error);
      }

      continue;
    }

    let waitMs = 5 * 60 * 1000;

    try {
      waitMs = await getAutoApplyWorkerWaitMs();
    } catch (error) {
      console.error("[auto-apply-worker] failed to compute next wait", error);
    }

    const safeWaitMs = Math.max(MIN_LOOP_PAUSE_MS, waitMs);
    console.log(`[auto-apply-worker] sleeping for ${formatDuration(safeWaitMs)}`);
    await sleep(safeWaitMs);

    // Antes de intentar un job programado para el futuro, refrescamos el estado.
    // Así evitamos actuar sobre recursos o colas antiguas.
    try {
      await refreshState("scheduled account refresh");
    } catch (error) {
      console.error("[auto-apply-worker] scheduled refresh failed", error);
    }
  }
};

run().catch((error) => {
  console.error("[auto-apply-worker] fatal", error);
  process.exit(1);
});
