import { buildLevels } from "@/lib/planner/catalog/level-builders";
import type {
  BuildingDefinition,
  BuildingPrerequisite,
  ResourceAmounts,
} from "@/lib/planner/catalog/types";

const warehouseCapacity = [
  0, 1_200, 1_700, 2_300, 3_100, 4_000, 5_000, 6_300, 7_800, 9_600, 11_800,
  14_400, 17_600, 21_400, 25_900, 31_300, 37_900, 45_700, 55_100, 66_400,
  80_000,
];

const makeBuilding = (input: {
  gid: number;
  name: string;
  maxLevel?: number;
  baseCost: ResourceAmounts;
  prerequisites?: BuildingPrerequisite[];
  slotKind?: BuildingDefinition["slotKind"];
  tribeIds?: number[];
  costGrowth?: number;
  baseDurationSeconds?: number;
  durationGrowth?: number;
  populationDelta?: number | ((level: number) => number);
  culturePointsDelta?: number | ((level: number) => number);
  effect?: Parameters<typeof buildLevels>[0]["effect"];
  aliases?: string[];
  notes?: string;
}): BuildingDefinition => ({
  gid: input.gid,
  name: input.name,
  aliases: input.aliases,
  maxLevel: input.maxLevel ?? 20,
  slotKind: input.slotKind ?? "normal",
  tribeIds: input.tribeIds,
  prerequisites: input.prerequisites ?? [],
  notes: input.notes,
  levels: buildLevels({
    maxLevel: input.maxLevel ?? 20,
    baseCost: input.baseCost,
    costGrowth: input.costGrowth,
    baseDurationSeconds: input.baseDurationSeconds,
    durationGrowth: input.durationGrowth,
    populationDelta: input.populationDelta,
    culturePointsDelta: input.culturePointsDelta,
    effect: input.effect,
  }),
});

const mainBuilding = { gid: 15, minimumLevel: 1 };
const rallyPoint = { gid: 16, minimumLevel: 1 };

/**
 * Catálogo estático de edificios internos por gid.
 * Incluye edificios comunes, especiales por tribu y entradas heredadas que
 * pueden aparecer en snapshots de mundos distintos. Jorge podrá corregir
 * valores concretos aquí sin tocar servicios ni simulador.
 */
