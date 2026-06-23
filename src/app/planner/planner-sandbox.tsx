"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { reorder } from "@atlaskit/pragmatic-drag-and-drop/reorder";

import {
  getAutomaticSlotForGid,
  getCatalogDefinition,
  getCatalogDisplayName,
  getResourceFieldSelectionValue,
  isLockedSlotForGid,
  parseResourceFieldSelectionValue,
  plannerCatalog,
  STANDARD_4446_RESOURCE_FIELD_LAYOUT,
  supportedServerSpeeds,
  type ServerSpeed,
} from "@/lib/planner/catalog";
import {
  createDefaultInitialSimulationState,
  createDefaultInitialStateProfiles,
  formatInitialBuildings,
  formatInitialResourceFields,
  parseInitialBuildings,
  parseInitialResourceFields,
  parseInitialStateProfilesPayload,
  resolveInitialSimulationState,
  sanitizeInitialSimulationState,
  toSupportedServerSpeed,
  type InitialStateProfiles,
} from "@/lib/planner/initial-state-profiles";
import type {
  PlannerStep,
  PlannerStepAction,
  PlannerStepKind,
  SimulatePlanResult,
  SimulationState,
} from "@/lib/planner/simulator";
import { simulatePlan } from "@/lib/planner/simulator";

const SANDBOX_TRIBE_ID = 3; // Galos

const resourceLabels = {
  wood: "Madera",
  clay: "Barro",
  iron: "Hierro",
  crop: "Cereal",
} as const;

const resourceKeys = Object.keys(resourceLabels) as Array<keyof typeof resourceLabels>;

