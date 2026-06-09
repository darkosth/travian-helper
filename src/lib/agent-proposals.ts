import { db, ensureDatabase } from "@/lib/db";
import { getActiveScopedAccount, getScopedAccount } from "@/lib/credentials";
import { executeApprovedProposal } from "@/lib/playwright-capture";
import { attachBuildMenuSlotsToSnapshot, parseDorf2BuildMenuPayload } from "@/lib/build-options";
import {
  buildContextKey,
  buildLearningState,
  evaluateProposalOutcome,
  scoreLearnedCandidate,
  type LearningSignalRecord,
} from "@/lib/recommendation-learning";
import {
  type ActiveConstructionLike,
  buildHeuristicCandidates,
  formatHoursToText,
  type AccountStrategyContext,
  type RecommendationCandidate,
  type VillageSnapshotLike,
} from "@/lib/recommendations";

type ProposalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "executed"
  | "failed"
  | "evaluated"
  | "stale";

const DEFAULT_GOAL = "population";
const MAX_HISTORY_SNAPSHOTS = 6;
const MAX_LEARNING_RECORDS = 200;

type ProposalCandidateFeatures = {
  goal: string;
  contextKey: string;
  category: string;
  kind: RecommendationCandidate["kind"];
  buildAction: "upgrade" | "construct";
  targetGid: number | null;
  targetHref: string | null;
  affordableNow: boolean;
  timeToAffordHours: number | null;
  totalCost: number;
};

type LearningAwareCandidate = RecommendationCandidate & {
  heuristicScore: number;
  learnedScore: number;
  confidence: number;
  contextKey: string;
};

export type ProposalCandidateSummary = {
  id: string;
  rank: number;
  label: string;
  category: string;
  affordableNow: boolean;
  finalScore: number;
  heuristicScore: number;
  learnedScore: number;
  confidence: number;
  timeToAffordText: string | null;
  reasons: string[];
};

export type VillageProposalSummary = {
  id: string;
  goal: string;
  status: ProposalStatus;
  headline: string;
  summary: string;
  confidence: number;
  focus: string;
  selectedCandidateId: string | null;
  recommendedCandidateId: string | null;
  createdAt: Date;
  decidedAt: Date | null;
  candidates: ProposalCandidateSummary[];
  executionStatus: string | null;
  executionError: string | null;
  outcomeStatus: string | null;
  outcomeReward: number | null;
  outcomeSummary: string | null;
};

const stableJson = (value: unknown) => JSON.stringify(value);

const parseJson = <T>(value: string): T => JSON.parse(value) as T;

const parseConstructionQueue = (value: string | null): ActiveConstructionLike[] => {
  if (!value) {
    return [];
  }

  try {
    return parseJson<ActiveConstructionLike[]>(value);
  } catch {
    return [];
  }
};

const getCurrentAccountContext = (accountSnapshot: {
  tribeId?: number | null;
  usedVillageSlots: number | null;
  maxControllableVillages: number | null;
  cpProducedForNextSlot: number | null;
  cpNeededForNextSlot: number | null;
} | null): AccountStrategyContext => ({
  tribeId: accountSnapshot?.tribeId ?? null,
  usedVillageSlots: accountSnapshot?.usedVillageSlots ?? null,
  maxControllableVillages: accountSnapshot?.maxControllableVillages ?? null,
  cpProducedForNextSlot: accountSnapshot?.cpProducedForNextSlot ?? null,
  cpNeededForNextSlot: accountSnapshot?.cpNeededForNextSlot ?? null,
});

const getHistoryByVillageId = async (accountId: string) => {
  const snapshots = await db.villageSnapshot.findMany({
    where: {
      village: {
        accountId,
      },
    },
    include: {
      resources: true,
      resourceFields: true,
      buildings: true,
    },
    orderBy: {
      scrapedAt: "desc",
    },
  });

  const historyByVillageId = new Map<string, VillageSnapshotLike[]>();

  for (const snapshot of snapshots) {
    const existing = historyByVillageId.get(snapshot.villageId) ?? [];

    if (existing.length >= MAX_HISTORY_SNAPSHOTS) {
      continue;
    }

    existing.push({
      ...snapshot,
      activeConstructionSlots: snapshot.activeConstructionSlots,
      constructionQueue: parseConstructionQueue(snapshot.constructionQueueJson),
    });
    historyByVillageId.set(snapshot.villageId, existing);
  }

  return historyByVillageId;
};

