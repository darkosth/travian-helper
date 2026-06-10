import { db } from "@/lib/db";
import { ensurePlannerDatabase } from "@/lib/planner/database";
import { resolveNextVillagePlanStep } from "@/lib/planner/resolve-next-step";

/**
 * Punto de entrada para el worker existente.
 * off: usa heurísticas; shadow: compara sin ejecutar; active: el plan manda.
 */
export const resolvePlannerWorkerDirective = async (villageId: string) => {
  await ensurePlannerDatabase();
  const village = await db.village.findUnique({
    where: { id: villageId },
    select: { id: true, plannerMode: true },
  });
  if (!village || village.plannerMode === "off") {
    return { mode: "off" as const, directive: null };
  }

  const directive = await resolveNextVillagePlanStep(village.id);
  return {
    mode: village.plannerMode === "active" ? ("active" as const) : ("shadow" as const),
    directive,
  };
};
