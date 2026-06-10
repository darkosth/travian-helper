"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getCatalogDefinition,
  getCatalogDisplayName,
  getAutomaticSlotForGid,
  getResourceFieldSelectionValue,
  isLockedSlotForGid,
  parseResourceFieldSelectionValue,
  plannerCatalog,
  STANDARD_4446_RESOURCE_FIELD_LAYOUT,
} from "@/lib/planner/catalog";
import type {
  PlannerStep,
  PlannerStepAction,
  PlannerStepKind,
  SimulatePlanResult,
  SimulationState,
} from "@/lib/planner/simulator";

const SANDBOX_TRIBE_ID = 3; // Galos

const initialResourceFields: SimulationState["resourceFields"] = Object.fromEntries(
  STANDARD_4446_RESOURCE_FIELD_LAYOUT.map(({ slot, gid }) => [slot, { gid, level: 0 }]),
);

const initialSimulationState: SimulationState = {
  elapsedSeconds: 0,
  resources: { wood: 750, clay: 750, iron: 750, crop: 750 },
  productionPerHour: { wood: 58, clay: 52, iron: 48, crop: 56 },
  capacity: { warehouse: 800, granary: 800 },
  freeCrop: 20,
  population: 8,
  resourceFields: initialResourceFields,
  buildings: {
    26: { gid: 15, level: 1 },
    39: { gid: 16, level: 1 },
    1:  { gid: 1, level: 2 },
    2:  { gid: 4, level: 2 },
    5:  { gid: 2, level: 1 },

  },
  mainBuildingLevel: 1,
  workerAvailableAtSeconds: 0,
};

const createInitialSteps = (): PlannerStep[] => [
  {
    id: `sandbox-${crypto.randomUUID()}`,
    position: 1,
    stage: 1,
    kind: "building",
    action: "upgrade",
    slot: 26,
    gid: 15,
    targetLevel: 2,
  },
  {
    id: `sandbox-${crypto.randomUUID()}`,
    position: 2,
    stage: 1,
    kind: "resourceField",
    action: "upgrade",
    slot: 1,
    gid: 1,
    targetLevel: 1,
  },
];

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

const secondsToText = (seconds: number) => {
  const roundedMinutes = Math.ceil(seconds / 60);
  const hours = Math.floor(roundedMinutes / 60);
  const minutes = roundedMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
};

const normalizePositions = (steps: PlannerStep[]) =>
  steps.map((step, index) => ({ ...step, position: index + 1 }));

const isDefinitionAvailableForGauls = (definition: (typeof plannerCatalog)[number]) =>
  !definition.tribeIds || definition.tribeIds.includes(SANDBOX_TRIBE_ID);

