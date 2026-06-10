import { buildLevels } from "@/lib/planner/catalog/level-builders";
import type { BuildingDefinition } from "@/lib/planner/catalog/types";

const standardProduction = [
  0, 2, 5, 9, 15, 22, 33, 50, 70, 100, 145, 200, 280, 375, 495, 635,
  800, 1_000, 1_300, 1_600, 2_000,
];

const productionAt = (level: number) => standardProduction[level] ?? 0;

const makeResourceField = (input: {
  gid: number;
  name: string;
  baseCost: { wood: number; clay: number; iron: number; crop: number };
  baseDurationSeconds: number;
}): BuildingDefinition => ({
  gid: input.gid,
  name: input.name,
  maxLevel: 20,
  slotKind: "resourceField",
  prerequisites: [],
  levels: buildLevels({
    maxLevel: 20,
    baseCost: input.baseCost,
    costGrowth: 1.67,
    baseDurationSeconds: input.baseDurationSeconds,
    durationGrowth: 1.2,
    populationDelta: (level) => (level <= 5 ? 1 : level <= 10 ? 2 : 3),
    culturePointsDelta: 0,
    effect: (level) => ({ productionPerHour: productionAt(level) }),
  }),
});

/**
 * Campos de recurso del mapa exterior. Los valores están centralizados aquí para
 * que puedan ajustarse sin cambiar ninguna regla del simulador.
 */
export const resourceFieldDefinitions: BuildingDefinition[] = [
  makeResourceField({
    gid: 1,
    name: "Woodcutter",
    baseCost: { wood: 40, clay: 100, iron: 50, crop: 60 },
    baseDurationSeconds: 150,
  }),
  makeResourceField({
    gid: 2,
    name: "Clay Pit",
    baseCost: { wood: 80, clay: 40, iron: 80, crop: 50 },
    baseDurationSeconds: 150,
  }),
  makeResourceField({
    gid: 3,
    name: "Iron Mine",
    baseCost: { wood: 100, clay: 80, iron: 30, crop: 60 },
    baseDurationSeconds: 150,
  }),
  makeResourceField({
    gid: 4,
    name: "Cropland",
    baseCost: { wood: 70, clay: 90, iron: 70, crop: 20 },
    baseDurationSeconds: 150,
  }),
];
