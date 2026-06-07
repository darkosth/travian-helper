import { AlertTriangle, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function AlertsRail({ alerts }: { alerts: string[] }) {
  if (alerts.length === 0) {
    return (
      <Card className="border-emerald-400/15 bg-emerald-500/8">
        <CardContent className="flex flex-col gap-2 p-4 text-sm text-emerald-100 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-medium">Sin alertas urgentes</p>
          </div>
          <Badge className="w-fit bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/15">
            Estable
          </Badge>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-red-400/25 bg-red-500/10">
      <CardHeader className="gap-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl border border-red-300/20 bg-red-500/10 p-2 text-red-100">
              <ShieldAlert className="size-4" />
            </div>
            <div>
              <CardTitle className="text-red-50">Alertas prioritarias</CardTitle>
            </div>
          </div>
          <Badge className="w-fit bg-red-500/15 text-red-100 hover:bg-red-500/15">
            {alerts.length} señal{alerts.length === 1 ? "" : "es"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-2">
        {alerts.slice(0, 2).map((alert) => (
          <div
            key={alert}
            className="rounded-xl border border-red-300/25 bg-red-950/30 px-4 py-3 text-red-50"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 size-4 text-red-200" />
              <p className="text-sm leading-6 text-red-100">{alert}</p>
            </div>
          </div>
        ))}

        {alerts.length > 2 ? (
          <p className="text-sm text-red-100/75">
            +{alerts.length - 2} alerta{alerts.length - 2 === 1 ? "" : "s"} más esperando revisión.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
