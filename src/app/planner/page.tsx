import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { plannerCatalog } from "@/lib/planner/catalog";
import { PlannerSandbox } from "@/app/planner/planner-sandbox";

export default function PlannerPage() {
  return (
    <main className="min-h-screen bg-zinc-950 px-2 py-2 text-zinc-100 sm:px-4 sm:py-4">
      <div className="mx-auto w-full max-w-none space-y-6">
        <header className="space-y-3">
          <Link className="text-sm text-sky-400 hover:text-sky-300" href="/">
            ← Dashboard
          </Link>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold">Village Planner determinista</h1>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-400">
                Diseña una ruta completa, simúlala y publícala antes de copiar una revisión congelada a una aldea.
                El worker activo ejecuta la primera fila incompleta sin insertar pasos por su cuenta.
              </p>
            </div>
            <Link
              href="/villages"
              className="inline-flex items-center gap-2 rounded-lg border border-sky-700 px-3 py-2 text-sm font-medium text-sky-200 transition-colors hover:bg-sky-950"
            >
              Aplicar a una aldea
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </header>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Catálogo estático</p>
            <p className="mt-2 text-2xl font-semibold">{plannerCatalog.length}</p>
            <p className="mt-1 text-sm text-zinc-400">Definiciones editables por gid</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Modos del worker</p>
            <p className="mt-2 text-2xl font-semibold">3</p>
            <p className="mt-1 text-sm text-zinc-400">off · shadow · active</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Regla principal</p>
            <p className="mt-2 text-lg font-semibold">No improvisar</p>
            <p className="mt-1 text-sm text-zinc-400">Un bloqueo pausa la ruta</p>
          </div>
        </div>

        <PlannerSandbox />
      </div>
    </main>
  );
}
