import { db, ensureDatabase } from "@/lib/db";
import { dorf1Schema, dorf2Schema } from "@/lib/travian-schemas";
import type {
  ActiveConstructionSnapshot,
  Dorf1Snapshot,
  Dorf2Snapshot,
} from "@/lib/travian-types";

const getIncomingAttacksAmount = (villageRef: Record<string, unknown> | undefined) => {
  if (!villageRef) {
    return null;
  }

  const candidates = [
    villageRef.incomingAttacks,
    villageRef.incomingAttackAmount,
    villageRef.attacks,
    villageRef.attack,
    villageRef.attackAlert,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "number") {
      return candidate;
    }

    if (typeof candidate === "boolean") {
      return candidate ? 1 : 0;
    }
  }

  return null;
};

const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const matchesConstruction = (
  queueItem: ActiveConstructionSnapshot,
  activeTarget: ActiveConstructionSnapshot,
) => {
  if (normalizeText(queueItem.name) !== normalizeText(activeTarget.name)) {
    return false;
  }

  if (
    queueItem.targetLevel !== null &&
    activeTarget.currentLevel !== null &&
    queueItem.targetLevel !== activeTarget.currentLevel + 1
  ) {
    return false;
  }

  return true;
};

const buildActiveConstructionQueue = (
  dorf1: Dorf1Snapshot,
  dorf2: Dorf2Snapshot,
): ActiveConstructionSnapshot[] => {
  const queueItems = dorf2.villageCenter.activeConstructions;
  const activeTargets = [
    ...dorf1.village.activeConstructions,
    ...dorf2.villageCenter.buildings
      .filter((building) => building.upgradeStatus === "underConstruction")
      .map(
        (building): ActiveConstructionSnapshot => ({
          slot: building.slot,
          kind: "building",
          name: building.name,
          currentLevel: building.level,
          targetLevel: building.level !== null ? building.level + 1 : null,
          remainingTime: null,
          finishTime: null,
        }),
      ),
  ];
  const unmatchedTargets = [...activeTargets];

  return queueItems.map((queueItem) => {
    const matchedIndex = unmatchedTargets.findIndex((target) =>
      matchesConstruction(queueItem, target),
    );

    if (matchedIndex === -1) {
      return queueItem;
    }

    const matchedTarget = unmatchedTargets.splice(matchedIndex, 1)[0];

    return {
      ...queueItem,
      slot: matchedTarget.slot,
      kind: matchedTarget.kind,
      currentLevel: matchedTarget.currentLevel,
    };
  });
};

const ensureAccount = async (snapshot: Dorf1Snapshot) => {
  const playerName = snapshot.account.player?.name ?? "Unknown Player";

  return db.account.upsert({
    where: {
      serverUrl_playerName: {
        serverUrl: new URL(snapshot.page.url).origin,
        playerName,
      },
    },
    update: {
      tribeId: snapshot.account.player?.tribeId ?? null,
      language: snapshot.server.language,
    },
    create: {
      serverUrl: new URL(snapshot.page.url).origin,
      playerName,
      tribeId: snapshot.account.player?.tribeId ?? null,
      language: snapshot.server.language,
    },
  });
};

const ensureVillages = async (accountId: string, villages: Array<Record<string, unknown>>) => {
  for (const rawVillage of villages) {
    const externalId =
      typeof rawVillage.id === "number"
        ? rawVillage.id
        : typeof rawVillage.did === "number"
          ? rawVillage.did
          : null;

    if (!externalId) {
      continue;
    }

    await db.village.upsert({
      where: {
        externalId,
      },
      update: {
        accountId,
        name:
          typeof rawVillage.name === "string" && rawVillage.name.length > 0
            ? rawVillage.name
            : `Village ${externalId}`,
        x: typeof rawVillage.x === "number" ? rawVillage.x : null,
        y: typeof rawVillage.y === "number" ? rawVillage.y : null,
      },
      create: {
        externalId,
        accountId,
        name:
          typeof rawVillage.name === "string" && rawVillage.name.length > 0
            ? rawVillage.name
            : `Village ${externalId}`,
        x: typeof rawVillage.x === "number" ? rawVillage.x : null,
        y: typeof rawVillage.y === "number" ? rawVillage.y : null,
      },
    });
  }
};

const ensureVillage = async (input: {
  accountId: string;
  externalId: number;
  name: string | null;
  x: number | null;
  y: number | null;
}) =>
  db.village.upsert({
    where: {
      externalId: input.externalId,
    },
    update: {
      accountId: input.accountId,
      name: input.name ?? `Village ${input.externalId}`,
      x: input.x,
      y: input.y,
    },
    create: {
      externalId: input.externalId,
      accountId: input.accountId,
      name: input.name ?? `Village ${input.externalId}`,
      x: input.x,
      y: input.y,
    },
  });

