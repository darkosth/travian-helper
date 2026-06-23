import { listVillageAutoApplyState } from "@/lib/auto-apply";
import { attachBuildMenuSlotsToSnapshot, parseDorf2BuildMenuPayload } from "@/lib/build-options";
import { getEffectiveConstructionState } from "@/lib/construction-state";
import { getActiveScopedAccount } from "@/lib/credentials";
import { db, ensureDatabase } from "@/lib/db";
import { getCatalogDisplayName } from "@/lib/planner/catalog";
import { resolvePlannerWorkerDirective } from "@/lib/planner/worker-directive";
import {
  buildVillageDecision,
  formatHoursToText,
  type ActiveConstructionLike,
} from "@/lib/recommendations";

const parseConstructionQueue = (value: string | null): ActiveConstructionLike[] => {
  if (!value) {
    return [];
  }

  try {
    return JSON.parse(value) as ActiveConstructionLike[];
  } catch {
    return [];
  }
};

const describePlannerMove = (input: {
  kind: string;
  slot: number;
  gid: number;
  targetLevel: number;
}) => {
  const sourceLevel = Math.max(0, input.targetLevel - 1);
  return `${getCatalogDisplayName(input.gid)} · slot ${input.slot} · nivel ${sourceLevel} → ${input.targetLevel}`;
};

const getPlannerStepDetails = async (stepId: string) =>
  db.villagePlanStep.findUnique({
    where: { id: stepId },
    select: {
      kind: true,
      slot: true,
      gid: true,
      targetLevel: true,
    },
  });

const plannerModeLabel = (mode: string) => {
  if (mode === "active") {
    return "Planner activo";
  }

  if (mode === "shadow") {
    return "Planner sombra";
  }

  return "Planner apagado";
};

const plannerPlanStatusLabel = (status: string | null) => {
  if (status === "active") {
    return "Plan en curso";
  }

  if (status === "blocked") {
    return "Plan bloqueado";
  }

  if (status === "completed") {
    return "Plan completado";
  }

  return "Sin plan";
};

type PlannerMove = {
  summary: string;
  title: string;
  waitTime: string | null;
};

const buildPlannerMove = async (input: {
  recommendationWaitTime: string | null;
  villageId: string;
}) => {
  const plannerMode = await db.village.findUnique({
    where: { id: input.villageId },
    select: { plannerMode: true },
  });

  if (!plannerMode || plannerMode.plannerMode !== "active") {
    return null;
  }

  const planner = await resolvePlannerWorkerDirective(input.villageId);
  const plannerDirective = planner.mode === "active" ? planner.directive : null;

  if (!plannerDirective) {
    return null;
  }

  const plannerStep =
    "stepId" in plannerDirective ? await getPlannerStepDetails(plannerDirective.stepId) : null;

  if (plannerDirective.status === "ready") {
    return {
      title: describePlannerMove(plannerDirective.action),
      summary:
        "Paso actual del plan congelado. El worker ejecutará esta fila exacta sin reordenar ni improvisar.",
      waitTime: null,
    } satisfies PlannerMove;
  }

  if (plannerDirective.status === "waiting-resources" && plannerStep) {
    return {
      title: describePlannerMove(plannerStep),
      summary:
        "El planner ya resolvió el siguiente paso, pero está esperando recursos antes de ejecutarlo.",
      waitTime: formatHoursToText(plannerDirective.retryAfterSeconds / 3600),
    } satisfies PlannerMove;
  }

  if (plannerDirective.status === "waiting-construction" && plannerStep) {
    return {
      title: describePlannerMove(plannerStep),
      summary:
        "El planner mantiene la siguiente fila, pero primero debe liberarse un slot de construcción.",
      waitTime: input.recommendationWaitTime,
    } satisfies PlannerMove;
  }

  return null;
};

