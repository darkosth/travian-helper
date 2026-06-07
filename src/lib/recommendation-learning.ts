import "server-only";
import {
  type AccountStrategyContext,
  type CandidateCategory,
  type RecommendationCandidate,
  type ResourceType,
  type VillageSnapshotLike,
  getResourceBuckets,
} from "@/lib/recommendations";

export type LearningSignalRecord = {
  category: CandidateCategory;
  contextKey: string;
  goal: string;
  status: "approved" | "rejected";
  reward: number | null;
};

type LearningAggregate = {
  approvals: number;
  rejections: number;
  evaluatedCount: number;
  rewardTotal: number;
};

type LearningAggregateMap = Map<string, LearningAggregate>;

export type LearningState = {
  contextSignals: LearningAggregateMap;
  categorySignals: LearningAggregateMap;
};

export type LearnedCandidateScore = {
  learnedScore: number;
  confidence: number;
  evidenceCount: number;
  summary: string;
};

export type OutcomeEvaluation = {
  status: "evaluated" | "contaminated" | "insufficient_data";
  reward: number | null;
  contaminationReason: string | null;
  populationDelta: number;
  totalProductionDelta: number;
  freeCropDelta: number;
  changedTargetsCount: number;
  primaryProductionResource: ResourceType | null;
  primaryProductionDelta: number;
  details: Record<string, number | string | boolean | null>;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const aggregateKey = (goal: string, category: CandidateCategory, contextKey: string) =>
  `${goal}|${category}|${contextKey}`;

const categoryKey = (goal: string, category: CandidateCategory) => `${goal}|${category}`;

const getOrCreateAggregate = (map: LearningAggregateMap, key: string) => {
  const current = map.get(key);

  if (current) {
    return current;
  }

  const created: LearningAggregate = {
    approvals: 0,
    rejections: 0,
    evaluatedCount: 0,
    rewardTotal: 0,
  };

  map.set(key, created);
  return created;
};

export const buildContextKey = (input: {
  candidate: RecommendationCandidate;
  snapshot: VillageSnapshotLike;
  account: AccountStrategyContext;
}) => {
  const { candidate, snapshot, account } = input;
  const resources = getResourceBuckets(snapshot.resources);
  const fillPressure = Math.max(
    ...Object.values(resources).map((bucket) =>
      bucket.capacity && bucket.amount ? bucket.amount / bucket.capacity : 0,
    ),
  );
  const cropState =
    snapshot.freeCrop !== null && snapshot.freeCrop < 120
      ? "crop_critical"
      : snapshot.freeCrop !== null && snapshot.freeCrop < 250
        ? "crop_tight"
        : "crop_stable";
  const phase = (account.usedVillageSlots ?? 1) < 2 ? "early" : "established";
  const storageState = fillPressure >= 0.85 ? "storage_hot" : "storage_normal";
  const affordance = candidate.affordableNow ? "ready" : "wait";

  return [phase, cropState, storageState, affordance, candidate.kind].join("|");
};

export const buildLearningState = (records: LearningSignalRecord[]): LearningState => {
  const contextSignals = new Map<string, LearningAggregate>();
  const categorySignals = new Map<string, LearningAggregate>();

  for (const record of records) {
    const byContext = getOrCreateAggregate(
      contextSignals,
      aggregateKey(record.goal, record.category, record.contextKey),
    );
    const byCategory = getOrCreateAggregate(
      categorySignals,
      categoryKey(record.goal, record.category),
    );

    if (record.status === "approved") {
      byContext.approvals += 1;
      byCategory.approvals += 1;
    } else {
      byContext.rejections += 1;
      byCategory.rejections += 1;
    }

    if (record.reward !== null) {
      byContext.evaluatedCount += 1;
      byContext.rewardTotal += record.reward;
      byCategory.evaluatedCount += 1;
      byCategory.rewardTotal += record.reward;
    }
  }

  return {
    contextSignals,
    categorySignals,
  };
};

export const scoreLearnedCandidate = (input: {
  candidate: RecommendationCandidate;
  goal: string;
  contextKey: string;
  learningState: LearningState;
}): LearnedCandidateScore => {
  const { candidate, goal, contextKey, learningState } = input;
  const exact =
    learningState.contextSignals.get(aggregateKey(goal, candidate.category, contextKey)) ?? null;
  const categoryOnly =
    learningState.categorySignals.get(categoryKey(goal, candidate.category)) ?? null;

  const combinedApprovals = (exact?.approvals ?? 0) * 2 + (categoryOnly?.approvals ?? 0);
  const combinedRejections = (exact?.rejections ?? 0) * 2 + (categoryOnly?.rejections ?? 0);
  const totalSignals = combinedApprovals + combinedRejections;
  const approvalRate = totalSignals > 0 ? combinedApprovals / totalSignals : 0.5;
  const approvalBias = (approvalRate - 0.5) * 18;

  const exactRewardAverage =
    exact && exact.evaluatedCount > 0 ? exact.rewardTotal / exact.evaluatedCount : null;
  const categoryRewardAverage =
    categoryOnly && categoryOnly.evaluatedCount > 0
      ? categoryOnly.rewardTotal / categoryOnly.evaluatedCount
      : null;
  const rewardAverage =
    exactRewardAverage !== null && categoryRewardAverage !== null
      ? exactRewardAverage * 0.7 + categoryRewardAverage * 0.3
      : exactRewardAverage ?? categoryRewardAverage ?? 0;
  const rewardBias = clamp(rewardAverage * 2.4, -16, 16);

  const confidence = clamp(
    ((exact?.evaluatedCount ?? 0) * 2 + (categoryOnly?.evaluatedCount ?? 0) + totalSignals * 0.5) / 10,
    0,
    1,
  );
  const learnedScore = (approvalBias + rewardBias) * confidence;

  return {
    learnedScore,
    confidence,
    evidenceCount: (exact?.evaluatedCount ?? 0) + (categoryOnly?.evaluatedCount ?? 0),
    summary:
      confidence > 0
        ? `${Math.round(confidence * 100)}% confidence from approvals and outcomes in similar contexts.`
        : "Cold start: using heuristic baseline.",
  };
};

const getSlotLevelMap = (items: Array<{ slot: number; level: number | null }>) =>
  new Map(items.map((item) => [item.slot, item.level ?? 0]));

export const evaluateProposalOutcome = (input: {
  beforeSnapshot: VillageSnapshotLike;
  afterSnapshot: VillageSnapshotLike;
  candidate: RecommendationCandidate;
  rankedCandidates: RecommendationCandidate[];
}): OutcomeEvaluation => {
  const { beforeSnapshot, afterSnapshot, candidate, rankedCandidates } = input;
  const beforeResources = getResourceBuckets(beforeSnapshot.resources);
  const afterResources = getResourceBuckets(afterSnapshot.resources);
  const beforeFields = getSlotLevelMap(beforeSnapshot.resourceFields);
  const beforeBuildings = getSlotLevelMap(beforeSnapshot.buildings);

  let changedTargetsCount = 0;
  let targetChanged = false;

  for (const field of afterSnapshot.resourceFields) {
    const beforeLevel = beforeFields.get(field.slot) ?? 0;
    const afterLevel = field.level ?? 0;

    if (afterLevel > beforeLevel) {
      changedTargetsCount += 1;
      if (candidate.kind === "resourceField" && field.slot === candidate.slot) {
        targetChanged = true;
      }
    }
  }

  for (const building of afterSnapshot.buildings) {
    const beforeLevel = beforeBuildings.get(building.slot) ?? 0;
    const afterLevel = building.level ?? 0;

    if (afterLevel > beforeLevel) {
      changedTargetsCount += 1;
      if (candidate.kind === "building" && building.slot === candidate.slot) {
        targetChanged = true;
      }
    }
  }

  const productionDeltas = (["wood", "clay", "iron", "crop"] as const).map((type) => ({
    type,
    delta: (afterResources[type].productionPerHour ?? 0) - (beforeResources[type].productionPerHour ?? 0),
  }));
  const totalProductionDelta = productionDeltas.reduce((total, item) => total + item.delta, 0);
  const primaryProduction = productionDeltas.sort((left, right) => right.delta - left.delta)[0] ?? {
    type: null,
    delta: 0,
  };
  const populationDelta = (afterSnapshot.population ?? 0) - (beforeSnapshot.population ?? 0);
  const freeCropDelta = (afterSnapshot.freeCrop ?? 0) - (beforeSnapshot.freeCrop ?? 0);

  if (changedTargetsCount > 1) {
    return {
      status: "contaminated",
      reward: null,
      contaminationReason: "More than one target level changed before evaluation.",
      populationDelta,
      totalProductionDelta,
      freeCropDelta,
      changedTargetsCount,
      primaryProductionResource: primaryProduction.type,
      primaryProductionDelta: primaryProduction.delta,
      details: {
        targetChanged,
      },
    };
  }

  if (!targetChanged && populationDelta === 0 && totalProductionDelta === 0) {
    return {
      status: "insufficient_data",
      reward: null,
      contaminationReason: "The target upgrade did not materialize in the evaluation snapshot.",
      populationDelta,
      totalProductionDelta,
      freeCropDelta,
      changedTargetsCount,
      primaryProductionResource: primaryProduction.type,
      primaryProductionDelta: primaryProduction.delta,
      details: {
        targetChanged,
      },
    };
  }

  const bestAlternativeScore = rankedCandidates[1]?.score ?? candidate.score;
  const opportunityPenalty = Math.max(0, bestAlternativeScore - candidate.score) * 0.04;
  const costPenalty = clamp(Math.log10(candidate.totalCost + 10), 1, 5);
  const waitPenalty = Math.min(candidate.timeToAffordHours ?? 0, 8) * 0.6;
  const storagePressure = Math.max(
    ...Object.values(beforeResources).map((bucket) =>
      bucket.capacity && bucket.amount ? bucket.amount / bucket.capacity : 0,
    ),
  );
  const storageFit =
    candidate.category === "warehouse" || candidate.category === "granary"
      ? storagePressure >= 0.85
        ? 1.8
        : -1.4
      : 0;
  const cropFit =
    afterSnapshot.freeCrop !== null && afterSnapshot.freeCrop < 120
      ? -2.4
      : beforeSnapshot.freeCrop !== null && beforeSnapshot.freeCrop < 120 && freeCropDelta > 0
        ? 1.8
        : 0;

  const reward = clamp(
    populationDelta * 2.6 +
      totalProductionDelta * 0.015 +
      storageFit +
      cropFit -
      opportunityPenalty -
      costPenalty -
      waitPenalty,
    -8,
    8,
  );

  return {
    status: "evaluated",
    reward,
    contaminationReason: null,
    populationDelta,
    totalProductionDelta,
    freeCropDelta,
    changedTargetsCount,
    primaryProductionResource: primaryProduction.type,
    primaryProductionDelta: primaryProduction.delta,
    details: {
      targetChanged,
      bestAlternativeScore,
      opportunityPenalty,
      costPenalty,
      waitPenalty,
      storagePressure,
      storageFit,
      cropFit,
    },
  };
};
