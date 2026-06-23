import type {
  ProductionAmounts,
  ResourceAmounts,
} from "@/lib/planner/catalog";

export type PlannerStage = 1 | 2 | 3;
export type PlannerStepKind = "resourceField" | "building";
export type PlannerStepAction = "upgrade" | "construct";

export type PlannerStep = {
  id: string;
  position: number;
  stage: PlannerStage;
  kind: PlannerStepKind;
  action: PlannerStepAction;
  slot: number;
  gid: number;
  targetLevel: number;
};

export type SimulatedResourceField = {
  gid: number;
  level: number;
};

export type SimulatedBuilding = {
  gid: number;
  level: number;
};

export type SimulationState = {
  elapsedSeconds: number;
  resources: ResourceAmounts;
  productionPerHour: ProductionAmounts;
  capacity: {
    warehouse: number;
    granary: number;
  };
  freeCrop: number;
  population: number;
  resourceFields: Record<number, SimulatedResourceField>;
  buildings: Record<number, SimulatedBuilding>;
  mainBuildingLevel: number;
  workerAvailableAtSeconds: number;
};

export type SimulatedStepStatus =
  | "valid"
  | "skipped"
  | "blocked-capacity"
  | "blocked-prerequisite"
  | "blocked-resources"
  | "invalid-level"
  | "missing-catalog";

export type SimulatedStep = {
  step: PlannerStep;
  status: SimulatedStepStatus;
  waitForResourcesSeconds: number;
  buildDurationSeconds: number;
  missingResources: ResourceAmounts;
  startsAtSeconds: number;
  finishesAtSeconds: number;
  resourcesBefore: ResourceAmounts;
  resourcesAfter: ResourceAmounts;
  productionBefore: ProductionAmounts;
  productionAfter: ProductionAmounts;
  message: string | null;
};

export type SimulatePlanResult = {
  valid: boolean;
  steps: SimulatedStep[];
  initialState: SimulationState;
  finalState: SimulationState;
  totalElapsedSeconds: number;
  firstBlockingStep: SimulatedStep | null;
};
