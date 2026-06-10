import { db } from "@/lib/db";
import { ensurePlannerDatabase } from "@/lib/planner/database";
import { simulatePlan, type PlannerStep, type SimulationState } from "@/lib/planner/simulator";

const normalizeSteps = (steps: Omit<PlannerStep, "id">[]): Omit<PlannerStep, "id">[] =>
  [...steps]
    .sort((left, right) => left.position - right.position)
    .map((step, index) => ({ ...step, position: index + 1 }));

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

export const createTemplate = async (input: {
  name: string;
  tribeId?: number | null;
  serverSpeed?: number;
  description?: string | null;
  stage?: PlannerStep["stage"];
  steps?: Omit<PlannerStep, "id">[];
}) => {
  await ensurePlannerDatabase();
  const steps = normalizeSteps(input.steps ?? []);

  return db.villagePlanTemplate.create({
    data: {
      name: input.name,
      tribeId: input.tribeId ?? null,
      serverSpeed: input.serverSpeed ?? 1,
      description: input.description ?? null,
      revisions: {
        create: {
          revision: 1,
          status: "draft",
          stage: input.stage ?? 1,
          steps: {
            create: steps,
          },
        },
      },
    },
    include: { revisions: { include: { steps: { orderBy: { position: "asc" } } } } },
  });
};

export const updateDraftTemplate = async (input: {
  revisionId: string;
  name?: string;
  serverSpeed?: number;
  description?: string | null;
  stage?: PlannerStep["stage"];
  steps: Omit<PlannerStep, "id">[];
}) => {
  await ensurePlannerDatabase();
  const revision = await db.villagePlanTemplateRevision.findUnique({ where: { id: input.revisionId } });
  if (!revision || revision.status !== "draft") {
    throw new Error("Solo se puede editar una revisión draft.");
  }
  if (input.name !== undefined && input.name.length === 0) {
    throw new Error("El nombre es obligatorio.");
  }
  if (input.serverSpeed !== undefined && input.serverSpeed <= 0) {
    throw new Error("La velocidad del servidor debe ser mayor que cero.");
  }

  const steps = normalizeSteps(input.steps);
  return db.$transaction(async (tx) => {
    await tx.villagePlanTemplateStep.deleteMany({ where: { revisionId: revision.id } });

    if (input.name !== undefined || input.serverSpeed !== undefined || input.description !== undefined) {
      await tx.villagePlanTemplate.update({
        where: { id: revision.templateId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.serverSpeed !== undefined ? { serverSpeed: input.serverSpeed } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
        },
      });
    }

    return tx.villagePlanTemplateRevision.update({
      where: { id: revision.id },
      data: {
        stage: input.stage ?? revision.stage,
        steps: { create: steps },
      },
      include: { steps: { orderBy: { position: "asc" } } },
    });
  });
};

export const simulateTemplate = async (input: {
  revisionId: string;
  initialState: SimulationState;
}) => {
  await ensurePlannerDatabase();
  const revision = await db.villagePlanTemplateRevision.findUnique({
    where: { id: input.revisionId },
    include: { template: true, steps: { orderBy: { position: "asc" } } },
  });
  if (!revision) throw new Error("Template revision not found.");

  return simulatePlan({
    initialState: input.initialState,
    steps: toPlannerSteps(revision.steps),
    serverSpeed: revision.template.serverSpeed,
  });
};

export const publishTemplateRevision = async (input: {
  revisionId: string;
  initialState?: SimulationState;
}) => {
  await ensurePlannerDatabase();
  const revision = await db.villagePlanTemplateRevision.findUnique({
    where: { id: input.revisionId },
    include: { template: true, steps: { orderBy: { position: "asc" } } },
  });
  if (!revision || revision.status !== "draft") {
    throw new Error("Draft template revision not found.");
  }

  let summaryJson: string | null = null;
  if (input.initialState) {
    const simulation = simulatePlan({
      initialState: input.initialState,
      steps: toPlannerSteps(revision.steps),
      serverSpeed: revision.template.serverSpeed,
    });
    if (!simulation.valid) {
      throw new Error(simulation.firstBlockingStep?.message ?? "The route is invalid.");
    }
    summaryJson = JSON.stringify({ totalElapsedSeconds: simulation.totalElapsedSeconds });
  }

  const nextRevisionNumber = revision.revision + 1;
  return db.$transaction(async (tx) => {
    const published = await tx.villagePlanTemplateRevision.update({
      where: { id: revision.id },
      data: { status: "published", summaryJson },
      include: { steps: { orderBy: { position: "asc" } } },
    });
    const nextDraft = await tx.villagePlanTemplateRevision.create({
      data: {
        templateId: revision.templateId,
        revision: nextRevisionNumber,
        status: "draft",
        stage: revision.stage,
        steps: {
          create: revision.steps.map((step) => ({
            position: step.position,
            stage: step.stage,
            kind: step.kind,
            action: step.action,
            slot: step.slot,
            gid: step.gid,
            targetLevel: step.targetLevel,
          })),
        },
      },
      include: { steps: { orderBy: { position: "asc" } } },
    });
    return { published, nextDraft };
  });
};

export const listTemplates = async () => {
  await ensurePlannerDatabase();
  return db.villagePlanTemplate.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      revisions: {
        orderBy: { revision: "desc" },
        include: { steps: { orderBy: { position: "asc" } } },
      },
    },
  });
};
