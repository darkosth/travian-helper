import { Badge } from "@/components/ui/badge";
import { VillageDashboard } from "@/components/village-dashboard";
import { getDashboardData } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

export default async function VillagesPage() {
  const dashboard = await getDashboardData();

  return (
    <main className="flex flex-1 flex-col gap-6">
      <section className="rounded-[1.75rem] border border-white/12 bg-white/6 p-5 shadow-2xl shadow-black/25 backdrop-blur">
        <Badge className="w-fit bg-amber-300/15 text-amber-200 hover:bg-amber-300/15">
          Villages
        </Badge>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-50">
          Operación por aldea
        </h1>
      </section>

      <VillageDashboard villages={dashboard.villages} />
    </main>
  );
}
