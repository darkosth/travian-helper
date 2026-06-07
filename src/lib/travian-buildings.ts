export type BuildingSlotKind = "normal" | "rallyPoint" | "wall";

export type BuildingRequirement = {
  names: string[];
  minimumLevel: number;
};

export type TravianBuildingDefinition = {
  gid: number;
  defaultName: string;
  names: string[];
  slotKind: BuildingSlotKind;
  level1Costs: {
    wood: number;
    clay: number;
    iron: number;
    crop: number;
  };
  prerequisites: BuildingRequirement[];
  tribeIds?: number[];
};

export const normalizeBuildingName = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const buildingDefinitions: TravianBuildingDefinition[] = [
  {
    gid: 10,
    defaultName: "Warehouse",
    names: ["warehouse", "almacen", "almacén"],
    slotKind: "normal",
    level1Costs: { wood: 130, clay: 160, iron: 90, crop: 40 },
    prerequisites: [{ names: ["main building", "edificio principal"], minimumLevel: 1 }],
  },
  {
    gid: 11,
    defaultName: "Granary",
    names: ["granary", "granero"],
    slotKind: "normal",
    level1Costs: { wood: 80, clay: 100, iron: 70, crop: 20 },
    prerequisites: [{ names: ["main building", "edificio principal"], minimumLevel: 1 }],
  },
  {
    gid: 16,
    defaultName: "Rally Point",
    names: ["rally point", "punto de reunion", "punto de reunión"],
    slotKind: "rallyPoint",
    level1Costs: { wood: 110, clay: 160, iron: 90, crop: 70 },
    prerequisites: [{ names: ["main building", "edificio principal"], minimumLevel: 1 }],
  },
  {
    gid: 17,
    defaultName: "Marketplace",
    names: ["marketplace", "mercado"],
    slotKind: "normal",
    level1Costs: { wood: 80, clay: 70, iron: 120, crop: 70 },
    prerequisites: [
      { names: ["main building", "edificio principal"], minimumLevel: 3 },
      { names: ["warehouse", "almacen", "almacén"], minimumLevel: 1 },
      { names: ["granary", "granero"], minimumLevel: 1 },
    ],
  },
  {
    gid: 18,
    defaultName: "Embassy",
    names: ["embassy", "embajada"],
    slotKind: "normal",
    level1Costs: { wood: 180, clay: 130, iron: 150, crop: 80 },
    prerequisites: [
      { names: ["main building", "edificio principal"], minimumLevel: 1 },
      { names: ["rally point", "punto de reunion", "punto de reunión"], minimumLevel: 1 },
    ],
  },
  {
    gid: 19,
    defaultName: "Barracks",
    names: ["barracks", "cuartel"],
    slotKind: "normal",
    level1Costs: { wood: 210, clay: 140, iron: 260, crop: 120 },
    prerequisites: [
      { names: ["main building", "edificio principal"], minimumLevel: 3 },
      { names: ["rally point", "punto de reunion", "punto de reunión"], minimumLevel: 1 },
    ],
  },
  {
    gid: 22,
    defaultName: "Academy",
    names: ["academy", "academia"],
    slotKind: "normal",
    level1Costs: { wood: 220, clay: 160, iron: 90, crop: 40 },
    prerequisites: [
      { names: ["main building", "edificio principal"], minimumLevel: 3 },
      { names: ["barracks", "cuartel"], minimumLevel: 3 },
    ],
  },
  {
    gid: 23,
    defaultName: "Cranny",
    names: ["cranny", "escondite"],
    slotKind: "normal",
    level1Costs: { wood: 40, clay: 50, iron: 30, crop: 10 },
    prerequisites: [{ names: ["main building", "edificio principal"], minimumLevel: 1 }],
  },
  {
    gid: 24,
    defaultName: "Town Hall",
    names: ["town hall", "ayuntamiento"],
    slotKind: "normal",
    level1Costs: { wood: 1250, clay: 1110, iron: 1260, crop: 600 },
    prerequisites: [
      { names: ["main building", "edificio principal"], minimumLevel: 10 },
      { names: ["academy", "academia"], minimumLevel: 10 },
    ],
  },
  {
    gid: 25,
    defaultName: "Residence",
    names: ["residence", "residencia"],
    slotKind: "normal",
    level1Costs: { wood: 580, clay: 460, iron: 350, crop: 180 },
    prerequisites: [{ names: ["main building", "edificio principal"], minimumLevel: 5 }],
  },
  {
    gid: 31,
    defaultName: "City Wall",
    names: ["city wall", "wall", "muralla"],
    slotKind: "wall",
    level1Costs: { wood: 70, clay: 90, iron: 170, crop: 70 },
    prerequisites: [{ names: ["rally point", "punto de reunion", "punto de reunión"], minimumLevel: 1 }],
    tribeIds: [1],
  },
  {
    gid: 32,
    defaultName: "Earth Wall",
    names: ["earth wall"],
    slotKind: "wall",
    level1Costs: { wood: 120, clay: 200, iron: 0, crop: 80 },
    prerequisites: [{ names: ["rally point", "punto de reunion", "punto de reunión"], minimumLevel: 1 }],
    tribeIds: [2],
  },
  {
    gid: 33,
    defaultName: "Palisade",
    names: ["palisade", "empalizada"],
    slotKind: "wall",
    level1Costs: { wood: 130, clay: 100, iron: 70, crop: 20 },
    prerequisites: [{ names: ["rally point", "punto de reunion", "punto de reunión"], minimumLevel: 1 }],
    tribeIds: [3],
  },
];

const matchesName = (buildingName: string, targetNames: string[]) => {
  const normalized = normalizeBuildingName(buildingName);

  return targetNames.some((targetName) =>
    normalized.includes(normalizeBuildingName(targetName)),
  );
};

export const findBuildingDefinitions = (targetNames: string[], tribeId: number | null | undefined) =>
  buildingDefinitions.filter((definition) => {
    if (!matchesName(definition.defaultName, targetNames) && !definition.names.some((name) => matchesName(name, targetNames))) {
      return false;
    }

    if (!definition.tribeIds?.length) {
      return true;
    }

    return tribeId !== null && tribeId !== undefined && definition.tribeIds.includes(tribeId);
  });

export const getDefinitionByGid = (gid: number) =>
  buildingDefinitions.find((definition) => definition.gid === gid) ?? null;
