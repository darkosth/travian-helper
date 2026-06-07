import "server-only";
import { listLatestVillageProposals } from "@/lib/agent-proposals";
import { db, ensureDatabase } from "@/lib/db";
import { getVillageRecommendation } from "@/lib/recommendations";

export const getDashboardData = async () => {
  await ensureDatabase();
  const latestRun = await db.captureRun.findFirst({
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
      account: null,
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

      existing.push(historicalSnapshot);
      historyByVillageId.set(historicalSnapshot.villageId, existing);
    }
  }

  const villages = latestRun.villageSnapshots.map((snapshot) => {
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
      (field) => field.canAffordUpgrade === true,
    ).length;

    const availableBuildingUpgrades = snapshot.buildings.filter(
      (building) => building.canStartUpgradeNow === true,
    ).length;

    const recommendation = getVillageRecommendation({
      villageName: snapshot.village.name,
      snapshot,
      history:
        historyByVillageId.get(snapshot.villageId) ??
        [
          {
            freeCrop: snapshot.freeCrop,
            incomingAttacksAmount: snapshot.incomingAttacksAmount,
            population: snapshot.population,
            scrapedAt: snapshot.scrapedAt,
            resources: snapshot.resources,
            resourceFields: snapshot.resourceFields,
            buildings: snapshot.buildings,
          },
        ],
      account: {
        usedVillageSlots: accountSnapshot?.usedVillageSlots ?? null,
        maxControllableVillages: accountSnapshot?.maxControllableVillages ?? null,
        cpProducedForNextSlot: accountSnapshot?.cpProducedForNextSlot ?? null,
        cpNeededForNextSlot: accountSnapshot?.cpNeededForNextSlot ?? null,
      },
    });

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
      availableUpgrades: availableFieldUpgrades + availableBuildingUpgrades,
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
      resources: {
        wood: getResource("wood"),
        clay: getResource("clay"),
        iron: getResource("iron"),
        crop: getResource("crop"),
      },
    };
  });

  const latestProposals = await listLatestVillageProposals(
    latestRun.villageSnapshots.map((snapshot) => snapshot.villageId),
  );

  const villagesWithProposals = villages.map((village, index) => {
    const snapshot = latestRun.villageSnapshots[index];

    return {
      ...village,
      latestProposal: latestProposals.get(snapshot.villageId) ?? null,
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