const createClientStepId = () => {
  if (typeof globalThis !== "undefined" && globalThis.crypto?.randomUUID) {
    return `sandbox-${globalThis.crypto.randomUUID()}`;
  }

  return `sandbox-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

type StoredTemplateStep = {
  id: string;
  position: number;
  stage: number;
  kind: string;
  action: string;
  slot: number;
  gid: number;
  targetLevel: number;
};

type StoredTemplateRevision = {
  id: string;
  revision: number;
  status: string;
  stage: number;
  steps: StoredTemplateStep[];
};

type StoredTemplate = {
  id: string;
  name: string;
  description: string | null;
  serverSpeed: number;
  revisions: StoredTemplateRevision[];
};

type PublishedTemplateResponse = {
  published: StoredTemplateRevision;
  nextDraft: StoredTemplateRevision;
};

const plannerDragDataKey = "planner-step-id";

const plannerStepTones = [
  {
    row: "bg-emerald-950/20",
    border: "border-emerald-700/45",
    badge: "bg-emerald-400/10 text-emerald-100",
    handle: "border-emerald-800/60 bg-emerald-950/35 text-emerald-200",
    input: "border-emerald-900/45 bg-emerald-950/18",
    drag: "bg-emerald-900/28 ring-1 ring-emerald-500/35",
    target: "bg-emerald-900/38 ring-1 ring-emerald-400/45",
  },
  {
    row: "bg-sky-950/20",
    border: "border-sky-700/45",
    badge: "bg-sky-400/10 text-sky-100",
    handle: "border-sky-800/60 bg-sky-950/35 text-sky-200",
    input: "border-sky-900/45 bg-sky-950/18",
    drag: "bg-sky-900/28 ring-1 ring-sky-500/35",
    target: "bg-sky-900/38 ring-1 ring-sky-400/45",
  },
  {
    row: "bg-amber-950/20",
    border: "border-amber-700/45",
    badge: "bg-amber-400/10 text-amber-100",
    handle: "border-amber-800/60 bg-amber-950/35 text-amber-200",
    input: "border-amber-900/45 bg-amber-950/18",
    drag: "bg-amber-900/28 ring-1 ring-amber-500/35",
    target: "bg-amber-900/38 ring-1 ring-amber-400/45",
  },
  {
    row: "bg-violet-950/20",
    border: "border-violet-700/45",
    badge: "bg-violet-400/10 text-violet-100",
    handle: "border-violet-800/60 bg-violet-950/35 text-violet-200",
    input: "border-violet-900/45 bg-violet-950/18",
    drag: "bg-violet-900/28 ring-1 ring-violet-500/35",
    target: "bg-violet-900/38 ring-1 ring-violet-400/45",
  },
  {
    row: "bg-rose-950/20",
    border: "border-rose-700/45",
    badge: "bg-rose-400/10 text-rose-100",
    handle: "border-rose-800/60 bg-rose-950/35 text-rose-200",
    input: "border-rose-900/45 bg-rose-950/18",
    drag: "bg-rose-900/28 ring-1 ring-rose-500/35",
    target: "bg-rose-900/38 ring-1 ring-rose-400/45",
  },
  {
    row: "bg-teal-950/20",
    border: "border-teal-700/45",
    badge: "bg-teal-400/10 text-teal-100",
    handle: "border-teal-800/60 bg-teal-950/35 text-teal-200",
    input: "border-teal-900/45 bg-teal-950/18",
    drag: "bg-teal-900/28 ring-1 ring-teal-500/35",
    target: "bg-teal-900/38 ring-1 ring-teal-400/45",
  },
  {
    row: "bg-orange-950/20",
    border: "border-orange-700/45",
    badge: "bg-orange-400/10 text-orange-100",
    handle: "border-orange-800/60 bg-orange-950/35 text-orange-200",
    input: "border-orange-900/45 bg-orange-950/18",
    drag: "bg-orange-900/28 ring-1 ring-orange-500/35",
    target: "bg-orange-900/38 ring-1 ring-orange-400/45",
  },
  {
    row: "bg-fuchsia-950/20",
    border: "border-fuchsia-700/45",
    badge: "bg-fuchsia-400/10 text-fuchsia-100",
    handle: "border-fuchsia-800/60 bg-fuchsia-950/35 text-fuchsia-200",
    input: "border-fuchsia-900/45 bg-fuchsia-950/18",
    drag: "bg-fuchsia-900/28 ring-1 ring-fuchsia-500/35",
    target: "bg-fuchsia-900/38 ring-1 ring-fuchsia-400/45",
  },
] as const;

const hashPlannerStepKey = (value: string) => {
  let hash = 0;

  for (const character of value) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  return hash;
};

const resourceFieldToneBaseIndexByGid: Record<number, number> = {
  1: 0,
  2: 2,
  3: 1,
  4: 5,
};

const resourceFieldSlotOrderByGid = STANDARD_4446_RESOURCE_FIELD_LAYOUT.reduce<
  Partial<Record<number, number[]>>
>((map, field) => {
  const current = map[field.gid] ?? [];
  current.push(field.slot);
  map[field.gid] = current;
  return map;
}, {});

const getPlannerStepTone = (step: PlannerStep) => {
  if (step.kind === "resourceField") {
    const slotOrder = resourceFieldSlotOrderByGid[step.gid] ?? [];
    const slotIndex = slotOrder.indexOf(step.slot);
    const baseIndex = resourceFieldToneBaseIndexByGid[step.gid];

    if (slotIndex >= 0 && baseIndex !== undefined) {
      return plannerStepTones[(baseIndex + slotIndex * 3) % plannerStepTones.length];
    }

    return plannerStepTones[
      hashPlannerStepKey(`resource:${step.gid}:${step.slot}`) % plannerStepTones.length
    ];
  }

  return plannerStepTones[
    hashPlannerStepKey(`building:${step.slot}:${step.gid}`) % plannerStepTones.length
  ];
};

const secondsToText = (seconds: number) => {
  const roundedMinutes = Math.ceil(seconds / 60);
  const hours = Math.floor(roundedMinutes / 60);
  const minutes = roundedMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
};

const formatMissingResources = (
  missingResources: SimulatePlanResult["steps"][number]["missingResources"],
) =>
  resourceKeys
    .filter((key) => missingResources[key] > 0)
    .map((key) => `${Math.ceil(missingResources[key])} ${resourceLabels[key].toLowerCase()}`)
    .join(", ");

const normalizePositions = (steps: PlannerStep[]) =>
  steps.map((step, index) => ({ ...step, position: index + 1 }));

const normalizeStepProgression = (
  steps: PlannerStep[],
  initialState: SimulationState,
) => {
  const normalized = normalizePositions(steps);
  const progressionLevels = new Map<string, number>();

  return normalized.map((step) => {
    if (step.kind === "resourceField") {
      const key = `resourceField:${step.slot}`;
      const previousLevel = progressionLevels.get(key);
      const baseLevel =
        previousLevel ??
        getKnownInitialResourceFieldLevel(initialState, step.gid, step.slot);
      const targetLevel = baseLevel + 1;

      progressionLevels.set(key, targetLevel);

      return {
        ...step,
        action: "upgrade" as const,
        targetLevel,
      };
    }

    const key = `building:${step.slot}:${step.gid}`;
    const previousLevel = progressionLevels.get(key);
    const initialLevel = getKnownInitialBuildingLevel(
      initialState,
      step.gid,
      step.slot,
    );
    const baseLevel = previousLevel ?? initialLevel;
    const targetLevel = baseLevel + 1;

    progressionLevels.set(key, targetLevel);

    return {
      ...step,
      action: (baseLevel > 0 ? "upgrade" : "construct") as PlannerStepAction,
      targetLevel,
    };
  });
};

const reorderStepsById = (
  steps: PlannerStep[],
  startStepId: string,
  finishStepId: string,
) => {
  const startIndex = steps.findIndex((step) => step.id === startStepId);
  const finishIndex = steps.findIndex((step) => step.id === finishStepId);

  if (
    startIndex < 0 ||
    finishIndex < 0 ||
    startIndex === finishIndex
  ) {
    return steps;
  }

  return normalizePositions(
    reorder({
      list: steps,
      startIndex,
      finishIndex,
    }),
  );
};

const isDefinitionAvailableForGauls = (
  definition: (typeof plannerCatalog)[number],
) => !definition.tribeIds || definition.tribeIds.includes(SANDBOX_TRIBE_ID);

const buildingOptions = plannerCatalog.filter(
  (definition) =>
    definition.slotKind !== "resourceField" &&
    isDefinitionAvailableForGauls(definition),
);

const describePlannedStep = (step: PlannerStep) => {
  const definition = getCatalogDefinition(step.gid);
  const name = getCatalogDisplayName(step.gid, definition?.name);
  const sourceLevel = Math.max(0, step.targetLevel - 1);
  return `${name} · slot ${step.slot} · nivel ${sourceLevel} → ${step.targetLevel}`;
};

const toEditableSteps = (steps: StoredTemplateStep[]): PlannerStep[] =>
  normalizePositions(
    steps.map((step) => ({
      id: step.id,
      position: step.position,
      stage: step.stage as PlannerStep["stage"],
      kind: step.kind as PlannerStep["kind"],
      action: step.action as PlannerStep["action"],
      slot: step.slot,
      gid: step.gid,
      targetLevel: step.targetLevel,
    })),
  );

const getPreviousMatchingStep = (
  steps: PlannerStep[],
  currentIndex: number,
  predicate: (step: PlannerStep) => boolean,
) => [...steps.slice(0, currentIndex)].reverse().find(predicate) ?? null;

const getKnownInitialBuildingLevel = (
  initialState: SimulationState,
  gid: number,
  slot: number,
) => {
  const building = initialState.buildings[slot];
  return building?.gid === gid ? building.level : 0;
};

const getKnownInitialResourceFieldLevel = (
  initialState: SimulationState,
  gid: number,
  slot: number,
) => {
  const field = initialState.resourceFields[slot];
  return field?.gid === gid ? field.level : 0;
};

const getNextResourceFieldDefaults = (
  steps: PlannerStep[],
  currentIndex: number,
  field: { gid: number; slot: number },
  initialState: SimulationState,
) => {
  const previous = getPreviousMatchingStep(
    steps,
    currentIndex,
    (step) =>
      step.kind === "resourceField" &&
      step.gid === field.gid &&
      step.slot === field.slot,
  );
  const initialLevel = getKnownInitialResourceFieldLevel(
    initialState,
    field.gid,
    field.slot,
  );

  return {
    gid: field.gid,
    slot: field.slot,
    action: "upgrade" as const,
    targetLevel: previous ? previous.targetLevel + 1 : initialLevel + 1,
  };
};

const getNextBuildingDefaults = (
  steps: PlannerStep[],
  currentIndex: number,
  gid: number,
  fallbackSlot: number,
  initialState: SimulationState,
) => {
  const previousSameBuilding = getPreviousMatchingStep(
    steps,
    currentIndex,
    (step) => step.kind === "building" && step.gid === gid,
  );

  if (previousSameBuilding) {
    return {
      gid,
      slot: previousSameBuilding.slot,
      action: "upgrade" as const,
      targetLevel: previousSameBuilding.targetLevel + 1,
    };
  }

  const slot = getAutomaticSlotForGid(gid) ?? fallbackSlot;
  const initialLevel = getKnownInitialBuildingLevel(initialState, gid, slot);

  return {
    gid,
    slot,
    action: (initialLevel > 0 ? "upgrade" : "construct") as PlannerStepAction,
    targetLevel: initialLevel + 1,
  };
};

const createInitialSteps = (initialState: SimulationState): PlannerStep[] => {
  const firstResourceField = STANDARD_4446_RESOURCE_FIELD_LAYOUT[0];
  const mainBuildingLevel = getKnownInitialBuildingLevel(initialState, 15, 26);

  return [
    {
      id: createClientStepId(),
      position: 1,
      stage: 1,
      kind: "building",
      action: mainBuildingLevel > 0 ? "upgrade" : "construct",
      slot: 26,
      gid: 15,
      targetLevel: mainBuildingLevel + 1,
    },
    {
      id: createClientStepId(),
      position: 2,
      stage: 1,
      kind: "resourceField",
      ...getNextResourceFieldDefaults([], 0, firstResourceField, initialState),
    },
  ];
};

const numberFromInput = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

const NumberInput = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) => (
  <label className="space-y-1 text-xs text-zinc-400">
    <span>{label}</span>
    <input
      className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100"
      min={0}
      type="number"
      value={value}
      onChange={(event) => onChange(numberFromInput(event.target.value))}
    />
  </label>
);

type PlannerStepRowProps = {
  step: PlannerStep;
  index: number;
  stepCount: number;
  result: SimulatePlanResult["steps"][number] | undefined;
  automaticSlot: number | null;
  slotLocked: boolean;
  onReorderSteps: (startStepId: string, finishStepId: string) => void;
  onChangeStepKind: (id: string, kind: PlannerStepKind) => void;
  onChangeResourceField: (id: string, value: string) => void;
  onChangeStepGid: (id: string, gid: number) => void;
  onUpdateStep: <Key extends keyof PlannerStep>(
    id: string,
    key: Key,
    value: PlannerStep[Key],
  ) => void;
  onChangeBuildingSlot: (id: string, slot: number) => void;
  onMoveStep: (index: number, direction: -1 | 1) => void;
  onDuplicateStep: (index: number) => void;
  onRemoveStep: (id: string) => void;
};

const getPlannerStepSlotHint = (
  step: PlannerStep,
  slotLocked: boolean,
  automaticSlot: number | null,
) => {
  if (step.kind === "resourceField") {
    return "Slot fijo del layout 4-4-4-6";
  }

  if (slotLocked) {
    return "Slot fijo";
  }

  if (automaticSlot !== null) {
    return "Slot inicial sugerido";
  }

  return null;
};

const renderPlannerStepResult = (
  result: SimulatePlanResult["steps"][number] | undefined,
) => {
  if (!result) {
    return <p>Sin simular</p>;
  }

  return (
    <p>
      {result.status} · espera {secondsToText(result.waitForResourcesSeconds)} ·
      obra {secondsToText(result.buildDurationSeconds)}
      {formatMissingResources(result.missingResources)
        ? ` · falta ${formatMissingResources(result.missingResources)}`
        : ""}
      {result.message ? ` · ${result.message}` : ""}
    </p>
  );
};

const getPlannerStepResultCardClassName = (
  result: SimulatePlanResult["steps"][number] | undefined,
) => {
  if (!result) {
    return "border-zinc-800/80 bg-black/15";
  }

  return result.status === "valid"
    ? "border-emerald-900/70 bg-emerald-950/20"
    : "border-red-900/70 bg-red-950/25";
};

const PlannerStepRow = ({
  step,
  index,
  stepCount,
  result,
  automaticSlot,
  slotLocked,
  onReorderSteps,
  onChangeStepKind,
  onChangeResourceField,
  onChangeStepGid,
  onUpdateStep,
  onChangeBuildingSlot,
  onMoveStep,
  onDuplicateStep,
  onRemoveStep,
}: PlannerStepRowProps) => {
  const rowRef = useRef<HTMLTableRowElement | null>(null);
  const dragHandleRef = useRef<HTMLButtonElement | null>(null);
  const [isDraggedOver, setIsDraggedOver] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const tone = getPlannerStepTone(step);
  const rowClassName = [
    "align-top border-l-2 transition-colors duration-150",
    tone.row,
    tone.border,
    isDragging ? tone.drag : "",
    isDraggedOver ? tone.target : "",
  ]
    .filter(Boolean)
    .join(" ");
  const fieldClassName = `w-full min-w-0 rounded border px-2 py-1 text-zinc-100 transition-colors ${tone.input}`;

  useEffect(() => {
    const rowElement = rowRef.current;
    const dragHandleElement = dragHandleRef.current;

    if (!rowElement || !dragHandleElement) {
      return;
    }

    const cleanupDraggable = draggable({
      element: rowElement,
      dragHandle: dragHandleElement,
      getInitialData: () => ({
        [plannerDragDataKey]: step.id,
      }),
      onDragStart: () => setIsDragging(true),
      onDrop: () => setIsDragging(false),
    });

    const cleanupDropTarget = dropTargetForElements({
      element: rowElement,
      canDrop: ({ source }) =>
        typeof source.data[plannerDragDataKey] === "string" &&
        source.data[plannerDragDataKey] !== step.id,
      getData: () => ({
        [plannerDragDataKey]: step.id,
      }),
      onDragEnter: () => setIsDraggedOver(true),
      onDragLeave: () => setIsDraggedOver(false),
      onDrop: ({ source, self }) => {
        setIsDraggedOver(false);

        const sourceStepId = source.data[plannerDragDataKey];
        const targetStepId = self.data[plannerDragDataKey];

        if (
          typeof sourceStepId === "string" &&
          typeof targetStepId === "string"
        ) {
          onReorderSteps(sourceStepId, targetStepId);
        }
      },
    });

    return () => {
      cleanupDraggable();
      cleanupDropTarget();
    };
  }, [onReorderSteps, step.id]);

  return (
    <tr
      className={rowClassName}
      key={step.id}
      ref={rowRef}
    >
      <td className="px-2 py-3 text-zinc-300">
        <div className="flex items-center gap-2">
          <button
            aria-label={`Arrastrar paso ${index + 1}`}
            className={`cursor-grab rounded px-1.5 py-1 text-[10px] hover:text-zinc-50 active:cursor-grabbing ${tone.handle}`}
            ref={dragHandleRef}
            type="button"
          >
            ⋮⋮
          </button>
          <div className="space-y-1">
            <span className="block leading-none">{index + 1}</span>
            <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] ${tone.badge}`}>
              {step.kind === "resourceField" ? "Campo" : "Edificio"}
            </span>
          </div>
        </div>
      </td>
      <td className="px-2 py-3">
        <select
          className={fieldClassName}
          value={step.kind}
          onChange={(event) =>
            onChangeStepKind(step.id, event.target.value as PlannerStepKind)
          }
        >
          <option value="resourceField">Campo</option>
          <option value="building">Edificio</option>
        </select>
      </td>
      <td className="px-2 py-3">
        {step.kind === "resourceField" ? (
          <select
            className={fieldClassName}
            value={getResourceFieldSelectionValue({ gid: step.gid, slot: step.slot })}
            onChange={(event) => onChangeResourceField(step.id, event.target.value)}
          >
            {STANDARD_4446_RESOURCE_FIELD_LAYOUT.map((field) => {
              const definition = getCatalogDefinition(field.gid);
              return (
                <option
                  key={`${field.slot}-${field.gid}`}
                  value={getResourceFieldSelectionValue(field)}
                >
                  {getCatalogDisplayName(field.gid, definition?.name)} · slot{" "}
                  {field.slot}
                </option>
              );
            })}
          </select>
        ) : (
          <select
            className={fieldClassName}
            value={step.gid}
            onChange={(event) => onChangeStepGid(step.id, Number(event.target.value))}
          >
            {buildingOptions.map((definition) => (
              <option key={definition.gid} value={definition.gid}>
                {getCatalogDisplayName(definition.gid, definition.name)}
              </option>
            ))}
          </select>
        )}
        <p className="mt-1 break-words text-xs leading-4 text-zinc-400">
          {describePlannedStep(step)} · gid interno {step.gid}
        </p>
      </td>
      <td className="px-2 py-3">
        <select
          className={fieldClassName}
          value={step.action}
          onChange={(event) =>
            onUpdateStep(step.id, "action", event.target.value as PlannerStep["action"])
          }
        >
          <option value="upgrade">upgrade</option>
          <option value="construct">construct</option>
        </select>
      </td>
      <td className="px-2 py-3">
        <input
          className={fieldClassName}
          disabled={slotLocked}
          min={1}
          type="number"
          value={step.slot}
          onChange={(event) =>
            onChangeBuildingSlot(step.id, Number(event.target.value))
          }
        />
        {getPlannerStepSlotHint(step, slotLocked, automaticSlot) ? (
          <p className="mt-1 text-xs leading-4 text-zinc-400">
            {getPlannerStepSlotHint(step, slotLocked, automaticSlot)}
          </p>
        ) : null}
      </td>
      <td className="px-2 py-3">
        <input
          className={fieldClassName}
          min={1}
          type="number"
          value={step.targetLevel}
          onChange={(event) =>
            onUpdateStep(step.id, "targetLevel", Number(event.target.value))
          }
        />
      </td>
      <td className="px-2 py-3 text-xs leading-4 text-zinc-400">
        {renderPlannerStepResult(result)}
      </td>
      <td className="px-2 py-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <button
            className="text-zinc-400 hover:text-zinc-100"
            disabled={index === 0}
            title="Mover hacia arriba"
            type="button"
            onClick={() => onMoveStep(index, -1)}
          >
            ↑
          </button>
          <button
            className="text-zinc-400 hover:text-zinc-100"
            disabled={index === stepCount - 1}
            title="Mover hacia abajo"
            type="button"
            onClick={() => onMoveStep(index, 1)}
          >
            ↓
          </button>
          <button
            className="text-sky-400 hover:text-sky-300"
            type="button"
            onClick={() => onDuplicateStep(index)}
          >
            Duplicar
          </button>
          <button
            className="text-red-400 hover:text-red-300"
            type="button"
            onClick={() => onRemoveStep(step.id)}
          >
            Eliminar
          </button>
        </div>
      </td>
    </tr>
  );
};

