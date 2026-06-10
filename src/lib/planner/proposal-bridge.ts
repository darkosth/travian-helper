import { db } from "@/lib/db";
import { getCatalogLevel } from "@/lib/planner/catalog";
import { ensurePlannerDatabase } from "@/lib/planner/database";
import { resolvePlannerWorkerDirective } from "@/lib/planner/worker-directive";

const getPlanStep = async (stepId: string) =>
  db.villagePlanStep.findUnique({ where: { id: stepId } });

const getCandidateTiming = (
  directive:
    | { status: "ready" }
    | { status: "waiting-resources"; retryAfterSeconds: number }
    | { status: "waiting-construction" },
) => {
  if (directive.status === "ready") {
    return { affordableNow: true, timeToAffordHours: 0 };
  }
  if (directive.status === "waiting-resources") {
    return {
      affordableNow: false,
      timeToAffordHours: directive.retryAfterSeconds / 3600,
    };
  }
  return { affordableNow: false, timeToAffordHours: null };
};

/**
 * Convierte el siguiente paso determinista en una propuesta compatible con el
 * ejecutor Playwright actual. Así el planner reutiliza el camino ya probado.
 */
export const ensurePlannerAgentProposalForVillage = async (villageId: string) => {
  await ensurePlannerDatabase();
  const planner = await resolvePlannerWorkerDirective(villageId);
  if (planner.mode !== "active" || !planner.directive) {
    return null;
  }

  // En modo active nunca permitimos que sobreviva una recomendación heurística.
  // Si el plan está bloqueado, completado o no existe, la aldea simplemente no
  // recibe una acción nueva hasta que el usuario corrija o aplique un plan.
  const directive = planner.directive;
  if (
    directive.status !== "ready" &&
    directive.status !== "waiting-resources" &&
    directive.status !== "waiting-construction"
  ) {
    await db.agentProposal.updateMany({
      where: { villageId, status: "pending" },
      data: { status: "stale" },
    });
    return null;
  }

  const step = await getPlanStep(directive.stepId);
  const snapshot = await db.villageSnapshot.findFirst({
    where: { villageId },
    orderBy: { scrapedAt: "desc" },
  });
  if (!step || !snapshot) return null;

  const catalogLevel = getCatalogLevel(step.gid, step.targetLevel);
  if (!catalogLevel) return null;
  const timing = getCandidateTiming(directive);
  const totalCost = Object.values(catalogLevel.cost).reduce((sum, amount) => sum + amount, 0);
  const fingerprint = `planner:${step.id}:${snapshot.id}`;

  const existing = await db.agentProposal.findFirst({
    where: { villageId, villageSnapshotId: snapshot.id, goal: fingerprint, status: "pending" },
    include: { candidates: { orderBy: { rank: "asc" } } },
  });

  await db.agentProposal.updateMany({
    where: {
      villageId,
      status: "pending",
      ...(existing ? { id: { not: existing.id } } : {}),
    },
    data: { status: "stale" },
  });
  if (existing) return existing;

  return db.agentProposal.create({
    data: {
      villageId,
      villageSnapshotId: snapshot.id,
      goal: fingerprint,
      status: "pending",
      focus: "Deterministic village planner",
      headline: `Planner step ${step.position}: gid ${step.gid} → ${step.targetLevel}`,
      summary: timing.affordableNow
        ? "The deterministic planner selected the exact next row."
        : "The deterministic planner is waiting for resources or a free construction slot.",
      confidence: 1,
      candidates: {
        create: {
          rank: 0,
          isRecommended: true,
          label: `Planner gid ${step.gid} level ${step.targetLevel}`,
          name: `gid ${step.gid}`,
          kind: step.kind,
          slot: step.slot,
          level: step.targetLevel,
          category: "planner",
          affordableNow: timing.affordableNow,
          totalCost,
          timeToAffordHours: timing.timeToAffordHours,
          heuristicScore: 0,
          learnedScore: 0,
          finalScore: 1_000_000,
          confidence: 1,
          featuresJson: JSON.stringify({
            planner: true,
            planStepId: step.id,
            buildAction: step.action,
            targetGid: step.gid,
            targetHref: null,
          }),
          reasonsJson: JSON.stringify([
            "Selected by frozen deterministic village plan.",
            "The worker must not insert or reorder rows automatically.",
          ]),
        },
      },
    },
    include: { candidates: true },
  });
};

export const syncPlannerAgentProposals = async (profileId: string) => {
  await ensurePlannerDatabase();
  const profile = await db.credentialProfile.findUnique({ where: { id: profileId } });
  if (!profile?.accountId) return [];
  const villages = await db.village.findMany({
    where: { accountId: profile.accountId, plannerMode: "active", autoApplyEnabled: true },
    select: { id: true },
  });

  const proposals: unknown[] = [];
  for (const village of villages) {
    const proposal = await ensurePlannerAgentProposalForVillage(village.id);
    if (proposal) proposals.push(proposal);
  }
  return proposals;
};
