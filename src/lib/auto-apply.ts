import { randomUUID } from "node:crypto";
import { approveAgentProposal, generateAgentProposals } from "@/lib/agent-proposals";
import {
  getEffectiveConstructionState,
  getSoonestQueueDelayMs,
} from "@/lib/construction-state";
import { getActiveCredentialProfile, getCredentialProfile } from "@/lib/credentials";
import { db, ensureDatabase } from "@/lib/db";
import { runManualCapture } from "@/lib/playwright-capture";
import type { ActiveConstructionLike } from "@/lib/recommendations";

// El MVP prioriza un flujo fácil de observar:
// una captura global, un solo job por ciclo y una sola acción por job.
const SAFETY_SWEEP_MS = 5 * 60 * 1000;
const MIN_RETRY_DELAY_MS = 30 * 1000;
const ERROR_RETRY_DELAY_MS = 60 * 1000;
const QUEUE_FINISH_BUFFER_MS = 15 * 1000;
const MAX_ATTEMPTS_BEFORE_PAUSE = 3;
const ACTIVE_JOB_STATUSES = ["pending", "running"] as const;
const STALE_RUNNING_JOB_MS = 2 * 60 * 1000;

const resolveCredentialProfileId = async (profileId?: string) => {
  if (profileId) {
    return profileId;
  }

  const activeProfile = await getActiveCredentialProfile();

  if (!activeProfile) {
    throw new Error("Missing active credential profile.");
  }

  return activeProfile.id;
};

const getLinkedProfileAccountId = async (profileId: string) => {
  const profile = await getCredentialProfile(profileId);

  if (!profile) {
    throw new Error("Credential profile not found.");
  }

  if (!profile.accountId) {
    throw new Error(
      "Credential profile is not linked to a Travian account yet. Run a capture for this profile first.",
    );
  }

  return profile.accountId;
};

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

type AutoApplyCandidateLike = {
  affordableNow: boolean;
  category: string;
  totalCost: number;
  timeToAffordHours: number | null;
  finalScore?: number | null;
};

const addMilliseconds = (date: Date, milliseconds: number) =>
  new Date(date.getTime() + milliseconds);

const shouldAllowSafeSecondSlot = (input: {
  activeConstructionSlots: number | null | undefined;
  candidate: AutoApplyCandidateLike | null;
}) => {
  if ((input.activeConstructionSlots ?? 0) !== 1) {
    return true;
  }

  // Mientras exista un segundo slot libre, el MVP permite usarlo
  // únicamente si la recomendación ya es pagable ahora mismo.
  return Boolean(input.candidate?.affordableNow);
};

const markJobsCancelledForVillage = async (
  villageId: string,
  reason: string,
  profileId?: string,
) => {
  await db.autoApplyJob.updateMany({
    where: {
      villageId,
      ...(profileId ? { credentialProfileId: profileId } : {}),
      status: {
        in: [...ACTIVE_JOB_STATUSES],
      },
    },
    data: {
      status: "cancelled",
      lastError: reason,
      completedAt: new Date(),
      lockToken: null,
      lockedAt: null,
    },
  });
};

