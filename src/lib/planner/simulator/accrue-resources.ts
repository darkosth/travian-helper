import type { ResourceAmounts } from "@/lib/planner/catalog";
import type { SimulationState } from "@/lib/planner/simulator/types";

const RESOURCE_TYPES = ["wood", "clay", "iron", "crop"] as const;

const getCapacity = (
  resourceType: (typeof RESOURCE_TYPES)[number],
  state: SimulationState,
) => (resourceType === "crop" ? state.capacity.granary : state.capacity.warehouse);

/** Acumula recursos respetando la capacidad máxima del snapshot simulado. */
export const accrueResources = (
  state: SimulationState,
  seconds: number,
): SimulationState => {
  if (seconds <= 0) {
    return structuredClone(state);
  }

  const next = structuredClone(state);
  for (const resourceType of RESOURCE_TYPES) {
    const generated = (next.productionPerHour[resourceType] * seconds) / 3600;
    next.resources[resourceType] = Math.min(
      getCapacity(resourceType, next),
      next.resources[resourceType] + generated,
    );
  }

  next.elapsedSeconds += seconds;
  return next;
};

export const subtractResources = (
  state: SimulationState,
  cost: ResourceAmounts,
): SimulationState => {
  const next = structuredClone(state);
  for (const resourceType of RESOURCE_TYPES) {
    next.resources[resourceType] -= cost[resourceType];
  }
  return next;
};