const PlannerStepCard = ({
  step,
  index,
  stepCount,
  result,
  automaticSlot,
  slotLocked,
  onReorderSteps,
  onChangeStepKind,
  onChangeResourceField,
  onChangeStepGid,
  onUpdateStep,
  onChangeBuildingSlot,
  onMoveStep,
  onDuplicateStep,
  onRemoveStep,
}: PlannerStepRowProps) => {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const dragHandleRef = useRef<HTMLButtonElement | null>(null);
  const [isDraggedOver, setIsDraggedOver] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const tone = getPlannerStepTone(step);
  const cardClassName = [
    "rounded-xl border border-l-2 p-3 transition-colors duration-150",
    tone.row,
    tone.border,
    isDragging ? tone.drag : "",
    isDraggedOver ? tone.target : "",
  ]
    .filter(Boolean)
    .join(" ");
  const fieldClassName = `mt-1 w-full rounded-lg border px-2.5 py-2 text-sm text-zinc-100 transition-colors ${tone.input}`;

  useEffect(() => {
    const cardElement = cardRef.current;
    const dragHandleElement = dragHandleRef.current;

    if (!cardElement || !dragHandleElement) {
      return;
    }

    const cleanupDraggable = draggable({
      element: cardElement,
      dragHandle: dragHandleElement,
      getInitialData: () => ({
        [plannerDragDataKey]: step.id,
      }),
      onDragStart: () => setIsDragging(true),
      onDrop: () => setIsDragging(false),
    });

    const cleanupDropTarget = dropTargetForElements({
      element: cardElement,
      canDrop: ({ source }) =>
        typeof source.data[plannerDragDataKey] === "string" &&
        source.data[plannerDragDataKey] !== step.id,
      getData: () => ({
        [plannerDragDataKey]: step.id,
      }),
      onDragEnter: () => setIsDraggedOver(true),
      onDragLeave: () => setIsDraggedOver(false),
      onDrop: ({ source, self }) => {
        setIsDraggedOver(false);

        const sourceStepId = source.data[plannerDragDataKey];
        const targetStepId = self.data[plannerDragDataKey];

        if (
          typeof sourceStepId === "string" &&
          typeof targetStepId === "string"
        ) {
          onReorderSteps(sourceStepId, targetStepId);
        }
      },
    });

    return () => {
      cleanupDraggable();
      cleanupDropTarget();
    };
  }, [onReorderSteps, step.id]);

  return (
    <article className={cardClassName} ref={cardRef}>
      <div className="flex items-start gap-2.5">
        <button
          aria-label={`Arrastrar paso ${index + 1}`}
          className={`mt-0.5 inline-flex items-center gap-1 cursor-grab rounded-md px-2 py-1 text-[11px] font-medium hover:text-zinc-50 active:cursor-grabbing ${tone.handle}`}
          ref={dragHandleRef}
          type="button"
        >
          <span className="text-xs leading-none">⋮⋮</span>
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold leading-none text-zinc-100">
              Paso {index + 1}
            </span>
            <span
              className={`inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.14em] ${tone.badge}`}
            >
              {step.kind === "resourceField" ? "Campo" : "Edificio"}
            </span>
          </div>
          <p className="mt-1.5 break-words text-sm leading-4 text-zinc-200">
            {getCatalogDisplayName(
              step.gid,
              getCatalogDefinition(step.gid)?.name,
            )}{" "}
            · slot {step.slot} · lvl {step.targetLevel}
          </p>
          <p className="mt-0.5 text-[11px] leading-4 text-zinc-500">
            {step.action} · gid {step.gid}
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-2.5">
        <div className="grid grid-cols-[minmax(0,1fr)_92px] gap-2">
          <label className="text-[11px] text-zinc-400">
            Mejora
            {step.kind === "resourceField" ? (
              <select
                className={fieldClassName}
                value={getResourceFieldSelectionValue({ gid: step.gid, slot: step.slot })}
                onChange={(event) => onChangeResourceField(step.id, event.target.value)}
              >
                {STANDARD_4446_RESOURCE_FIELD_LAYOUT.map((field) => {
                  const definition = getCatalogDefinition(field.gid);
                  return (
                    <option
                      key={`${field.slot}-${field.gid}`}
                      value={getResourceFieldSelectionValue(field)}
                    >
                      {getCatalogDisplayName(field.gid, definition?.name)} · slot{" "}
                      {field.slot}
                    </option>
                  );
                })}
              </select>
            ) : (
              <select
                className={fieldClassName}
                value={step.gid}
                onChange={(event) => onChangeStepGid(step.id, Number(event.target.value))}
              >
                {buildingOptions.map((definition) => (
                  <option key={definition.gid} value={definition.gid}>
                    {getCatalogDisplayName(definition.gid, definition.name)}
                  </option>
                ))}
              </select>
            )}
          </label>

          <label className="text-[11px] text-zinc-400">
            Tipo
            <select
              className={fieldClassName}
              value={step.kind}
              onChange={(event) =>
                onChangeStepKind(step.id, event.target.value as PlannerStepKind)
              }
            >
              <option value="resourceField">Campo</option>
              <option value="building">Edificio</option>
            </select>
          </label>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <label className="text-[11px] text-zinc-400">
            Acción
            <select
              className={fieldClassName}
              value={step.action}
              onChange={(event) =>
                onUpdateStep(
                  step.id,
                  "action",
                  event.target.value as PlannerStep["action"],
                )
              }
            >
              <option value="upgrade">upgrade</option>
              <option value="construct">construct</option>
            </select>
          </label>

          <label className="text-[11px] text-zinc-400">
            Slot
            <input
              className={fieldClassName}
              disabled={slotLocked}
              min={1}
              type="number"
              value={step.slot}
              onChange={(event) =>
                onChangeBuildingSlot(step.id, Number(event.target.value))
              }
            />
          </label>

          <label className="text-[11px] text-zinc-400">
            Nivel
            <input
              className={fieldClassName}
              min={1}
              type="number"
              value={step.targetLevel}
              onChange={(event) =>
                onUpdateStep(step.id, "targetLevel", Number(event.target.value))
              }
            />
          </label>
        </div>

        {getPlannerStepSlotHint(step, slotLocked, automaticSlot) ? (
          <p className="text-[11px] leading-4 text-zinc-500">
            {getPlannerStepSlotHint(step, slotLocked, automaticSlot)}
          </p>
        ) : null}

        <div
          className={`rounded-lg border px-2.5 py-2 text-[11px] leading-4 text-zinc-300 ${getPlannerStepResultCardClassName(result)}`}
        >
          <p className="font-medium text-zinc-100">Resultado</p>
          <div className="mt-0.5 text-zinc-400">{renderPlannerStepResult(result)}</div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-xs">
          <button
            className="rounded-md border border-zinc-700 px-2 py-1.5 text-zinc-200 disabled:opacity-40"
            disabled={index === 0}
            type="button"
            onClick={() => onMoveStep(index, -1)}
          >
            ↑
          </button>
          <button
            className="rounded-md border border-zinc-700 px-2 py-1.5 text-zinc-200 disabled:opacity-40"
            disabled={index === stepCount - 1}
            type="button"
            onClick={() => onMoveStep(index, 1)}
          >
            ↓
          </button>
          <button
            className="rounded-md border border-sky-900/70 px-2.5 py-1.5 text-sky-300"
            type="button"
            onClick={() => onDuplicateStep(index)}
          >
            Duplicar
          </button>
          <button
            className="rounded-md border border-red-900/70 px-2.5 py-1.5 text-red-300"
            type="button"
            onClick={() => onRemoveStep(step.id)}
          >
            Eliminar
          </button>
        </div>
      </div>
    </article>
  );
};

