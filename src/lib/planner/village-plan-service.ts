import { db } from "@/lib/db";
import { ensurePlannerDatabase } from "@/lib/planner/database";
import { snapshotToSimulationState } from "@/lib/planner/snapshot-to-simulation-state";
import {
  getCurrentStepLevel,
  simulatePlan,
  type PlannerStep,
} from "@/lib/planner/simulator";

const toPlannerSteps = (
  steps: Array<{
    id: string;
    position: number;
    stage: number;
    kind: string;
    action: string;
    slot: number;
    gid: number;
    targetLevel: number;
  }>,
): PlannerStep[] =>
  steps.map((step) => ({
    id: step.id,
    position: step.position,
    stage: step.stage as PlannerStep["stage"],
    kind: step.kind as PlannerStep["kind"],
    action: step.action as PlannerStep["action"],
    slot: step.slot,
    gid: step.gid,
    targetLevel: step.targetLevel,
  }));

const getLatestSnapshot = async (villageId: string, snapshotId?: string) => {
  if (snapshotId) {
    return db.villageSnapshot.findUnique({
      where: { id: snapshotId },
      include: { resources: true, resourceFields: true, buildings: true },
    });
  }

  return db.villageSnapshot.findFirst({
    where: { villageId },
    orderBy: { scrapedAt: "desc" },
    include: { resources: true, resourceFields: true, buildings: true },
  });
};

export const applyTemplateToVillage = async (input: {
  villageId: string;
  templateRevisionId: string;
  snapshotId?: string;
}) => {
  await ensurePlannerDatabase();
  const [village, revision, snapshot] = await Promise.all([
    db.village.findUnique({ where: { id: input.villageId } }),
    db.villagePlanTemplateRevision.findUnique({
      where: { id: input.templateRevisionId },
      include: { template: true, steps: { orderBy: { position: "asc" } } },
    }),
    getLatestSnapshot(input.villageId, input.snapshotId),
  ]);

  if (!village) throw new Error("Village not found.");
  if (!revision || revision.status !== "published") {
    throw new Error("A published template revision is required.");
  }
  if (!snapshot || snapshot.villageId !== village.id) {
    throw new Error("Village snapshot not found.");
  }

  const state = snapshotToSimulationState(snapshot);
  const remainingSteps = toPlannerSteps(revision.steps).filter(
    (step) => getCurrentStepLevel(state, step) < step.targetLevel,
  );
  const simulation = simulatePlan({
    initialState: state,
    steps: remainingSteps,
    serverSpeed: revision.template.serverSpeed,
  });
  if (!simulation.valid) {
    throw new Error(simulation.firstBlockingStep?.message ?? "The village plan is invalid.");
  }

  const previousPlans = await db.villagePlan.findMany({
    where: { villageId: village.id },
    orderBy: { revision: "desc" },
    take: 1,
  });
  const villageRevision = (previousPlans[0]?.revision ?? 0) + 1;
  const metadataByPosition = new Map(
    simulation.steps.map((entry) => [
      entry.step.position,
      JSON.stringify({
        waitForResourcesSeconds: entry.waitForResourcesSeconds,
        buildDurationSeconds: entry.buildDurationSeconds,
        finishesAtSeconds: entry.finishesAtSeconds,
      }),
    ]),
  );

  return db.$transaction(async (tx) => {
    await tx.villagePlan.updateMany({
      where: { villageId: village.id, status: { in: ["active", "blocked"] } },
      data: { status: "archived" },
    });

    return tx.villagePlan.create({
      data: {
        villageId: village.id,
        templateRevisionId: revision.id,
        revision: villageRevision,
        status: remainingSteps.length === 0 ? "completed" : "active",
        stage: revision.stage,
        basedOnSnapshotId: snapshot.id,
        originalEtaSeconds: simulation.totalElapsedSeconds,
        recalculatedEtaSeconds: simulation.totalElapsedSeconds,
        steps: {
          create: remainingSteps.map((step, index) => ({
            position: index + 1,
            stage: step.stage,
            kind: step.kind,
            action: step.action,
            slot: step.slot,
            gid: step.gid,
            targetLevel: step.targetLevel,
            status: "pending",
            metadataJson: metadataByPosition.get(step.position) ?? null,
          })),
        },
      },
      include: { steps: { orderBy: { position: "asc" } }, templateRevision: true },
    });
  });
};

export const setVillagePlannerMode = async (input: {
  villageId: string;
  mode: "off" | "shadow" | "active";
}) => {
  await ensurePlannerDatabase();
  return db.village.update({
    where: { id: input.villageId },
    data: { plannerMode: input.mode },
  });
};

export const getVillagePlanDetails = async (villageId: string) => {
  await ensurePlannerDatabase();
  return db.village.findUnique({
    where: { id: villageId },
    include: {
      plans: {
        orderBy: { revision: "desc" },
        include: {
          steps: { orderBy: { position: "asc" } },
          templateRevision: { include: { template: true } },
        },
      },
    },
  });
};
