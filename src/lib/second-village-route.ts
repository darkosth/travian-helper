export type StrictRouteTarget =
  | {
      kind: "field";
      fieldType: "wood" | "clay" | "iron" | "crop" | "any";
      requiredCount: number;
      targetLevel: number;
    }
  | {
      kind: "building";
      names: string[];
      targetLevel: number;
    }
  | {
      kind: "population";
      targetPopulation: number;
    }
  | {
      kind: "culturePoints";
      targetProduced: number;
    }
  | {
      kind: "manual";
    };

export type StrictRouteMilestone = {
  id: string;
  title: string;
  summary: string;
  target: StrictRouteTarget;
  reasons: string[];
};

export const secondVillageRoute: StrictRouteMilestone[] = [
  {
    id: "main-building-1",
    title: "Main Building to level 1",
    summary: "Lock the starter quest tempo before spending on broader economy.",
    target: { kind: "building", names: ["main building", "edificio principal"], targetLevel: 1 },
    reasons: ["Starter route step", "Unlocks early build flow"],
  },
  {
    id: "one-wood-2",
    title: "One woodcutter to level 2",
    summary: "Open the first resource quest chain with the lowest wood step.",
    target: { kind: "field", fieldType: "wood", requiredCount: 1, targetLevel: 2 },
    reasons: ["Early quest economy", "Cheap production gain"],
  },
  {
    id: "one-crop-2",
    title: "One cropland to level 2",
    summary: "Keep crop stable while the account is still small.",
    target: { kind: "field", fieldType: "crop", requiredCount: 1, targetLevel: 2 },
    reasons: ["Crop safety", "Early quest economy"],
  },
  {
    id: "rally-point-1",
    title: "Build Rally Point",
    summary: "Complete the early utility requirement before heavier expansion spending.",
    target: { kind: "building", names: ["rally point", "punto de reunion"], targetLevel: 1 },
    reasons: ["Route prerequisite", "Minimal utility investment"],
  },
  {
    id: "one-clay-2",
    title: "One clay pit to level 2",
    summary: "Bring clay into the starter route before balancing all fields.",
    target: { kind: "field", fieldType: "clay", requiredCount: 1, targetLevel: 2 },
    reasons: ["Early quest economy", "Balances starter production"],
  },
  {
    id: "one-iron-2",
    title: "One iron mine to level 2",
    summary: "Complete the first round of resource type coverage.",
    target: { kind: "field", fieldType: "iron", requiredCount: 1, targetLevel: 2 },
    reasons: ["Early quest economy", "Balances starter production"],
  },
  {
    id: "all-fields-2",
    title: "All resource fields to level 2",
    summary: "Finish the starter economy baseline before pushing utility and CP.",
    target: { kind: "field", fieldType: "any", requiredCount: 18, targetLevel: 2 },
    reasons: ["Strict route economy baseline", "Improves passive income"],
  },
  {
    id: "granary-1",
    title: "Build Granary",
    summary: "Add crop storage before quest rewards and field growth overflow.",
    target: { kind: "building", names: ["granary", "granero"], targetLevel: 1 },
    reasons: ["Prevents crop overflow", "Route storage prerequisite"],
  },
  {
    id: "warehouse-1",
    title: "Build Warehouse",
    summary: "Add resource storage before larger route rewards land.",
    target: { kind: "building", names: ["warehouse", "almacen"], targetLevel: 1 },
    reasons: ["Prevents resource overflow", "Route storage prerequisite"],
  },
  {
    id: "main-building-3",
    title: "Main Building to level 3",
    summary: "Speed up the account before the first expansion infrastructure block.",
    target: { kind: "building", names: ["main building", "edificio principal"], targetLevel: 3 },
    reasons: ["Faster construction tempo", "Strict route prerequisite"],
  },
  {
    id: "granary-3",
    title: "Granary to level 3",
    summary: "Prepare enough crop capacity for quest rewards and field pushes.",
    target: { kind: "building", names: ["granary", "granero"], targetLevel: 3 },
    reasons: ["Storage buffer", "Supports uninterrupted route progress"],
  },
  {
    id: "marketplace-3",
    title: "Marketplace to level 3",
    summary: "Complete the early marketplace block used by the fast-settle route.",
    target: { kind: "building", names: ["marketplace", "mercado"], targetLevel: 3 },
    reasons: ["Route utility block", "Adds CP and account flexibility"],
  },
  {
    id: "embassy-1",
    title: "Build Embassy",
    summary: "Take the cheap CP and quest value before heavier fields.",
    target: { kind: "building", names: ["embassy", "embajada"], targetLevel: 1 },
    reasons: ["Cheap CP", "Strict route prerequisite"],
  },
  {
    id: "cranny-3",
    title: "Cranny to level 3",
    summary: "Follow the strict route's low-cost population and protection step.",
    target: { kind: "building", names: ["cranny", "escondite"], targetLevel: 3 },
    reasons: ["Cheap population", "Starter safety"],
  },
  {
    id: "wall-3",
    title: "Wall to level 3",
    summary: "Keep the minimal route defense step without drifting into military spending.",
    target: {
      kind: "building",
      names: ["city wall", "wall", "muralla", "empalizada", "earth wall"],
      targetLevel: 3,
    },
    reasons: ["Strict route defense minimum", "Cheap population"],
  },
  {
    id: "all-fields-3",
    title: "All resource fields to level 3",
    summary: "Build the economy base needed for residence and party costs.",
    target: { kind: "field", fieldType: "any", requiredCount: 18, targetLevel: 3 },
    reasons: ["Second-village economy base", "Reduces waiting on large costs"],
  },
  {
    id: "all-fields-4",
    title: "All resource fields to level 4",
    summary: "Finish the main no-raid economy baseline before the heavy expansion phase.",
    target: { kind: "field", fieldType: "any", requiredCount: 18, targetLevel: 4 },
    reasons: ["Strict route economy milestone", "Funds residence and parties"],
  },
  {
    id: "residence-1",
    title: "Build Residence",
    summary: "Start the actual second-village infrastructure path.",
    target: { kind: "building", names: ["residence", "residencia"], targetLevel: 1 },
    reasons: ["Expansion prerequisite", "Direct second-village progress"],
  },
  {
    id: "main-building-12",
    title: "Main Building to level 12",
    summary: "Prepare the village for Town Hall and faster late route construction.",
    target: { kind: "building", names: ["main building", "edificio principal"], targetLevel: 12 },
    reasons: ["Town Hall prerequisite", "Faster construction tempo"],
  },
  {
    id: "academy-10",
    title: "Academy to level 10",
    summary: "Unlock Town Hall while keeping military spending strictly functional.",
    target: { kind: "building", names: ["academy", "academia"], targetLevel: 10 },
    reasons: ["Town Hall prerequisite", "Functional expansion tech"],
  },
  {
    id: "town-hall-1",
    title: "Build Town Hall",
    summary: "Unlock parties so culture points stop being the bottleneck.",
    target: { kind: "building", names: ["town hall", "ayuntamiento"], targetLevel: 1 },
    reasons: ["CP acceleration", "Second-village bottleneck reducer"],
  },
  {
    id: "first-party",
    title: "Run the next small celebration",
    summary: "Spend for culture points once Town Hall is available.",
    target: { kind: "manual" },
    reasons: ["CP acceleration", "The snapshot cannot confirm active parties yet"],
  },
  {
    id: "residence-10",
    title: "Residence to level 10",
    summary: "Finish the residence requirement for three settlers.",
    target: { kind: "building", names: ["residence", "residencia"], targetLevel: 10 },
    reasons: ["Settler prerequisite", "Direct second-village progress"],
  },
  {
    id: "settlers",
    title: "Train three settlers",
    summary: "Once CP and Residence 10 are ready, resources should go to settlers.",
    target: { kind: "manual" },
    reasons: ["Final second-village step", "Requires manual troop training check"],
  },
];
