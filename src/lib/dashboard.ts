import { listVillageAutoApplyState } from "@/lib/auto-apply";
import { attachBuildMenuSlotsToSnapshot, parseDorf2BuildMenuPayload } from "@/lib/build-options";
import { getEffectiveConstructionState } from "@/lib/construction-state";
import { getActiveScopedAccount } from "@/lib/credentials";
import { db, ensureDatabase } from "@/lib/db";
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

export const getDashboardData = async () => {
  await ensureDatabase();
  const scopedAccount = await getActiveScopedAccount();

  if (!scopedAccount?.account?.id) {
    return {
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

  if (latestRun.accountId) {
    const historicalSnapshots = await db.villageSnapshot.findMany({
      where: {
        village: {
          accountId: latestRun.accountId,
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
  }

  const villages = latestRun.villageSnapshots.map((snapshot) => {
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

    return {
      id: snapshot.village.externalId,
      name: snapshot.village.name,
      coordinates:
        snapshot.village.x !== null && snapshot.village.y !== null
          ? `${snapshot.village.x} | ${snapshot.village.y}`
          : "Unknown",
      population: snapshot.population,
      loyalty: snapshot.loyalty,
      freeCrop: snapshot.freeCrop,
      incomingAttacksAmount: snapshot.incomingAttacksAmount,
      status: snapshot.status,
      scrapedAt: snapshot.scrapedAt,
      visibleTroops,
      activeConstructionSlots: effectiveConstruction.activeConstructionSlots,
      queueExpiredByClock: effectiveConstruction.queueExpiredByClock,
      constructionQueue,
      availableUpgrades: queueIsFull ? 0 : availableFieldUpgrades + availableBuildingUpgrades,
      topRecommendation: recommendation.title,
      recommendationSummary: recommendation.summary,
      recommendationPriority: recommendation.priority,
      recommendationScore: recommendation.score,
      recommendationWaitTime: recommendation.waitTimeText,
      recommendationShouldWait: recommendation.shouldWait,
      recommendationReasons: recommendation.reasons,
      recommendationMemorySummary: recommendation.memorySummary,
      recommendationFocus: recommendation.focus,
      strictRouteTitle: recommendation.strictRouteTitle,
      strictRouteSummary: recommendation.strictRouteSummary,
      strictRouteWaitTime: recommendation.strictRouteWaitTime,
      strictRouteReasons: recommendation.strictRouteReasons,
      snapshotRecommendationTitle: recommendation.snapshotRecommendationTitle,
      snapshotRecommendationSummary: recommendation.snapshotRecommendationSummary,
      recommendationCandidates: decision.rankedCandidates.slice(0, 3).map((candidate) => ({
        id: candidate.id,
        label: candidate.label,
        category: candidate.category,
        affordableNow: candidate.affordableNow,
        blockedByConstructionQueue: candidate.blockedByConstructionQueue,
        score: candidate.score,
        reasons: candidate.reasons,
        waitTimeText: formatHoursToText(candidate.timeToAffordHours),
      })),
      resources: {
        wood: getResource("wood"),
        clay: getResource("clay"),
        iron: getResource("iron"),
        crop: getResource("crop"),
      },
    };
  });

  const autoApplyByVillageId = await listVillageAutoApplyState(
    latestRun.villageSnapshots.map((snapshot) => snapshot.villageId),
  );

  const villagesWithProposals = villages.map((village, index) => {
    const snapshot = latestRun.villageSnapshots[index];
    const autoApplyJob = autoApplyByVillageId.get(snapshot.villageId) ?? null;

    return {
      ...village,
      dbId: snapshot.villageId,
      autoApplyEnabled: snapshot.village.autoApplyEnabled,
      autoApplyPausedAt: snapshot.village.autoApplyPausedAt,
      autoApplyPauseReason: snapshot.village.autoApplyPauseReason,
      autoApplyJob: autoApplyJob
        ? {
            id: autoApplyJob.id,
            status: autoApplyJob.status,
            runAt: autoApplyJob.runAt,
            lastError: autoApplyJob.lastError,
            attemptCount: autoApplyJob.attemptCount,
          }
        : null,
    };
  });

  const alerts = [
    ...villagesWithProposals
      .filter((village) => (village.incomingAttacksAmount ?? 0) > 0)
      .map((village) => `${village.name} has incoming attacks.`),
    ...villagesWithProposals
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
    villages: villagesWithProposals,
    alerts,
  };
};

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;
