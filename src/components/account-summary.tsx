import { Coins } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardData } from "@/lib/dashboard";

const tribeNames: Record<number, string> = {
  1: "Romans",
  2: "Teutons",
  3: "Gauls",
  4: "Nature",
  5: "Natars",
  6: "Egyptians",
  7: "Huns",
};

type AccountSummaryProps = {
  account: DashboardData["account"];
  activeServerUrl?: string;
  alertsCount: number;
  compact?: boolean;
};

export function AccountSummary({
  account,
  activeServerUrl,
  alertsCount,
  compact = false,
}: AccountSummaryProps) {
  const containerClass = compact ? "grid gap-3 sm:grid-cols-2" : "space-y-4";

  return (
    <Card className="border-white/10 bg-black/20">
      <CardHeader>
        <p className="text-xs uppercase tracking-[0.18em] text-stone-400">Resumen de cuenta</p>
        <CardTitle className="mt-2 text-stone-50">Estado actual</CardTitle>
      </CardHeader>
      <CardContent className={containerClass}>
        <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-stone-400">Jugador</p>
          <p className="mt-2 text-lg font-semibold text-stone-50">
            {account?.playerName ?? "Esperando captura"}
          </p>
          <p className="mt-2 text-sm text-stone-300">
            {account?.tribeId
              ? tribeNames[account.tribeId] ?? `Tribu ${account.tribeId}`
              : "Tribu desconocida"}
          </p>
        </div>

        <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-stone-400">Aldeas / slots</p>
          <p className="mt-2 text-lg font-semibold text-stone-50">
            {account?.usedVillageSlots ?? 0}
            <span className="text-stone-400"> / {account?.maxControllableVillages ?? 0}</span>
          </p>
          <p className="mt-2 text-sm text-stone-300">
            CP total: {account?.cpProductionTotal ?? 0}
          </p>
        </div>

        <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-stone-400">Tesorería</p>
          <p className="mt-2 flex items-center gap-2 text-lg font-semibold text-stone-50">
            <Coins className="size-5 text-amber-300" />
            {account?.gold ?? 0} oro / {account?.silver ?? 0} plata
          </p>
          <p className="mt-2 text-sm text-stone-300">
            Servidor: {activeServerUrl ?? account?.serverUrl ?? "Sin servidor guardado"}
          </p>
        </div>

        <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-stone-400">Señales activas</p>
          <div className="mt-2 flex items-center gap-2">
            <p className="text-2xl font-semibold text-stone-50">{alertsCount}</p>
            <Badge className="bg-white/10 text-stone-200 hover:bg-white/10">
              {alertsCount > 0 ? "Atención" : "Estable"}
            </Badge>
          </div>
          <p className="mt-2 text-sm text-stone-300">
            {alertsCount > 0
              ? "Hay señales abiertas."
              : "Sin bloqueos visibles."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
