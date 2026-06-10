import { db } from "@/lib/db";
import { getCatalogLevel } from "@/lib/planner/catalog";
import { ensurePlannerDatabase } from "@/lib/planner/database";
import { snapshotToSimulationState } from "@/lib/planner/snapshot-to-simulation-state";
import {
  getCurrentStepLevel,
  simulateStep,
  validateStep,
  type PlannerStep,
} from "@/lib/planner/simulator";

export type PlannerWorkerDirective =
  | { status: "no-plan" }
  | { status: "completed"; planId: string }
  | { status: "waiting-construction"; planId: string; stepId: string }
  | { status: "waiting-resources"; planId: string; stepId: string; retryAfterSeconds: number }
  | { status: "blocked"; planId: string; stepId: string; reason: string }
  | {
      status: "ready";
      planId: string;
      stepId: string;
      action: {
        villageId: string;
        kind: "resourceField" | "building";
        action: "upgrade" | "construct";
        slot: number;
        gid: number;
        targetLevel: number;
      };
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

const snapshotQueueContainsSlot = (value: string | null, slot: number) => {
  if (!value) return false;
  try {
    const queue = JSON.parse(value) as Array<{ slot?: number | string | null }>;
    return queue.some((entry) => Number(entry.slot) === slot);
  } catch {
    return false;
  }
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
    where: { villageId, status: "active" },
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
      ? { status: "blocked", planId: plan.id, stepId: firstStep.id, reason }
      : { status: "completed", planId: plan.id };
  }

  const state = snapshotToSimulationState(snapshot);
  let nextStepRecord = null as (typeof plan.steps)[number] | null;
  for (const stepRecord of plan.steps) {
    if (["completed", "skipped"].includes(stepRecord.status)) continue;
    const step = toPlannerStep(stepRecord);
    if (getCurrentStepLevel(state, step) >= step.targetLevel) {
      await db.villagePlanStep.update({
        where: { id: stepRecord.id },
        data: { status: "skipped", completedAt: new Date() },
      });
      continue;
    }
    nextStepRecord = stepRecord;
    break;
  }

  if (!nextStepRecord) {
    await db.villagePlan.update({ where: { id: plan.id }, data: { status: "completed" } });
    return { status: "completed", planId: plan.id };
  }

  const step = toPlannerStep(nextStepRecord);
  const validation = validateStep(state, step);
  if (!validation.valid) {
    const reason = validation.message ?? "El plan contradice el snapshot actual.";
    await blockVillagePlan({ planId: plan.id, stepId: step.id, reason });
    return { status: "blocked", planId: plan.id, stepId: step.id, reason };
  }

  if (
    snapshotQueueContainsSlot(snapshot.constructionQueueJson, step.slot) ||
    (snapshot.activeConstructionSlots ?? 0) >= 2
  ) {
    return { status: "waiting-construction", planId: plan.id, stepId: step.id };
  }

  const target = getCatalogLevel(step.gid, step.targetLevel);
  if (!target) {
    const reason = `Falta gid ${step.gid} nivel ${step.targetLevel} en catálogo.`;
    await blockVillagePlan({ planId: plan.id, stepId: step.id, reason });
    return { status: "blocked", planId: plan.id, stepId: step.id, reason };
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
      retryAfterSeconds: Math.max(30, simulated.result.waitForResourcesSeconds),
    };
  }

  await db.villagePlanStep.update({ where: { id: step.id }, data: { status: "pending" } });
  return {
    status: "ready",
    planId: plan.id,
    stepId: step.id,
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
