import { VillageDashboard } from "@/components/village-dashboard";
import { getDashboardData } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

export default async function VillagesPage() {
  const dashboard = await getDashboardData();

  return (
    <main className="flex flex-1 flex-col">
      <VillageDashboard villages={dashboard.villages} />
    </main>
  );
}
