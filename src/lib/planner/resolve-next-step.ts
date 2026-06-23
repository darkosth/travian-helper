import { db } from "@/lib/db";
import {
  getCatalogDefinition,
  getCatalogDisplayName,
  getCatalogLevel,
} from "@/lib/planner/catalog";
import { ensurePlannerDatabase } from "@/lib/planner/database";
import { snapshotToSimulationState } from "@/lib/planner/snapshot-to-simulation-state";
import {
  getCurrentStepLevel,
  validateStep,
  type SimulationState,
  simulateStep,
  type PlannerStep,
} from "@/lib/planner/simulator";

export type PlannerWorkerDirective =
  | { status: "no-plan" }
  | { status: "completed"; planId: string }
  | { status: "waiting-construction"; planId: string; stepId: string; snapshotId: string }
  | {
      status: "waiting-resources";
      planId: string;
      stepId: string;
      snapshotId: string;
      retryAfterSeconds: number;
    }
  | { status: "blocked"; planId: string; stepId: string; snapshotId: string; reason: string }
  | {
      status: "ready";
      planId: string;
      stepId: string;
      snapshotId: string;
      action: {
        villageId: string;
        kind: "resourceField" | "building";
        action: "upgrade" | "construct";
        slot: number;
        gid: number;
        targetLevel: number;
      };
    };

type PlannerActionabilitySnapshot = {
  population: number | null;
  freeCrop: number | null;
  activeConstructionSlots: number | null;
  constructionQueueJson: string | null;
  resources: Array<{
    type: string;
    amount: number | null;
    productionPerHour: number | null;
    capacity: number | null;
  }>;
  resourceFields: Array<{
    slot: number;
    gid: number;
    level: number | null;
    canAffordUpgrade: boolean | null;
    canStartUpgradeNow: boolean | null;
  }>;
  buildings: Array<{
    slot: number;
    gid: number;
    level: number | null;
    isEmpty: boolean;
    canStartUpgradeNow: boolean | null;
  }>;
};

const toPlannerStep = (step: {
  id: string;
  position: number;
  stage: number;
  kind: string;
  action: string;
  slot: number;
  gid: number;
  targetLevel: number;
}): PlannerStep => ({
  id: step.id,
  position: step.position,
  stage: step.stage as PlannerStep["stage"],
  kind: step.kind as PlannerStep["kind"],
  action: step.action as PlannerStep["action"],
  slot: step.slot,
  gid: step.gid,
  targetLevel: step.targetLevel,
});

type ParsedConstructionQueueEntry = {
  currentLevel: number | null;
  kind: "resourceField" | "building" | null;
  name: string;
  remainingTime: string | null;
  slot: number | null;
  targetLevel: number | null;
};

const parseConstructionQueue = (value: string | null) => {
  if (!value) {
    return [] as ParsedConstructionQueueEntry[];
  }

  try {
    return JSON.parse(value) as ParsedConstructionQueueEntry[];
  } catch {
    return [] as ParsedConstructionQueueEntry[];
  }
};

