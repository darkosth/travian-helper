export type ResourceType = "wood" | "clay" | "iron" | "crop";

export type ResourceAmounts = Record<ResourceType, number>;
export type ProductionAmounts = ResourceAmounts;

export type PlannerSlotKind =
  | "resourceField"
  | "normal"
  | "rallyPoint"
  | "wall";

export type LevelEffect = {
  productionPerHour?: number;
  warehouseCapacity?: number;
  granaryCapacity?: number;
  mainBuildingTimeFactor?: number;
};

export type LevelDefinition = {
  level: number;
  cost: ResourceAmounts;
  baseDurationSeconds: number;
  populationDelta: number;
  culturePointsDelta: number;
  effect?: LevelEffect;
};

export type BuildingPrerequisite = {
  gid: number;
  minimumLevel: number;
};

export type BuildingDefinition = {
  gid: number;
  name: string;
  aliases?: string[];
  maxLevel: number;
  slotKind: PlannerSlotKind;
  tribeIds?: number[];
  prerequisites: BuildingPrerequisite[];
  levels: LevelDefinition[];
  notes?: string;
};

export type CatalogDefinition = BuildingDefinition;
