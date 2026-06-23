import {
  STANDARD_4446_RESOURCE_FIELD_LAYOUT,
  supportedServerSpeeds,
  type ServerSpeed,
} from "@/lib/planner/catalog";
import type { SimulationState } from "@/lib/planner/simulator";

export type InitialStateProfiles = Record<ServerSpeed, SimulationState>;

type SlotState = {
  gid: number;
  level: number;
};

type SlotStateRecord = Record<number, SlotState>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toNonNegativeNumber = (value: unknown, fallback: number) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const toNonNegativeInteger = (value: unknown, fallback: number) =>
  Math.floor(toNonNegativeNumber(value, fallback));

const createInitialResourceFields = (): SimulationState["resourceFields"] =>
  Object.fromEntries(
    STANDARD_4446_RESOURCE_FIELD_LAYOUT.map(({ slot, gid }) => [
      slot,
      { gid, level: 0 },
    ]),
  );

/**
 * Perfil base de una aldea inicial.
 *
 * IMPORTANTE: productionPerHour siempre representa la producción base x1.
 * La producción efectiva se deriva al simular según la velocidad del servidor.
 */
export const createDefaultInitialSimulationState = (): SimulationState => ({
  elapsedSeconds: 0,
  resources: { wood: 750, clay: 750, iron: 750, crop: 750 },
  productionPerHour: { wood: 58, clay: 52, iron: 48, crop: 56 },
  capacity: { warehouse: 800, granary: 800 },
  freeCrop: 20,
  population: 8,
  resourceFields: createInitialResourceFields(),
  buildings: {
    26: { gid: 15, level: 1 },
    39: { gid: 16, level: 1 },
    1: { gid: 1, level: 2 },
    2: { gid: 4, level: 2 },
    5: { gid: 2, level: 1 },
  },
  mainBuildingLevel: 1,
  workerAvailableAtSeconds: 0,
});

export const cloneSimulationState = (state: SimulationState): SimulationState => ({
  ...state,
  resources: { ...state.resources },
  productionPerHour: { ...state.productionPerHour },
  capacity: { ...state.capacity },
  resourceFields: Object.fromEntries(
    Object.entries(state.resourceFields).map(([slot, field]) => [
      slot,
      { ...field },
    ]),
  ),
  buildings: Object.fromEntries(
    Object.entries(state.buildings).map(([slot, building]) => [
      slot,
      { ...building },
    ]),
  ),
});

export const createDefaultInitialStateProfiles = (): InitialStateProfiles =>
  Object.fromEntries(
    supportedServerSpeeds.map((speed) => [
      speed,
      createDefaultInitialSimulationState(),
    ]),
  ) as InitialStateProfiles;

export const toSupportedServerSpeed = (value: number): ServerSpeed =>
  supportedServerSpeeds.includes(value as ServerSpeed)
    ? (value as ServerSpeed)
    : 1;

/**
 * Convierte el perfil base guardado en DB en el estado efectivo del servidor.
 * Los recursos iniciales, edificios y capacidades no cambian automáticamente.
 * La producción sí se multiplica por la velocidad.
 */
export const resolveInitialSimulationState = (
  baseProfile: SimulationState,
  serverSpeed: ServerSpeed,
): SimulationState => {
  const resolved = cloneSimulationState(baseProfile);

  resolved.productionPerHour = {
    wood: baseProfile.productionPerHour.wood * serverSpeed,
    clay: baseProfile.productionPerHour.clay * serverSpeed,
    iron: baseProfile.productionPerHour.iron * serverSpeed,
    crop: baseProfile.productionPerHour.crop * serverSpeed,
  };

  return resolved;
};

const sanitizeSlotStateRecord = (
  value: unknown,
  fallback: SlotStateRecord,
): SlotStateRecord => {
  if (!isRecord(value)) return { ...fallback };

  const sanitized: SlotStateRecord = {};

  for (const [slotText, rawSlotState] of Object.entries(value)) {
    const slot = Number(slotText);
    if (!Number.isInteger(slot) || slot < 1 || !isRecord(rawSlotState)) continue;

    const gid = toNonNegativeInteger(rawSlotState.gid, -1);
    const level = toNonNegativeInteger(rawSlotState.level, -1);
    if (gid < 1 || level < 0) continue;

    sanitized[slot] = { gid, level };
  }

  return Object.keys(sanitized).length > 0 ? sanitized : { ...fallback };
};