const getLearningRecords = async (accountId: string) => {
  const proposals = await db.agentProposal.findMany({
    where: {
      village: {
        accountId,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: MAX_LEARNING_RECORDS,
    include: {
      candidates: {
        where: {
          isRecommended: true,
        },
      },
      execution: {
        include: {
          outcome: true,
        },
      },
    },
  });

  const records: LearningSignalRecord[] = [];

  for (const proposal of proposals) {
    const candidate =
      (proposal.selectedCandidateId
        ? proposal.candidates.find((entry) => entry.id === proposal.selectedCandidateId)
        : null) ??
      proposal.candidates[0];

    if (!candidate) {
      continue;
    }

    const features = parseJson<ProposalCandidateFeatures>(candidate.featuresJson);
    const reward = proposal.execution?.outcome?.reward ?? null;

    if (proposal.status === "approved" || proposal.status === "executed" || proposal.status === "evaluated") {
      records.push({
        category: candidate.category as RecommendationCandidate["category"],
        contextKey: features.contextKey,
        goal: proposal.goal,
        status: "approved",
        reward,
      });
    }

    if (proposal.status === "rejected") {
      records.push({
        category: candidate.category as RecommendationCandidate["category"],
        contextKey: features.contextKey,
        goal: proposal.goal,
        status: "rejected",
        reward: null,
      });
    }
  }

  return records;
};

const buildProposalCopy = (input: {
  villageName: string;
  candidate: RecommendationCandidate;
  confidence: number;
}) => {
  const { villageName, candidate, confidence } = input;
  const waitTimeText = formatHoursToText(candidate.timeToAffordHours);

  if (candidate.affordableNow) {
    return {
      headline: candidate.label,
      summary: `${candidate.label} is the best approved-action candidate for ${villageName} right now.`,
      confidenceText: `${Math.round(confidence * 100)}% confidence`,
    };
  }

  return {
    headline: `Wait for ${candidate.label}`,
    summary: `Wait ${waitTimeText ?? "until resources catch up"} before applying ${candidate.label}; it still outranks the current alternatives.`,
    confidenceText: `${Math.round(confidence * 100)}% confidence`,
  };
};

const serializeCandidate = (candidate: LearningAwareCandidate) => ({
  rank: 0,
  isRecommended: false,
  label: candidate.label,
  name: candidate.name,
  kind: candidate.kind,
  slot: candidate.slot,
  level: candidate.level,
  category: candidate.category,
  affordableNow: candidate.affordableNow,
  totalCost: candidate.totalCost,
  timeToAffordHours: candidate.timeToAffordHours,
  heuristicScore: candidate.heuristicScore,
  learnedScore: candidate.learnedScore,
  finalScore: candidate.score,
  confidence: candidate.confidence,
  featuresJson: stableJson({
    goal: DEFAULT_GOAL,
    contextKey: candidate.contextKey,
    category: candidate.category,
    kind: candidate.kind,
    affordableNow: candidate.affordableNow,
    timeToAffordHours: candidate.timeToAffordHours,
    totalCost: candidate.totalCost,
    buildAction: candidate.buildAction ?? "upgrade",
    targetGid: candidate.targetGid ?? null,
    targetHref: candidate.targetHref ?? null,
  } satisfies ProposalCandidateFeatures),
  reasonsJson: stableJson(candidate.reasons),
});

const getLatestRunState = async (profileId?: string) => {
  const scopedAccount = profileId
    ? await getScopedAccount(profileId)
    : await getActiveScopedAccount();

  if (!scopedAccount?.account?.id) {
    return null;
  }

  const latestRun = await db.captureRun.findFirst({
    where: {
      accountId: scopedAccount.account.id,
      ...(profileId ? { credentialProfileId: profileId } : {}),
    },
    orderBy: {
      startedAt: "desc",
    },
    include: {
      account: true,
      accountSnapshots: true,
      rawPayloads: true,
      villageSnapshots: {
        include: {
          village: true,
          resources: true,
          resourceFields: true,
          buildings: true,
        },
        orderBy: {
          village: {
            externalId: "asc",
          },
        },
      },
    },
  });

  return latestRun;
};

export const generateAgentProposals = async (profileId?: string) => {
  await ensureDatabase();

  const latestRun = await getLatestRunState(profileId);

  if (!latestRun?.accountId || latestRun.villageSnapshots.length === 0) {
    return [];
  }

  const accountContext = getCurrentAccountContext({
    ...(latestRun.accountSnapshots[0] ?? {
      usedVillageSlots: null,
      maxControllableVillages: null,
      cpProducedForNextSlot: null,
      cpNeededForNextSlot: null,
    }),
    tribeId: latestRun.account?.tribeId ?? null,
  });
  const historyByVillageId = await getHistoryByVillageId(latestRun.accountId);
  const learningState = buildLearningState(await getLearningRecords(latestRun.accountId));
  const createdProposalIds: string[] = [];

  for (const snapshot of latestRun.villageSnapshots) {
    const latestDorf2Payload = latestRun.rawPayloads
      .filter(
        (payload) =>
          payload.source === "dorf2" &&
          payload.villageExternalId === snapshot.village.externalId,
      )
      .sort(
        (left, right) =>
          new Date(right.importedAt).getTime() - new Date(left.importedAt).getTime(),
      )[0];
    const snapshotWithBuildMenus = attachBuildMenuSlotsToSnapshot(
      snapshot,
      latestDorf2Payload ? parseDorf2BuildMenuPayload(latestDorf2Payload.payloadJson) : null,
    );
    const existing = await db.agentProposal.findFirst({
      where: {
        villageSnapshotId: snapshot.id,
        goal: DEFAULT_GOAL,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (existing) {
      createdProposalIds.push(existing.id);
      continue;
    }

    await db.agentProposal.updateMany({
      where: {
        villageId: snapshot.villageId,
        status: "pending",
      },
      data: {
        status: "stale",
      },
    });

    if ((snapshot.incomingAttacksAmount ?? 0) > 0) {
      continue;
    }

    const history =
      historyByVillageId.get(snapshot.villageId) ??
      [
        {
          freeCrop: snapshot.freeCrop,
          incomingAttacksAmount: snapshot.incomingAttacksAmount,
          population: snapshot.population,
          activeConstructionSlots: snapshot.activeConstructionSlots,
          constructionQueue: parseConstructionQueue(snapshot.constructionQueueJson),
          scrapedAt: snapshot.scrapedAt,
          resources: snapshot.resources,
          resourceFields: snapshot.resourceFields,
          buildings: snapshotWithBuildMenus.buildings,
        },
      ];
    const heuristic = buildHeuristicCandidates({
      snapshot: {
        ...snapshotWithBuildMenus,
        activeConstructionSlots: snapshot.activeConstructionSlots,
        constructionQueue: parseConstructionQueue(snapshot.constructionQueueJson),
      },
      history,
      account: accountContext,
    });
    const learningAwareCandidates = heuristic.candidates
      .map((candidate: RecommendationCandidate) => {
        const contextKey = buildContextKey({
          candidate,
          snapshot,
          account: accountContext,
        });
        const learned = scoreLearnedCandidate({
          candidate,
          goal: DEFAULT_GOAL,
          contextKey,
          learningState,
        });

        return {
          ...candidate,
          heuristicScore: candidate.score,
          learnedScore: learned.learnedScore,
          confidence: learned.confidence,
          contextKey,
          score: Math.round(candidate.score + learned.learnedScore),
          reasons: [...candidate.reasons, learned.summary],
        };
      })
      .sort((left: LearningAwareCandidate, right: LearningAwareCandidate) => right.score - left.score)
      .map((candidate: LearningAwareCandidate, index: number) => ({
        ...candidate,
        rank: index,
      }));
    const strictRouteCandidateId = heuristic.strictRoute?.candidateId ?? null;
    const strictRouteScore = heuristic.strictRoute?.score ?? null;
    const strictRouteReasons = heuristic.strictRoute?.reasons ?? [];
    const prioritizedCandidates = (
      strictRouteCandidateId
        ? learningAwareCandidates.map((candidate) =>
            candidate.id !== strictRouteCandidateId
              ? candidate
              : {
                  ...candidate,
                  score: Math.max(candidate.score, strictRouteScore ?? candidate.score),
                  reasons: [...strictRouteReasons, ...candidate.reasons],
                },
          )
        : learningAwareCandidates
    )
      .sort((left: LearningAwareCandidate, right: LearningAwareCandidate) => right.score - left.score)
      .map((candidate: LearningAwareCandidate, index: number) => ({
        ...candidate,
        rank: index,
      }));

    const topCandidate = prioritizedCandidates[0];

    if (!topCandidate) {
      continue;
    }

    const copy = buildProposalCopy({
      villageName: snapshot.village.name,
      candidate: topCandidate,
      confidence: topCandidate.confidence,
    });

    const created = await db.agentProposal.create({
      data: {
        villageId: snapshot.villageId,
        villageSnapshotId: snapshot.id,
        goal: DEFAULT_GOAL,
        status: "pending",
        focus:
          (accountContext.usedVillageSlots ?? 1) < 2
            ? "Second village rush"
            : "Population leaderboard growth",
        headline: copy.headline,
        summary: `${copy.summary} ${copy.confidenceText}.`,
        confidence: topCandidate.confidence,
        candidates: {
          create: prioritizedCandidates.slice(0, 4).map((candidate: LearningAwareCandidate, index: number) => ({
            ...serializeCandidate(candidate),
            rank: index,
            isRecommended: index === 0,
          })),
        },
      },
      include: {
        candidates: true,
      },
    });

    createdProposalIds.push(created.id);
  }

  return createdProposalIds;
};

export const rejectAgentProposal = async (proposalId: string) => {
  await ensureDatabase();

  const proposal = await db.agentProposal.findUnique({
    where: {
      id: proposalId,
    },
    include: {
      candidates: {
        orderBy: {
          rank: "asc",
        },
      },
    },
  });

  if (!proposal) {
    throw new Error("Proposal not found.");
  }

  if (proposal.status !== "pending") {
    throw new Error("Only pending proposals can be rejected.");
  }

  const selected = proposal.candidates[0] ?? null;

  await db.agentProposal.update({
    where: {
      id: proposal.id,
    },
    data: {
      status: "rejected",
      decidedAt: new Date(),
      selectedCandidateId: selected?.id ?? null,
      selectedCandidateRank: selected?.rank ?? null,
    },
  });
};

export const approveAgentProposal = async (
  proposalId: string,
  candidateId: string,
  profileId?: string,
) => {
  await ensureDatabase();

  const proposal = await db.agentProposal.findUnique({
    where: {
      id: proposalId,
    },
    include: {
      candidates: {
        orderBy: {
          rank: "asc",
        },
      },
      village: {
        include: {
          snapshots: {
            orderBy: {
              scrapedAt: "desc",
            },
            take: 1,
          },
        },
      },
    },
  });

  if (!proposal) {
    throw new Error("Proposal not found.");
  }

  if (proposal.status !== "pending") {
    throw new Error("Only pending proposals can be approved.");
  }

  const selected = proposal.candidates.find((candidate) => candidate.id === candidateId) ?? null;

  if (!selected) {
    throw new Error("Selected candidate was not found in this proposal.");
  }

  if (!selected.affordableNow) {
    throw new Error("This proposal is not affordable yet. Capture again before applying it.");
  }

  const latestSnapshot = proposal.village.snapshots[0] ?? null;

  if (latestSnapshot && latestSnapshot.id !== proposal.villageSnapshotId) {
    await db.agentProposal.update({
      where: {
        id: proposal.id,
      },
      data: {
        status: "stale",
      },
    });

    throw new Error("The village changed after this proposal was generated. Regenerate it first.");
  }

  await db.agentProposal.update({
    where: {
      id: proposal.id,
    },
    data: {
      status: "approved",
      decidedAt: new Date(),
      selectedCandidateId: selected.id,
      selectedCandidateRank: selected.rank,
    },
  });

  return executeApprovedProposal(proposal.id, profileId);
};

const outcomeSummary = (outcome: {
  status: string;
  reward: number | null;
  populationDelta: number | null;
  totalProductionDelta: number | null;
  contaminationReason: string | null;
}) => {
  if (outcome.status === "contaminated") {
    return outcome.contaminationReason ?? "Outcome contaminated.";
  }

  if (outcome.status === "insufficient_data") {
    return outcome.contaminationReason ?? "Still waiting for a clean evaluation snapshot.";
  }

  if (outcome.reward === null) {
    return "Outcome pending.";
  }

  return `Reward ${outcome.reward.toFixed(1)} · pop ${outcome.populationDelta ?? 0} · prod ${outcome.totalProductionDelta ?? 0}/h`;
};

export const listLatestVillageProposals = async (villageIds: string[]) => {
  await ensureDatabase();

  const proposals = await db.agentProposal.findMany({
    where: {
      villageId: {
        in: villageIds,
      },
    },
    include: {
      candidates: {
        orderBy: {
          rank: "asc",
        },
      },
      execution: {
        include: {
          outcome: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const latestByVillageId = new Map<string, VillageProposalSummary>();

  for (const proposal of proposals) {
    if (latestByVillageId.has(proposal.villageId)) {
      continue;
    }

    latestByVillageId.set(proposal.villageId, {
      id: proposal.id,
      goal: proposal.goal,
      status: proposal.status as ProposalStatus,
      headline: proposal.headline,
      summary: proposal.summary,
      confidence: proposal.confidence,
      focus: proposal.focus,
      selectedCandidateId: proposal.selectedCandidateId,
      recommendedCandidateId:
        proposal.candidates.find((candidate) => candidate.isRecommended)?.id ?? null,
      createdAt: proposal.createdAt,
      decidedAt: proposal.decidedAt,
      candidates: proposal.candidates.map((candidate) => ({
        id: candidate.id,
        rank: candidate.rank,
        label: candidate.label,
        category: candidate.category,
        affordableNow: candidate.affordableNow,
        finalScore: candidate.finalScore,
        heuristicScore: candidate.heuristicScore,
        learnedScore: candidate.learnedScore,
        confidence: candidate.confidence,
        timeToAffordText: formatHoursToText(candidate.timeToAffordHours),
        reasons: parseJson<string[]>(candidate.reasonsJson),
      })),
      executionStatus: proposal.execution?.status ?? null,
      executionError: proposal.execution?.errorMessage ?? null,
      outcomeStatus: proposal.execution?.outcome?.status ?? null,
      outcomeReward: proposal.execution?.outcome?.reward ?? null,
      outcomeSummary: proposal.execution?.outcome
        ? outcomeSummary(proposal.execution.outcome)
        : null,
    });
  }

  return latestByVillageId;
};

const candidateFromRow = (candidate: {
  label: string;
  name: string;
  kind: string;
  slot: number;
  level: number | null;
  affordableNow: boolean;
  totalCost: number;
  timeToAffordHours: number | null;
  category: string;
  finalScore: number;
  reasonsJson: string;
}) =>
  ({
    id: `${candidate.kind}-${candidate.slot}`,
    slot: candidate.slot,
    level: candidate.level,
    label: candidate.label,
    name: candidate.name,
    kind: candidate.kind as RecommendationCandidate["kind"],
    affordableNow: candidate.affordableNow,
    totalCost: candidate.totalCost,
    nextLevelWood: null,
    nextLevelClay: null,
    nextLevelIron: null,
    nextLevelCrop: null,
    timeToAffordHours: candidate.timeToAffordHours,
    blockedByConstructionQueue: false,
    category: candidate.category as RecommendationCandidate["category"],
    score: candidate.finalScore,
    reasons: parseJson<string[]>(candidate.reasonsJson),
  }) satisfies RecommendationCandidate;

export const evaluatePendingOutcomesForVillage = async (input: {
  villageId: string;
  villageSnapshotId: string;
}) => {
  await ensureDatabase();

  const currentSnapshot = await db.villageSnapshot.findUnique({
    where: {
      id: input.villageSnapshotId,
    },
    include: {
      resources: true,
      resourceFields: true,
      buildings: true,
    },
  });

  if (!currentSnapshot) {
    return;
  }

  const executions = await db.agentExecution.findMany({
    where: {
      proposal: {
        villageId: input.villageId,
      },
      status: "success",
      outcome: null,
    },
    include: {
      proposal: {
        include: {
          villageSnapshot: {
            include: {
              resources: true,
              resourceFields: true,
              buildings: true,
            },
          },
          candidates: {
            orderBy: {
              rank: "asc",
            },
          },
        },
      },
      candidate: true,
    },
    orderBy: {
      completedAt: "asc",
    },
  });

  for (const execution of executions) {
    if (
      execution.completedAt &&
      currentSnapshot.scrapedAt.getTime() <= execution.completedAt.getTime()
    ) {
      continue;
    }

    const outcome = evaluateProposalOutcome({
      beforeSnapshot: execution.proposal.villageSnapshot,
      afterSnapshot: currentSnapshot,
      candidate: candidateFromRow(execution.candidate),
      rankedCandidates: execution.proposal.candidates.map(candidateFromRow),
    });

    await db.agentOutcome.create({
      data: {
        executionId: execution.id,
        villageSnapshotId: currentSnapshot.id,
        status: outcome.status,
        reward: outcome.reward,
        contaminationReason: outcome.contaminationReason,
        populationDelta: outcome.populationDelta,
        totalProductionDelta: outcome.totalProductionDelta,
        freeCropDelta: outcome.freeCropDelta,
        changedTargetsCount: outcome.changedTargetsCount,
        primaryProductionResource: outcome.primaryProductionResource,
        primaryProductionDelta: outcome.primaryProductionDelta,
        detailsJson: stableJson(outcome.details),
        evaluatedAt: new Date(),
      },
    });

    await db.agentProposal.update({
      where: {
        id: execution.proposalId,
      },
      data: {
        status: "evaluated",
      },
    });
  }
};
