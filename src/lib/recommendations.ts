import { secondVillageRoute, type StrictRouteMilestone } from "@/lib/second-village-route";
import {
  findBuildingDefinitions,
  type TravianBuildingDefinition,
} from "@/lib/travian-buildings";
import {
  getSoonestQueueWaitHours,
  withEffectiveConstructionState,
} from "@/lib/construction-state";

export type ResourceType = "wood" | "clay" | "iron" | "crop";

export type ResourceSnapshotLike = {
  type: string;
  amount: number | null;
  productionPerHour: number | null;
  capacity: number | null;
};

export type ResourceFieldSnapshotLike = {
  slot: number;
  gid?: number;
  type: string;
  name: string;
  level: number | null;
  upgradeStatus?: string;
  canAffordUpgrade: boolean | null;
  canStartUpgradeNow: boolean | null;
  nextLevelWood: number | null;
  nextLevelClay: number | null;
  nextLevelIron: number | null;
  nextLevelCrop: number | null;
};

export type BuildingSnapshotLike = {
  slot: number;
  gid?: number;
  name: string;
  level: number | null;
  isEmpty?: boolean;
  upgradeStatus?: string;
  canStartUpgradeNow: boolean | null;
  nextLevelWood: number | null;
  nextLevelClay: number | null;
  nextLevelIron: number | null;
  nextLevelCrop: number | null;
  href?: string | null;
  constructOptions?: Array<{
    gid: number;
    name: string;
    category: number | null;
    availableNow: boolean;
    blockedReason: string | null;
    nextLevelCosts: {
      wood: number | null;
      clay: number | null;
      iron: number | null;
      crop: number | null;
    };
    duration: string | null;
    actionHref: string | null;
  }>;
};

export type ActiveConstructionLike = {
  slot: number | null;
  kind: "resourceField" | "building" | null;
  name: string;
  currentLevel: number | null;
  targetLevel: number | null;
  remainingTime: string | null;
  finishTime: string | null;
};

export type VillageSnapshotLike = {
  freeCrop: number | null;
  incomingAttacksAmount: number | null;
  population: number | null;
  activeConstructionSlots?: number | null;
  constructionQueue?: ActiveConstructionLike[];
  scrapedAt?: Date | string;
  resources: ResourceSnapshotLike[];
  resourceFields: ResourceFieldSnapshotLike[];
  buildings: BuildingSnapshotLike[];
};

export type AccountStrategyContext = {
  tribeId?: number | null;
  usedVillageSlots: number | null;
  maxControllableVillages: number | null;
  cpProducedForNextSlot: number | null;
  cpNeededForNextSlot: number | null;
};

export type CandidateCategory =
  | "resource_wood"
  | "resource_clay"
  | "resource_iron"
  | "resource_crop"
  | "main_building"
  | "warehouse"
  | "granary"
  | "expansion"
  | "economic_support"
  | "utility"
  | "military"
  | "defense"
  | "other_building";

export type RecommendationCandidate = {
  id: string;
  slot: number;
  level: number | null;
  label: string;
  name: string;
  kind: "resourceField" | "building";
  affordableNow: boolean;
  totalCost: number;
  nextLevelWood: number | null;
  nextLevelClay: number | null;
  nextLevelIron: number | null;
  nextLevelCrop: number | null;
  timeToAffordHours: number | null;
  blockedByConstructionQueue: boolean;
  category: CandidateCategory;
  score: number;
  reasons: string[];
  buildAction?: "upgrade" | "construct";
  targetGid?: number | null;
  targetHref?: string | null;
};

type MemorySignal = {
  averagePopulationDelta: number;
  sampleCount: number;
};

export type MemoryProfile = {
  signals: Partial<Record<CandidateCategory, MemorySignal>>;
  summary: string;
};

export type VillageRecommendation = {
  priority: "critical" | "high" | "medium" | "low";
  title: string;
  summary: string;
  score: number;
  shouldWait: boolean;
  waitTimeText: string | null;
  reasons: string[];
  memorySummary: string;
  focus: string;
  strictRouteTitle: string | null;
  strictRouteSummary: string | null;
  strictRouteWaitTime: string | null;
  strictRouteReasons: string[];
  snapshotRecommendationTitle: string;
  snapshotRecommendationSummary: string;
};

export type VillageDecision = {
  recommendation: VillageRecommendation;
  rankedCandidates: RecommendationCandidate[];
  memory: MemoryProfile;
  focus: string;
};

const resourceTypes: ResourceType[] = ["wood", "clay", "iron", "crop"];

export const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const getTotalCost = (candidate: {
  nextLevelWood: number | null;
  nextLevelClay: number | null;
  nextLevelIron: number | null;
  nextLevelCrop: number | null;
}) =>
  [candidate.nextLevelWood, candidate.nextLevelClay, candidate.nextLevelIron, candidate.nextLevelCrop]
    .map((value) => value ?? 0)
    .reduce((total, value) => total + value, 0);

export const getResourceBuckets = (resources: ResourceSnapshotLike[]) =>
  resourceTypes.reduce(
    (accumulator, type) => {
      accumulator[type] =
        resources.find((resource) => resource.type === type) ?? {
          type,
          amount: null,
          capacity: null,
          productionPerHour: null,
        };
      return accumulator;
    },
    {} as Record<ResourceType, ResourceSnapshotLike>,
  );