const buildingOptions = plannerCatalog.filter(
  (definition) =>
    definition.slotKind !== "resourceField" && isDefinitionAvailableForGauls(definition),
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

const getKnownInitialBuildingLevel = (gid: number, slot: number) =>
  gid === 15 && slot === 26 ? 1 : 0;

const getNextResourceFieldDefaults = (
  steps: PlannerStep[],
  currentIndex: number,
  field: { gid: number; slot: number },
) => {
  const previous = getPreviousMatchingStep(
    steps,
    currentIndex,
    (step) => step.kind === "resourceField" && step.gid === field.gid && step.slot === field.slot,
  );

  return {
    gid: field.gid,
    slot: field.slot,
    action: "upgrade" as const,
    targetLevel: previous ? previous.targetLevel + 1 : 1,
  };
};

const getNextBuildingDefaults = (
  steps: PlannerStep[],
  currentIndex: number,
  gid: number,
  fallbackSlot: number,
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
  const initialLevel = getKnownInitialBuildingLevel(gid, slot);
  return {
    gid,
    slot,
    action: (initialLevel > 0 ? "upgrade" : "construct") as PlannerStepAction,
    targetLevel: initialLevel + 1,
  };
};

export const PlannerSandbox = () => {
  const [steps, setSteps] = useState<PlannerStep[]>(() => createInitialSteps());
  const [serverSpeed, setServerSpeed] = useState(1);
  const [simulation, setSimulation] = useState<SimulatePlanResult | null>(null);
  const [templateName, setTemplateName] = useState("Gaul x10 · Sandbox");
  const [templates, setTemplates] = useState<StoredTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [draftRevisionId, setDraftRevisionId] = useState<string | null>(null);
  const [draftRevisionNumber, setDraftRevisionNumber] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const simulatedByStepId = useMemo(
    () => new Map(simulation?.steps.map((step) => [step.step.id, step]) ?? []),
    [simulation],
  );

  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      const response = await fetch("/api/planner/templates", { cache: "no-store" });
      const payload = (await response.json()) as StoredTemplate[] | { error?: string };
      if (!response.ok || !Array.isArray(payload)) {
        throw new Error(!Array.isArray(payload) ? payload.error : "No se pudieron cargar las rutas.");
      }
      setTemplates(payload);
      return payload;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudieron cargar las rutas.");
      return [];
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const openTemplate = (templateId: string, availableTemplates = templates) => {
    const template = availableTemplates.find((item) => item.id === templateId);
    if (!template) return;

    const draft = template.revisions.find((revision) => revision.status === "draft");
    if (!draft) {
      setMessage("Esta ruta no tiene un borrador editable. Publica nuevamente o crea una revisión draft.");
      return;
    }

    setSelectedTemplateId(template.id);
    setDraftRevisionId(draft.id);
    setDraftRevisionNumber(draft.revision);
    setTemplateName(template.name);
    setServerSpeed(template.serverSpeed);
    setSteps(toEditableSteps(draft.steps));
    setSimulation(null);
    setMessage(`Editando ${template.name} · borrador revisión ${draft.revision}.`);
  };

  const startNewTemplate = () => {
    setSelectedTemplateId("");
    setDraftRevisionId(null);
    setDraftRevisionNumber(null);
    setTemplateName("Gaul x10 · Nueva ruta");
    setServerSpeed(1);
    setSteps(createInitialSteps());
    setSimulation(null);
    setMessage("Nueva ruta preparada. Guarda el borrador cuando quieras conservarla.");
  };

  const updateStep = <Key extends keyof PlannerStep>(
    id: string,
    key: Key,
    value: PlannerStep[Key],
  ) => {
    setSteps((current) =>
      current.map((step) => (step.id === id ? { ...step, [key]: value } : step)),
    );
    setSimulation(null);
  };

  const changeStepKind = (id: string, kind: PlannerStepKind) => {
    const firstResourceField = STANDARD_4446_RESOURCE_FIELD_LAYOUT[0];
    const firstBuilding = buildingOptions[0];

    setSteps((current) => {
      const currentIndex = current.findIndex((step) => step.id === id);
      if (currentIndex < 0) return current;

      return current.map((step, index) => {
        if (index !== currentIndex) return step;
        if (kind === "resourceField") {
          return { ...step, kind, ...getNextResourceFieldDefaults(current, currentIndex, firstResourceField) };
        }
        if (!firstBuilding) return step;
        return {
          ...step,
          kind,
          ...getNextBuildingDefaults(current, currentIndex, firstBuilding.gid, 20),
        };
      });
    });
    setSimulation(null);
  };

  const changeStepGid = (id: string, gid: number) => {
    setSteps((current) => {
      const currentIndex = current.findIndex((step) => step.id === id);
      if (currentIndex < 0) return current;

      return current.map((step, index) =>
        index === currentIndex
          ? { ...step, ...getNextBuildingDefaults(current, currentIndex, gid, step.slot) }
          : step,
      );
    });
    setSimulation(null);
  };

  const changeBuildingSlot = (id: string, slot: number) => {
    setSteps((current) => {
      const currentIndex = current.findIndex((step) => step.id === id);
      if (currentIndex < 0) return current;
      const currentStep = current[currentIndex];
      const previous = getPreviousMatchingStep(
        current,
        currentIndex,
        (step) => step.kind === "building" && step.gid === currentStep.gid && step.slot === slot,
      );
      const initialLevel = getKnownInitialBuildingLevel(currentStep.gid, slot);

      return current.map((step, index) =>
        index === currentIndex
          ? {
              ...step,
              slot,
              action: (previous || initialLevel > 0 ? "upgrade" : "construct") as PlannerStepAction,
              targetLevel: previous ? previous.targetLevel + 1 : initialLevel + 1,
            }
          : step,
      );
    });
    setSimulation(null);
  };

  const changeResourceField = (id: string, value: string) => {
    const field = parseResourceFieldSelectionValue(value);
    if (!field) return;

    setSteps((current) => {
      const currentIndex = current.findIndex((step) => step.id === id);
      if (currentIndex < 0) return current;

      return current.map((step, index) =>
        index === currentIndex
          ? { ...step, ...getNextResourceFieldDefaults(current, currentIndex, field) }
          : step,
      );
    });
    setSimulation(null);
  };

  const moveStep = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= steps.length) return;
    const reordered = [...steps];
    [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
    setSteps(normalizePositions(reordered));
    setSimulation(null);
  };

  const addStep = () => {
    setSteps((current) => {
      const firstResourceField = STANDARD_4446_RESOURCE_FIELD_LAYOUT[0];
      return [
        ...current,
        {
          id: `sandbox-${crypto.randomUUID()}`,
          position: current.length + 1,
          stage: 1,
          kind: "resourceField",
          ...getNextResourceFieldDefaults(current, current.length, firstResourceField),
        },
      ];
    });
    setSimulation(null);
  };

  const duplicateStep = (index: number) => {
    setSteps((current) => {
      const source = current[index];
      if (!source) return current;

      const duplicated: PlannerStep = {
        ...source,
        id: `sandbox-${crypto.randomUUID()}`,
        position: source.position + 1,
        action: "upgrade",
        targetLevel: source.targetLevel + 1,
      };

      return normalizePositions([
        ...current.slice(0, index + 1),
        duplicated,
        ...current.slice(index + 1),
      ]);
    });
    setSimulation(null);
  };

  const removeStep = (id: string) => {
    setSteps((current) => normalizePositions(current.filter((step) => step.id !== id)));
    setSimulation(null);
  };

  const simulate = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/planner/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initialState: initialSimulationState, steps, serverSpeed }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No se pudo simular.");
      setSimulation(payload);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo simular.");
    } finally {
      setLoading(false);
    }
  };

  const serializeSteps = () => steps.map(({ id: _id, ...step }) => step);

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
      const payload = (await response.json()) as StoredTemplateRevision & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "No se pudo actualizar el borrador.");
      setSteps(toEditableSteps(payload.steps));
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
    const payload = (await response.json()) as StoredTemplate & { error?: string };
    if (!response.ok) throw new Error(payload.error ?? "No se pudo guardar.");

    const draft = payload.revisions.find((revision) => revision.status === "draft");
    if (!draft) throw new Error("La plantilla fue creada sin una revisión draft editable.");

    setSelectedTemplateId(payload.id);
    setDraftRevisionId(draft.id);
    setDraftRevisionNumber(draft.revision);
    setSteps(toEditableSteps(draft.steps));
    return { revisionId: draft.id, templateId: payload.id };
  };

  const saveDraft = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const { templateId } = await persistDraft();
      await loadTemplates();
      setMessage(`${draftRevisionId ? "Borrador actualizado" : "Borrador creado"}: ${templateName}${templateId ? "" : ""}`);
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
      const { revisionId, templateId } = await persistDraft();
      const response = await fetch(`/api/planner/templates/${revisionId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initialState: initialSimulationState }),
      });
      const payload = (await response.json()) as PublishedTemplateResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "No se pudo publicar la revisión.");

      setDraftRevisionId(payload.nextDraft.id);
      setDraftRevisionNumber(payload.nextDraft.revision);
      setSteps(toEditableSteps(payload.nextDraft.steps));
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
    <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Editor de plantillas</h2>
          <p className="mt-1 max-w-3xl text-sm text-zinc-400">
            Abre una ruta guardada para seguir editando su borrador. Al publicar, la revisión publicada queda congelada y el editor crea automáticamente el siguiente borrador.
          </p>
        </div>
        <label className="text-sm text-zinc-300">
          Velocidad
          <select
            className="ml-2 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1"
            value={serverSpeed}
            onChange={(event) => setServerSpeed(Number(event.target.value))}
          >
            {[1, 2, 3, 5, 10].map((speed) => (
              <option key={speed} value={speed}>x{speed}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <label className="text-sm text-zinc-300">
          Ruta guardada
          <select
            className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
            value={selectedTemplateId}
            disabled={templatesLoading}
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
              const draft = template.revisions.find((revision) => revision.status === "draft");
              const publishedCount = template.revisions.filter((revision) => revision.status === "published").length;
              return (
                <option key={template.id} value={template.id}>
                  {template.name} · borrador {draft?.revision ?? "—"} · {publishedCount} publicadas
                </option>
              );
            })}
          </select>
        </label>
        <button
          type="button"
          className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900"
          onClick={startNewTemplate}
        >
          Nueva ruta
        </button>
      </div>

      {draftRevisionNumber ? (
        <p className="text-xs text-sky-300">
          Editando borrador {draftRevisionNumber}. Las revisiones publicadas anteriores permanecen congeladas.
        </p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-800 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-2 py-3">#</th>
              <th className="px-2 py-3">Tipo</th>
              <th className="px-2 py-3">Mejora</th>
              <th className="px-2 py-3">Acción</th>
              <th className="px-2 py-3">Slot</th>
              <th className="px-2 py-3">Nivel destino</th>
              <th className="px-2 py-3">Resultado</th>
              <th className="px-2 py-3">Orden</th>
            </tr>
          </thead>
          <tbody>
            {steps.map((step, index) => {
              const result = simulatedByStepId.get(step.id);
              const automaticSlot = getAutomaticSlotForGid(step.gid);
              const slotLocked = step.kind === "resourceField" || isLockedSlotForGid(step.gid);
              return (
                <tr key={step.id} className="border-b border-zinc-900 text-zinc-300">
                  <td className="px-2 py-3">{index + 1}</td>
                  <td className="px-2 py-3">
                    <select
                      className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
                      value={step.kind}
                      onChange={(event) =>
                        changeStepKind(step.id, event.target.value as PlannerStepKind)
                      }
                    >
                      <option value="resourceField">Campo</option>
                      <option value="building">Edificio</option>
                    </select>
                  </td>
                  <td className="min-w-64 px-2 py-3">
                    {step.kind === "resourceField" ? (
                      <select
                        className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
                        value={getResourceFieldSelectionValue(step)}
                        onChange={(event) => changeResourceField(step.id, event.target.value)}
                      >
                        {STANDARD_4446_RESOURCE_FIELD_LAYOUT.map((field) => {
                          const definition = getCatalogDefinition(field.gid);
                          return (
                            <option
                              key={getResourceFieldSelectionValue(field)}
                              value={getResourceFieldSelectionValue(field)}
                            >
                              {getCatalogDisplayName(field.gid, definition?.name)} · slot {field.slot}
                            </option>
                          );
                        })}
                      </select>
                    ) : (
                      <select
                        className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
                        value={step.gid}
                        onChange={(event) => changeStepGid(step.id, Number(event.target.value))}
                      >
                        {buildingOptions.map((definition) => (
                          <option key={definition.gid} value={definition.gid}>
                            {getCatalogDisplayName(definition.gid, definition.name)}
                          </option>
                        ))}
                      </select>
                    )}
                    <p className="mt-1 whitespace-nowrap text-xs text-zinc-500">
                      {describePlannedStep(step)} · gid interno {step.gid}
                    </p>
                  </td>
                  <td className="px-2 py-3">
                    <select
                      className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 disabled:text-zinc-500"
                      value={step.action}
                      disabled={step.kind === "resourceField"}
                      onChange={(event) =>
                        updateStep(step.id, "action", event.target.value as PlannerStep["action"])
                      }
                    >
                      <option value="upgrade">upgrade</option>
                      <option value="construct">construct</option>
                    </select>
                  </td>
                  <td className="px-2 py-3">
                    <input
                      className="w-20 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 disabled:cursor-not-allowed disabled:text-zinc-500"
                      type="number"
                      min={1}
                      value={step.slot}
                      disabled={slotLocked}
                      title={slotLocked ? "Travian reserva este slot para el edificio seleccionado." : undefined}
                      onChange={(event) => changeBuildingSlot(step.id, Number(event.target.value))}
                    />
                    {step.kind === "resourceField" ? (
                      <p className="mt-1 whitespace-nowrap text-xs text-zinc-500">Slot fijo del layout 4-4-4-6</p>
                    ) : slotLocked ? (
                      <p className="mt-1 whitespace-nowrap text-xs text-zinc-500">Slot fijo</p>
                    ) : automaticSlot !== null ? (
                      <p className="mt-1 whitespace-nowrap text-xs text-zinc-500">Slot inicial sugerido</p>
                    ) : null}
                  </td>
                  <td className="px-2 py-3">
                    <input
                      className="w-20 rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
                      type="number"
                      min={1}
                      value={step.targetLevel}
                      onChange={(event) =>
                        updateStep(step.id, "targetLevel", Number(event.target.value))
                      }
                    />
                  </td>
                  <td className="min-w-56 px-2 py-3 text-xs">
                    {result ? (
                      <span className={result.status === "valid" ? "text-emerald-400" : "text-amber-300"}>
                        {result.status} · espera {secondsToText(result.waitForResourcesSeconds)} · obra {secondsToText(result.buildDurationSeconds)}
                        {result.message ? ` · ${result.message}` : ""}
                      </span>
                    ) : (
                      <span className="text-zinc-600">Sin simular</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-2 py-3">
                    <button className="px-1 text-zinc-400 hover:text-zinc-100" onClick={() => moveStep(index, -1)}>↑</button>
                    <button className="px-1 text-zinc-400 hover:text-zinc-100" onClick={() => moveStep(index, 1)}>↓</button>
                    <button className="ml-2 text-sky-400 hover:text-sky-300" onClick={() => duplicateStep(index)}>Duplicar</button>
                    <button className="ml-2 text-red-400 hover:text-red-300" onClick={() => removeStep(step.id)}>Eliminar</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900" onClick={addStep}>Agregar paso</button>
        <button className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50" disabled={loading} onClick={simulate}>Simular</button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-zinc-800 pt-4">
        <input
          className="min-w-72 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          value={templateName}
          onChange={(event) => setTemplateName(event.target.value)}
        />
        <button className="rounded-lg border border-sky-700 px-3 py-2 text-sm text-sky-200 hover:bg-sky-950 disabled:opacity-50" disabled={loading} onClick={saveDraft}>Guardar borrador</button>
        <button className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50" disabled={loading} onClick={publishDraft}>Publicar revisión</button>
      </div>

      {simulation ? (
        <p className={simulation.valid ? "text-sm text-emerald-400" : "text-sm text-amber-300"}>
          {simulation.valid
            ? `Ruta válida · ETA acumulada ${secondsToText(simulation.totalElapsedSeconds)}`
            : `Ruta detenida · ${simulation.firstBlockingStep?.message ?? "Error no identificado"}`}
        </p>
      ) : null}
      {message ? <p className="text-sm text-zinc-300">{message}</p> : null}
    </section>
  );
};