const replaceVillageSnapshotChildren = async (villageSnapshotId: string, dorf1: Dorf1Snapshot, dorf2: Dorf2Snapshot) => {
  await db.resourceSnapshot.deleteMany({ where: { villageSnapshotId } });
  await db.troopSnapshot.deleteMany({ where: { villageSnapshotId } });
  await db.resourceFieldSnapshot.deleteMany({ where: { villageSnapshotId } });
  await db.buildingSnapshot.deleteMany({ where: { villageSnapshotId } });

  const resources = [
    ["wood", dorf1.village.resources.wood],
    ["clay", dorf1.village.resources.clay],
    ["iron", dorf1.village.resources.iron],
    ["crop", dorf1.village.resources.crop],
  ] as const;

  for (const [type, bucket] of resources) {
    await db.resourceSnapshot.create({
      data: {
        villageSnapshotId,
        type,
        amount: bucket.amount,
        productionPerHour: bucket.productionPerHour,
        capacity: bucket.capacity,
      },
    });
  }

  for (const troop of dorf1.village.troops) {
    await db.troopSnapshot.create({
      data: {
        villageSnapshotId,
        unitCode: troop.code,
        unitName: troop.unit ?? "Unknown Unit",
        amount: troop.amount,
      },
    });
  }

  for (const field of dorf1.village.resourceFields) {
    await db.resourceFieldSnapshot.create({
      data: {
        villageSnapshotId,
        slot: field.slot,
        gid: field.gid,
        type: field.type,
        name: field.name,
        level: field.level,
        isMaxLevel: field.isMaxLevel,
        upgradeStatus: field.upgradeStatus,
        canAffordUpgrade: field.canAffordUpgrade,
        canStartUpgradeNow: field.canStartUpgradeNow,
        nextLevelWood: field.nextLevelCosts?.wood ?? null,
        nextLevelClay: field.nextLevelCosts?.clay ?? null,
        nextLevelIron: field.nextLevelCosts?.iron ?? null,
        nextLevelCrop: field.nextLevelCosts?.crop ?? null,
        upgradeDurationText: field.upgradeDuration,
      },
    });
  }

  for (const building of dorf2.villageCenter.buildings) {
    await db.buildingSnapshot.create({
      data: {
        villageSnapshotId,
        slot: building.slot,
        buildingId: building.buildingId,
        gid: building.gid,
        name: building.name,
        level: building.level,
        isEmpty: building.isEmpty,
        isMaxLevel: building.isMaxLevel,
        upgradeStatus: building.upgradeStatus,
        canStartUpgradeNow: building.canStartUpgradeNow,
        nextLevelWood: building.nextLevelCosts?.wood ?? null,
        nextLevelClay: building.nextLevelCosts?.clay ?? null,
        nextLevelIron: building.nextLevelCosts?.iron ?? null,
        nextLevelCrop: building.nextLevelCosts?.crop ?? null,
        upgradeDurationText: building.upgradeDuration,
        href: building.href,
      },
    });
  }
};

