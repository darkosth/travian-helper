import { db } from "@/lib/db";
import { ensurePlannerDatabase } from "@/lib/planner/database";
import { applyTemplateToVillage } from "@/lib/planner/village-plan-service";
import { snapshotToSimulationState } from "@/lib/planner/snapshot-to-simulation-state";
import { getCurrentStepLevel, simulatePlan, type PlannerStep } from "@/lib/planner/simulator";

export const previewVillagePlanRecalculation = async (input: {
  villageId: string;
  templateRevisionId: string;
  snapshotId?: string;
}) => {
  await ensurePlannerDatabase();
  const snapshot = input.snapshotId
    ? await db.villageSnapshot.findUnique({
        where: { id: input.snapshotId },
        include: { resources: true, resourceFields: true, buildings: true },
      })
    : await db.villageSnapshot.findFirst({
        where: { villageId: input.villageId },
        orderBy: { scrapedAt: "desc" },
        include: { resources: true, resourceFields: true, buildings: true },
      });
  const revision = await db.villagePlanTemplateRevision.findUnique({
    where: { id: input.templateRevisionId },
    include: { template: true, steps: { orderBy: { position: "asc" } } },
  });
  if (!snapshot || snapshot.villageId !== input.villageId) throw new Error("Village snapshot not found.");
  if (!revision || revision.status !== "published") throw new Error("Published revision not found.");

  const initialState = snapshotToSimulationState(snapshot);
  const allSteps: PlannerStep[] = revision.steps.map((step) => ({
    id: step.id,
    position: step.position,
    stage: step.stage as PlannerStep["stage"],
    kind: step.kind as PlannerStep["kind"],
    action: step.action as PlannerStep["action"],
    slot: step.slot,
    gid: step.gid,
    targetLevel: step.targetLevel,
  }));
  const remainingSteps = allSteps.filter((step) => getCurrentStepLevel(initialState, step) < step.targetLevel);
  const simulation = simulatePlan({
    initialState,
    steps: remainingSteps,
    serverSpeed: revision.template.serverSpeed,
  });

  return {
    snapshotId: snapshot.id,
    templateRevisionId: revision.id,
    remainingSteps,
    simulation,
  };
};

export const confirmVillagePlanRecalculation = async (input: {
  villageId: string;
  templateRevisionId: string;
  snapshotId?: string;
}) => applyTemplateToVillage(input);
