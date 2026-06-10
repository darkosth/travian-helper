import { PlannerVillageAccess } from "@/components/planner-village-access";
import { VillageDashboard } from "@/components/village-dashboard";
import { getDashboardData } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

export default async function VillagesPage() {
  const dashboard = await getDashboardData();

  return (
    <main className="flex flex-1 flex-col">
      <PlannerVillageAccess
        villages={dashboard.villages.map((village) => ({
          dbId: village.dbId,
          name: village.name,
          coordinates: village.coordinates,
        }))}
      />
      <VillageDashboard villages={dashboard.villages} />
    </main>
  );
}
