import { accrueResources, simulateStep, validateStep, type PlannerStep, type SimulationState } from "../src/lib/planner/simulator";

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const createState = (overrides: Partial<SimulationState> = {}): SimulationState => ({
  elapsedSeconds: 0,
  resources: { wood: 10_000, clay: 10_000, iron: 10_000, crop: 10_000 },
  productionPerHour: { wood: 30, clay: 30, iron: 30, crop: 30 },
  capacity: { warehouse: 20_000, granary: 20_000 },
  freeCrop: 100,
  population: 2,
  resourceFields: { 1: { gid: 1, level: 0 } },
  buildings: { 19: { gid: 15, level: 5 } },
  mainBuildingLevel: 5,
  workerAvailableAtSeconds: 0,
  ...overrides,
});

const step = (input: Partial<PlannerStep> & Pick<PlannerStep, "id" | "kind" | "action" | "slot" | "gid" | "targetLevel">): PlannerStep => ({
  position: 1,
  stage: 1,
  ...input,
});

const field01 = step({ id: "field-0-1", kind: "resourceField", action: "upgrade", slot: 1, gid: 1, targetLevel: 1 });
const field02 = step({ id: "field-0-2", kind: "resourceField", action: "upgrade", slot: 1, gid: 1, targetLevel: 2 });

// 1. Un campo nivel 0 sí puede subir y aumenta producción solo al finalizar.
const fieldUpgrade = simulateStep(createState(), field01);
assert(fieldUpgrade.result.status === "valid", "El campo 0 → 1 debe ser válido.");
assert(fieldUpgrade.result.productionBefore.wood === 30, "La producción inicial debe conservarse antes de la obra.");
assert(fieldUpgrade.result.productionAfter.wood > 30, "La producción debe aumentar al terminar el campo.");

// 2. El Edificio Principal reduce el tiempo de filas posteriores.
const beforeMainBuilding = simulateStep(createState({ mainBuildingLevel: 1 }), field01);
const mainBuildingUpgrade = simulateStep(
  createState({ mainBuildingLevel: 1, buildings: { 19: { gid: 15, level: 1 } } }),
  step({ id: "mb-1-2", kind: "building", action: "upgrade", slot: 19, gid: 15, targetLevel: 2 }),
);
const afterMainBuilding = simulateStep(mainBuildingUpgrade.state, field01);
assert(afterMainBuilding.result.buildDurationSeconds < beforeMainBuilding.result.buildDurationSeconds, "El Edificio Principal debe reducir tiempos posteriores.");

// 3. La capacidad insuficiente bloquea la ruta antes de esperar recursos.
const capacityBlocked = validateStep(
  createState({ capacity: { warehouse: 100, granary: 100 } }),
  step({ id: "residence", kind: "building", action: "construct", slot: 20, gid: 25, targetLevel: 1 }),
);
assert(capacityBlocked.status === "blocked-capacity", "Residencia debe bloquearse por capacidad.");

// 4. Un prerrequisito faltante bloquea la ruta.
const prerequisiteBlocked = validateStep(
  createState(),
  step({ id: "stable", kind: "building", action: "construct", slot: 20, gid: 20, targetLevel: 1 }),
);
assert(prerequisiteBlocked.status === "blocked-prerequisite", "Establo debe bloquearse sin prerrequisitos.");

// 5. Acumular recursos nunca supera los topes.
const accrued = accrueResources(
  createState({
    resources: { wood: 95, clay: 95, iron: 95, crop: 95 },
    productionPerHour: { wood: 100, clay: 100, iron: 100, crop: 100 },
    capacity: { warehouse: 100, granary: 100 },
  }),
  3_600,
);
assert(Object.values(accrued.resources).every((amount) => amount === 100), "Los recursos deben respetar capacidad.");

// 6. Un paso ya completado manualmente se omite.
const skipped = simulateStep(createState({ resourceFields: { 1: { gid: 1, level: 1 } } }), field01);
assert(skipped.result.status === "skipped", "La fila satisfecha manualmente debe omitirse.");

// 7. El worker no salta niveles para improvisar una solución.
const invalidJump = validateStep(createState(), field02);
assert(invalidJump.status === "invalid-level", "El planner no debe aceptar saltos de nivel implícitos.");

// 8. Construir el primer almacén reemplaza el tope base, no lo duplica.
const firstWarehouse = simulateStep(
  createState({ resources: { wood: 800, clay: 800, iron: 800, crop: 800 }, capacity: { warehouse: 800, granary: 800 } }),
  step({ id: "warehouse", kind: "building", action: "construct", slot: 20, gid: 10, targetLevel: 1 }),
);
assert(firstWarehouse.result.status === "valid", "El primer almacén debe poder construirse.");
assert(firstWarehouse.state.capacity.warehouse === 1_200, "El primer almacén debe dejar capacidad 1200.");

console.log("Planner smoke tests: OK");
