import {
  getCatalogDefinition,
  getCatalogLevel,
  getCatalogDisplayName,
} from "@/lib/planner/catalog";
import type {
  PlannerStep,
  SimulatedStepStatus,
  SimulationState,
} from "@/lib/planner/simulator/types";

export type StepValidationResult = {
  valid: boolean;
  status: SimulatedStepStatus;
  message: string | null;
  currentLevel: number;
};

export const getCurrentStepLevel = (
  state: SimulationState,
  step: PlannerStep,
) => {
  if (step.kind === "resourceField") {
    return state.resourceFields[step.slot]?.level ?? 0;
  }

  const building = state.buildings[step.slot];
  if (!building || building.gid !== step.gid) {
    return 0;
  }
  return building.level;
};

const getHighestBuildingLevel = (state: SimulationState, gid: number) =>
  Object.values(state.buildings)
    .filter((building) => building.gid === gid)
    .reduce((highest, building) => Math.max(highest, building.level), 0);

export const validateStep = (
  state: SimulationState,
  step: PlannerStep,
): StepValidationResult => {
  const definition = getCatalogDefinition(step.gid);
  if (!definition) {
    return {
      valid: false,
      status: "missing-catalog",
      message: `El catálogo no contiene gid ${step.gid}.`,
      currentLevel: 0,
    };
  }

  const displayName = getCatalogDisplayName(step.gid, definition.name);
  const target = getCatalogLevel(step.gid, step.targetLevel);
  if (!target) {
    return {
      valid: false,
      status: "invalid-level",
      message: `${displayName} no tiene nivel ${step.targetLevel} en el catálogo.`,
      currentLevel: getCurrentStepLevel(state, step),
    };
  }

  const currentLevel = getCurrentStepLevel(state, step);
  if (currentLevel >= step.targetLevel) {
    return {
      valid: true,
      status: "skipped",
      message: `${displayName} ya cumple nivel ${step.targetLevel}.`,
      currentLevel,
    };
  }

  if (step.targetLevel !== currentLevel + 1) {
    return {
      valid: false,
      status: "invalid-level",
      message: `${displayName} esperaba ${currentLevel} → ${currentLevel + 1}, pero el plan pide nivel ${step.targetLevel}.`,
      currentLevel,
    };
  }

  if (step.kind === "building" && step.action === "construct" && currentLevel !== 0) {
    return {
      valid: false,
      status: "invalid-level",
      message: `${displayName} ya existe en el slot ${step.slot}; no se puede construir como nuevo.`,
      currentLevel,
    };
  }

  if (step.kind === "building" && step.action === "upgrade" && currentLevel === 0) {
    return {
      valid: false,
      status: "invalid-level",
      message: `${displayName} no existe en el slot ${step.slot}; la fila debe ser construct.`,
      currentLevel,
    };
  }

  const missingPrerequisite = definition.prerequisites.find(
    (requirement) =>
      getHighestBuildingLevel(state, requirement.gid) < requirement.minimumLevel,
  );
  if (missingPrerequisite) {
    return {
      valid: false,
      status: "blocked-prerequisite",
      message: `${displayName} requiere ${getCatalogDisplayName(missingPrerequisite.gid)} nivel ${missingPrerequisite.minimumLevel}.`,
      currentLevel,
    };
  }

  if (
    target.cost.wood > state.capacity.warehouse ||
    target.cost.clay > state.capacity.warehouse ||
    target.cost.iron > state.capacity.warehouse ||
    target.cost.crop > state.capacity.granary
  ) {
    return {
      valid: false,
      status: "blocked-capacity",
      message: `${displayName} ${currentLevel} → ${step.targetLevel} supera la capacidad simulada de almacén o granero.`,
      currentLevel,
    };
  }

  return { valid: true, status: "valid", message: null, currentLevel };
};
