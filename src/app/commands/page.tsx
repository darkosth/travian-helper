import { Badge } from "@/components/ui/badge";
import { AgentProposalsPanel } from "@/components/agent-proposals-panel";
import { AlertsRail } from "@/components/alerts-rail";
import { HomeHero } from "@/components/home-hero";
import { getCredentialSummary } from "@/lib/credentials";
import { getDashboardData } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

export default async function CommandsPage() {
  const [credentials, dashboard] = await Promise.all([
    getCredentialSummary(),
    getDashboardData(),
  ]);

  return (
    <main className="flex flex-1 flex-col gap-6">
      <section className="rounded-[1.75rem] border border-white/12 bg-white/6 p-5 shadow-2xl shadow-black/25 backdrop-blur">
        <Badge className="w-fit bg-amber-300/15 text-amber-200 hover:bg-amber-300/15">
          Commands
        </Badge>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-50">
          Command strips
        </h1>
      </section>

      <HomeHero
        profiles={credentials.profiles}
        activeProfileId={credentials.activeProfileId}
        latestRunStatus={dashboard.latestRun?.status}
        latestRunCompletedAt={dashboard.latestRun?.completedAt}
      />

      <AlertsRail alerts={dashboard.alerts} />
      <AgentProposalsPanel villages={dashboard.villages} />
    </main>
  );
}
