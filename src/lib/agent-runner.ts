import { generateAgentProposals } from "@/lib/agent-proposals";
import { kickAutoApplyNow, syncAutoApplyJobsFromLatestRun } from "@/lib/auto-apply";
import { db, ensureDatabase } from "@/lib/db";
import { runManualCapture } from "@/lib/playwright-capture";

export const runCaptureAndGenerateProposals = async () => {
  await ensureDatabase();

  const runId = await runManualCapture();
  const run = await db.captureRun.findUnique({
    where: {
      id: runId,
    },
    select: {
      status: true,
      errorMessage: true,
    },
  });

  if (!run) {
    throw new Error("Capture run was not found after completion.");
  }

  if (run.status !== "complete") {
    throw new Error(
      run.errorMessage ??
        "Capture did not complete successfully, so no proposals were generated.",
    );
  }

  const proposalIds = await generateAgentProposals();
  await syncAutoApplyJobsFromLatestRun();
  await kickAutoApplyNow();

  return {
    runId,
    proposalIds,
  };
};
