import {
  getCatalogLevel,
  getMainBuildingTimeFactor,
  normalizeServerSpeed,
  type ResourceAmounts,
} from "@/lib/planner/catalog";
import {
  accrueResources,
  subtractResources,
} from "@/lib/planner/simulator/accrue-resources";
import type {
  PlannerStep,
  SimulatedStep,
  SimulationState,
} from "@/lib/planner/simulator/types";
import {
  getCurrentStepLevel,
  validateStep,
} from "@/lib/planner/simulator/validate-step";

const RESOURCE_TYPES = ["wood", "clay", "iron", "crop"] as const;

const cloneAmounts = (amounts: ResourceAmounts): ResourceAmounts => ({ ...amounts });

const getWaitForResourcesSeconds = (
  state: SimulationState,
  cost: ResourceAmounts,
): number | null => {
  let longestWait = 0;

  for (const resourceType of RESOURCE_TYPES) {
    const missing = Math.max(0, cost[resourceType] - state.resources[resourceType]);
    if (missing === 0) {
      continue;
    }

    const productionPerHour = state.productionPerHour[resourceType];
    if (productionPerHour <= 0) {
      return null;
    }

    longestWait = Math.max(longestWait, (missing / productionPerHour) * 3600);
  }

  return Math.ceil(longestWait);
};

const applyCompletedEffect = (
  state: SimulationState,
  step: PlannerStep,
): SimulationState => {
  const next = structuredClone(state);
  const nextLevel = getCatalogLevel(step.gid, step.targetLevel);
  if (!nextLevel) {
    return next;
  }

  const previousLevel = getCurrentStepLevel(state, step);
  const previousDefinition = previousLevel > 0 ? getCatalogLevel(step.gid, previousLevel) : null;

  if (step.kind === "resourceField") {
    next.resourceFields[step.slot] = { gid: step.gid, level: step.targetLevel };
    const beforeProduction = previousDefinition?.effect?.productionPerHour ?? 0;
    const afterProduction = nextLevel.effect?.productionPerHour ?? beforeProduction;
    const resourceType =
      step.gid === 1 ? "wood" : step.gid === 2 ? "clay" : step.gid === 3 ? "iron" : "crop";
    next.productionPerHour[resourceType] += afterProduction - beforeProduction;
  } else {
    next.buildings[step.slot] = { gid: step.gid, level: step.targetLevel };

    const warehouseBefore = previousDefinition?.effect?.warehouseCapacity ?? 0;
    const warehouseAfter = nextLevel.effect?.warehouseCapacity ?? warehouseBefore;
    if (warehouseAfter > 0) {
      // El primer almacén reemplaza la capacidad base de la aldea; un segundo
      // almacén sí aporta capacidad adicional. Los upgrades suman solo el delta.
      const hasOtherWarehouse = Object.entries(state.buildings).some(
        ([slot, building]) => Number(slot) !== step.slot && [10, 38].includes(building.gid),
      );
      next.capacity.warehouse =
        previousLevel === 0 && !hasOtherWarehouse
          ? Math.max(next.capacity.warehouse, warehouseAfter)
          : next.capacity.warehouse + (warehouseAfter - warehouseBefore);
    }

    const granaryBefore = previousDefinition?.effect?.granaryCapacity ?? 0;
    const granaryAfter = nextLevel.effect?.granaryCapacity ?? granaryBefore;
    if (granaryAfter > 0) {
      const hasOtherGranary = Object.entries(state.buildings).some(
        ([slot, building]) => Number(slot) !== step.slot && [11, 39].includes(building.gid),
      );
      next.capacity.granary =
        previousLevel === 0 && !hasOtherGranary
          ? Math.max(next.capacity.granary, granaryAfter)
          : next.capacity.granary + (granaryAfter - granaryBefore);
    }

    if (step.gid === 15) {
      next.mainBuildingLevel = step.targetLevel;
    }
  }

  next.population += nextLevel.populationDelta;
  next.freeCrop -= nextLevel.populationDelta;
  return next;
};

const blockedResult = (
  state: SimulationState,
  step: PlannerStep,
  status: SimulatedStep["status"],
  message: string,
): { state: SimulationState; result: SimulatedStep } => ({
  state,
  result: {
    step,
    status,
    waitForResourcesSeconds: 0,
    buildDurationSeconds: 0,
    startsAtSeconds: state.elapsedSeconds,
    finishesAtSeconds: state.elapsedSeconds,
    resourcesBefore: cloneAmounts(state.resources),
    resourcesAfter: cloneAmounts(state.resources),
    productionBefore: cloneAmounts(state.productionPerHour),
    productionAfter: cloneAmounts(state.productionPerHour),
    message,
  },
});

export const simulateStep = (
  state: SimulationState,
  step: PlannerStep,
  serverSpeed = 1,
): { state: SimulationState; result: SimulatedStep } => {
  const validation = validateStep(state, step);
  if (!validation.valid) {
    return blockedResult(
      state,
      step,
      validation.status,
      validation.message ?? "Paso inválido.",
    );
  }

  if (validation.status === "skipped") {
    return blockedResult(state, step, "skipped", validation.message ?? "Paso ya cumplido.");
  }

  const target = getCatalogLevel(step.gid, step.targetLevel);
  if (!target) {
    return blockedResult(state, step, "missing-catalog", `Falta gid ${step.gid}.`);
  }

  const waitForResourcesSeconds = getWaitForResourcesSeconds(state, target.cost);
  if (waitForResourcesSeconds === null) {
    return blockedResult(
      state,
      step,
      "blocked-resources",
      "La producción actual nunca alcanzará los recursos necesarios.",
    );
  }

  const resourcesBefore = cloneAmounts(state.resources);
  const productionBefore = cloneAmounts(state.productionPerHour);
  const afterWait = accrueResources(state, waitForResourcesSeconds);
  const afterCost = subtractResources(afterWait, target.cost);
  const startsAtSeconds = afterCost.elapsedSeconds;
  const buildDurationSeconds = Math.max(
    1,
    Math.ceil(
      (target.baseDurationSeconds * getMainBuildingTimeFactor(state.mainBuildingLevel)) /
        normalizeServerSpeed(serverSpeed),
    ),
  );
  const afterBuildTime = accrueResources(afterCost, buildDurationSeconds);
  const afterEffect = applyCompletedEffect(afterBuildTime, step);
  afterEffect.workerAvailableAtSeconds = afterEffect.elapsedSeconds;

  return {
    state: afterEffect,
    result: {
      step,
      status: "valid",
      waitForResourcesSeconds,
      buildDurationSeconds,
      startsAtSeconds,
      finishesAtSeconds: afterEffect.elapsedSeconds,
      resourcesBefore,
      resourcesAfter: cloneAmounts(afterEffect.resources),
      productionBefore,
      productionAfter: cloneAmounts(afterEffect.productionPerHour),
      message: null,
    },
  };
};
