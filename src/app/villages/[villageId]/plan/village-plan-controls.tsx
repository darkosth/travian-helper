"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, PlayCircle, Route, ShieldCheck } from "lucide-react";

type PlannerMode = "off" | "shadow" | "active";

type TemplateRevision = {
  id: string;
  revision: number;
  status: string;
  stage: number;
  steps: Array<{ id: string }>;
};

type Template = {
  id: string;
  name: string;
  description: string | null;
  serverSpeed: number;
  revisions: TemplateRevision[];
};

type PublishedRevisionOption = {
  id: string;
  label: string;
  templateName: string;
  revision: number;
  stage: number;
  stepsCount: number;
  serverSpeed: number;
};

type VillagePlanControlsProps = {
  villageId: string;
  initialPlannerMode: string;
  hasCurrentPlan: boolean;
};

const isPlannerMode = (value: string): value is PlannerMode =>
  value === "off" || value === "shadow" || value === "active";

const plannerModeInfo: Record<PlannerMode, { label: string; description: string }> = {
  off: {
    label: "Off",
    description: "El planner queda guardado, pero no influye en el worker. El bot conserva el flujo heurístico anterior.",
  },
  shadow: {
    label: "Shadow",
    description: "El plan puede consultarse para pruebas, pero no reemplaza las acciones reales del bot. Úsalo antes de entregar control al planner.",
  },
  active: {
    label: "Active",
    description: "El plan congelado manda. El worker ejecuta la siguiente fila exacta y bloquea la ruta si detecta una inconsistencia.",
  },
};

export function VillagePlanControls({
  villageId,
  initialPlannerMode,
  hasCurrentPlan,
}: VillagePlanControlsProps) {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [selectedRevisionId, setSelectedRevisionId] = useState("");
  const [plannerMode, setPlannerMode] = useState<PlannerMode>(
    isPlannerMode(initialPlannerMode) ? initialPlannerMode : "off",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;

    const loadTemplates = async () => {
      try {
        const response = await fetch("/api/planner/templates", { cache: "no-store" });
        const payload = (await response.json()) as Template[] | { error?: string };
        if (!response.ok || !Array.isArray(payload)) {
          throw new Error(!Array.isArray(payload) ? payload.error : "No se pudieron cargar las plantillas.");
        }
        if (!cancelled) setTemplates(payload);
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "No se pudieron cargar las plantillas.");
        }
      } finally {
        if (!cancelled) setTemplatesLoading(false);
      }
    };

    void loadTemplates();
    return () => {
      cancelled = true;
    };
  }, []);

  const publishedRevisions = useMemo<PublishedRevisionOption[]>(
    () =>
      templates.flatMap((template) =>
        template.revisions
          .filter((revision) => revision.status === "published")
          .map((revision) => ({
            id: revision.id,
            label: `${template.name} · revisión ${revision.revision}`,
            templateName: template.name,
            revision: revision.revision,
            stage: revision.stage,
            stepsCount: revision.steps.length,
            serverSpeed: template.serverSpeed,
          })),
      ),
    [templates],
  );

  useEffect(() => {
    if (!selectedRevisionId && publishedRevisions[0]) {
      setSelectedRevisionId(publishedRevisions[0].id);
    }
  }, [publishedRevisions, selectedRevisionId]);

  const selectedRevision = publishedRevisions.find((revision) => revision.id === selectedRevisionId) ?? null;

  const applyTemplate = () => {
    if (!selectedRevisionId) return;
    setMessage(null);

    startTransition(async () => {
      const response = await fetch(`/api/planner/villages/${villageId}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateRevisionId: selectedRevisionId }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setMessage(payload.error ?? "No se pudo aplicar la plantilla.");
        return;
      }

      setMessage(
        `Copia congelada aplicada como plan en curso. El modo del worker continúa en ${plannerModeInfo[plannerMode].label}; no se cambió automáticamente.`,
      );
      router.refresh();
    });
  };

  const updateMode = (mode: PlannerMode) => {
    setMessage(null);

    startTransition(async () => {
      const response = await fetch(`/api/planner/villages/${villageId}/mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setMessage(payload.error ?? "No se pudo cambiar el modo del planner.");
        return;
      }

      setPlannerMode(mode);
      setMessage(`Modo del worker actualizado a ${plannerModeInfo[mode].label}.`);
      router.refresh();
    });
  };

  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.48fr)]">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
        <div className="flex items-start gap-3">
          <Route className="mt-0.5 size-5 text-sky-300" />
          <div>
            <h2 className="font-semibold text-zinc-100">Aplicar una plantilla publicada</h2>
            <p className="mt-1 text-sm leading-6 text-zinc-400">
              Se crea una copia congelada para esta aldea. Los cambios posteriores del editor no alteran el plan ya aplicado.
            </p>
          </div>
        </div>

        {templatesLoading ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-zinc-400">
            <LoaderCircle className="size-4 animate-spin" />
            Cargando plantillas…
          </p>
        ) : publishedRevisions.length === 0 ? (
          <div className="mt-4 rounded-xl border border-amber-900/70 bg-amber-950/30 p-4 text-sm text-amber-100">
            Todavía no hay revisiones publicadas. Guarda y publica una ruta desde el{" "}
            <Link className="font-medium text-sky-300 hover:text-sky-200" href="/planner">
              editor del planner
            </Link>
            .
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <select
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
              value={selectedRevisionId}
              onChange={(event) => setSelectedRevisionId(event.target.value)}
            >
              {publishedRevisions.map((revision) => (
                <option key={revision.id} value={revision.id}>
                  {revision.label}
                </option>
              ))}
            </select>

            {selectedRevision ? (
              <p className="text-xs text-zinc-500">
                Etapa {selectedRevision.stage} · {selectedRevision.stepsCount} pasos · servidor x{selectedRevision.serverSpeed}
              </p>
            ) : null}

            {hasCurrentPlan ? (
              <p className="rounded-lg border border-amber-900/60 bg-amber-950/25 px-3 py-2 text-xs text-amber-200">
                Esta aldea ya tiene historial de planes. Aplicar otra plantilla archivará el plan activo o bloqueado anterior.
              </p>
            ) : null}

            <button
              type="button"
              disabled={isPending || !selectedRevisionId}
              onClick={applyTemplate}
              className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? <LoaderCircle className="size-4 animate-spin" /> : <PlayCircle className="size-4" />}
              Aplicar copia congelada
            </button>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 size-5 text-emerald-300" />
          <div>
            <h2 className="font-semibold text-zinc-100">Modo del worker</h2>
            <p className="mt-1 text-sm leading-6 text-zinc-400">
              Es independiente del estado del plan. Aplicar una copia congelada no activa ejecuciones reales automáticamente.
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {(["off", "shadow", "active"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              disabled={isPending}
              onClick={() => updateMode(mode)}
              className={`rounded-lg border px-2 py-2 text-xs font-medium transition-colors disabled:opacity-50 ${
                plannerMode === mode
                  ? "border-emerald-400/60 bg-emerald-400/15 text-emerald-100"
                  : "border-zinc-700 bg-zinc-950 text-zinc-300 hover:border-zinc-500"
              }`}
            >
              {plannerModeInfo[mode].label}
            </button>
          ))}
        </div>

        <p className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-xs leading-5 text-zinc-300">
          <span className="font-semibold text-emerald-200">{plannerModeInfo[plannerMode].label}:</span>{" "}
          {plannerModeInfo[plannerMode].description}
        </p>
      </div>

      {message ? (
        <p className="lg:col-span-2 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-200">
          {message}
        </p>
      ) : null}
    </section>
  );
}
