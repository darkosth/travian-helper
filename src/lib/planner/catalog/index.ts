import { buildingDefinitions } from "@/lib/planner/catalog/buildings";
import { resourceFieldDefinitions } from "@/lib/planner/catalog/resource-fields";
import type {
  BuildingDefinition,
  LevelDefinition,
} from "@/lib/planner/catalog/types";

export * from "@/lib/planner/catalog/types";
export * from "@/lib/planner/catalog/server-speeds";
export * from "@/lib/planner/catalog/main-building-time";
export * from "@/lib/planner/catalog/display-names";
export * from "@/lib/planner/catalog/resource-field-layouts";

export const plannerCatalog: BuildingDefinition[] = [
  ...resourceFieldDefinitions,
  ...buildingDefinitions,
];

const byGid = new Map(plannerCatalog.map((definition) => [definition.gid, definition]));

export const getCatalogDefinition = (gid: number) => byGid.get(gid) ?? null;

/**
 * Algunos edificios tienen una posición automática conocida.
 * El Edificio principal comienza en el slot 26, pero puede reconstruirse en
 * otro espacio si fue destruido. La Plaza de reuniones y la muralla sí usan
 * posiciones reservadas que no deben editarse manualmente.
 */
export const getAutomaticSlotForDefinition = (
  definition: Pick<BuildingDefinition, "gid" | "slotKind">,
): number | null => {
  if (definition.gid === 15) return 26; // Posición inicial del Edificio principal
  if (definition.slotKind === "rallyPoint") return 39;
  if (definition.slotKind === "wall") return 40;
  return null;
};

export const getAutomaticSlotForGid = (gid: number): number | null => {
  const definition = getCatalogDefinition(gid);
  return definition ? getAutomaticSlotForDefinition(definition) : null;
};

export const isLockedSlotForDefinition = (
  definition: Pick<BuildingDefinition, "slotKind">,
) => definition.slotKind === "rallyPoint" || definition.slotKind === "wall";

export const isLockedSlotForGid = (gid: number) => {
  const definition = getCatalogDefinition(gid);
  return definition ? isLockedSlotForDefinition(definition) : false;
};

export const getCatalogLevel = (
  gid: number,
  level: number,
): LevelDefinition | null =>
  getCatalogDefinition(gid)?.levels.find((entry) => entry.level === level) ?? null;

export const assertCatalogLevel = (gid: number, level: number) => {
  const definition = getCatalogDefinition(gid);
  if (!definition) {
    throw new Error(`Planner catalog is missing gid ${gid}.`);
  }

  const levelDefinition = definition.levels.find((entry) => entry.level === level);
  if (!levelDefinition) {
    throw new Error(`${definition.name} has no catalog row for level ${level}.`);
  }

  return { definition, levelDefinition };
};
