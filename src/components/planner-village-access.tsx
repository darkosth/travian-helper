import Link from "next/link";
import { ArrowRight, Route } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type PlannerVillageAccessProps = {
  villages: Array<{
    dbId: string;
    name: string;
    coordinates: string;
  }>;
};

/**
 * Puente visible entre el dashboard existente y el planner determinista.
 * No activa el worker: solamente conduce al usuario hacia la pantalla donde
 * puede aplicar una copia congelada y elegir off, shadow o active.
 */
export function PlannerVillageAccess({ villages }: PlannerVillageAccessProps) {
  return (
    <Card className="mb-5 border-amber-300/20 bg-amber-300/8">
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-stone-50">
            <Route className="size-5 text-amber-200" />
            Village Planner
          </CardTitle>
          <CardDescription className="mt-2 max-w-2xl text-stone-300">
            Diseña rutas completas y aplica una revisión publicada como copia congelada a una aldea.
            El worker permanece apagado hasta que elijas shadow o active manualmente.
          </CardDescription>
        </div>
        <Link
          href="/planner"
          className="inline-flex h-9 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-amber-300/30 bg-black/10 px-4 py-2 text-sm font-medium text-amber-100 transition-colors hover:bg-amber-300/10"
        >
          Abrir editor
          <ArrowRight className="size-4" />
        </Link>
      </CardHeader>

      {villages.length > 0 ? (
        <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {villages.map((village) => (
            <Link
              key={village.dbId}
              href={`/villages/${village.dbId}/plan`}
              className="group rounded-2xl border border-white/10 bg-black/15 p-3 transition-colors hover:border-amber-300/35 hover:bg-amber-300/8"
            >
              <p className="font-medium text-stone-100">{village.name}</p>
              <p className="mt-1 text-xs text-stone-400">{village.coordinates}</p>
              <p className="mt-3 flex items-center gap-1 text-xs font-medium text-amber-200">
                Aplicar o ver plan
                <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
              </p>
            </Link>
          ))}
        </CardContent>
      ) : null}
    </Card>
  );
}