export const buildingDefinitions: BuildingDefinition[] = [
  makeBuilding({ gid: 5, name: "Sawmill", maxLevel: 5, baseCost: { wood: 520, clay: 380, iron: 290, crop: 90 }, prerequisites: [{ gid: 1, minimumLevel: 10 }, { gid: 15, minimumLevel: 5 }] }),
  makeBuilding({ gid: 6, name: "Brickyard", maxLevel: 5, baseCost: { wood: 440, clay: 480, iron: 320, crop: 50 }, prerequisites: [{ gid: 2, minimumLevel: 10 }, { gid: 15, minimumLevel: 5 }] }),
  makeBuilding({ gid: 7, name: "Iron Foundry", maxLevel: 5, baseCost: { wood: 200, clay: 450, iron: 510, crop: 120 }, prerequisites: [{ gid: 3, minimumLevel: 10 }, { gid: 15, minimumLevel: 5 }] }),
  makeBuilding({ gid: 8, name: "Grain Mill", maxLevel: 5, baseCost: { wood: 500, clay: 440, iron: 380, crop: 1240 }, prerequisites: [{ gid: 4, minimumLevel: 5 }] }),
  makeBuilding({ gid: 9, name: "Bakery", maxLevel: 5, baseCost: { wood: 1200, clay: 1480, iron: 870, crop: 1600 }, prerequisites: [{ gid: 4, minimumLevel: 10 }, { gid: 8, minimumLevel: 5 }, { gid: 15, minimumLevel: 5 }] }),
  makeBuilding({ gid: 10, name: "Warehouse", baseCost: { wood: 130, clay: 160, iron: 90, crop: 40 }, prerequisites: [mainBuilding], effect: (level) => ({ warehouseCapacity: warehouseCapacity[level] }) }),
  makeBuilding({ gid: 11, name: "Granary", baseCost: { wood: 80, clay: 100, iron: 70, crop: 20 }, prerequisites: [mainBuilding], effect: (level) => ({ granaryCapacity: warehouseCapacity[level] }) }),
  makeBuilding({ gid: 12, name: "Smithy", baseCost: { wood: 170, clay: 200, iron: 380, crop: 130 }, prerequisites: [{ gid: 15, minimumLevel: 3 }, { gid: 22, minimumLevel: 1 }] }),
  makeBuilding({ gid: 13, name: "Armoury (legacy)", baseCost: { wood: 130, clay: 210, iron: 410, crop: 130 }, prerequisites: [{ gid: 15, minimumLevel: 3 }, { gid: 22, minimumLevel: 1 }], notes: "Entrada heredada para snapshots de versiones antiguas." }),
  makeBuilding({ gid: 14, name: "Tournament Square", baseCost: { wood: 1750, clay: 2250, iron: 1530, crop: 240 }, prerequisites: [{ gid: 16, minimumLevel: 15 }] }),
  makeBuilding({ gid: 15, name: "Main Building", baseCost: { wood: 70, clay: 40, iron: 60, crop: 20 }, prerequisites: [] }),
  makeBuilding({ gid: 16, name: "Rally Point", baseCost: { wood: 110, clay: 160, iron: 90, crop: 70 }, prerequisites: [mainBuilding], slotKind: "rallyPoint" }),
  makeBuilding({ gid: 17, name: "Marketplace", baseCost: { wood: 80, clay: 70, iron: 120, crop: 70 }, prerequisites: [{ gid: 15, minimumLevel: 3 }, { gid: 10, minimumLevel: 1 }, { gid: 11, minimumLevel: 1 }] }),
  makeBuilding({ gid: 18, name: "Embassy", baseCost: { wood: 180, clay: 130, iron: 150, crop: 80 }, prerequisites: [mainBuilding] }),
  makeBuilding({ gid: 19, name: "Barracks", baseCost: { wood: 210, clay: 140, iron: 260, crop: 120 }, prerequisites: [{ gid: 15, minimumLevel: 3 }, rallyPoint] }),
  makeBuilding({ gid: 20, name: "Stable", baseCost: { wood: 260, clay: 140, iron: 220, crop: 100 }, prerequisites: [{ gid: 22, minimumLevel: 5 }, { gid: 12, minimumLevel: 3 }] }),
  makeBuilding({ gid: 21, name: "Workshop", baseCost: { wood: 460, clay: 510, iron: 600, crop: 320 }, prerequisites: [{ gid: 22, minimumLevel: 10 }, { gid: 15, minimumLevel: 5 }] }),
  makeBuilding({ gid: 22, name: "Academy", baseCost: { wood: 220, clay: 160, iron: 90, crop: 40 }, prerequisites: [{ gid: 19, minimumLevel: 3 }, { gid: 15, minimumLevel: 3 }] }),
  makeBuilding({ gid: 23, name: "Cranny", maxLevel: 10, baseCost: { wood: 40, clay: 50, iron: 30, crop: 10 }, prerequisites: [mainBuilding] }),
  makeBuilding({ gid: 24, name: "Town Hall", baseCost: { wood: 1250, clay: 1110, iron: 1260, crop: 600 }, prerequisites: [{ gid: 15, minimumLevel: 10 }, { gid: 22, minimumLevel: 10 }] }),
  makeBuilding({ gid: 25, name: "Residence", baseCost: { wood: 580, clay: 460, iron: 350, crop: 180 }, prerequisites: [{ gid: 15, minimumLevel: 5 }] }),
  makeBuilding({ gid: 26, name: "Palace", baseCost: { wood: 550, clay: 800, iron: 750, crop: 250 }, prerequisites: [{ gid: 18, minimumLevel: 1 }, { gid: 15, minimumLevel: 5 }] }),
  makeBuilding({ gid: 27, name: "Treasury", baseCost: { wood: 2880, clay: 2740, iron: 2580, crop: 990 }, prerequisites: [{ gid: 15, minimumLevel: 10 }] }),
  makeBuilding({ gid: 28, name: "Trade Office", baseCost: { wood: 1400, clay: 1330, iron: 1200, crop: 400 }, prerequisites: [{ gid: 17, minimumLevel: 20 }, { gid: 20, minimumLevel: 10 }] }),
  makeBuilding({ gid: 29, name: "Great Barracks", baseCost: { wood: 630, clay: 420, iron: 780, crop: 360 }, prerequisites: [{ gid: 19, minimumLevel: 20 }], notes: "Normalmente restringido a capitales especiales o artefactos según mundo." }),
  makeBuilding({ gid: 30, name: "Great Stable", baseCost: { wood: 780, clay: 420, iron: 660, crop: 300 }, prerequisites: [{ gid: 20, minimumLevel: 20 }], notes: "Normalmente restringido a capitales especiales o artefactos según mundo." }),
  makeBuilding({ gid: 31, name: "City Wall", baseCost: { wood: 70, clay: 90, iron: 170, crop: 70 }, prerequisites: [rallyPoint], slotKind: "wall", tribeIds: [1] }),
  makeBuilding({ gid: 32, name: "Earth Wall", baseCost: { wood: 120, clay: 200, iron: 0, crop: 80 }, prerequisites: [rallyPoint], slotKind: "wall", tribeIds: [2] }),
  makeBuilding({ gid: 33, name: "Palisade", baseCost: { wood: 160, clay: 100, iron: 80, crop: 60 }, prerequisites: [rallyPoint], slotKind: "wall", tribeIds: [3] }),
  makeBuilding({ gid: 34, name: "Stonemason's Lodge", baseCost: { wood: 155, clay: 130, iron: 125, crop: 70 }, prerequisites: [{ gid: 15, minimumLevel: 5 }], notes: "Solo capital." }),
  makeBuilding({ gid: 35, name: "Brewery", baseCost: { wood: 1460, clay: 930, iron: 1250, crop: 1740 }, prerequisites: [{ gid: 11, minimumLevel: 20 }, rallyPoint], tribeIds: [2] }),
  makeBuilding({ gid: 36, name: "Trapper", baseCost: { wood: 100, clay: 100, iron: 100, crop: 100 }, prerequisites: [rallyPoint], tribeIds: [3] }),
  makeBuilding({ gid: 37, name: "Hero's Mansion", baseCost: { wood: 700, clay: 670, iron: 700, crop: 240 }, prerequisites: [{ gid: 15, minimumLevel: 3 }, rallyPoint] }),
  makeBuilding({ gid: 38, name: "Great Warehouse", baseCost: { wood: 650, clay: 800, iron: 450, crop: 200 }, prerequisites: [{ gid: 15, minimumLevel: 10 }], effect: (level) => ({ warehouseCapacity: (warehouseCapacity[level] ?? 0) * 3 }) }),
  makeBuilding({ gid: 39, name: "Great Granary", baseCost: { wood: 400, clay: 500, iron: 350, crop: 100 }, prerequisites: [{ gid: 15, minimumLevel: 10 }], effect: (level) => ({ granaryCapacity: (warehouseCapacity[level] ?? 0) * 3 }) }),
  makeBuilding({ gid: 40, name: "Wonder of the World", maxLevel: 100, baseCost: { wood: 66700, clay: 69050, iron: 72200, crop: 13200 }, prerequisites: [], costGrowth: 1.027, durationGrowth: 1.014, notes: "Solo aldeas Natar especiales." }),
  makeBuilding({ gid: 41, name: "Horse Drinking Trough", baseCost: { wood: 780, clay: 420, iron: 660, crop: 540 }, prerequisites: [{ gid: 20, minimumLevel: 20 }, rallyPoint], tribeIds: [1] }),
  makeBuilding({ gid: 42, name: "Stone Wall", baseCost: { wood: 110, clay: 160, iron: 70, crop: 60 }, prerequisites: [rallyPoint], slotKind: "wall", tribeIds: [6] }),
  makeBuilding({ gid: 43, name: "Makeshift Wall", baseCost: { wood: 50, clay: 80, iron: 40, crop: 30 }, prerequisites: [rallyPoint], slotKind: "wall", tribeIds: [7] }),
  makeBuilding({ gid: 44, name: "Command Center", baseCost: { wood: 1600, clay: 1250, iron: 1050, crop: 200 }, prerequisites: [{ gid: 15, minimumLevel: 5 }], tribeIds: [7] }),
  makeBuilding({ gid: 45, name: "Waterworks", baseCost: { wood: 910, clay: 945, iron: 910, crop: 340 }, prerequisites: [{ gid: 37, minimumLevel: 10 }], tribeIds: [6] }),
  makeBuilding({ gid: 46, name: "Hospital", baseCost: { wood: 320, clay: 280, iron: 420, crop: 360 }, prerequisites: [{ gid: 22, minimumLevel: 15 }, { gid: 15, minimumLevel: 10 }] }),
  makeBuilding({ gid: 47, name: "Great Workshop", baseCost: { wood: 1380, clay: 1530, iron: 1800, crop: 960 }, prerequisites: [{ gid: 21, minimumLevel: 20 }], notes: "Entrada incluida para mundos o variantes que la expongan." }),
];
