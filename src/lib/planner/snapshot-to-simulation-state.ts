import type {
  ProductionAmounts,
  ResourceAmounts,
} from "@/lib/planner/catalog";
import type { SimulationState } from "@/lib/planner/simulator";

export type PlannerSnapshotLike = {
  population: number | null;
  freeCrop: number | null;
  resources: Array<{
    type: string;
    amount: number | null;
    productionPerHour: number | null;
    capacity: number | null;
  }>;
  resourceFields: Array<{
    slot: number;
    gid: number;
    level: number | null;
  }>;
  buildings: Array<{
    slot: number;
    gid: number;
    level: number | null;
    isEmpty: boolean;
  }>;
};

const emptyAmounts = (): ResourceAmounts => ({ wood: 0, clay: 0, iron: 0, crop: 0 });

const normalizeResourceType = (value: string): keyof ResourceAmounts | null => {
  const normalized = value.toLowerCase();
  if (normalized.includes("wood") || normalized.includes("madera")) return "wood";
  if (normalized.includes("clay") || normalized.includes("barro") || normalized.includes("arcilla")) return "clay";
  if (normalized.includes("iron") || normalized.includes("hierro")) return "iron";
  if (normalized.includes("crop") || normalized.includes("cereal") || normalized.includes("trigo")) return "crop";
  return null;
};

export const snapshotToSimulationState = (
  snapshot: PlannerSnapshotLike,
): SimulationState => {
  const resources = emptyAmounts();
  const productionPerHour: ProductionAmounts = emptyAmounts();
  let warehouse = 800;
  let granary = 800;

  for (const resource of snapshot.resources) {
    const type = normalizeResourceType(resource.type);
    if (!type) continue;
    resources[type] = resource.amount ?? 0;
    productionPerHour[type] = resource.productionPerHour ?? 0;
    if (type === "crop") {
      granary = resource.capacity ?? granary;
    } else {
      warehouse = Math.max(warehouse, resource.capacity ?? warehouse);
    }
  }

  const resourceFields = Object.fromEntries(
    snapshot.resourceFields.map((field) => [
      field.slot,
      { gid: field.gid, level: field.level ?? 0 },
    ]),
  );
  const buildings = Object.fromEntries(
    snapshot.buildings
      .filter((building) => !building.isEmpty && (building.level ?? 0) > 0)
      .map((building) => [
        building.slot,
        { gid: building.gid, level: building.level ?? 0 },
      ]),
  );
  const mainBuilding = Object.values(buildings).find((building) => building.gid === 15);

  return {
    elapsedSeconds: 0,
    resources,
    productionPerHour,
    capacity: { warehouse, granary },
    freeCrop: snapshot.freeCrop ?? 0,
    population: snapshot.population ?? 0,
    resourceFields,
    buildings,
    mainBuildingLevel: mainBuilding?.level ?? 0,
    workerAvailableAtSeconds: 0,
  };
};
