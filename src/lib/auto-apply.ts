import { randomUUID } from "node:crypto";
import { approveAgentProposal, generateAgentProposals } from "@/lib/agent-proposals";
import {
  getEffectiveConstructionState,
  getSoonestQueueDelayMs,
} from "@/lib/construction-state";
import { db, ensureDatabase } from "@/lib/db";
import { runManualCapture } from "@/lib/playwright-capture";
import type { ActiveConstructionLike } from "@/lib/recommendations";

const SAFETY_SWEEP_MS = 60 * 60 * 1000;
const MAX_ATTEMPTS_BEFORE_PAUSE = 3;
const ACTIVE_JOB_STATUSES = ["pending", "running"] as const;
const STALE_RUNNING_JOB_MS = 2 * 60 * 1000;

const parseConstructionQueueJson = (value: string | null): ActiveConstructionLike[] => {
  if (!value) {
    return [];
  }

  try {
    return JSON.parse(value) as ActiveConstructionLike[];
  } catch {
    return [];
  }
};

const getJitterWindowForVillageCount = (villageCount: number) => {
  if (villageCount <= 1) {
    return {
      min: 1,
      max: 2,
    };
  }

  if (villageCount <= 3) {
    return {
      min: 2,
      max: 3,
    };
  }

  return {
    min: 3,
    max: 5,
  };
};

type AutoApplyCandidateLike = {
  affordableNow: boolean;
  category: string;
  totalCost: number;
  timeToAffordHours: number | null;
  finalScore?: number | null;
};

const buildJitterMinutes = async (accountId: string) => {
  const villageCount = await db.village.count({
    where: {
      accountId,
    },
  });
  const window = getJitterWindowForVillageCount(villageCount);

  return window.min + Math.floor(Math.random() * (window.max - window.min + 1));
};

const addMinutes = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60_000);

const shouldAllowSafeSecondSlot = (input: {
  activeConstructionSlots: number | null | undefined;
  candidate: AutoApplyCandidateLike | null;
}) => {
  if ((input.activeConstructionSlots ?? 0) !== 1) {
    return true;
  }

  const candidate = input.candidate;

  // Relaxed safe mode: allow the second slot whenever the selected action
  // is already affordable now. Risk controls stay in the surrounding flow
  // via jitter, recapture, attack pauses, and repeated-failure pauses.
  return Boolean(candidate?.affordableNow);
};

const markJobsCancelledForVillage = async (villageId: string, reason: string) => {
  await db.autoApplyJob.updateMany({
    where: {
      villageId,
      status: {
        in: [...ACTIVE_JOB_STATUSES],
      },
    },
    data: {
      status: "cancelled",
      lastError: reason,
      completedAt: new Date(),
    },
  });
};

export const pauseVillageAutoApply = async (input: {
  villageId: string;
  reason: string;
}) => {
  await ensureDatabase();

  await db.village.update({
    where: {
      id: input.villageId,
    },
    data: {
      autoApplyPausedAt: new Date(),
      autoApplyPauseReason: input.reason,
    },
  });

  await db.autoApplyJob.updateMany({
    where: {
      villageId: input.villageId,
      status: {
        in: [...ACTIVE_JOB_STATUSES],
      },
    },
    data: {
      status: "paused",
      lastError: input.reason,
      completedAt: new Date(),
    },
  });
};

const clearVillagePause = async (villageId: string) => {
  await db.village.update({
    where: {
      id: villageId,
    },
    data: {
      autoApplyPausedAt: null,
      autoApplyPauseReason: null,
    },
  });
};