export const PlannerSandbox = () => {
  const [initialProfiles, setInitialProfiles] = useState<InitialStateProfiles>(
    () => createDefaultInitialStateProfiles(),
  );
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [profilesSaving, setProfilesSaving] = useState(false);
  const [dirtyProfileSpeeds, setDirtyProfileSpeeds] = useState<ServerSpeed[]>([]);
  const [serverSpeed, setServerSpeed] = useState<ServerSpeed>(1);
  const activeBaseProfile = initialProfiles[serverSpeed];
  const activeInitialState = useMemo(
    () => resolveInitialSimulationState(activeBaseProfile, serverSpeed),
    [activeBaseProfile, serverSpeed],
  );
  const activeProfileDirty = dirtyProfileSpeeds.includes(serverSpeed);

  const [steps, setSteps] = useState(() =>
    createInitialSteps(createDefaultInitialSimulationState()),
  );
  const [templateName, setTemplateName] = useState("Gaul x1 · Sandbox");
  const [templates, setTemplates] = useState<StoredTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [draftRevisionId, setDraftRevisionId] = useState<string | null>(null);
  const [draftRevisionNumber, setDraftRevisionNumber] = useState<number | null>(
    null,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [buildingsDraft, setBuildingsDraft] = useState(() =>
    formatInitialBuildings(createDefaultInitialSimulationState().buildings),
  );
  const [resourceFieldsDraft, setResourceFieldsDraft] = useState(() =>
    formatInitialResourceFields(
      createDefaultInitialSimulationState().resourceFields,
    ),
  );

  const simulation = useMemo<SimulatePlanResult | null>(() => {
    try {
      return simulatePlan({
        initialState: activeInitialState,
        steps,
        serverSpeed,
      });
    } catch {
      return null;
    }
  }, [activeInitialState, serverSpeed, steps]);

  const simulatedByStepId = useMemo(
    () =>
      new Map(
        simulation?.steps.map((step) => [step.step.id, step] as const) ?? [],
      ),
    [simulation],
  );

  const normalizeEditorSteps = useCallback(
    (nextSteps: PlannerStep[]) =>
      normalizeStepProgression(nextSteps, activeInitialState),
    [activeInitialState],
  );

  const loadInitialProfiles = useCallback(async () => {
    setProfilesLoading(true);

    try {
      const response = await fetch("/api/planner/initial-state-profiles", {
        cache: "no-store",
      });
      const payload = (await response.json()) as unknown;

      if (!response.ok) {
        const errorPayload = payload as { error?: string };
        throw new Error(
          errorPayload.error ?? "No se pudieron cargar los perfiles iniciales.",
        );
      }

      setInitialProfiles(parseInitialStateProfilesPayload(payload));
      setDirtyProfileSpeeds([]);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudieron cargar los perfiles iniciales.",
      );
    } finally {
      setProfilesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInitialProfiles();
  }, [loadInitialProfiles]);

  useEffect(() => {
    setBuildingsDraft(formatInitialBuildings(activeInitialState.buildings));
    setResourceFieldsDraft(
      formatInitialResourceFields(activeInitialState.resourceFields),
    );
  }, [activeInitialState.buildings, activeInitialState.resourceFields, serverSpeed]);

  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true);

    try {
      const response = await fetch("/api/planner/templates", {
        cache: "no-store",
      });
      const payload = (await response.json()) as
        | StoredTemplate[]
        | { error?: string };

      if (!response.ok || !Array.isArray(payload)) {
        throw new Error(
          !Array.isArray(payload)
            ? payload.error
            : "No se pudieron cargar las rutas.",
        );
      }

      setTemplates(payload);
      return payload;
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudieron cargar las rutas.",
      );
      return [];
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const updateActiveProfile = (
    updater: (current: SimulationState) => SimulationState,
  ) => {
    setInitialProfiles((current) => ({
      ...current,
      [serverSpeed]: updater(current[serverSpeed]),
    }));
    setDirtyProfileSpeeds((current) =>
      current.includes(serverSpeed) ? current : [...current, serverSpeed],
    );
  };

  const updateInitialResource = (
    key: keyof SimulationState["resources"],
    value: number,
  ) => {
    updateActiveProfile((current) => ({
      ...current,
      resources: { ...current.resources, [key]: value },
    }));
  };

  const updateInitialProduction = (
    key: keyof SimulationState["productionPerHour"],
    value: number,
  ) => {
    updateActiveProfile((current) => ({
      ...current,
      productionPerHour: { ...current.productionPerHour, [key]: value },
    }));
  };

  const updateInitialCapacity = (
    key: keyof SimulationState["capacity"],
    value: number,
  ) => {
    updateActiveProfile((current) => ({
      ...current,
      capacity: { ...current.capacity, [key]: value },
    }));
  };

  const updateInitialScalar = (
    key: "freeCrop" | "population" | "mainBuildingLevel",
    value: number,
  ) => {
    updateActiveProfile((current) => ({ ...current, [key]: value }));
  };

  const applyInitialSlotDrafts = () => {
    try {
      const buildings = parseInitialBuildings(buildingsDraft);
      const resourceFields = parseInitialResourceFields(resourceFieldsDraft);

      updateActiveProfile((current) => ({
        ...current,
        buildings,
        resourceFields,
        mainBuildingLevel:
          buildings[26]?.gid === 15
            ? buildings[26].level
            : current.mainBuildingLevel,
      }));
      setMessage(
        `Perfil inicial x${serverSpeed} actualizado localmente. Guarda el perfil para persistirlo en DB.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo actualizar el perfil inicial.",
      );
    }
  };

  const saveActiveProfile = async () => {
    setProfilesSaving(true);

    try {
      const response = await fetch("/api/planner/initial-state-profiles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serverSpeed,
          profile: activeBaseProfile,
        }),
      });
      const payload = (await response.json()) as {
        profile?: unknown;
        error?: string;
      };

      if (!response.ok || !payload.profile) {
        throw new Error(payload.error ?? "No se pudo guardar el perfil inicial.");
      }

      const savedProfile = sanitizeInitialSimulationState(payload.profile);
      setInitialProfiles((current) => ({
        ...current,
        [serverSpeed]: savedProfile,
      }));
      setDirtyProfileSpeeds((current) =>
        current.filter((speed) => speed !== serverSpeed),
      );

      return savedProfile;
    } finally {
      setProfilesSaving(false);
    }
  };

  const persistActiveProfileIfNeeded = async () =>
    activeProfileDirty ? saveActiveProfile() : activeBaseProfile;

  const restoreActiveProfile = async () => {
    setProfilesSaving(true);

    try {
      const response = await fetch(
        `/api/planner/initial-state-profiles?serverSpeed=${serverSpeed}`,
        { method: "DELETE" },
      );
      const payload = (await response.json()) as {
        profile?: unknown;
        error?: string;
      };

      if (!response.ok || !payload.profile) {
        throw new Error(payload.error ?? "No se pudo restaurar el perfil inicial.");
      }

      const restored = sanitizeInitialSimulationState(payload.profile);
      setInitialProfiles((current) => ({
        ...current,
        [serverSpeed]: restored,
      }));
      setDirtyProfileSpeeds((current) =>
        current.filter((speed) => speed !== serverSpeed),
      );
      setBuildingsDraft(formatInitialBuildings(restored.buildings));
      setResourceFieldsDraft(formatInitialResourceFields(restored.resourceFields));
      setMessage(`Perfil inicial x${serverSpeed} restaurado y guardado en DB.`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo restaurar el perfil inicial.",
      );
    } finally {
      setProfilesSaving(false);
    }
  };

  const handleServerSpeedChange = (value: number) => {
    setServerSpeed(toSupportedServerSpeed(value));
  };

  const openTemplate = (
    templateId: string,
    availableTemplates = templates,
  ) => {
    const template = availableTemplates.find((item) => item.id === templateId);
    if (!template) return;

    const draft = template.revisions.find((revision) => revision.status === "draft");
    if (!draft) {
      setMessage(
        "Esta ruta no tiene un borrador editable. Publica nuevamente o crea una revisión draft.",
      );
      return;
    }

    setSelectedTemplateId(template.id);
    setDraftRevisionId(draft.id);
    setDraftRevisionNumber(draft.revision);
    setTemplateName(template.name);
    setServerSpeed(toSupportedServerSpeed(template.serverSpeed));
    setSteps(normalizeEditorSteps(toEditableSteps(draft.steps)));
    setMessage(`Editando ${template.name} · borrador revisión ${draft.revision}.`);
  };

  const startNewTemplate = () => {
    const initialSpeed: ServerSpeed = 1;

    setSelectedTemplateId("");
    setDraftRevisionId(null);
    setDraftRevisionNumber(null);
    setTemplateName("Gaul x1 · Nueva ruta");
    setServerSpeed(initialSpeed);
    setSteps(
      normalizeEditorSteps(createInitialSteps(initialProfiles[initialSpeed])),
    );
    setMessage("Nueva ruta preparada. Guarda el borrador cuando quieras conservarla.");
  };

  const updateStep = <Key extends keyof PlannerStep>(
    id: string,
    key: Key,
    value: PlannerStep[Key],
  ) => {
    setSteps((current) =>
      normalizeEditorSteps(
        current.map((step) => (step.id === id ? { ...step, [key]: value } : step)),
      ),
    );
  };

  const changeStepKind = (id: string, kind: PlannerStepKind) => {
    const firstResourceField = STANDARD_4446_RESOURCE_FIELD_LAYOUT[0];
    const firstBuilding = buildingOptions[0];

    setSteps((current) => {
      const currentIndex = current.findIndex((step) => step.id === id);
      if (currentIndex < 0) return current;

      return normalizeEditorSteps(current.map((step, index) => {
        if (index !== currentIndex) return step;

        if (kind === "resourceField") {
          return {
            ...step,
            kind,
            ...getNextResourceFieldDefaults(
              current,
              currentIndex,
              firstResourceField,
              activeInitialState,
            ),
          };
        }

        if (!firstBuilding) return step;

        return {
          ...step,
          kind,
          ...getNextBuildingDefaults(
            current,
            currentIndex,
            firstBuilding.gid,
            20,
            activeInitialState,
          ),
        };
      }));
    });
  };

  const changeStepGid = (id: string, gid: number) => {
    setSteps((current) => {
      const currentIndex = current.findIndex((step) => step.id === id);
      if (currentIndex < 0) return current;

      return normalizeEditorSteps(current.map((step, index) =>
        index === currentIndex
          ? {
              ...step,
              ...getNextBuildingDefaults(
                current,
                currentIndex,
                gid,
                step.slot,
                activeInitialState,
              ),
            }
          : step,
      ));
    });
  };

  const changeBuildingSlot = (id: string, slot: number) => {
    setSteps((current) => {
      const currentIndex = current.findIndex((step) => step.id === id);
      if (currentIndex < 0) return current;

      const currentStep = current[currentIndex];
      const previous = getPreviousMatchingStep(
        current,
        currentIndex,
        (step) =>
          step.kind === "building" &&
          step.gid === currentStep.gid &&
          step.slot === slot,
      );
      const initialLevel = getKnownInitialBuildingLevel(
        activeInitialState,
        currentStep.gid,
        slot,
      );

      return normalizeEditorSteps(current.map((step, index) =>
        index === currentIndex
          ? {
              ...step,
              slot,
              action: (previous || initialLevel > 0
                ? "upgrade"
                : "construct") as PlannerStepAction,
              targetLevel: previous ? previous.targetLevel + 1 : initialLevel + 1,
            }
          : step,
      ));
    });
  };

  const changeResourceField = (id: string, value: string) => {
    const field = parseResourceFieldSelectionValue(value);
    if (!field) return;

    setSteps((current) => {
      const currentIndex = current.findIndex((step) => step.id === id);
      if (currentIndex < 0) return current;

      return normalizeEditorSteps(current.map((step, index) =>
        index === currentIndex
          ? {
              ...step,
              ...getNextResourceFieldDefaults(
                current,
                currentIndex,
                field,
                activeInitialState,
              ),
            }
          : step,
      ));
    });
  };

  const moveStep = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= steps.length) return;

    const reordered = [...steps];
    [reordered[index], reordered[nextIndex]] = [
      reordered[nextIndex],
      reordered[index],
    ];
    setSteps(normalizeEditorSteps(reordered));
  };

  const reorderSteps = (startStepId: string, finishStepId: string) => {
    setSteps((current) =>
      normalizeEditorSteps(reorderStepsById(current, startStepId, finishStepId)),
    );
  };

  const addStep = () => {
    setSteps((current) => {
      const firstResourceField = STANDARD_4446_RESOURCE_FIELD_LAYOUT[0];

      return normalizeEditorSteps([
        ...current,
        {
          id: createClientStepId(),
          position: current.length + 1,
          stage: 1,
          kind: "resourceField",
          ...getNextResourceFieldDefaults(
            current,
            current.length,
            firstResourceField,
            activeInitialState,
          ),
        },
      ]);
    });
  };

  const duplicateStep = (index: number) => {
    setSteps((current) => {
      const source = current[index];
      if (!source) return current;

      const duplicated: PlannerStep = {
        ...source,
        id: createClientStepId(),
        position: source.position + 1,
        action: "upgrade",
        targetLevel: source.targetLevel + 1,
      };

      return normalizeEditorSteps([
        ...current.slice(0, index + 1),
        duplicated,
        ...current.slice(index + 1),
      ]);
    });
  };

  const removeStep = (id: string) => {
    setSteps((current) =>
      normalizeEditorSteps(current.filter((step) => step.id !== id)),
    );
  };

  const serializeSteps = () =>
    steps.map((step) => ({
      position: step.position,
      stage: step.stage,
      kind: step.kind,
      action: step.action,
      slot: step.slot,
      gid: step.gid,
      targetLevel: step.targetLevel,
    }));

  const persistDraft = async () => {
    if (draftRevisionId) {
      const response = await fetch(`/api/planner/templates/${draftRevisionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: templateName,
          serverSpeed,
          stage: 1,
          steps: serializeSteps(),
        }),
      });
      const payload = (await response.json()) as StoredTemplateRevision & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo actualizar el borrador.");
      }

      setSteps(normalizeEditorSteps(toEditableSteps(payload.steps)));
      return { revisionId: payload.id, templateId: selectedTemplateId };
    }

    const response = await fetch("/api/planner/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: templateName,
        tribeId: SANDBOX_TRIBE_ID,
        serverSpeed,
        stage: 1,
        steps: serializeSteps(),
      }),
    });
    const payload = (await response.json()) as StoredTemplate & {
      error?: string;
    };

    if (!response.ok) throw new Error(payload.error ?? "No se pudo guardar.");

    const draft = payload.revisions.find((revision) => revision.status === "draft");
    if (!draft) {
      throw new Error("La plantilla fue creada sin una revisión draft editable.");
    }

    setSelectedTemplateId(payload.id);
    setDraftRevisionId(draft.id);
    setDraftRevisionNumber(draft.revision);
    setSteps(normalizeEditorSteps(toEditableSteps(draft.steps)));
    return { revisionId: draft.id, templateId: payload.id };
  };

  const saveDraft = async () => {
    setLoading(true);
    setMessage(null);

    try {
      await persistActiveProfileIfNeeded();
      await persistDraft();
      await loadTemplates();
      setMessage(
        `${draftRevisionId ? "Borrador actualizado" : "Borrador creado"}: ${templateName}`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo guardar.");
    } finally {
      setLoading(false);
    }
  };

  const publishDraft = async () => {
    setLoading(true);
    setMessage(null);

    try {
      const savedProfile = await persistActiveProfileIfNeeded();
      const initialStateForPublish = resolveInitialSimulationState(
        savedProfile,
        serverSpeed,
      );
      const { revisionId, templateId } = await persistDraft();
      const response = await fetch(`/api/planner/templates/${revisionId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initialState: initialStateForPublish }),
      });
      const payload = (await response.json()) as PublishedTemplateResponse & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo publicar la revisión.");
      }

      setDraftRevisionId(payload.nextDraft.id);
      setDraftRevisionNumber(payload.nextDraft.revision);
      setSteps(normalizeEditorSteps(toEditableSteps(payload.nextDraft.steps)));
      setSelectedTemplateId(templateId);
      await loadTemplates();
      setMessage(
        `Revisión ${payload.published.revision} publicada. Ya puedes aplicarla a una aldea. ` +
          `El editor quedó abierto en el borrador ${payload.nextDraft.revision} para futuros cambios.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo publicar.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-6 pb-32 shadow-lg">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Editor de plantillas</h2>
          <p className="mt-1 max-w-3xl text-sm text-zinc-400">
            Abre una ruta guardada para seguir editando su borrador. Al publicar,
            la revisión publicada queda congelada y el editor crea automáticamente
            el siguiente borrador.
          </p>
        </div>

        <label className="text-sm text-zinc-300">
          Velocidad
          <select
            className="ml-2 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1"
            value={serverSpeed}
            onChange={(event) =>
              handleServerSpeedChange(Number(event.target.value))
            }
          >
            {supportedServerSpeeds.map((speed) => (
              <option key={speed} value={speed}>
                x{speed}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="rounded-xl border border-amber-800/50 bg-amber-950/20 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-amber-100">
              Recursos iniciales activos · servidor x{serverSpeed}
            </p>
            <p className="mt-1 text-xs text-amber-200/70">
              Estos valores se usan al simular y al publicar. Cada velocidad guarda
              su propio perfil editable en SQLite. La producción efectiva se calcula
              automáticamente como base x1 × velocidad del servidor.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-amber-200/70">
              {profilesLoading
                ? "Cargando perfiles…"
                : activeProfileDirty
                  ? "Cambios sin guardar"
                  : "Perfil guardado en DB"}
            </span>
            <button
              className="rounded-md bg-amber-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-60"
              disabled={profilesLoading || profilesSaving || !activeProfileDirty}
              type="button"
              onClick={() =>
                void saveActiveProfile()
                  .then(() =>
                    setMessage(`Perfil inicial x${serverSpeed} guardado en DB.`),
                  )
                  .catch((error) =>
                    setMessage(
                      error instanceof Error
                        ? error.message
                        : "No se pudo guardar el perfil inicial.",
                    ),
                  )
              }
            >
              Guardar perfil x{serverSpeed}
            </button>
            <button
              className="rounded-md border border-amber-700/70 px-3 py-1.5 text-xs text-amber-100 hover:bg-amber-900/40 disabled:opacity-60"
              disabled={profilesLoading || profilesSaving}
              type="button"
              onClick={() => void restoreActiveProfile()}
            >
              Restaurar base x{serverSpeed}
            </button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {resourceKeys.map((key) => (
            <div
              className="rounded-lg border border-amber-900/60 bg-zinc-950/60 px-3 py-2"
              key={key}
            >
              <p className="text-xs text-zinc-500">{resourceLabels[key]}</p>
              <p className="mt-1 text-lg font-semibold text-zinc-100">
                {activeInitialState.resources[key]}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-3">
          <p className="text-xs font-medium text-amber-100">
            Producción efectiva por hora · base x1 × {serverSpeed}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {resourceKeys.map((key) => (
              <div
                className="rounded-lg border border-amber-900/60 bg-zinc-950/60 px-3 py-2"
                key={key}
              >
                <p className="text-xs text-zinc-500">{resourceLabels[key]}</p>
                <p className="mt-1 text-lg font-semibold text-zinc-100">
                  {activeInitialState.productionPerHour[key]}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-amber-200/70">
            El tiempo de construcción también se ajusta automáticamente: duración
            base ÷ x{serverSpeed}.
          </p>
        </div>

        <details className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
          <summary className="cursor-pointer text-sm font-medium text-zinc-200">
            Editar perfil inicial x{serverSpeed}
          </summary>

          <div className="mt-4 space-y-5">
            <div>
              <h3 className="text-sm font-medium text-zinc-200">
                Recursos disponibles al iniciar
              </h3>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {resourceKeys.map((key) => (
                  <NumberInput
                    key={key}
                    label={resourceLabels[key]}
                    value={activeBaseProfile.resources[key]}
                    onChange={(value) => updateInitialResource(key, value)}
                  />
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium text-zinc-200">
                Producción base x1 por hora
              </h3>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {resourceKeys.map((key) => (
                  <NumberInput
                    key={key}
                    label={resourceLabels[key]}
                    value={activeBaseProfile.productionPerHour[key]}
                    onChange={(value) => updateInitialProduction(key, value)}
                  />
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium text-zinc-200">
                Capacidad y estado de la aldea
              </h3>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                <NumberInput
                  label="Almacén"
                  value={activeBaseProfile.capacity.warehouse}
                  onChange={(value) => updateInitialCapacity("warehouse", value)}
                />
                <NumberInput
                  label="Granero"
                  value={activeBaseProfile.capacity.granary}
                  onChange={(value) => updateInitialCapacity("granary", value)}
                />
                <NumberInput
                  label="Cereal libre"
                  value={activeBaseProfile.freeCrop}
                  onChange={(value) => updateInitialScalar("freeCrop", value)}
                />
                <NumberInput
                  label="Población"
                  value={activeBaseProfile.population}
                  onChange={(value) => updateInitialScalar("population", value)}
                />
                <NumberInput
                  label="Nivel Edificio principal"
                  value={activeBaseProfile.mainBuildingLevel}
                  onChange={(value) =>
                    updateInitialScalar("mainBuildingLevel", value)
                  }
                />
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <label className="space-y-2 text-xs text-zinc-400">
                <span className="block text-sm font-medium text-zinc-200">
                  Edificios iniciales
                </span>
                <textarea
                  className="min-h-36 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-100"
                  value={buildingsDraft}
                  onChange={(event) => setBuildingsDraft(event.target.value)}
                />
                <span className="block">
                  Una línea por edificio con formato <code>slot:gid:nivel</code>.
                  Ejemplo: <code>26:15:1</code>.
                </span>
              </label>

              <label className="space-y-2 text-xs text-zinc-400">
                <span className="block text-sm font-medium text-zinc-200">
                  Campos de recursos iniciales
                </span>
                <textarea
                  className="min-h-36 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-100"
                  value={resourceFieldsDraft}
                  onChange={(event) => setResourceFieldsDraft(event.target.value)}
                />
                <span className="block">
                  Usa el mismo formato <code>slot:gid:nivel</code>. Esto también
                  permite representar mundos con inicio especial.
                </span>
              </label>
            </div>

            <button
              className="rounded-md bg-amber-700 px-3 py-2 text-sm font-medium text-white hover:bg-amber-600"
              type="button"
              onClick={applyInitialSlotDrafts}
            >
              Aplicar edificios y campos iniciales
            </button>
          </div>
        </details>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-72 flex-1 text-sm text-zinc-300">
          Ruta guardada
          <select
            className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2"
            disabled={templatesLoading}
            value={selectedTemplateId}
            onChange={(event) => {
              const value = event.target.value;
              if (!value) {
                startNewTemplate();
                return;
              }
              openTemplate(value);
            }}
          >
            <option value="">Nueva ruta sin guardar</option>
            {templates.map((template) => {
              const draft = template.revisions.find(
                (revision) => revision.status === "draft",
              );
              const publishedCount = template.revisions.filter(
                (revision) => revision.status === "published",
              ).length;

              return (
                <option key={template.id} value={template.id}>
                  {template.name} · borrador {draft?.revision ?? "—"} ·{" "}
                  {publishedCount} publicadas
                </option>
              );
            })}
          </select>
        </label>

        <button
          className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900"
          type="button"
          onClick={startNewTemplate}
        >
          Nueva ruta
        </button>
      </div>

      {draftRevisionNumber ? (
        <p className="rounded-md border border-sky-900/60 bg-sky-950/30 px-3 py-2 text-xs text-sky-200">
          Editando borrador {draftRevisionNumber}. Las revisiones publicadas
          anteriores permanecen congeladas.
        </p>
      ) : null}

      <div className="space-y-3 sm:hidden">
        {steps.map((step, index) => {
          const result = simulatedByStepId.get(step.id);
          const automaticSlot = getAutomaticSlotForGid(step.gid);
          const slotLocked =
            step.kind === "resourceField" || isLockedSlotForGid(step.gid);

          return (
            <PlannerStepCard
              automaticSlot={automaticSlot}
              index={index}
              key={step.id}
              result={result}
              slotLocked={slotLocked}
              step={step}
              stepCount={steps.length}
              onChangeBuildingSlot={changeBuildingSlot}
              onChangeResourceField={changeResourceField}
              onChangeStepGid={changeStepGid}
              onChangeStepKind={changeStepKind}
              onDuplicateStep={duplicateStep}
              onMoveStep={moveStep}
              onRemoveStep={removeStep}
              onReorderSteps={reorderSteps}
              onUpdateStep={updateStep}
            />
          );
        })}
      </div>

      <div className="hidden w-full sm:block">
        <table className="w-full table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[4%]" />
            <col className="w-[10%]" />
            <col className="w-[23%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
            <col className="w-[9%]" />
            <col className="w-[21%]" />
            <col className="w-[13%]" />
          </colgroup>
          <thead className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-2 py-3">#</th>
              <th className="px-2 py-3">Tipo</th>
              <th className="px-2 py-3">Mejora</th>
              <th className="px-2 py-3">Acción</th>
              <th className="px-2 py-3">Slot</th>
              <th className="px-2 py-3">Nivel</th>
              <th className="px-2 py-3">Resultado</th>
              <th className="px-2 py-3">Orden</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-900">
            {steps.map((step, index) => {
              const result = simulatedByStepId.get(step.id);
              const automaticSlot = getAutomaticSlotForGid(step.gid);
              const slotLocked =
                step.kind === "resourceField" || isLockedSlotForGid(step.gid);

              return (
                <PlannerStepRow
                  automaticSlot={automaticSlot}
                  index={index}
                  key={step.id}
                  result={result}
                  slotLocked={slotLocked}
                  step={step}
                  stepCount={steps.length}
                  onChangeBuildingSlot={changeBuildingSlot}
                  onChangeResourceField={changeResourceField}
                  onChangeStepGid={changeStepGid}
                  onChangeStepKind={changeStepKind}
                  onDuplicateStep={duplicateStep}
                  onMoveStep={moveStep}
                  onRemoveStep={removeStep}
                  onReorderSteps={reorderSteps}
                  onUpdateStep={updateStep}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900"
          type="button"
          onClick={addStep}
        >
          Agregar paso
        </button>
      </div>

      {message ? (
        <p className="rounded-md border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-sm text-zinc-300">
          {message}
        </p>
      ) : null}

      <div className="sticky bottom-20 z-20 -mx-3 mt-2 px-3 sm:bottom-24 sm:px-0">
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/92 px-3 py-3 shadow-2xl backdrop-blur">
          <div className="flex flex-wrap items-center gap-3">
            <label className="min-w-56 flex-1 text-xs text-zinc-400">
              <span className="block">Nombre de la ruta</span>
              <input
                className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
              />
            </label>

            {simulation ? (
              <div
                className={`min-w-52 rounded-md border px-3 py-2 text-xs ${
                  simulation.valid
                    ? "border-emerald-900/60 bg-emerald-950/30 text-emerald-200"
                    : "border-red-900/60 bg-red-950/30 text-red-200"
                }`}
              >
                <p className="font-medium">
                  {simulation.valid
                    ? `ETA ${secondsToText(simulation.totalElapsedSeconds)}`
                    : "Ruta detenida"}
                </p>
                <p className="mt-0.5 text-[11px] opacity-80">
                  {simulation.valid
                    ? "Ruta válida"
                    : simulation.firstBlockingStep?.message ?? "Error no identificado"}
                </p>
              </div>
            ) : null}

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <button
                className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900 disabled:opacity-60"
                disabled={loading}
                type="button"
                onClick={() => void saveDraft()}
              >
                Guardar borrador
              </button>
              <button
                className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-60"
                disabled={loading || profilesLoading || profilesSaving}
                type="button"
                onClick={() => void publishDraft()}
              >
                Publicar revisión
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
