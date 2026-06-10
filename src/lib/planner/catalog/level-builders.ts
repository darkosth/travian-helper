import type {
  LevelDefinition,
  LevelEffect,
  ResourceAmounts,
} from "@/lib/planner/catalog/types";

const roundToFive = (value: number) => Math.max(0, Math.round(value / 5) * 5);

const scaleResources = (
  resources: ResourceAmounts,
  factor: number,
): ResourceAmounts => ({
  wood: roundToFive(resources.wood * factor),
  clay: roundToFive(resources.clay * factor),
  iron: roundToFive(resources.iron * factor),
  crop: roundToFive(resources.crop * factor),
});

export type LevelBuilderSeed = {
  maxLevel: number;
  baseCost: ResourceAmounts;
  costGrowth?: number;
  baseDurationSeconds?: number;
  durationGrowth?: number;
  populationDelta?: number | ((level: number) => number);
  culturePointsDelta?: number | ((level: number) => number);
  effect?: (level: number) => LevelEffect | undefined;
};

/**
 * Genera las filas estáticas del catálogo desde una semilla versionada.
 * La intención es que toda corrección futura ocurra en catalog/, no en el simulador.
 */
export const buildLevels = (seed: LevelBuilderSeed): LevelDefinition[] => {
  const costGrowth = seed.costGrowth ?? 1.28;
  const durationGrowth = seed.durationGrowth ?? 1.16;
  const baseDurationSeconds = seed.baseDurationSeconds ?? 180;

  return Array.from({ length: seed.maxLevel }, (_, index) => {
    const level = index + 1;
    const populationDelta =
      typeof seed.populationDelta === "function"
        ? seed.populationDelta(level)
        : seed.populationDelta ?? 1;
    const culturePointsDelta =
      typeof seed.culturePointsDelta === "function"
        ? seed.culturePointsDelta(level)
        : seed.culturePointsDelta ?? Math.max(1, Math.floor(level / 2));

    return {
      level,
      cost: scaleResources(seed.baseCost, costGrowth ** index),
      baseDurationSeconds: Math.max(
        1,
        Math.round(baseDurationSeconds * durationGrowth ** index),
      ),
      populationDelta,
      culturePointsDelta,
      effect: seed.effect?.(level),
    };
  });
};

export const zeroResources = (): ResourceAmounts => ({
  wood: 0,
  clay: 0,
  iron: 0,
  crop: 0,
});