const getVillagePlanSummary = async (villageId: string, plannerMode: string) => {
  const currentPlan = await db.villagePlan.findFirst({
    where: {
      villageId,
      status: {
        in: ["active", "blocked"],
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
    include: {
      templateRevision: {
        include: {
          template: true,
        },
      },
    },
  });

  const planName = currentPlan?.templateRevision?.template.name ?? null;
  const summary = currentPlan
    ? `${plannerPlanStatusLabel(currentPlan.status)}${planName ? ` · ${planName}` : ""}`
    : plannerMode === "shadow"
      ? "El planner observa, pero no manda sobre el worker."
      : plannerMode === "active"
        ? "Activa un plan publicado para que el worker siga directivas deterministas."
        : "La aldea usa la heurística normal.";

  return {
    href: `/villages/${villageId}/plan`,
    mode: plannerMode,
    modeLabel: plannerModeLabel(plannerMode),
    planName,
    planStatus: currentPlan?.status ?? null,
    summary,
  };
};

export const getDashboardData = async () => {
  await ensureDatabase();
  const scopedAccount = await getActiveScopedAccount();

  if (!scopedAccount?.account?.id) {
    return {
      activeProfile: scopedAccount?.profile
        ? {
            id: scopedAccount.profile.id,
            isActive: scopedAccount.profile.isActive,
            label: scopedAccount.profile.label,
            serverUrl: scopedAccount.profile.serverUrl,
            username: scopedAccount.profile.username,
          }
        : null,
      latestRun: null,
      account: null,
      villages: [],
      alerts: [],
    };
  }

  const latestRun = await db.captureRun.findFirst({
    where: {
      accountId: scopedAccount.account.id,
    },
    orderBy: {
      startedAt: "desc",
    },
    include: {
      account: true,
      villageRuns: {
        orderBy: {
          villageExternalId: "asc",
        },
      },
      accountSnapshots: true,
      rawPayloads: true,
      villageSnapshots: {
        include: {
          village: true,
          resources: true,
          troops: true,
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

  if (!latestRun) {
    return {
      activeProfile: {
        id: scopedAccount.profile.id,
        isActive: scopedAccount.profile.isActive,
        label: scopedAccount.profile.label,
        serverUrl: scopedAccount.profile.serverUrl,
        username: scopedAccount.profile.username,
      },
      latestRun: null,
      account: {
        playerName: scopedAccount.account.playerName,
        tribeId: scopedAccount.account.tribeId,
        serverUrl: scopedAccount.account.serverUrl,
        language: scopedAccount.account.language,
        gold: null,
        silver: null,
        usedVillageSlots: null,
        maxControllableVillages: null,
        cpProducedForNextSlot: null,
        cpNeededForNextSlot: null,
        cpProductionTotal: null,
      },
      villages: [],
      alerts: [],
    };
  }

  const accountSnapshot = latestRun.accountSnapshots[0] ?? null;
  const latestAccountId = latestRun.accountId ?? scopedAccount.account.id;
  const historyByVillageId = new Map<
    string,
    Array<{
      freeCrop: number | null;
      incomingAttacksAmount: number | null;
      population: number | null;
      activeConstructionSlots: number | null;
      scrapedAt: Date;
      resources: typeof latestRun.villageSnapshots[number]["resources"];
      resourceFields: typeof latestRun.villageSnapshots[number]["resourceFields"];
      buildings: typeof latestRun.villageSnapshots[number]["buildings"];
    }>
  >();

  const historicalSnapshots = await db.villageSnapshot.findMany({
    where: {
      village: {
        accountId: latestAccountId,
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

  for (const historicalSnapshot of historicalSnapshots) {
    const existing = historyByVillageId.get(historicalSnapshot.villageId) ?? [];

    if (existing.length >= 6) {
      continue;
    }

    existing.push({
      ...historicalSnapshot,
      activeConstructionSlots: historicalSnapshot.activeConstructionSlots,
    });
    historyByVillageId.set(historicalSnapshot.villageId, existing);
  }

  const villages = await Promise.all(
    latestRun.villageSnapshots.map(async (snapshot) => {
      const latestDorf2Payload = latestRun.rawPayloads
        ?.filter(
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
      const effectiveConstruction = getEffectiveConstructionState({
        activeConstructionSlots: snapshotWithBuildMenus.activeConstructionSlots,
        constructionQueue: parseConstructionQueue(snapshotWithBuildMenus.constructionQueueJson),
        scrapedAt: snapshotWithBuildMenus.scrapedAt,
      });
      const constructionQueue = effectiveConstruction.constructionQueue;
      const queueIsFull = effectiveConstruction.activeConstructionSlots >= 2;
      const getResource = (type: "wood" | "clay" | "iron" | "crop") =>
        snapshot.resources.find((resource) => resource.type === type) ?? {
          amount: null,
          capacity: null,
          productionPerHour: null,
        };

      const visibleTroops = snapshot.troops.reduce(
        (total, troop) => total + (troop.amount ?? 0),
        0,
      );

      const availableFieldUpgrades = snapshot.resourceFields.filter(
        (field) => field.canStartUpgradeNow === true,
      ).length;

      const availableBuildingUpgrades = snapshot.buildings.filter(
        (building) => building.canStartUpgradeNow === true,
      ).length;

      const decision = buildVillageDecision({
        villageName: snapshot.village.name,
        snapshot: {
          ...snapshotWithBuildMenus,
          activeConstructionSlots: effectiveConstruction.activeConstructionSlots,
          constructionQueue,
        },
        history:
          historyByVillageId.get(snapshot.villageId) ??
          [
            {
              freeCrop: snapshot.freeCrop,
              incomingAttacksAmount: snapshot.incomingAttacksAmount,
              population: snapshot.population,
              activeConstructionSlots: snapshot.activeConstructionSlots,
              scrapedAt: snapshot.scrapedAt,
              resources: snapshot.resources,
              resourceFields: snapshot.resourceFields,
              buildings: snapshotWithBuildMenus.buildings,
            },
          ],
        account: {
          tribeId: latestRun.account?.tribeId ?? null,
          usedVillageSlots: accountSnapshot?.usedVillageSlots ?? null,
          maxControllableVillages: accountSnapshot?.maxControllableVillages ?? null,
          cpProducedForNextSlot: accountSnapshot?.cpProducedForNextSlot ?? null,
          cpNeededForNextSlot: accountSnapshot?.cpNeededForNextSlot ?? null,
        },
      });
      const recommendation = decision.recommendation;
      const plannerMove = await buildPlannerMove({
        recommendationWaitTime: recommendation.waitTimeText,
        villageId: snapshot.villageId,
      });
      const planSummary = await getVillagePlanSummary(
        snapshot.villageId,
        snapshot.village.plannerMode,
      );

      return {
        dbId: snapshot.villageId,
        id: snapshot.village.externalId,
        name: snapshot.village.name,
        coordinates:
          snapshot.village.x !== null && snapshot.village.y !== null
            ? `${snapshot.village.x} | ${snapshot.village.y}`
            : "Unknown",
        population: snapshot.population,
        status: snapshot.status,
        scrapedAt: snapshot.scrapedAt,
        freeCrop: snapshot.freeCrop,
        visibleTroops,
        incomingAttacksAmount: snapshot.incomingAttacksAmount,
        availableUpgrades: queueIsFull ? 0 : availableFieldUpgrades + availableBuildingUpgrades,
        resources: {
          wood: getResource("wood"),
          clay: getResource("clay"),
          iron: getResource("iron"),
          crop: getResource("crop"),
        },
        queue: {
          activeSlots: effectiveConstruction.activeConstructionSlots,
          expiredByClock: effectiveConstruction.queueExpiredByClock,
          entries: constructionQueue,
        },
        nextMove: {
          source: plannerMove ? ("planner" as const) : ("heuristic" as const),
          sourceLabel: plannerMove ? "Planner activo" : "Heurística",
          summary: plannerMove?.summary ?? recommendation.summary,
          title: plannerMove?.title ?? recommendation.title,
          waitTime: plannerMove?.waitTime ?? recommendation.waitTimeText,
        },
        planner: planSummary,
      };
    }),
  );

  const autoApplyByVillageId = await listVillageAutoApplyState(
    latestRun.villageSnapshots.map((snapshot) => snapshot.villageId),
  );

  const villagesWithAutomation = villages.map((village) => {
    const autoApplyJob = autoApplyByVillageId.get(village.dbId) ?? null;
    const latestSnapshot =
      latestRun.villageSnapshots.find((snapshot) => snapshot.villageId === village.dbId) ?? null;

    return {
      ...village,
      autoApply: {
        enabled: latestSnapshot?.village.autoApplyEnabled ?? false,
        pausedAt: latestSnapshot?.village.autoApplyPausedAt ?? null,
        pauseReason: latestSnapshot?.village.autoApplyPauseReason ?? null,
        job: autoApplyJob
          ? {
              attemptCount: autoApplyJob.attemptCount,
              id: autoApplyJob.id,
              lastError: autoApplyJob.lastError,
              runAt: autoApplyJob.runAt,
              status: autoApplyJob.status,
            }
          : null,
      },
    };
  });

  const alerts = [
    ...villagesWithAutomation
      .filter((village) => (village.incomingAttacksAmount ?? 0) > 0)
      .map((village) => `${village.name} has incoming attacks.`),
    ...villagesWithAutomation
      .filter((village) => village.freeCrop !== null && village.freeCrop < 300)
      .map((village) => `${village.name} is running low on free crop.`),
    ...latestRun.villageRuns
      .filter((villageRun) => villageRun.status === "failed")
      .map(
        (villageRun) =>
          `${villageRun.villageName ?? villageRun.villageExternalId} failed to capture.`,
      ),
  ];

  return {
    activeProfile: {
      id: scopedAccount.profile.id,
      isActive: scopedAccount.profile.isActive,
      label: scopedAccount.profile.label,
      serverUrl: scopedAccount.profile.serverUrl,
      username: scopedAccount.profile.username,
    },
    latestRun: {
      id: latestRun.id,
      status: latestRun.status,
      startedAt: latestRun.startedAt,
      completedAt: latestRun.completedAt,
      errorMessage: latestRun.errorMessage,
    },
    account: latestRun.account
      ? {
          playerName: latestRun.account.playerName,
          tribeId: latestRun.account.tribeId,
          serverUrl: latestRun.account.serverUrl,
          language: latestRun.account.language,
          gold: accountSnapshot?.gold ?? null,
          silver: accountSnapshot?.silver ?? null,
          usedVillageSlots: accountSnapshot?.usedVillageSlots ?? null,
          maxControllableVillages: accountSnapshot?.maxControllableVillages ?? null,
          cpProducedForNextSlot: accountSnapshot?.cpProducedForNextSlot ?? null,
          cpNeededForNextSlot: accountSnapshot?.cpNeededForNextSlot ?? null,
          cpProductionTotal: accountSnapshot?.cpProductionTotal ?? null,
        }
      : null,
    villages: villagesWithAutomation,
    alerts,
  };
};

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;