export const sanitizeInitialSimulationState = (
  value: unknown,
  fallback: SimulationState = createDefaultInitialSimulationState(),
): SimulationState => {
  if (!isRecord(value)) return cloneSimulationState(fallback);

  const resources = isRecord(value.resources) ? value.resources : {};
  const production = isRecord(value.productionPerHour)
    ? value.productionPerHour
    : {};
  const capacity = isRecord(value.capacity) ? value.capacity : {};

  return {
    elapsedSeconds: toNonNegativeNumber(
      value.elapsedSeconds,
      fallback.elapsedSeconds,
    ),
    resources: {
      wood: toNonNegativeNumber(resources.wood, fallback.resources.wood),
      clay: toNonNegativeNumber(resources.clay, fallback.resources.clay),
      iron: toNonNegativeNumber(resources.iron, fallback.resources.iron),
      crop: toNonNegativeNumber(resources.crop, fallback.resources.crop),
    },
    productionPerHour: {
      wood: toNonNegativeNumber(
        production.wood,
        fallback.productionPerHour.wood,
      ),
      clay: toNonNegativeNumber(
        production.clay,
        fallback.productionPerHour.clay,
      ),
      iron: toNonNegativeNumber(
        production.iron,
        fallback.productionPerHour.iron,
      ),
      crop: toNonNegativeNumber(
        production.crop,
        fallback.productionPerHour.crop,
      ),
    },
    capacity: {
      warehouse: toNonNegativeNumber(
        capacity.warehouse,
        fallback.capacity.warehouse,
      ),
      granary: toNonNegativeNumber(capacity.granary, fallback.capacity.granary),
    },
    freeCrop: toNonNegativeNumber(value.freeCrop, fallback.freeCrop),
    population: toNonNegativeNumber(value.population, fallback.population),
    resourceFields: sanitizeSlotStateRecord(
      value.resourceFields,
      fallback.resourceFields,
    ),
    buildings: sanitizeSlotStateRecord(value.buildings, fallback.buildings),
    mainBuildingLevel: toNonNegativeInteger(
      value.mainBuildingLevel,
      fallback.mainBuildingLevel,
    ),
    workerAvailableAtSeconds: toNonNegativeNumber(
      value.workerAvailableAtSeconds,
      fallback.workerAvailableAtSeconds,
    ),
  };
};

export const parseInitialStateProfilesPayload = (
  value: unknown,
): InitialStateProfiles => {
  const defaults = createDefaultInitialStateProfiles();
  const rawProfiles = isRecord(value) && isRecord(value.profiles)
    ? value.profiles
    : value;

  if (!isRecord(rawProfiles)) return defaults;

  return Object.fromEntries(
    supportedServerSpeeds.map((speed) => [
      speed,
      sanitizeInitialSimulationState(rawProfiles[String(speed)], defaults[speed]),
    ]),
  ) as InitialStateProfiles;
};

const formatSlotStateRecord = (slots: SlotStateRecord) =>
  Object.entries(slots)
    .sort(([slotA], [slotB]) => Number(slotA) - Number(slotB))
    .map(([slot, state]) => `${slot}:${state.gid}:${state.level}`)
    .join("\n");

const parseSlotStateRecord = (value: string, label: string): SlotStateRecord => {
  const slots: SlotStateRecord = {};

  value.split("\n").forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;

    const parts = line.split(":").map((part) => part.trim());
    if (parts.length !== 3) {
      throw new Error(
        `${label}: formato inválido en la línea ${index + 1}. Usa slot:gid:nivel.`,
      );
    }

    const [slot, gid, level] = parts.map(Number);
    if (
      !Number.isInteger(slot) ||
      slot < 1 ||
      !Number.isInteger(gid) ||
      gid < 1 ||
      !Number.isInteger(level) ||
      level < 0
    ) {
      throw new Error(
        `${label}: valores inválidos en la línea ${index + 1}. Usa enteros positivos y permite nivel 0.`,
      );
    }

    if (slots[slot]) {
      throw new Error(`${label}: el slot ${slot} aparece más de una vez.`);
    }

    slots[slot] = { gid, level };
  });

  if (Object.keys(slots).length === 0) {
    throw new Error(`${label}: agrega al menos una línea con formato slot:gid:nivel.`);
  }

  return slots;
};

export const formatInitialBuildings = (buildings: SimulationState["buildings"]) =>
  formatSlotStateRecord(buildings);

export const parseInitialBuildings = (value: string) =>
  parseSlotStateRecord(value, "Edificios iniciales");

export const formatInitialResourceFields = (
  resourceFields: SimulationState["resourceFields"],
) => formatSlotStateRecord(resourceFields);

export const parseInitialResourceFields = (value: string) =>
  parseSlotStateRecord(value, "Campos iniciales");
