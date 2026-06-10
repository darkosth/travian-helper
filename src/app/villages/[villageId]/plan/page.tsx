import Link from "next/link";
import { notFound } from "next/navigation";
import { VillagePlanControls } from "@/app/villages/[villageId]/plan/village-plan-controls";
import { getCatalogDefinition, getCatalogDisplayName } from "@/lib/planner/catalog";
import { getVillagePlanDetails } from "@/lib/planner/village-plan-service";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ villageId: string }> };

const secondsToText = (seconds: number | null) => {
  if (seconds === null) return "—";
  const minutes = Math.ceil(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours}h ${remainder}m`;
};

const describeStep = (step: { gid: number; slot: number; targetLevel: number }) => {
  const definition = getCatalogDefinition(step.gid);
  return `${getCatalogDisplayName(step.gid, definition?.name)} · slot ${step.slot} · nivel ${Math.max(0, step.targetLevel - 1)} → ${step.targetLevel}`;
};

const plannerModeLabel = (mode: string) => {
  if (mode === "active") return "Active · el planner controla el worker";
  if (mode === "shadow") return "Shadow · el planner no ejecuta pasos reales";
  return "Off · el worker conserva el flujo heurístico";
};

const planStatusLabel = (status: string) => {
  if (status === "active") return "En curso";
  if (status === "blocked") return "Bloqueado";
  if (status === "completed") return "Completado";
  if (status === "archived") return "Archivado";
  return status;
};

export default async function VillagePlanPage({ params }: PageProps) {
  const { villageId } = await params;
  const village = await getVillagePlanDetails(villageId);
  if (!village) notFound();

  const plan = village.plans[0] ?? null;

  return (
    <main className="min-h-screen bg-zinc-950 px-2 py-2 text-zinc-100 sm:px-4 sm:py-4">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="space-y-2">
          <Link className="text-sm text-sky-400 hover:text-sky-300" href="/villages">
            ← Mis aldeas
          </Link>
          <h1 className="text-3xl font-semibold">{village.name}</h1>
          <p className="text-sm text-zinc-400">Planner determinista · modo del worker: {plannerModeLabel(village.plannerMode)}</p>
        </header>

        <VillagePlanControls
          villageId={village.id}
          initialPlannerMode={village.plannerMode}
          hasCurrentPlan={village.plans.length > 0}
        />

        {!plan ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 text-sm text-zinc-300">
            Esta aldea todavía no tiene una copia congelada de una plantilla. Selecciona una revisión publicada arriba para comenzar.
          </div>
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                <p className="text-xs uppercase text-zinc-500">Estado del plan</p>
                <p className="mt-2 font-semibold">{planStatusLabel(plan.status)}</p>
                <p className="mt-1 text-xs text-zinc-500">Describe el ciclo de vida de la copia congelada, no el modo del worker.</p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                <p className="text-xs uppercase text-zinc-500">Modo del worker</p>
                <p className="mt-2 font-semibold">{village.plannerMode}</p>
                <p className="mt-1 text-xs text-zinc-500">Controla si el bot ignora, observa o ejecuta el planner.</p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                <p className="text-xs uppercase text-zinc-500">Plan aplicado</p>
                <p className="mt-2 font-semibold">
                  {plan.templateRevision?.template.name ?? "Plantilla eliminada"}
                </p>
                <p className="mt-1 text-xs text-zinc-500">Revisión congelada {plan.revision}</p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                <p className="text-xs uppercase text-zinc-500">ETA original</p>
                <p className="mt-2 font-semibold">{secondsToText(plan.originalEtaSeconds)}</p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                <p className="text-xs uppercase text-zinc-500">ETA recalculada</p>
                <p className="mt-2 font-semibold">{secondsToText(plan.recalculatedEtaSeconds)}</p>
              </div>
            </section>

            {plan.blockedReason ? (
              <p className="rounded-xl border border-amber-800 bg-amber-950/40 p-4 text-sm text-amber-200">
                ⚠ {plan.blockedReason}
              </p>
            ) : null}

            <section className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/40">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-zinc-800 text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">Mejora</th>
                    <th className="px-4 py-3">Etapa</th>
                    <th className="px-4 py-3">Acción</th>
                    <th className="px-4 py-3">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.steps.map((step) => (
                    <tr key={step.id} className="border-b border-zinc-900 text-zinc-300">
                      <td className="px-4 py-3">{step.position}</td>
                      <td className="px-4 py-3 font-medium text-zinc-100">{describeStep(step)}</td>
                      <td className="px-4 py-3">{step.stage}</td>
                      <td className="px-4 py-3">{step.action}</td>
                      <td className="px-4 py-3">{step.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
