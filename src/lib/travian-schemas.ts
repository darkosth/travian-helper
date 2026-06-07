import { z } from "zod";

const numberOrNull = z.number().nullable();

const nextLevelCostsSchema = z
  .object({
    wood: numberOrNull,
    clay: numberOrNull,
    iron: numberOrNull,
    crop: numberOrNull,
  })
  .nullable();

const villageRefSchema = z.object({
  id: z.number(),
  name: z.string().nullable(),
  x: numberOrNull,
  y: numberOrNull,
});

export const dorf1Schema = z.object({
  schemaVersion: z.literal(1),
  source: z.literal("dorf1"),
  scrapedAt: z.string().datetime(),
  page: z.object({
    type: z.literal("resourceFields"),
    path: z.string(),
    url: z.string().url(),
  }),
  server: z.object({
    timestamp: numberOrNull,
    language: z.string().nullable(),
    timeZone: z.string().nullable(),
    timezoneOffsetToUTC: numberOrNull,
  }),
  account: z.object({
    currency: z.object({
      gold: numberOrNull,
      silver: numberOrNull,
    }),
    player: z
      .object({
        name: z.string().nullable(),
        tribeId: numberOrNull,
        isSitter: z.boolean().nullable(),
        goldFeatures: z.unknown(),
      })
      .nullable(),
    villages: z.array(z.record(z.string(), z.unknown())),
    culturalPoints: z
      .object({
        usedSlots: numberOrNull,
        maxControllableVillages: numberOrNull,
        cpProducedForNextSlot: numberOrNull,
        cpNeededForNextSlot: numberOrNull,
        cpProductionTotal: numberOrNull,
      })
      .nullable(),
  }),
  village: z.object({
    current: villageRefSchema.extend({
      tribeId: numberOrNull,
      sortIndex: numberOrNull,
      population: numberOrNull,
      loyalty: numberOrNull,
    }),
    resources: z.object({
      wood: z.object({
        amount: numberOrNull,
        productionPerHour: numberOrNull,
        capacity: numberOrNull,
      }),
      clay: z.object({
        amount: numberOrNull,
        productionPerHour: numberOrNull,
        capacity: numberOrNull,
      }),
      iron: z.object({
        amount: numberOrNull,
        productionPerHour: numberOrNull,
        capacity: numberOrNull,
      }),
      crop: z.object({
        amount: numberOrNull,
        productionPerHour: numberOrNull,
        capacity: numberOrNull,
      }),
      freeCrop: numberOrNull,
    }),
    troops: z.array(
      z.object({
        unit: z.string().nullable(),
        amount: numberOrNull,
        code: z.string().nullable(),
      }),
    ),
    resourceFields: z.array(
      z.object({
        slot: z.number(),
        gid: z.number(),
        type: z.string(),
        name: z.string(),
        level: numberOrNull,
        isMaxLevel: z.boolean(),
        upgradeStatus: z.string(),
        canAffordUpgrade: z.boolean().nullable(),
        nextLevelCosts: nextLevelCostsSchema,
        upgradeDuration: z.string().nullable(),
      }),
    ),
  }),
  diagnostics: z.object({
    resourceFieldCount: z.number(),
    troopTypeCount: z.number(),
    fieldsWithUnknownLevel: z.array(z.number()),
    fieldsWithMissingCosts: z.array(z.number()),
    fieldsWithUnknownUpgradeStatus: z.array(z.number()),
  }),
});

export const dorf2Schema = z.object({
  schemaVersion: z.literal(1),
  source: z.literal("dorf2"),
  scrapedAt: z.string().datetime(),
  page: z.object({
    type: z.literal("villageCenter"),
    path: z.string(),
    url: z.string().url(),
  }),
  villageRef: villageRefSchema,
  villageCenter: z.object({
    summary: z.object({
      totalSlots: z.number(),
      occupiedSlots: z.number(),
      emptySlots: z.number(),
      upgradesAvailableNow: z.number(),
      maxLevelBuildings: z.number(),
    }),
    emptySlots: z.array(z.number()),
    buildings: z.array(
      z.object({
        slot: z.number(),
        buildingId: numberOrNull,
        gid: z.number(),
        name: z.string(),
        level: numberOrNull,
        isEmpty: z.boolean(),
        isMaxLevel: z.boolean(),
        canStartUpgradeNow: z.boolean().nullable(),
        upgradeStatus: z.string(),
        nextLevelCosts: nextLevelCostsSchema,
        upgradeDuration: z.string().nullable(),
        href: z.string().nullable(),
      }),
    ),
  }),
  diagnostics: z.object({
    buildingCount: z.number(),
    duplicatedSlots: z.array(
      z.object({
        slot: z.number(),
        variants: z.number(),
      }),
    ),
    buildingsWithUnknownLevel: z.array(z.number()),
    buildingsWithMissingCosts: z.array(z.number()),
    buildingsWithUnknownUpgradeStatus: z.array(z.number()),
    tooltipDebug: z.array(
      z.object({
        slot: z.number(),
        name: z.string(),
        tooltipCandidateCount: z.number(),
        tooltipScore: z.number(),
      }),
    ),
  }),
});