export const pauseVillageAutoApply = async (input: {
  villageId: string;
  reason: string;
  profileId?: string;
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
      ...(input.profileId ? { credentialProfileId: input.profileId } : {}),
      status: {
        in: [...ACTIVE_JOB_STATUSES],
      },
    },
    data: {
      status: "paused",
      lastError: input.reason,
      completedAt: new Date(),
      lockToken: null,
      lockedAt: null,
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

const recoverStaleRunningJobs = async (profileId: string) => {
  const staleBefore = new Date(Date.now() - STALE_RUNNING_JOB_MS);

  await db.autoApplyJob.updateMany({
    where: {
      credentialProfileId: profileId,
      status: "running",
      OR: [
        {
          lockedAt: {
            lte: staleBefore,
          },
        },
        {
          lockedAt: null,
        },
      ],
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

const scheduleVillageJob = async (input: {
  credentialProfileId: string;
  villageId: string;
  runAt: Date;
  proposalId?: string | null;
  captureRunId?: string | null;
  reason: string;
}) => {
  const activeJobs = await db.autoApplyJob.findMany({
    where: {
      credentialProfileId: input.credentialProfileId,
      villageId: input.villageId,
      status: {
        in: [...ACTIVE_JOB_STATUSES],
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  const runningJob = activeJobs.find((job) => job.status === "running") ?? null;

  // Nunca creamos otro pending mientras esta aldea ya está ejecutando una acción.
  // La captura posterior al job programará el siguiente intento limpio.
  if (runningJob) {
    await db.autoApplyJob.updateMany({
      where: {
        credentialProfileId: input.credentialProfileId,
        villageId: input.villageId,
        status: "pending",
      },
      data: {
        status: "cancelled",
        lastError: `Superseded while village job is running: ${input.reason}`,
        completedAt: new Date(),
      },
    });

    return runningJob;
  }

  const pendingJob = activeJobs.find((job) => job.status === "pending") ?? null;

  if (pendingJob) {
    await db.autoApplyJob.updateMany({
      where: {
        credentialProfileId: input.credentialProfileId,
        villageId: input.villageId,
        status: "pending",
        id: {
          not: pendingJob.id,
        },
      },
      data: {
        status: "cancelled",
        lastError: `Superseded duplicate pending job: ${input.reason}`,
        completedAt: new Date(),
      },
    });

    return db.autoApplyJob.update({
      where: {
        id: pendingJob.id,
      },
      data: {
        runAt: input.runAt,
        notBefore: input.runAt,
        jitterMinutes: 0,
        proposalId: input.proposalId ?? null,
        captureRunId: input.captureRunId ?? null,
        lastError: null,
      },
    });
  }

  return db.autoApplyJob.create({
    data: {
      credentialProfileId: input.credentialProfileId,
      villageId: input.villageId,
      status: "pending",
      runAt: input.runAt,
      notBefore: input.runAt,
      jitterMinutes: 0,
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

const getCandidateDelayMs = (candidate: AutoApplyCandidateLike | null) => {
  if (!candidate) {
    return SAFETY_SWEEP_MS;
  }

  if (candidate.affordableNow) {
    return 0;
  }

  if (candidate.timeToAffordHours === null || candidate.timeToAffordHours === undefined) {
    return SAFETY_SWEEP_MS;
  }

  return Math.max(MIN_RETRY_DELAY_MS, candidate.timeToAffordHours * 60 * 60 * 1000);
};

export const syncAutoApplyJobsFromLatestRun = async (profileId?: string) => {
  await ensureDatabase();
  const resolvedProfileId = await resolveCredentialProfileId(profileId);
  const accountId = await getLinkedProfileAccountId(resolvedProfileId);
  await recoverStaleRunningJobs(resolvedProfileId);

  const villages = await db.village.findMany({
    where: {
      accountId,
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

    if (!snapshot || !proposal) {
      await markJobsCancelledForVillage(
        village.id,
        !snapshot ? "Missing current village snapshot." : "Missing pending proposal.",
        resolvedProfileId,
      );
      continue;
    }

    if ((snapshot.incomingAttacksAmount ?? 0) > 0) {
      await pauseVillageAutoApply({
        villageId: village.id,
        reason: "Incoming attacks detected.",
        profileId: resolvedProfileId,
      });
      continue;
    }

    const constructionQueue = parseConstructionQueueJson(snapshot.constructionQueueJson);
    const effectiveConstruction = getEffectiveConstructionState({
      activeConstructionSlots: snapshot.activeConstructionSlots,
      constructionQueue,
      scrapedAt: snapshot.scrapedAt,
    });
    const queueDelayMs = getSoonestQueueDelayMs({
      activeConstructionSlots: snapshot.activeConstructionSlots,
      constructionQueue,
      scrapedAt: snapshot.scrapedAt,
    });
    const topCandidate = proposal.candidates[0] ?? null;
    const candidateLike = topCandidate
      ? {
          affordableNow: topCandidate.affordableNow,
          category: topCandidate.category,
          totalCost: topCandidate.totalCost,
          timeToAffordHours: topCandidate.timeToAffordHours,
          finalScore: topCandidate.finalScore,
        }
      : null;
    const canUseSecondSlotNow = shouldAllowSafeSecondSlot({
      activeConstructionSlots: effectiveConstruction.activeConstructionSlots,
      candidate: candidateLike,
    });
    const hasFreeSlot = effectiveConstruction.activeConstructionSlots < 2;
    const shouldRunImmediately =
      hasFreeSlot && Boolean(topCandidate?.affordableNow) && canUseSecondSlotNow;

    let delayMs = 0;
    let reason = "ready-now";

    if (!shouldRunImmediately) {
      if (!hasFreeSlot || !canUseSecondSlotNow) {
        delayMs = Math.max(
          MIN_RETRY_DELAY_MS,
          (queueDelayMs ?? SAFETY_SWEEP_MS) + QUEUE_FINISH_BUFFER_MS,
        );
        reason = "queue-delay";
      } else {
        delayMs = getCandidateDelayMs(candidateLike);
        reason = "resource-delay";
      }
    }

    await scheduleVillageJob({
      credentialProfileId: resolvedProfileId,
      villageId: village.id,
      runAt: addMilliseconds(new Date(), delayMs),
      proposalId: proposal.id,
      captureRunId: snapshot.captureRunId,
      reason,
    });
  }
};

export const refreshAutoApplyState = async (profileId?: string) => {
  await ensureDatabase();
  const resolvedProfileId = await resolveCredentialProfileId(profileId);
  await recoverStaleRunningJobs(resolvedProfileId);

  const captureRunId = await runManualCapture(resolvedProfileId);
  await generateAgentProposals(resolvedProfileId);
  await syncAutoApplyJobsFromLatestRun(resolvedProfileId);

  return captureRunId;
};

export const setVillageAutoApply = async (input: {
  villageId: string;
  enabled: boolean;
  profileId?: string;
}) => {
  await ensureDatabase();
  const resolvedProfileId = await resolveCredentialProfileId(input.profileId);
  const accountId = await getLinkedProfileAccountId(resolvedProfileId);

  const village = await db.village.findUnique({
    where: {
      id: input.villageId,
    },
  });

  if (!village) {
    throw new Error("Village not found.");
  }

  if (village.accountId !== accountId) {
    throw new Error("Village does not belong to the selected credential profile.");
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
    await markJobsCancelledForVillage(input.villageId, "Auto-apply disabled.", resolvedProfileId);
    return;
  }

  await clearVillagePause(input.villageId);
  await syncAutoApplyJobsFromLatestRun(resolvedProfileId);
};

const getNextPendingJob = async (profileId: string) =>
  db.autoApplyJob.findFirst({
    where: {
      credentialProfileId: profileId,
      status: "pending",
    },
    orderBy: {
      runAt: "asc",
    },
    include: {
      village: true,
    },
  });

const claimJob = async (jobId: string, profileId: string) => {
  const lockToken = randomUUID();
  const updateResult = await db.autoApplyJob.updateMany({
    where: {
      id: jobId,
      credentialProfileId: profileId,
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

const isDeterministicFailure = (message: string) =>
  /captcha|login|anti-bot|no confirmó el inicio de la construcción|Building slot \d+ was not found|Resource field slot \d+ was not found|No se encontró un botón directo para construir/i.test(
    message,
  );

const isStaleProposalFailure = (message: string) =>
  /The village changed after this proposal was generated|Regenerate it first/i.test(message);

export const processAutoApplyJob = async (jobId: string, profileId?: string) => {
  await ensureDatabase();
  const resolvedProfileId = await resolveCredentialProfileId(profileId);
  const accountId = await getLinkedProfileAccountId(resolvedProfileId);

  const lockToken = await claimJob(jobId, resolvedProfileId);

  if (!lockToken) {
    return false;
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
    return false;
  }

  if (
    job.credentialProfileId !== resolvedProfileId ||
    job.village.accountId !== accountId
  ) {
    await finishJob(job.id, "cancelled", "Job belongs to a different credential profile.");
    return true;
  }

  try {
    if (!job.village.autoApplyEnabled) {
      await finishJob(job.id, "cancelled", "Auto-apply disabled.");
      return true;
    }

    if (job.village.autoApplyPausedAt) {
      await finishJob(job.id, "paused", job.village.autoApplyPauseReason ?? "Village paused.");
      return true;
    }

    // Importante: aquí NO hacemos una captura global.
    // El worker refresca la cuenta antes de programar jobs y después de cada acción.
    const latest = await getLatestVillageAutomationState(job.villageId);

    if (!latest.village || !latest.snapshot) {
      await finishJob(job.id, "done", "Village snapshot missing. Refresh required.");
      return true;
    }

    if ((latest.snapshot.incomingAttacksAmount ?? 0) > 0) {
      await pauseVillageAutoApply({
        villageId: latest.village.id,
        reason: "Incoming attacks detected.",
        profileId: resolvedProfileId,
      });
      await finishJob(job.id, "paused", "Incoming attacks detected.");
      return true;
    }

    const proposal = latest.proposal;
    const selectedCandidate =
      proposal?.candidates.find((candidate) => candidate.isRecommended) ??
      proposal?.candidates[0] ??
      null;
    const effectiveConstruction = getEffectiveConstructionState({
      activeConstructionSlots: latest.snapshot.activeConstructionSlots,
      constructionQueue: parseConstructionQueueJson(latest.snapshot.constructionQueueJson),
      scrapedAt: latest.snapshot.scrapedAt,
    });
    const canUseSecondSlotNow = shouldAllowSafeSecondSlot({
      activeConstructionSlots: effectiveConstruction.activeConstructionSlots,
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
      effectiveConstruction.activeConstructionSlots >= 2 ||
      !canUseSecondSlotNow
    ) {
      await finishJob(job.id, "done", "Current state is not actionable. Refresh required.");
      return true;
    }

    await approveAgentProposal(proposal.id, selectedCandidate.id, resolvedProfileId);
    await finishJob(job.id, "done");

    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown auto-apply failure.";

    if (isStaleProposalFailure(message)) {
      await finishJob(job.id, "done", "Proposal became stale. Refresh required.");
      return true;
    }

    if (isDeterministicFailure(message)) {
      await pauseVillageAutoApply({
        villageId: job.villageId,
        reason: message,
        profileId: resolvedProfileId,
      });
      await finishJob(job.id, "paused", message);
      return true;
    }

    const nextRunAt = addMilliseconds(new Date(), ERROR_RETRY_DELAY_MS);
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
        notBefore: nextRunAt,
        lockToken: null,
        lockedAt: null,
      },
    });

    if (updateResult.count === 0) {
      return true;
    }

    const updated = await db.autoApplyJob.findUnique({
      where: {
        id: job.id,
      },
    });

    if (updated && updated.attemptCount >= MAX_ATTEMPTS_BEFORE_PAUSE) {
      await pauseVillageAutoApply({
        villageId: job.villageId,
        reason: message,
        profileId: resolvedProfileId,
      });
      await finishJob(job.id, "paused", message);
    }

    return true;
  }
};

export const getAutoApplyWorkerWaitMs = async (profileId?: string) => {
  await ensureDatabase();
  const resolvedProfileId = await resolveCredentialProfileId(profileId);
  await recoverStaleRunningJobs(resolvedProfileId);
  const nextJob = await getNextPendingJob(resolvedProfileId);

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
        in: ["pending", "running"],
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  const activeByVillage = new Map<string, (typeof jobs)[number]>();

  for (const job of jobs) {
    const current = activeByVillage.get(job.villageId);

    if (!current) {
      activeByVillage.set(job.villageId, job);
      continue;
    }

    if (current.status !== "running" && job.status === "running") {
      activeByVillage.set(job.villageId, job);
      continue;
    }

    if (
      current.status === "pending" &&
      job.status === "pending" &&
      job.runAt.getTime() < current.runAt.getTime()
    ) {
      activeByVillage.set(job.villageId, job);
    }
  }

  return activeByVillage;
};

export const processDueAutoApplyJobs = async (profileId?: string) => {
  await ensureDatabase();
  const resolvedProfileId = await resolveCredentialProfileId(profileId);
  await recoverStaleRunningJobs(resolvedProfileId);

  const dueJob = await db.autoApplyJob.findFirst({
    where: {
      credentialProfileId: resolvedProfileId,
      status: "pending",
      runAt: {
        lte: new Date(),
      },
    },
    orderBy: {
      runAt: "asc",
    },
  });

  if (!dueJob) {
    return 0;
  }

  await processAutoApplyJob(dueJob.id, resolvedProfileId);
  return 1;
};
