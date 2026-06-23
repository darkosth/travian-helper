import { VillagesProfileHeader } from "@/components/villages-profile-header";
import { VillageDashboard } from "@/components/village-dashboard";
import { getCredentialSummary } from "@/lib/credentials";
import { getDashboardData } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

export default async function VillagesPage() {
  const [dashboard, credentials] = await Promise.all([
    getDashboardData(),
    getCredentialSummary(),
  ]);

  return (
    <main className="flex flex-1 flex-col">
      <VillagesProfileHeader
        activeProfileId={credentials.activeProfileId}
        autoApplyEnabledCount={dashboard.villages.filter((village) => village.autoApply.enabled).length}
        profiles={credentials.profiles}
      />
      <VillageDashboard villages={dashboard.villages} />
    </main>
  );
}