const normalizeText = (value: string | null | undefined) =>
  (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const queueEntryMatchesStep = (entry: ParsedConstructionQueueEntry, step: PlannerStep) => {
  if (entry.slot !== null && entry.slot === step.slot) {
    return true;
  }

  if (entry.kind && entry.kind !== step.kind) {
    return false;
  }

  if (entry.targetLevel !== null && entry.targetLevel !== step.targetLevel) {
    return false;
  }

  const currentLevel = entry.currentLevel ?? 0;

  if (step.action === "construct") {
    if (entry.targetLevel !== null && entry.targetLevel !== 1) {
      return false;
    }
  } else if (currentLevel + 1 !== step.targetLevel) {
    return false;
  }

  const definition = getCatalogDefinition(step.gid);
  const displayName = normalizeText(getCatalogDisplayName(step.gid, definition?.name));
  const englishName = normalizeText(definition?.name);
  const queueName = normalizeText(entry.name);

  if (!queueName) {
    return false;
  }

  return (
    queueName.includes(displayName) ||
    (englishName.length > 0 && queueName.includes(englishName))
  );
};

const getQueuedConstructionMatch = (
  queue: ParsedConstructionQueueEntry[],
  step: PlannerStep,
  usedIndexes?: Set<number>,
) => {
  for (const [index, entry] of queue.entries()) {
    if (usedIndexes?.has(index)) continue;
    if (queueEntryMatchesStep(entry, step)) {
      return { entry, index };
    }
  }

  return null;
};

export const applyProjectedStepCompletion = (
  state: SimulationState,
  step: PlannerStep,
): SimulationState => {
  const next = structuredClone(state);
  const currentLevel = getCurrentStepLevel(next, step);

  if (currentLevel >= step.targetLevel) {
    return next;
  }

  if (step.kind === "resourceField") {
    next.resourceFields[step.slot] = { gid: step.gid, level: step.targetLevel };
    return next;
  }

  next.buildings[step.slot] = { gid: step.gid, level: step.targetLevel };

  if (step.gid === 15) {
    next.mainBuildingLevel = step.targetLevel;
  }

  return next;
};

export const isStepWaitingOnProjectedState = (
  snapshotState: SimulationState,
  projectedState: SimulationState,
  step: PlannerStep,
) => getCurrentStepLevel(snapshotState, step) < getCurrentStepLevel(projectedState, step);

export const getPlannerStepSnapshotActionability = (
  snapshot: PlannerActionabilitySnapshot,
  step: PlannerStep,
  options?: {
    queue?: ParsedConstructionQueueEntry[];
    usedQueueIndexes?: Set<number>;
  },
) => {
  const state = snapshotToSimulationState(snapshot);
  const target = getCatalogLevel(step.gid, step.targetLevel);

  if (!target) {
    return {
      isActionableNow: false,
      blockedReason: `Missing catalog level for gid ${step.gid} level ${step.targetLevel}.`,
    };
  }

  const hasResources =
    state.resources.wood >= target.cost.wood &&
    state.resources.clay >= target.cost.clay &&
    state.resources.iron >= target.cost.iron &&
    state.resources.crop >= target.cost.crop;
  const queue = options?.queue ?? parseConstructionQueue(snapshot.constructionQueueJson);
  const queuedMatch = getQueuedConstructionMatch(queue, step, options?.usedQueueIndexes);

  if (queuedMatch) {
    return {
      isActionableNow: false,
      blockedReason: "Construction queue is currently blocking this slot.",
      isQueuedNow: true,
      queuedIndex: queuedMatch.index,
    };
  }

  if (step.kind === "resourceField") {
    const field = snapshot.resourceFields.find((entry) => entry.slot === step.slot) ?? null;

    if (!field || field.gid !== step.gid) {
      return {
        isActionableNow: false,
        blockedReason: `Snapshot slot ${step.slot} does not match resource gid ${step.gid}.`,
        isQueuedNow: false,
      };
    }

    if (!hasResources || field.canAffordUpgrade === false) {
      return {
        isActionableNow: false,
        blockedReason: "Snapshot says the resource upgrade is not affordable yet.",
        isQueuedNow: false,
      };
    }

    if (field.canStartUpgradeNow !== true) {
      return {
        isActionableNow: false,
        blockedReason: "Snapshot says the resource upgrade cannot start right now.",
        isQueuedNow: false,
      };
    }

    return {
      isActionableNow: true,
      blockedReason: null,
      isQueuedNow: false,
    };
  }

  const building = snapshot.buildings.find((entry) => entry.slot === step.slot) ?? null;

  if (step.action === "construct") {
    if (building && !building.isEmpty && building.gid !== step.gid) {
      return {
        isActionableNow: false,
        blockedReason: `Snapshot slot ${step.slot} is no longer empty for construct gid ${step.gid}.`,
        isQueuedNow: false,
      };
    }

    return {
      isActionableNow: hasResources,
      blockedReason: hasResources
        ? null
        : "Snapshot says the construct action is not affordable yet.",
      isQueuedNow: false,
    };
  }

  if (!building || building.isEmpty || building.gid !== step.gid) {
    return {
      isActionableNow: false,
      blockedReason: `Snapshot slot ${step.slot} does not match building gid ${step.gid}.`,
      isQueuedNow: false,
    };
  }

  if (!hasResources) {
    return {
      isActionableNow: false,
      blockedReason: "Snapshot says the building upgrade is not affordable yet.",
      isQueuedNow: false,
    };
  }

  if (building.canStartUpgradeNow !== true) {
    return {
      isActionableNow: false,
      blockedReason: "Snapshot says the building upgrade cannot start right now.",
      isQueuedNow: false,
    };
  }

  return {
    isActionableNow: true,
    blockedReason: null,
    isQueuedNow: false,
  };
};

export const blockVillagePlan = async (input: {
  planId: string;
  stepId: string;
  reason: string;
}) => {
  await ensurePlannerDatabase();
  await db.$transaction([
    db.villagePlan.update({
      where: { id: input.planId },
      data: { status: "blocked", blockedReason: input.reason },
    }),
    db.villagePlanStep.update({
      where: { id: input.stepId },
      data: { status: "blocked", metadataJson: JSON.stringify({ reason: input.reason }) },
    }),
  ]);
};

export const resolveNextVillagePlanStep = async (
  villageId: string,
): Promise<PlannerWorkerDirective> => {
  await ensurePlannerDatabase();
  const plan = await db.villagePlan.findFirst({
    where: { villageId, status: { in: ["active", "blocked"] } },
    orderBy: { revision: "desc" },
    include: {
      steps: { orderBy: { position: "asc" } },
      templateRevision: { include: { template: true } },
    },
  });
  if (!plan) return { status: "no-plan" };

  const snapshot = await db.villageSnapshot.findFirst({
    where: { villageId },
    orderBy: { scrapedAt: "desc" },
    include: { resources: true, resourceFields: true, buildings: true },
  });
  if (!snapshot) {
    const reason = "No existe snapshot actual para resolver el siguiente paso.";
    const firstStep = plan.steps[0];
    if (firstStep) await blockVillagePlan({ planId: plan.id, stepId: firstStep.id, reason });
    return firstStep
      ? {
          status: "blocked",
          planId: plan.id,
          stepId: firstStep.id,
          snapshotId: plan.basedOnSnapshotId ?? "missing-snapshot",
          reason,
        }
      : { status: "completed", planId: plan.id };
  }

  const snapshotState = snapshotToSimulationState(snapshot);
  let state = structuredClone(snapshotState);
  let nextStepRecord = null as (typeof plan.steps)[number] | null;
  let firstQueuedStep = null as (typeof plan.steps)[number] | null;
  const queue = parseConstructionQueue(snapshot.constructionQueueJson);
  const usedQueueIndexes = new Set<number>();
  for (const stepRecord of plan.steps) {
    if (["completed", "skipped"].includes(stepRecord.status)) continue;
    const step = toPlannerStep(stepRecord);
    const queuedMatch = getQueuedConstructionMatch(queue, step, usedQueueIndexes);

    if (stepRecord.status === "queued" && !queuedMatch) {
      await db.villagePlanStep.update({
        where: { id: stepRecord.id },
        data: {
          status: "pending",
          startedAt: null,
          metadataJson: null,
        },
      });
      stepRecord.status = "pending";
      stepRecord.startedAt = null;
      stepRecord.metadataJson = null;
    }

    if (getCurrentStepLevel(state, step) >= step.targetLevel) {
      await db.$transaction([
        db.villagePlan.update({
          where: { id: plan.id },
          data: { status: "active", blockedReason: null },
        }),
        db.villagePlanStep.update({
          where: { id: stepRecord.id },
          data: { status: "skipped", completedAt: new Date(), metadataJson: null },
        }),
      ]);
      continue;
    }

    if (queuedMatch) {
      usedQueueIndexes.add(queuedMatch.index);
      state = applyProjectedStepCompletion(state, step);
      await db.$transaction([
        db.villagePlan.update({
          where: { id: plan.id },
          data: { status: "active", blockedReason: null },
        }),
        db.villagePlanStep.update({
          where: { id: stepRecord.id },
          data: {
            status: "queued",
            startedAt: stepRecord.startedAt ?? new Date(),
            metadataJson: null,
          },
        }),
      ]);
      firstQueuedStep ??= stepRecord;
      if ((snapshot.activeConstructionSlots ?? 0) >= 2) {
        break;
      }
      continue;
    }

    getPlannerStepSnapshotActionability(snapshot, step, {
      queue,
      usedQueueIndexes,
    });
    nextStepRecord = stepRecord;
    break;
  }

  if (!nextStepRecord) {
    if (firstQueuedStep) {
      return {
        status: "waiting-construction",
        planId: plan.id,
        stepId: firstQueuedStep.id,
        snapshotId: snapshot.id,
      };
    }
    await db.villagePlan.update({ where: { id: plan.id }, data: { status: "completed" } });
    return { status: "completed", planId: plan.id };
  }

  const step = toPlannerStep(nextStepRecord);
  const validation = validateStep(state, step);
  if (!validation.valid) {
    const reason = validation.message ?? "El plan contradice el snapshot actual.";
    await blockVillagePlan({ planId: plan.id, stepId: step.id, reason });
    return { status: "blocked", planId: plan.id, stepId: step.id, snapshotId: snapshot.id, reason };
  }

  const actionability = getPlannerStepSnapshotActionability(snapshot, step);

  if (actionability.blockedReason === "Construction queue is currently blocking this slot.") {
    return { status: "waiting-construction", planId: plan.id, stepId: step.id, snapshotId: snapshot.id };
  }

  if (isStepWaitingOnProjectedState(snapshotState, state, step)) {
    return { status: "waiting-construction", planId: plan.id, stepId: step.id, snapshotId: snapshot.id };
  }

  const target = getCatalogLevel(step.gid, step.targetLevel);
  if (!target) {
    const reason = `Falta gid ${step.gid} nivel ${step.targetLevel} en catálogo.`;
    await blockVillagePlan({ planId: plan.id, stepId: step.id, reason });
    return { status: "blocked", planId: plan.id, stepId: step.id, snapshotId: snapshot.id, reason };
  }

  const canAfford =
    state.resources.wood >= target.cost.wood &&
    state.resources.clay >= target.cost.clay &&
    state.resources.iron >= target.cost.iron &&
    state.resources.crop >= target.cost.crop;
  if (!canAfford) {
    const simulated = simulateStep(state, step, plan.templateRevision?.template.serverSpeed ?? 1);
    await db.villagePlanStep.update({
      where: { id: step.id },
      data: { status: "waiting-resources" },
    });
    return {
      status: "waiting-resources",
      planId: plan.id,
      stepId: step.id,
      snapshotId: snapshot.id,
      retryAfterSeconds: Math.max(30, simulated.result.waitForResourcesSeconds),
    };
  }

  if (!actionability.isActionableNow) {
    const reason = actionability.blockedReason ?? "Snapshot says the step is not actionable now.";
    await blockVillagePlan({ planId: plan.id, stepId: step.id, reason });
    return { status: "blocked", planId: plan.id, stepId: step.id, snapshotId: snapshot.id, reason };
  }

  await db.$transaction([
    db.villagePlan.update({
      where: { id: plan.id },
      data: { status: "active", blockedReason: null },
    }),
    db.villagePlanStep.update({ where: { id: step.id }, data: { status: "pending", metadataJson: null } }),
  ]);
  return {
    status: "ready",
    planId: plan.id,
    stepId: step.id,
    snapshotId: snapshot.id,
    action: {
      villageId,
      kind: step.kind,
      action: step.action,
      slot: step.slot,
      gid: step.gid,
      targetLevel: step.targetLevel,
    },
  };
};

export const markStepQueued = async (stepId: string) => {
  await ensurePlannerDatabase();
  return db.villagePlanStep.update({
    where: { id: stepId },
    data: { status: "queued", startedAt: new Date() },
  });
};

export const markStepCompleted = async (stepId: string) => {
  await ensurePlannerDatabase();
  return db.villagePlanStep.update({
    where: { id: stepId },
    data: { status: "completed", completedAt: new Date() },
  });
};