const scheduleVillageJob = async (input: {
  villageId: string;
  runAt: Date;
  proposalId?: string | null;
  captureRunId?: string | null;
  jitterMinutes: number;
  reason: string;
}) => {
  const activeJobs = await db.autoApplyJob.findMany({
    where: {
      villageId: input.villageId,
      status: {
        in: [...ACTIVE_JOB_STATUSES],
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  const equivalentJobs = activeJobs.filter(
    (job) => job.proposalId === (input.proposalId ?? null),
  );
  const runningEquivalentJob =
    equivalentJobs.find((job) => job.status === "running") ?? null;
  const pendingEquivalentJob =
    equivalentJobs.find((job) => job.status === "pending") ?? null;

  if (runningEquivalentJob) {
    await db.autoApplyJob.updateMany({
      where: {
        villageId: input.villageId,
        status: "pending",
        proposalId: input.proposalId ?? null,
      },
      data: {
        status: "cancelled",
        lastError: `Superseded: ${input.reason}`,
        completedAt: new Date(),
      },
    });

    return runningEquivalentJob;
  }

  if (pendingEquivalentJob) {
    await db.autoApplyJob.updateMany({
      where: {
        villageId: input.villageId,
        status: "pending",
        proposalId: input.proposalId ?? null,
        id: {
          not: pendingEquivalentJob.id,
        },
      },
      data: {
        status: "cancelled",
        lastError: `Superseded: ${input.reason}`,
        completedAt: new Date(),
      },
    });

    if (input.runAt.getTime() < pendingEquivalentJob.runAt.getTime()) {
      return db.autoApplyJob.update({
        where: {
          id: pendingEquivalentJob.id,
        },
        data: {
          runAt: input.runAt,
          notBefore: input.runAt,
          jitterMinutes: input.jitterMinutes,
          captureRunId: input.captureRunId ?? null,
        },
      });
    }

    return pendingEquivalentJob;
  }

  await db.autoApplyJob.updateMany({
    where: {
      villageId: input.villageId,
      status: "pending",
    },
    data: {
      status: "cancelled",
      lastError: `Superseded: ${input.reason}`,
      completedAt: new Date(),
    },
  });

  return db.autoApplyJob.create({
    data: {
      villageId: input.villageId,
      status: "pending",
      runAt: input.runAt,
      notBefore: input.runAt,
      jitterMinutes: input.jitterMinutes,
      proposalId: input.proposalId ?? null,
      captureRunId: input.captureRunId ?? null,
    },
  });
};

const getLatestVillageAutomationState = async (villageId: string) => {
  const village = await db.village.findUnique({
    where: {
      id: villageId,
    },
    include: {
      snapshots: {
        orderBy: {
          scrapedAt: "desc",
        },
        take: 1,
      },
      proposals: {
        where: {
          status: "pending",
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
        include: {
          candidates: {
            orderBy: {
              rank: "asc",
            },
          },
        },
      },
    },
  });

  return {
    village,
    snapshot: village?.snapshots[0] ?? null,
    proposal: village?.proposals[0] ?? null,
  };
};

export const syncAutoApplyJobsFromLatestRun = async () => {
  await ensureDatabase();

  const villages = await db.village.findMany({
    where: {
      autoApplyEnabled: true,
    },
    include: {
      snapshots: {
        orderBy: {
          scrapedAt: "desc",
        },
        take: 1,
      },
      proposals: {
        where: {
          status: "pending",
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
        include: {
          candidates: {
            orderBy: {
              rank: "asc",
            },
          },
        },
      },
    },
  });

  for (const village of villages) {
    if (village.autoApplyPausedAt) {
      continue;
    }

    const snapshot = village.snapshots[0] ?? null;
    const proposal = village.proposals[0] ?? null;

    if (!snapshot) {
      continue;
    }

    if (!proposal) {
      continue;
    }

    if ((snapshot.incomingAttacksAmount ?? 0) > 0) {
      await pauseVillageAutoApply({
        villageId: village.id,
        reason: "Incoming attacks detected.",
      });
      continue;
    }

    const effectiveConstruction = getEffectiveConstructionState({
      activeConstructionSlots: snapshot.activeConstructionSlots,
      constructionQueue: parseConstructionQueueJson(snapshot.constructionQueueJson),
      scrapedAt: snapshot.scrapedAt,
    });
    const jitterMinutes = await buildJitterMinutes(village.accountId);
    const queueDelayMs = getSoonestQueueDelayMs({
      activeConstructionSlots: snapshot.activeConstructionSlots,
      constructionQueue: parseConstructionQueueJson(snapshot.constructionQueueJson),
      scrapedAt: snapshot.scrapedAt,
    });
    const topCandidate = proposal?.candidates[0] ?? null;
    const canUseSecondSlotNow = shouldAllowSafeSecondSlot({
      activeConstructionSlots: effectiveConstruction.activeConstructionSlots,
      candidate: topCandidate
        ? {
            affordableNow: topCandidate.affordableNow,
            category: topCandidate.category,
            totalCost: topCandidate.totalCost,
            timeToAffordHours: topCandidate.timeToAffordHours,
            finalScore: topCandidate.finalScore,
          }
        : null,
    });
    const shouldRunImmediately =
      effectiveConstruction.activeConstructionSlots < 2 &&
      Boolean(topCandidate?.affordableNow) &&
      canUseSecondSlotNow;
    const baseDelayMs =
      effectiveConstruction.queueExpiredByClock && effectiveConstruction.activeConstructionSlots === 0
        ? 0
        : !canUseSecondSlotNow && effectiveConstruction.activeConstructionSlots >= 1
        ? queueDelayMs ?? SAFETY_SWEEP_MS
        : queueDelayMs ??
          (topCandidate?.timeToAffordHours !== null && topCandidate?.timeToAffordHours !== undefined
            ? topCandidate.timeToAffordHours * 60 * 60 * 1000
            : topCandidate?.affordableNow
              ? 0
              : SAFETY_SWEEP_MS);
    const runAt = shouldRunImmediately
      ? new Date(Date.now())
      : addMinutes(new Date(Date.now() + baseDelayMs), jitterMinutes);

    await scheduleVillageJob({
      villageId: village.id,
      runAt,
      proposalId: proposal?.id ?? null,
      captureRunId: snapshot.captureRunId,
      jitterMinutes: shouldRunImmediately ? 0 : jitterMinutes,
      reason: queueDelayMs !== null ? "queue-delay" : "proposal-delay",
    });
  }
};

export const setVillageAutoApply = async (input: {
  villageId: string;
  enabled: boolean;
}) => {
  await ensureDatabase();

  const village = await db.village.findUnique({
    where: {
      id: input.villageId,
    },
  });

  if (!village) {
    throw new Error("Village not found.");
  }

  await db.village.update({
    where: {
      id: input.villageId,
    },
    data: {
      autoApplyEnabled: input.enabled,
      autoApplyPausedAt: null,
      autoApplyPauseReason: null,
    },
  });

  if (!input.enabled) {
    await markJobsCancelledForVillage(input.villageId, "Auto-apply disabled.");
    return;
  }

  await clearVillagePause(input.villageId);
  await syncAutoApplyJobsFromLatestRun();
};

const getNextPendingJob = async () =>
  db.autoApplyJob.findFirst({
    where: {
      status: "pending",
    },
    orderBy: {
      runAt: "asc",
    },
    include: {
      village: true,
    },
  });

const recoverStaleRunningJobs = async () => {
  const staleBefore = new Date(Date.now() - STALE_RUNNING_JOB_MS);

  await db.autoApplyJob.updateMany({
    where: {
      status: "running",
      lockedAt: {
        lte: staleBefore,
      },
    },
    data: {
      status: "pending",
      runAt: new Date(),
      notBefore: new Date(),
      lastError: "Recovered stale auto-apply worker lock.",
      lockToken: null,
      lockedAt: null,
    },
  });
};

const claimJob = async (jobId: string) => {
  const lockToken = randomUUID();
  const updateResult = await db.autoApplyJob.updateMany({
    where: {
      id: jobId,
      status: "pending",
    },
    data: {
      status: "running",
      lockToken,
      lockedAt: new Date(),
    },
  });

  if (updateResult.count === 0) {
    return null;
  }

  return lockToken;
};

const finishJob = async (jobId: string, status: string, lastError?: string | null) => {
  await db.autoApplyJob.updateMany({
    where: {
      id: jobId,
    },
    data: {
      status,
      lastError: lastError ?? null,
      processedAt: new Date(),
      completedAt: new Date(),
      lockToken: null,
      lockedAt: null,
    },
  });
};

const refreshAccountState = async () => {
  const captureRunId = await runManualCapture();
  await generateAgentProposals();
  await syncAutoApplyJobsFromLatestRun();
  return captureRunId;
};

export const processAutoApplyJob = async (jobId: string) => {
  await ensureDatabase();

  const lockToken = await claimJob(jobId);

  if (!lockToken) {
    return;
  }

  const job = await db.autoApplyJob.findUnique({
    where: {
      id: jobId,
    },
    include: {
      village: true,
    },
  });

  if (!job) {
    return;
  }

  try {
    if (!job.village.autoApplyEnabled) {
      await finishJob(job.id, "cancelled", "Auto-apply disabled.");
      return;
    }

    if (job.village.autoApplyPausedAt) {
      await finishJob(job.id, "paused", job.village.autoApplyPauseReason ?? "Village paused.");
      return;
    }

    const captureRunId = await refreshAccountState();
    const latest = await getLatestVillageAutomationState(job.villageId);

    if (!latest.village || !latest.snapshot) {
      throw new Error("Village snapshot missing after refresh.");
    }

    if ((latest.snapshot.incomingAttacksAmount ?? 0) > 0) {
      await pauseVillageAutoApply({
        villageId: latest.village.id,
        reason: "Incoming attacks detected.",
      });
      await finishJob(job.id, "paused", "Incoming attacks detected.");
      return;
    }

    const proposal = latest.proposal;
    const selectedCandidate =
      proposal?.candidates.find((candidate) => candidate.isRecommended) ??
      proposal?.candidates[0] ??
      null;
    const canUseSecondSlotNow = shouldAllowSafeSecondSlot({
      activeConstructionSlots: getEffectiveConstructionState({
        activeConstructionSlots: latest.snapshot.activeConstructionSlots,
        constructionQueue: parseConstructionQueueJson(latest.snapshot.constructionQueueJson),
        scrapedAt: latest.snapshot.scrapedAt,
      }).activeConstructionSlots,
      candidate: selectedCandidate
        ? {
            affordableNow: selectedCandidate.affordableNow,
            category: selectedCandidate.category,
            totalCost: selectedCandidate.totalCost,
            timeToAffordHours: selectedCandidate.timeToAffordHours,
            finalScore: selectedCandidate.finalScore,
          }
        : null,
    });

    if (
      !proposal ||
      !selectedCandidate ||
      !selectedCandidate.affordableNow ||
      !canUseSecondSlotNow
    ) {
      await syncAutoApplyJobsFromLatestRun();
      await finishJob(job.id, "done", "Refreshed and rescheduled.");
      return;
    }

    await approveAgentProposal(proposal.id, selectedCandidate.id);
    await db.autoApplyJob.update({
      where: {
        id: job.id,
      },
      data: {
        proposalId: proposal.id,
        captureRunId,
      },
    });

    await refreshAccountState();
    await finishJob(job.id, "done");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown auto-apply failure.";
    const nextRunAt = addMinutes(new Date(), await buildJitterMinutes(job.village.accountId));
    const updateResult = await db.autoApplyJob.updateMany({
      where: {
        id: job.id,
      },
      data: {
        status: "pending",
        lastError: message,
        attemptCount: {
          increment: 1,
        },
        runAt: nextRunAt,
        lockToken: null,
        lockedAt: null,
      },
    });

    if (updateResult.count === 0) {
      return;
    }

    const updated = await db.autoApplyJob.findUnique({
      where: {
        id: job.id,
      },
    });

    if (!updated) {
      return;
    }

    if (
      updated.attemptCount >= MAX_ATTEMPTS_BEFORE_PAUSE ||
      /captcha|login|anti-bot/i.test(message)
    ) {
      await pauseVillageAutoApply({
        villageId: job.villageId,
        reason: message,
      });
      await finishJob(job.id, "paused", message);
    }
  }
};

export const getAutoApplyWorkerWaitMs = async () => {
  await ensureDatabase();
  await recoverStaleRunningJobs();
  const nextJob = await getNextPendingJob();

  if (!nextJob) {
    return SAFETY_SWEEP_MS;
  }

  return Math.max(0, Math.min(nextJob.runAt.getTime() - Date.now(), SAFETY_SWEEP_MS));
};

export const listVillageAutoApplyState = async (villageIds: string[]) => {
  await ensureDatabase();

  const jobs = await db.autoApplyJob.findMany({
    where: {
      villageId: {
        in: villageIds,
      },
      status: {
        in: ["pending", "running", "paused"],
      },
    },
    orderBy: {
      runAt: "asc",
    },
  });

  const latestByVillage = new Map<string, (typeof jobs)[number]>();

  for (const job of jobs) {
    if (!latestByVillage.has(job.villageId)) {
      latestByVillage.set(job.villageId, job);
    }
  }

  return latestByVillage;
};

export const processDueAutoApplyJobs = async () => {
  await ensureDatabase();
  await recoverStaleRunningJobs();

  const dueJobs = await db.autoApplyJob.findMany({
    where: {
      status: "pending",
      runAt: {
        lte: new Date(),
      },
    },
    orderBy: {
      runAt: "asc",
    },
    take: 10,
  });

  for (const job of dueJobs) {
    await processAutoApplyJob(job.id);
  }
};
