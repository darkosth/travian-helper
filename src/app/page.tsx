import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AccountSummary } from "@/components/account-summary";
import { AlertsRail } from "@/components/alerts-rail";
import { getCredentialSummary } from "@/lib/credentials";
import { getDashboardData } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [dashboard, credentials] = await Promise.all([
    getDashboardData(),
    getCredentialSummary(),
  ]);

  const topVillage = dashboard.villages[0] ?? null;
  const activeServerUrl =
    credentials.profiles.find((profile) => profile.id === credentials.activeProfileId)?.serverUrl ??
    undefined;

  return (
    <main className="flex flex-1 flex-col gap-6">
      <section className="rounded-[1.75rem] border border-white/12 bg-white/6 p-5 shadow-2xl shadow-black/25 backdrop-blur">
        <Badge className="w-fit bg-amber-300/15 text-amber-200 hover:bg-amber-300/15">
          Home
        </Badge>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-50">
          Resumen de cuenta
        </h1>
      </section>

      <AlertsRail alerts={dashboard.alerts} />

      <AccountSummary
        account={dashboard.account}
        activeServerUrl={activeServerUrl}
        alertsCount={dashboard.alerts.length}
        compact
      />

      {topVillage ? (
        <Card className="border-white/10 bg-black/20">
          <CardHeader>
            <p className="text-xs uppercase tracking-[0.18em] text-stone-400">Aldea foco</p>
            <CardTitle className="mt-2 text-stone-50">{topVillage.name}</CardTitle>
            <CardDescription className="text-stone-300">
              {topVillage.coordinates} · {topVillage.population ?? "?"} pop
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-amber-200/80">
                Recomendación actual
              </p>
              <p className="mt-2 text-lg font-semibold text-stone-50">
                {topVillage.topRecommendation}
              </p>
              <p className="mt-3 text-sm leading-6 text-stone-300">
                {topVillage.recommendationSummary}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-stone-400">Cultivo libre</p>
                <p className="mt-2 text-lg font-semibold text-stone-50">{topVillage.freeCrop}</p>
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-stone-400">Mejoras</p>
                <p className="mt-2 text-lg font-semibold text-stone-50">
                  {topVillage.availableUpgrades}
                </p>
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-stone-400">Score</p>
                <p className="mt-2 text-lg font-semibold text-stone-50">
                  {topVillage.recommendationScore}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </main>
  );
}