const getResourceFillRatio = (bucket: ResourceSnapshotLike) => {
  if (!bucket.capacity || !bucket.amount) {
    return 0;
  }

  return bucket.amount / bucket.capacity;
};

const getLowestProductionType = (resources: Record<ResourceType, ResourceSnapshotLike>) =>
  resourceTypes.reduce((lowestType, currentType) => {
    const lowestProduction = resources[lowestType].productionPerHour ?? Number.POSITIVE_INFINITY;
    const currentProduction = resources[currentType].productionPerHour ?? Number.POSITIVE_INFINITY;

    return currentProduction < lowestProduction ? currentType : lowestType;
  }, "wood" as ResourceType);

const formatUpgradeLabel = (name: string, slot: number, level: number | null) =>
  `${name} (slot ${slot}${level !== null ? `, lvl ${level}` : ""})`;

const formatConstructionLabel = (name: string, slot: number) => `Build ${name} (slot ${slot})`;

export const formatHoursToText = (value: number | null) => {
  if (value === null || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  const totalMinutes = Math.max(1, Math.ceil(value * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes}m`;
  }

  if (minutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${minutes}m`;
};

const formatResourceList = (values: Partial<Record<ResourceType, number>>) =>
  resourceTypes
    .map((type) => {
      const value = values[type] ?? 0;

      return value > 0 ? `${type} ${Math.ceil(value)}` : null;
    })
    .filter((value): value is string => value !== null)
    .join(", ");

const getTimeToAffordHours = (
  candidate: {
    nextLevelWood: number | null;
    nextLevelClay: number | null;
    nextLevelIron: number | null;
    nextLevelCrop: number | null;
  },
  resources: Record<ResourceType, ResourceSnapshotLike>,
) => {
  const waits = resourceTypes.map((type) => {
    const amount = resources[type].amount ?? 0;
    const production = resources[type].productionPerHour ?? 0;
    const required =
      type === "wood"
        ? candidate.nextLevelWood ?? 0
        : type === "clay"
          ? candidate.nextLevelClay ?? 0
          : type === "iron"
            ? candidate.nextLevelIron ?? 0
            : candidate.nextLevelCrop ?? 0;
    const missing = Math.max(0, required - amount);

    if (missing === 0) {
      return 0;
    }

    if (production <= 0) {
      return null;
    }

    return missing / production;
  });

  if (waits.some((wait) => wait === null)) {
    return null;
  }

  return Math.max(...(waits as number[]));
};

const getMissingResources = (
  candidate: {
    nextLevelWood: number | null;
    nextLevelClay: number | null;
    nextLevelIron: number | null;
    nextLevelCrop: number | null;
  },
  resources: Record<ResourceType, ResourceSnapshotLike>,
) => ({
  wood: Math.max(0, (candidate.nextLevelWood ?? 0) - (resources.wood.amount ?? 0)),
  clay: Math.max(0, (candidate.nextLevelClay ?? 0) - (resources.clay.amount ?? 0)),
  iron: Math.max(0, (candidate.nextLevelIron ?? 0) - (resources.iron.amount ?? 0)),
  crop: Math.max(0, (candidate.nextLevelCrop ?? 0) - (resources.crop.amount ?? 0)),
});

const combineWaitHours = (input: {
  baseWaitHours: number | null;
  queueWaitHours: number | null;
  queueIsFull: boolean;
}) => {
  const { baseWaitHours, queueWaitHours, queueIsFull } = input;

  if (!queueIsFull) {
    return baseWaitHours;
  }

  if (baseWaitHours === null) {
    return null;
  }

  if (queueWaitHours === null) {
    return baseWaitHours;
  }

  return Math.max(baseWaitHours, queueWaitHours);
};

export const getCategoryLabel = (category: CandidateCategory) => {
  switch (category) {
    case "resource_crop":
      return "crop upgrades";
    case "resource_wood":
    case "resource_clay":
    case "resource_iron":
      return "resource field upgrades";
    case "main_building":
      return "main building upgrades";
    case "warehouse":
    case "granary":
      return "storage upgrades";
    case "expansion":
      return "expansion-oriented upgrades";
    case "economic_support":
      return "economic support buildings";
    case "utility":
      return "utility buildings";
    case "military":
      return "military buildings";
    case "defense":
      return "defensive buildings";
    default:
      return "general upgrades";
  }
};

export const classifyBuildingCategory = (name: string): CandidateCategory => {
  const normalized = normalizeText(name);

  if (normalized.includes("edificio principal") || normalized.includes("main building")) {
    return "main_building";
  }

  if (normalized.includes("granero") || normalized.includes("granary")) {
    return "granary";
  }

  if (normalized.includes("almacen") || normalized.includes("warehouse")) {
    return "warehouse";
  }

  if (
    normalized.includes("residencia") ||
    normalized.includes("residence") ||
    normalized.includes("palacio") ||
    normalized.includes("palace") ||
    normalized.includes("ayuntamiento") ||
    normalized.includes("town hall")
  ) {
    return "expansion";
  }

  if (
    normalized.includes("serreria") ||
    normalized.includes("sawmill") ||
    normalized.includes("ladrillera") ||
    normalized.includes("brickyard") ||
    normalized.includes("fundicion") ||
    normalized.includes("iron foundry") ||
    normalized.includes("molino") ||
    normalized.includes("grain mill") ||
    normalized.includes("panaderia") ||
    normalized.includes("bakery")
  ) {
    return "economic_support";
  }

  if (
    normalized.includes("cuartel") ||
    normalized.includes("barracks") ||
    normalized.includes("establo") ||
    normalized.includes("stable") ||
    normalized.includes("academia") ||
    normalized.includes("academy") ||
    normalized.includes("herrer") ||
    normalized.includes("smithy") ||
    normalized.includes("taller") ||
    normalized.includes("workshop") ||
    normalized.includes("plaza de torneos") ||
    normalized.includes("tournament") ||
    normalized.includes("palacio del heroe") ||
    normalized.includes("hero")
  ) {
    return "military";
  }

  if (
    normalized.includes("muralla") ||
    normalized.includes("empalizada") ||
    normalized.includes("earth wall")
  ) {
    return "defense";
  }

  if (
    normalized.includes("mercado") ||
    normalized.includes("marketplace") ||
    normalized.includes("embajada") ||
    normalized.includes("embassy") ||
    normalized.includes("escondite") ||
    normalized.includes("cranny") ||
    normalized.includes("punto de reunion") ||
    normalized.includes("rally point")
  ) {
    return "utility";
  }

  return "other_building";
};

export const classifyFieldCategory = (fieldType: string): CandidateCategory => {
  const normalized = normalizeText(fieldType);

  if (normalized.includes("crop")) {
    return "resource_crop";
  }

  if (normalized.includes("clay")) {
    return "resource_clay";
  }

  if (normalized.includes("iron")) {
    return "resource_iron";
  }

  return "resource_wood";
};

export const getCategoryFromCandidate = (candidate: ResourceFieldSnapshotLike | BuildingSnapshotLike) => {
  if ("canAffordUpgrade" in candidate) {
    return classifyFieldCategory(candidate.type);
  }

  return classifyBuildingCategory(candidate.name);
};

const getSlotLevelMap = (items: Array<{ slot: number; level: number | null }>) =>
  new Map(items.map((item) => [item.slot, item.level ?? 0]));

const getEmptyBuildingSlot = (
  snapshot: VillageSnapshotLike,
  definition: TravianBuildingDefinition,
) => {
  const allowedSlots =
    definition.slotKind === "rallyPoint"
      ? [39]
      : definition.slotKind === "wall"
        ? [40]
        : Array.from({ length: 20 }, (_, index) => index + 19).filter((slot) => slot !== 39 && slot !== 40);

  return (
    snapshot.buildings
      .filter((building) => building.isEmpty)
      .find((building) => allowedSlots.includes(building.slot)) ?? null
  );
};

const getConstructionCandidate = (input: {
  snapshot: VillageSnapshotLike;
  resources: Record<ResourceType, ResourceSnapshotLike>;
  queueIsFull: boolean;
  queueWaitHours: number | null;
  definition: TravianBuildingDefinition;
}) => {
  const { snapshot, resources, queueIsFull, queueWaitHours, definition } = input;
  const existingBuilding = snapshot.buildings.find(
    (building) => !building.isEmpty && building.gid === definition.gid,
  );

  if (existingBuilding) {
    return null;
  }

  const emptySlot = getEmptyBuildingSlot(snapshot, definition);

  if (!emptySlot) {
    return null;
  }

  const liveOption =
    emptySlot.constructOptions?.find((option) => option.gid === definition.gid) ?? null;
  const costs = {
    nextLevelWood: liveOption?.nextLevelCosts.wood ?? definition.level1Costs.wood,
    nextLevelClay: liveOption?.nextLevelCosts.clay ?? definition.level1Costs.clay,
    nextLevelIron: liveOption?.nextLevelCosts.iron ?? definition.level1Costs.iron,
    nextLevelCrop: liveOption?.nextLevelCosts.crop ?? definition.level1Costs.crop,
  };
  const baseWaitHours = getTimeToAffordHours(costs, resources);
  const canAffordNow = resourceTypes.every((type) => {
    const amount = resources[type].amount ?? 0;
    const required =
      type === "wood"
        ? costs.nextLevelWood
        : type === "clay"
          ? costs.nextLevelClay
          : type === "iron"
            ? costs.nextLevelIron
            : costs.nextLevelCrop;

    return amount >= required;
  });

  return {
    id: `construct-${emptySlot.slot}-${definition.gid}`,
    slot: emptySlot.slot,
    level: 0,
    label: formatConstructionLabel(liveOption?.name ?? definition.defaultName, emptySlot.slot),
    name: liveOption?.name ?? definition.defaultName,
    kind: "building" as const,
    affordableNow: !queueIsFull && (liveOption ? liveOption.availableNow : canAffordNow),
    totalCost: getTotalCost(costs),
    nextLevelWood: costs.nextLevelWood,
    nextLevelClay: costs.nextLevelClay,
    nextLevelIron: costs.nextLevelIron,
    nextLevelCrop: costs.nextLevelCrop,
    timeToAffordHours:
      !queueIsFull && canAffordNow
        ? 0
        : combineWaitHours({
            baseWaitHours,
            queueWaitHours,
            queueIsFull,
          }),
    blockedByConstructionQueue: queueIsFull,
    category: classifyBuildingCategory(liveOption?.name ?? definition.defaultName),
    score: 0,
    reasons: liveOption?.blockedReason ? [liveOption.blockedReason] : ([] as string[]),
    buildAction: "construct" as const,
    targetGid: definition.gid,
    targetHref: liveOption?.actionHref ?? emptySlot.href ?? null,
  };
};

export const buildMemoryProfile = (history: VillageSnapshotLike[]): MemoryProfile => {
  if (history.length < 2) {
    return {
      signals: {},
      summary: "Not enough local history yet; using rapid-growth defaults.",
    };
  }

  const chronologicalHistory = history
    .slice()
    .sort((left, right) => new Date(String(left.scrapedAt)).getTime() - new Date(String(right.scrapedAt)).getTime());

  const rawSignals = new Map<CandidateCategory, { totalPopulationDelta: number; count: number }>();

  for (let index = 1; index < chronologicalHistory.length; index += 1) {
    const previous = chronologicalHistory[index - 1];
    const current = chronologicalHistory[index];
    const populationDelta = (current.population ?? 0) - (previous.population ?? 0);
    const previousFields = getSlotLevelMap(previous.resourceFields);
    const previousBuildings = getSlotLevelMap(previous.buildings);
    const categories = new Set<CandidateCategory>();

    for (const field of current.resourceFields) {
      if ((field.level ?? 0) > (previousFields.get(field.slot) ?? 0)) {
        categories.add(getCategoryFromCandidate(field));
      }
    }

    for (const building of current.buildings) {
      if ((building.level ?? 0) > (previousBuildings.get(building.slot) ?? 0)) {
        categories.add(getCategoryFromCandidate(building));
      }
    }

    for (const category of categories) {
      const previousSignal = rawSignals.get(category) ?? {
        totalPopulationDelta: 0,
        count: 0,
      };

      previousSignal.totalPopulationDelta += populationDelta;
      previousSignal.count += 1;
      rawSignals.set(category, previousSignal);
    }
  }

  const signals = Object.fromEntries(
    [...rawSignals.entries()].map(([category, signal]) => [
      category,
      {
        averagePopulationDelta: signal.totalPopulationDelta / signal.count,
        sampleCount: signal.count,
      },
    ]),
  ) as Partial<Record<CandidateCategory, MemorySignal>>;

  const bestLearnedCategory = [...Object.entries(signals)]
    .filter((entry): entry is [CandidateCategory, MemorySignal] => Boolean(entry[1]))
    .sort(
      (left, right) =>
        right[1].averagePopulationDelta - left[1].averagePopulationDelta ||
        right[1].sampleCount - left[1].sampleCount,
    )[0];

  if (!bestLearnedCategory) {
    return {
      signals,
      summary: "No upgrade history has changed recently, so the engine is using default growth heuristics.",
    };
  }

  return {
    signals,
    summary: `Memory bias: recent population gains in this village followed ${getCategoryLabel(
      bestLearnedCategory[0],
    )}.`,
  };
};

export const buildCandidateList = (snapshot: VillageSnapshotLike, resources: Record<ResourceType, ResourceSnapshotLike>) => {
  const effectiveSnapshot = withEffectiveConstructionState(snapshot);
  const queueIsFull = (effectiveSnapshot.activeConstructionSlots ?? 0) >= 2;
  const queueWaitHours = getSoonestQueueWaitHours(effectiveSnapshot);
  const fieldCandidates = effectiveSnapshot.resourceFields
    .filter(
      (field) =>
        field.upgradeStatus !== "underConstruction" &&
        getTotalCost(field) > 0,
    )
    .map((field) => {
      const baseWaitHours =
        field.canAffordUpgrade === true ? 0 : getTimeToAffordHours(field, resources);

      return {
      id: `field-${field.slot}`,
      slot: field.slot,
      level: field.level,
      label: formatUpgradeLabel(field.name, field.slot, field.level),
      name: field.name,
      kind: "resourceField" as const,
      affordableNow:
        field.canStartUpgradeNow === true && !queueIsFull,
      totalCost: getTotalCost(field),
      nextLevelWood: field.nextLevelWood,
      nextLevelClay: field.nextLevelClay,
      nextLevelIron: field.nextLevelIron,
      nextLevelCrop: field.nextLevelCrop,
      timeToAffordHours:
        field.canStartUpgradeNow === true && !queueIsFull
          ? 0
          : combineWaitHours({
              baseWaitHours,
              queueWaitHours,
              queueIsFull,
            }),
      blockedByConstructionQueue: queueIsFull,
      category: getCategoryFromCandidate(field),
      score: 0,
      reasons: [] as string[],
      buildAction: "upgrade" as const,
      targetGid: field.gid,
      targetHref: null,
      };
    });

  const buildingCandidates = effectiveSnapshot.buildings
    .filter(
      (building) =>
        !building.isEmpty &&
        building.upgradeStatus !== "underConstruction" &&
        getTotalCost(building) > 0,
    )
    .map((building) => {
      const baseWaitHours = getTimeToAffordHours(building, resources);

      return {
      id: `building-${building.slot}`,
      slot: building.slot,
      level: building.level,
      label: formatUpgradeLabel(building.name, building.slot, building.level),
      name: building.name,
      kind: "building" as const,
      affordableNow:
        building.canStartUpgradeNow === true && !queueIsFull,
      totalCost: getTotalCost(building),
      nextLevelWood: building.nextLevelWood,
      nextLevelClay: building.nextLevelClay,
      nextLevelIron: building.nextLevelIron,
      nextLevelCrop: building.nextLevelCrop,
      timeToAffordHours:
        building.canStartUpgradeNow === true && !queueIsFull
          ? 0
          : combineWaitHours({
              baseWaitHours,
              queueWaitHours,
              queueIsFull,
            }),
      blockedByConstructionQueue: queueIsFull,
      category: getCategoryFromCandidate(building),
      score: 0,
      reasons: [] as string[],
      buildAction: "upgrade" as const,
      targetGid: building.gid ?? null,
      targetHref: building.href ?? null,
      };
    });

  return [...fieldCandidates, ...buildingCandidates];
};

export const scoreCandidate = (input: {
  candidate: RecommendationCandidate;
  snapshot: VillageSnapshotLike;
  account: AccountStrategyContext;
  resources: Record<ResourceType, ResourceSnapshotLike>;
  memory: MemoryProfile;
}) => {
  const { candidate, snapshot, account, resources, memory } = input;
  const reasons: string[] = [];
  let score = 0;
  const cpProgress =
    account.cpNeededForNextSlot && account.cpNeededForNextSlot > 0
      ? (account.cpProducedForNextSlot ?? 0) / account.cpNeededForNextSlot
      : null;
  const isSecondVillageRush = (account.usedVillageSlots ?? 1) < 2;
  const isLowCrop = snapshot.freeCrop !== null && snapshot.freeCrop < 120;
  const isCropTight = snapshot.freeCrop !== null && snapshot.freeCrop < 250;
  const resourceFillPressure = Math.max(...resourceTypes.map((type) => getResourceFillRatio(resources[type])));
  const lowestProductionType = getLowestProductionType(resources);

  score += 20;
  reasons.push("+20 base score");

  if (candidate.affordableNow) {
    score += 18;
    reasons.push("+18 affordable now");
  } else if (candidate.blockedByConstructionQueue) {
    score -= 8;
    reasons.push("-8 both construction slots are busy right now");
  } else if (candidate.timeToAffordHours !== null) {
    if (candidate.timeToAffordHours <= 0.5) {
      score += 12;
      reasons.push("+12 affordable very soon");
    } else if (candidate.timeToAffordHours <= 2) {
      score += 8;
      reasons.push("+8 short wait");
    } else if (candidate.timeToAffordHours <= 6) {
      score += 1;
      reasons.push("+1 moderate wait");
    } else {
      score -= 12;
      reasons.push("-12 long wait");
    }
  } else {
    score -= 18;
    reasons.push("-18 blocked by missing production");
  }

  const costEfficiency = clamp(18 - Math.log10(candidate.totalCost + 10) * 5, 2, 18);
  score += costEfficiency;
  reasons.push(`+${Math.round(costEfficiency)} cost efficiency`);

  const lowLevelBonus = clamp(12 - (candidate.level ?? 0), 0, 12);
  score += lowLevelBonus;
  reasons.push(`+${Math.round(lowLevelBonus)} fast population-per-cost`);

  switch (candidate.category) {
    case "resource_crop":
      score += isLowCrop ? 28 : isCropTight ? 14 : 8;
      reasons.push(isLowCrop ? "+28 crop safety" : isCropTight ? "+14 crop buffer" : "+8 stable growth");
      break;
    case "resource_wood":
    case "resource_clay":
    case "resource_iron":
      if (candidate.category === `resource_${lowestProductionType}`) {
        score += 18;
        reasons.push("+18 balances the weakest resource income");
      } else {
        score += 10;
        reasons.push("+10 supports village economy");
      }
      break;
    case "main_building":
      score += isSecondVillageRush ? 18 : 14;
      reasons.push(isSecondVillageRush ? "+18 accelerates early account tempo" : "+14 helps population push");
      break;
    case "warehouse":
    case "granary":
      if (resourceFillPressure >= 0.85) {
        score += 20;
        reasons.push("+20 prevents resource overflow");
      } else {
        score += 6;
        reasons.push("+6 support building");
      }
      break;
    case "expansion":
      score += isSecondVillageRush ? 24 : 12;
      reasons.push(isSecondVillageRush ? "+24 second-village strategy" : "+12 supports continued growth");
      if (cpProgress !== null && cpProgress >= 0.7) {
        score += 10;
        reasons.push("+10 close to next village milestone");
      }
      break;
    case "economic_support":
      score += 14;
      reasons.push("+14 boosts long-term economy");
      break;
    case "utility":
      score += 6;
      reasons.push("+6 utility value");
      break;
    case "military":
      score -= 28;
      reasons.push("-28 military is deprioritized for this growth profile");
      break;
    case "defense":
      score -= 16;
      reasons.push("-16 defense is kept minimal unless needed");
      break;
    default:
      score += 4;
      reasons.push("+4 generic population growth");
      break;
  }

  if (isLowCrop && candidate.category !== "resource_crop" && candidate.category !== "granary") {
    score -= 18;
    reasons.push("-18 low free crop makes this risky");
  }

  const memorySignal = memory.signals[candidate.category];

  if (memorySignal) {
    const learnedBonus = clamp(memorySignal.averagePopulationDelta * 4, -10, 16);
    score += learnedBonus;
    reasons.push(
      `${learnedBonus >= 0 ? "+" : ""}${Math.round(learnedBonus)} memory bias from recent village outcomes`,
    );
  }

  return {
    ...candidate,
    score: Math.round(score),
    reasons,
  };
};

const chooseCandidate = (candidates: RecommendationCandidate[]) => {
  const ranked = candidates.slice().sort((left, right) => right.score - left.score);
  const bestAffordable = ranked.find((candidate) => candidate.affordableNow);
  const bestFuture = ranked.find((candidate) => !candidate.affordableNow);

  if (
    bestFuture &&
    bestFuture.timeToAffordHours !== null &&
    bestFuture.timeToAffordHours <= 3 &&
    (!bestAffordable || bestFuture.score >= bestAffordable.score + 8)
  ) {
    return {
      candidate: bestFuture,
      shouldWait: true,
    };
  }

  if (bestAffordable) {
    return {
      candidate: bestAffordable,
      shouldWait: false,
    };
  }

  if (bestFuture) {
    return {
      candidate: bestFuture,
      shouldWait: true,
    };
  }

  return null;
};

export const buildHeuristicCandidates = (input: {
  snapshot: VillageSnapshotLike;
  history: VillageSnapshotLike[];
  account: AccountStrategyContext;
}): {
  resources: Record<ResourceType, ResourceSnapshotLike>;
  memory: MemoryProfile;
  candidates: RecommendationCandidate[];
  strictRoute: StrictRouteContext | null;
} => {
  const { history, account } = input;
  const snapshot = withEffectiveConstructionState(input.snapshot);
  const resources = getResourceBuckets(snapshot.resources);
  const memory = buildMemoryProfile(history);
  const scoredCandidates = buildCandidateList(snapshot, resources).map((candidate) =>
    scoreCandidate({
      candidate,
      snapshot,
      account,
      resources,
      memory,
    }),
  );
  const strictRoute =
    (account.usedVillageSlots ?? 1) < 2
      ? getStrictRouteRecommendation({
          snapshot,
          account,
          candidates: scoredCandidates,
          resources,
          memory,
        })
      : null;
  const candidates =
    strictRoute?.candidate && !scoredCandidates.some((candidate) => candidate.id === strictRoute.candidateId)
      ? [...scoredCandidates, strictRoute.candidate]
      : scoredCandidates;

  return {
    resources,
    memory,
    candidates,
    strictRoute,
  };
};

const matchesAnyName = (name: string, names: string[]) => {
  const normalized = normalizeText(name);

  return names.some((candidateName) => normalized.includes(normalizeText(candidateName)));
};

const matchesFieldType = (category: CandidateCategory, fieldType: "wood" | "clay" | "iron" | "crop" | "any") => {
  if (fieldType === "any") {
    return (
      category === "resource_wood" ||
      category === "resource_clay" ||
      category === "resource_iron" ||
      category === "resource_crop"
    );
  }

  return category === `resource_${fieldType}`;
};

const getBuildingLevel = (snapshot: VillageSnapshotLike, names: string[]) =>
  snapshot.buildings
    .filter((building) => matchesAnyName(building.name, names))
    .reduce((highestLevel, building) => Math.max(highestLevel, building.level ?? 0), 0);

const getFieldCountAtLevel = (
  snapshot: VillageSnapshotLike,
  fieldType: "wood" | "clay" | "iron" | "crop" | "any",
  targetLevel: number,
) =>
  snapshot.resourceFields.filter((field) =>
    matchesFieldType(getCategoryFromCandidate(field), fieldType) && (field.level ?? 0) >= targetLevel
  ).length;

const isMilestoneComplete = (
  milestone: StrictRouteMilestone,
  snapshot: VillageSnapshotLike,
  account: AccountStrategyContext,
) => {
  switch (milestone.target.kind) {
    case "field":
      return (
        getFieldCountAtLevel(snapshot, milestone.target.fieldType, milestone.target.targetLevel) >=
        milestone.target.requiredCount
      );
    case "building":
      return getBuildingLevel(snapshot, milestone.target.names) >= milestone.target.targetLevel;
    case "population":
      return (snapshot.population ?? 0) >= milestone.target.targetPopulation;
    case "culturePoints":
      return (account.cpProducedForNextSlot ?? 0) >= milestone.target.targetProduced;
    case "manual":
      return false;
  }
};

const findMilestoneCandidate = (
  milestone: StrictRouteMilestone,
  snapshot: VillageSnapshotLike,
  account: AccountStrategyContext,
  candidates: RecommendationCandidate[],
  resources: Record<ResourceType, ResourceSnapshotLike>,
) => {
  switch (milestone.target.kind) {
    case "field": {
      const target = milestone.target;

      return candidates
        .filter(
          (candidate) =>
            candidate.kind === "resourceField" &&
            matchesFieldType(candidate.category, target.fieldType) &&
            (candidate.level ?? 0) < target.targetLevel,
        )
        .sort(
          (left, right) =>
            (left.level ?? 0) - (right.level ?? 0) ||
            left.totalCost - right.totalCost ||
            left.slot - right.slot,
        )[0];
    }
    case "building": {
      const resolveBuildingTarget = (
        targetNames: string[],
        targetLevel: number,
        visitedGids = new Set<number>(),
      ): RecommendationCandidate | undefined => {
        const upgradeCandidate = candidates
          .filter(
            (candidate) =>
              candidate.kind === "building" &&
              matchesAnyName(candidate.name, targetNames) &&
              (candidate.level ?? 0) < targetLevel,
          )
          .sort(
            (left, right) =>
              (left.level ?? 0) - (right.level ?? 0) ||
              left.totalCost - right.totalCost ||
              left.slot - right.slot,
          )[0];

        if (upgradeCandidate) {
          return upgradeCandidate;
        }

        const definition = findBuildingDefinitions(targetNames, account.tribeId)[0];

        if (!definition || visitedGids.has(definition.gid)) {
          return undefined;
        }

        const nextVisited = new Set(visitedGids);
        nextVisited.add(definition.gid);

        for (const prerequisite of definition.prerequisites) {
          if (getBuildingLevel(snapshot, prerequisite.names) >= prerequisite.minimumLevel) {
            continue;
          }

          return resolveBuildingTarget(
            prerequisite.names,
            prerequisite.minimumLevel,
            nextVisited,
          );
        }

        return (
          getConstructionCandidate({
            snapshot,
            resources,
            queueIsFull: (snapshot.activeConstructionSlots ?? 0) >= 2,
            queueWaitHours: getSoonestQueueWaitHours(snapshot),
            definition,
          }) ?? undefined
        );
      };

      return resolveBuildingTarget(milestone.target.names, milestone.target.targetLevel);
    }
    default:
      return undefined;
  }
};

const getExpansionMilestoneOverride = (
  snapshot: VillageSnapshotLike,
  account: AccountStrategyContext,
): StrictRouteMilestone | null => {
  const townHallLevel = getBuildingLevel(snapshot, ["town hall", "ayuntamiento"]);
  const residenceLevel = getBuildingLevel(snapshot, ["residence", "residencia"]);
  const cpProgress =
    account.cpNeededForNextSlot && account.cpNeededForNextSlot > 0
      ? (account.cpProducedForNextSlot ?? 0) / account.cpNeededForNextSlot
      : null;

  if (townHallLevel >= 1 && residenceLevel < 10) {
    return secondVillageRoute.find((milestone) => milestone.id === "residence-10") ?? null;
  }

  if (townHallLevel >= 1 && residenceLevel >= 10 && cpProgress !== null && cpProgress < 1) {
    return {
      id: "party-until-cp-ready",
      title: "Run celebrations until CP are ready",
      summary: `Culture points are at ${Math.round(cpProgress * 100)}%, so keep celebrations ahead of settlers.`,
      target: { kind: "manual" },
      reasons: ["CP is still the bottleneck", "Town Hall is already available"],
    };
  }

  if (residenceLevel >= 10 && (cpProgress === null || cpProgress >= 1)) {
    return secondVillageRoute.find((milestone) => milestone.id === "settlers") ?? null;
  }

  return null;
};

type StrictRouteContext = {
  candidateId: string | null;
  candidate: RecommendationCandidate | null;
  title: string;
  summary: string;
  waitTimeText: string | null;
  shouldWait: boolean;
  reasons: string[];
  score: number;
};

const getStrictRouteRecommendation = (input: {
  snapshot: VillageSnapshotLike;
  account: AccountStrategyContext;
  candidates: RecommendationCandidate[];
  resources: Record<ResourceType, ResourceSnapshotLike>;
  memory: MemoryProfile;
}): StrictRouteContext | null => {
  const { snapshot, account, candidates, resources, memory } = input;
  const override = getExpansionMilestoneOverride(snapshot, account);
  const milestone =
    override ??
    secondVillageRoute.find((routeMilestone) => !isMilestoneComplete(routeMilestone, snapshot, account));

  if (!milestone) {
    return null;
  }

  const milestoneCandidate = findMilestoneCandidate(
    milestone,
    snapshot,
    account,
    candidates,
    resources,
  );

  if (!milestoneCandidate) {
    return {
      candidateId: null,
      candidate: null,
      title: milestone.title,
      summary: `${milestone.summary} Cost and ETA are unavailable until this exact build option appears in the captured village state.`,
      waitTimeText: null,
      shouldWait: true,
      reasons: [...milestone.reasons, "No exact upgrade cost was detected in this snapshot"],
      score: 95,
    };
  }

  const resolvedCandidate =
    milestoneCandidate.score === 0 && milestoneCandidate.reasons.length === 0
      ? scoreCandidate({
          candidate: milestoneCandidate,
          snapshot,
          account,
          resources,
          memory,
        })
      : milestoneCandidate;
  const missing = getMissingResources(resolvedCandidate, resources);
  const missingText = formatResourceList(missing);
  const waitTimeText = formatHoursToText(resolvedCandidate.timeToAffordHours);
  const isPrerequisiteStep =
    !matchesAnyName(
      resolvedCandidate.name,
      milestone.target.kind === "building" ? milestone.target.names : [],
    );
  const action = resolvedCandidate.affordableNow
    ? `${resolvedCandidate.label} is available now.`
    : `Wait ${waitTimeText ?? "until production catches up"} for ${resolvedCandidate.label}.`;
  const prerequisiteText =
    isPrerequisiteStep && milestone.target.kind === "building"
      ? ` Route repair: ${milestoneCandidate.name} is missing before ${milestone.title}.`
      : "";
  const costText = missingText ? ` Missing: ${missingText}.` : "";

  return {
    candidateId: resolvedCandidate.id,
    candidate: resolvedCandidate,
    title: resolvedCandidate.affordableNow ? resolvedCandidate.label : `Wait for ${resolvedCandidate.label}`,
    summary: `${milestone.summary}${prerequisiteText} ${action}${costText}`,
    waitTimeText,
    shouldWait: !resolvedCandidate.affordableNow,
    reasons: [
      ...milestone.reasons,
      ...(resolvedCandidate.affordableNow
        ? ["Strict route step is affordable now"]
        : ["Strict route step is not affordable yet"]),
    ],
    score: Math.max(95, resolvedCandidate.score),
  };
};

const applyStrictRoutePriority = (
  candidates: RecommendationCandidate[],
  strictRoute: StrictRouteContext | null,
) => {
  if (!strictRoute?.candidateId) {
    return candidates.slice().sort((left, right) => right.score - left.score);
  }

  return candidates
    .map((candidate) => {
      if (candidate.id !== strictRoute.candidateId) {
        return candidate;
      }

      return {
        ...candidate,
        score: Math.max(candidate.score, strictRoute.score),
        reasons: [...strictRoute.reasons, ...candidate.reasons],
      };
    })
    .sort((left, right) => right.score - left.score);
};

export const getVillageRecommendation = (input: {
  villageName: string;
  snapshot: VillageSnapshotLike;
  history: VillageSnapshotLike[];
  account: AccountStrategyContext;
}): VillageRecommendation => buildVillageDecision(input).recommendation;

export const buildVillageDecision = (input: {
  villageName: string;
  snapshot: VillageSnapshotLike;
  history: VillageSnapshotLike[];
  account: AccountStrategyContext;
}): VillageDecision => {
  const { villageName, snapshot, history, account } = input;
  const effectiveSnapshot = withEffectiveConstructionState(snapshot);

  if ((effectiveSnapshot.incomingAttacksAmount ?? 0) > 0) {
    return {
      rankedCandidates: [],
      memory: {
        signals: {},
        summary: "Threat state active; memory is ignored until the village is stable again.",
      },
      focus: "Defensive pause",
      recommendation: {
        priority: "critical",
        title: "Manual review required",
        summary: `${villageName} has incoming attacks, so resource spending should wait until the defense picture is clear.`,
        score: 100,
        shouldWait: false,
        waitTimeText: null,
        reasons: ["Incoming attacks override the normal population-growth strategy."],
        memorySummary: "Threat state active; memory is ignored until the village is stable again.",
        focus: "Defensive pause",
        strictRouteTitle: null,
        strictRouteSummary: null,
        strictRouteWaitTime: null,
        strictRouteReasons: [],
        snapshotRecommendationTitle: "Manual review required",
        snapshotRecommendationSummary: `${villageName} has incoming attacks, so resource spending should wait until the defense picture is clear.`,
      },
    };
  }

  const { memory, candidates, strictRoute } = buildHeuristicCandidates({
    snapshot: effectiveSnapshot,
    history,
    account,
  });
  const rankedCandidates = applyStrictRoutePriority(candidates, strictRoute);
  const selected = chooseCandidate(rankedCandidates);
  const isSecondVillageRush = (account.usedVillageSlots ?? 1) < 2;
  const focus = isSecondVillageRush
    ? "Second village rush"
    : "Population leaderboard growth";

  if (!selected) {
    return {
      rankedCandidates,
      memory,
      focus,
      recommendation: {
        priority: "low",
        title: "Review village manually",
        summary: `No clear upgrade candidate was detected yet for ${villageName}.`,
        score: 0,
        shouldWait: false,
        waitTimeText: null,
        reasons: ["No candidate had enough cost and production data to score."],
        memorySummary: memory.summary,
        focus,
        strictRouteTitle: strictRoute?.title ?? null,
        strictRouteSummary: strictRoute?.summary ?? null,
        strictRouteWaitTime: strictRoute?.waitTimeText ?? null,
        strictRouteReasons: strictRoute?.reasons ?? [],
        snapshotRecommendationTitle: "Review village manually",
        snapshotRecommendationSummary: `No clear upgrade candidate was detected yet for ${villageName}.`,
      },
    };
  }

  const waitTimeText = formatHoursToText(selected.candidate.timeToAffordHours);
  const priority =
    selected.candidate.score >= 85
      ? "high"
      : selected.candidate.score >= 65
        ? "medium"
        : "low";
  const topReasons = selected.candidate.reasons.slice(0, 3);
  const summary = selected.shouldWait
    ? selected.candidate.blockedByConstructionQueue
      ? `Wait ${waitTimeText ?? "for a construction slot"} for ${selected.candidate.label}. The village already has both construction slots occupied, so this move is not available yet even if the materials are ready.`
      : `Wait ${waitTimeText ?? "a bit"} for ${selected.candidate.label}. It scores better for fast population growth than spending resources on a weaker option now.`
    : `${selected.candidate.label} is the best current move for population growth. ${topReasons
        .slice(1, 3)
        .join("; ")}.`;
  return {
    rankedCandidates,
    memory,
    focus,
    recommendation: {
      priority,
      title: strictRoute?.title ?? (selected.shouldWait
        ? `Wait for ${selected.candidate.label}`
        : selected.candidate.label),
      summary: strictRoute?.summary ?? summary,
      score: strictRoute?.score ?? selected.candidate.score,
      shouldWait: strictRoute?.shouldWait ?? selected.shouldWait,
      waitTimeText: strictRoute?.waitTimeText ?? waitTimeText,
      reasons: strictRoute?.reasons ?? selected.candidate.reasons,
      memorySummary: memory.summary,
      focus,
      strictRouteTitle: strictRoute?.title ?? null,
      strictRouteSummary: strictRoute?.summary ?? null,
      strictRouteWaitTime: strictRoute?.waitTimeText ?? null,
      strictRouteReasons: strictRoute?.reasons ?? [],
      snapshotRecommendationTitle: selected.shouldWait
        ? `Wait for ${selected.candidate.label}`
        : selected.candidate.label,
      snapshotRecommendationSummary: summary,
    },
  };
};
