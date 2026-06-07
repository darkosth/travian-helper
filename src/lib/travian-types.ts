export type ResourceBucket = {
  amount: number | null;
  productionPerHour: number | null;
  capacity: number | null;
};

export type Dorf1Snapshot = {
  schemaVersion: 1;
  source: "dorf1";
  scrapedAt: string;
  page: {
    type: "resourceFields";
    path: string;
    url: string;
  };
  server: {
    timestamp: number | null;
    language: string | null;
    timeZone: string | null;
    timezoneOffsetToUTC: number | null;
  };
  account: {
    currency: {
      gold: number | null;
      silver: number | null;
    };
    player: {
      name: string | null;
      tribeId: number | null;
      isSitter: boolean | null;
      goldFeatures: unknown;
    } | null;
    villages: Array<Record<string, unknown>>;
    culturalPoints: {
      usedSlots: number | null;
      maxControllableVillages: number | null;
      cpProducedForNextSlot: number | null;
      cpNeededForNextSlot: number | null;
      cpProductionTotal: number | null;
    } | null;
  };
  village: {
    current: {
      id: number;
      tribeId: number | null;
      name: string | null;
      sortIndex: number | null;
      population: number | null;
      loyalty: number | null;
      x: number | null;
      y: number | null;
    };
    resources: Record<"wood" | "clay" | "iron" | "crop", ResourceBucket> & {
      freeCrop: number | null;
    };
    troops: Array<{
      unit: string | null;
      amount: number | null;
      code: string | null;
    }>;
    resourceFields: Array<{
      slot: number;
      gid: number;
      type: string;
      name: string;
      level: number | null;
      isMaxLevel: boolean;
      upgradeStatus: string;
      canAffordUpgrade: boolean | null;
      nextLevelCosts: {
        wood: number | null;
        clay: number | null;
        iron: number | null;
        crop: number | null;
      } | null;
      upgradeDuration: string | null;
    }>;
  };
  diagnostics: {
    resourceFieldCount: number;
    troopTypeCount: number;
    fieldsWithUnknownLevel: number[];
    fieldsWithMissingCosts: number[];
    fieldsWithUnknownUpgradeStatus: number[];
  };
};

export type Dorf2Snapshot = {
  schemaVersion: 1;
  source: "dorf2";
  scrapedAt: string;
  page: {
    type: "villageCenter";
    path: string;
    url: string;
  };
  villageRef: {
    id: number;
    name: string | null;
    x: number | null;
    y: number | null;
  };
  villageCenter: {
    summary: {
      totalSlots: number;
      occupiedSlots: number;
      emptySlots: number;
      upgradesAvailableNow: number;
      maxLevelBuildings: number;
    };
    emptySlots: number[];
    buildings: Array<{
      slot: number;
      buildingId: number | null;
      gid: number;
      name: string;
      level: number | null;
      isEmpty: boolean;
      isMaxLevel: boolean;
      canStartUpgradeNow: boolean | null;
      upgradeStatus: string;
      nextLevelCosts: {
        wood: number | null;
        clay: number | null;
        iron: number | null;
        crop: number | null;
      } | null;
      upgradeDuration: string | null;
      href: string | null;
    }>;
  };
  diagnostics: {
    buildingCount: number;
    duplicatedSlots: Array<{
      slot: number;
      variants: number;
    }>;
    buildingsWithUnknownLevel: number[];
    buildingsWithMissingCosts: number[];
    buildingsWithUnknownUpgradeStatus: number[];
    tooltipDebug: Array<{
      slot: number;
      name: string;
      tooltipCandidateCount: number;
      tooltipScore: number;
    }>;
  };
};

export type TravianSnapshot = Dorf1Snapshot | Dorf2Snapshot;