export const importVillageCapture = async (input: {
  captureRunId: string;
  dorf1Payload: unknown;
  dorf2Payload: unknown;
}) => {
  await ensureDatabase();
  const dorf1 = dorf1Schema.parse(input.dorf1Payload);
  const dorf2 = dorf2Schema.parse(input.dorf2Payload);

  if (dorf1.village.current.id !== dorf2.villageRef.id) {
    throw new Error(
      `Village mismatch between dorf1 (${dorf1.village.current.id}) and dorf2 (${dorf2.villageRef.id})`,
    );
  }

  const account = await ensureAccount(dorf1);
  await ensureVillages(account.id, dorf1.account.villages);

  const village = await ensureVillage({
    accountId: account.id,
    externalId: dorf1.village.current.id,
    name: dorf1.village.current.name,
    x: dorf1.village.current.x,
    y: dorf1.village.current.y,
  });

  await db.captureRun.update({
    where: {
      id: input.captureRunId,
    },
    data: {
      accountId: account.id,
    },
  });

  await db.accountSnapshot.upsert({
    where: {
      captureRunId_accountId: {
        captureRunId: input.captureRunId,
        accountId: account.id,
      },
    },
    update: {
      gold: dorf1.account.currency.gold,
      silver: dorf1.account.currency.silver,
      usedVillageSlots: dorf1.account.culturalPoints?.usedSlots ?? null,
      maxControllableVillages:
        dorf1.account.culturalPoints?.maxControllableVillages ?? null,
      cpProducedForNextSlot:
        dorf1.account.culturalPoints?.cpProducedForNextSlot ?? null,
      cpNeededForNextSlot:
        dorf1.account.culturalPoints?.cpNeededForNextSlot ?? null,
      cpProductionTotal: dorf1.account.culturalPoints?.cpProductionTotal ?? null,
    },
    create: {
      captureRunId: input.captureRunId,
      accountId: account.id,
      gold: dorf1.account.currency.gold,
      silver: dorf1.account.currency.silver,
      usedVillageSlots: dorf1.account.culturalPoints?.usedSlots ?? null,
      maxControllableVillages:
        dorf1.account.culturalPoints?.maxControllableVillages ?? null,
      cpProducedForNextSlot:
        dorf1.account.culturalPoints?.cpProducedForNextSlot ?? null,
      cpNeededForNextSlot:
        dorf1.account.culturalPoints?.cpNeededForNextSlot ?? null,
      cpProductionTotal: dorf1.account.culturalPoints?.cpProductionTotal ?? null,
    },
  });

  const currentVillageReference = dorf1.account.villages.find(
    (candidate) =>
      (typeof candidate.id === "number" && candidate.id === dorf1.village.current.id) ||
      (typeof candidate.did === "number" && candidate.did === dorf1.village.current.id),
  );

  const scrapedAt = new Date(
    [dorf1.scrapedAt, dorf2.scrapedAt].sort().slice(-1)[0] ?? dorf1.scrapedAt,
  );
  const activeConstructionQueue = buildActiveConstructionQueue(dorf1, dorf2);

  const villageSnapshot = await db.villageSnapshot.upsert({
    where: {
      captureRunId_villageId: {
        captureRunId: input.captureRunId,
        villageId: village.id,
      },
    },
    update: {
      scrapedAt,
      population: dorf1.village.current.population,
      loyalty: dorf1.village.current.loyalty,
      freeCrop: dorf1.village.resources.freeCrop,
      incomingAttacksAmount: getIncomingAttacksAmount(currentVillageReference),
      activeConstructionSlots: activeConstructionQueue.length,
      constructionQueueJson: JSON.stringify(activeConstructionQueue),
      hasDorf1: true,
      hasDorf2: true,
      status: "complete",
    },
    create: {
      captureRunId: input.captureRunId,
      villageId: village.id,
      scrapedAt,
      population: dorf1.village.current.population,
      loyalty: dorf1.village.current.loyalty,
      freeCrop: dorf1.village.resources.freeCrop,
      incomingAttacksAmount: getIncomingAttacksAmount(currentVillageReference),
      activeConstructionSlots: activeConstructionQueue.length,
      constructionQueueJson: JSON.stringify(activeConstructionQueue),
      hasDorf1: true,
      hasDorf2: true,
      status: "complete",
    },
  });

  await replaceVillageSnapshotChildren(villageSnapshot.id, dorf1, dorf2);

  await db.captureRunVillage.upsert({
    where: {
      captureRunId_villageExternalId: {
        captureRunId: input.captureRunId,
        villageExternalId: village.externalId,
      },
    },
    update: {
      villageId: village.id,
      villageName: village.name,
      hasDorf1: true,
      hasDorf2: true,
      status: "success",
      completedAt: new Date(),
      errorMessage: null,
    },
    create: {
      captureRunId: input.captureRunId,
      villageId: village.id,
      villageExternalId: village.externalId,
      villageName: village.name,
      hasDorf1: true,
      hasDorf2: true,
      status: "success",
      completedAt: new Date(),
    },
  });

  await db.rawSnapshotPayload.createMany({
    data: [
      {
        captureRunId: input.captureRunId,
        villageExternalId: village.externalId,
        source: dorf1.source,
        schemaVersion: dorf1.schemaVersion,
        payloadJson: JSON.stringify(dorf1),
      },
      {
        captureRunId: input.captureRunId,
        villageExternalId: village.externalId,
        source: dorf2.source,
        schemaVersion: dorf2.schemaVersion,
        payloadJson: JSON.stringify(dorf2),
      },
    ],
  });

  const { evaluatePendingOutcomesForVillage } = await import("@/lib/agent-proposals");

  await evaluatePendingOutcomesForVillage({
    villageId: village.id,
    villageSnapshotId: villageSnapshot.id,
  });

  return {
    accountId: account.id,
    villageId: village.id,
    villageExternalId: village.externalId,
  };
};
