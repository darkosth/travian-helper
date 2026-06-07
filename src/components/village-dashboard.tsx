"use client";

import { useState } from "react";
import { AlertTriangle, Castle, ChevronDown, Clock3, Pickaxe, Target, Wheat } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/time";

type ResourceBucket = {
  amount: number | null;
  capacity: number | null;
  productionPerHour: number | null;
};

type Village = {
  id: number;
  name: string;
  coordinates: string;
  population: number | null;
  loyalty: number | null;
  freeCrop: number | null;
  incomingAttacksAmount: number | null;
  status: string;
  scrapedAt: Date | string;
  visibleTroops: number;
  availableUpgrades: number;
  topRecommendation: string;
  recommendationSummary: string;
  recommendationPriority: string;
  recommendationScore: number;
  recommendationWaitTime: string | null;
  recommendationShouldWait: boolean;
  recommendationReasons: string[];
  recommendationMemorySummary: string;
  recommendationFocus: string;
  strictRouteTitle: string | null;
  strictRouteSummary: string | null;
  strictRouteWaitTime: string | null;
  strictRouteReasons: string[];
  snapshotRecommendationTitle: string;
  snapshotRecommendationSummary: string;
  resources: {
    wood: ResourceBucket;
    clay: ResourceBucket;
    iron: ResourceBucket;
    crop: ResourceBucket;
  };
};

type VillageDashboardProps = {
  villages: Village[];
};

function VillageStatusBadge({ status }: { status: string }) {
  return (
    <Badge
      className={
        status === "complete"
          ? "bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/15"
          : "bg-orange-500/15 text-orange-200 hover:bg-orange-500/15"
      }
    >
      {status}
    </Badge>
  );
}

export function VillageDashboard({ villages }: VillageDashboardProps) {
  const [selectedVillageId, setSelectedVillageId] = useState(villages[0]?.id ?? null);
  const [isSupportOpen, setIsSupportOpen] = useState(false);

  if (villages.length === 0) {
    return (
      <Card className="border-white/10 bg-black/20">
        <CardHeader>
          <CardTitle className="text-stone-50">Todavía no hay aldeas capturadas</CardTitle>
          <CardDescription className="text-stone-300">Ejecuta una captura.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const selectedVillage =
    villages.find((village) => village.id === selectedVillageId) ?? villages[0];

  return (
    <section className="grid gap-4">
      <Card className="border-white/10 bg-black/20">
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-stone-400">Aldeas</p>
              <CardTitle className="mt-2 text-stone-50">Panel por aldea</CardTitle>
            </div>
            <CardDescription className="text-stone-300">
              {villages.length} aldea{villages.length === 1 ? "" : "s"} capturada
              {villages.length === 1 ? "" : "s"}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {villages.map((village) => {
              const isSelected = village.id === selectedVillage.id;

              return (
                <button
                  key={village.id}
                  aria-pressed={isSelected}
                  className={cn(
                    "rounded-2xl border px-4 py-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/70",
                    isSelected
                      ? "border-amber-300/35 bg-amber-300/12 shadow-[0_0_0_1px_rgba(252,211,77,0.12)]"
                      : "border-white/10 bg-white/5 hover:border-white/15 hover:bg-white/8",
                  )}
                  onClick={() => setSelectedVillageId(village.id)}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-stone-50">
                        {village.name}
                      </p>
                      <p className="mt-1 text-sm text-stone-300">
                        {village.coordinates} · {village.population ?? "?"} pop
                      </p>
                    </div>
                    <VillageStatusBadge status={village.status} />
                  </div>

                  <p className="mt-3 text-sm font-medium text-stone-100">
                    {village.topRecommendation}
                  </p>

                  <div className="mt-3 flex items-center justify-between text-sm text-stone-300">
                    <span>Cultivo libre {village.freeCrop ?? "?"}</span>
                    <span>{village.availableUpgrades} mejoras</span>
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-black/20">
        <CardHeader className="border-b border-white/8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <CardTitle className="text-stone-50">{selectedVillage.name}</CardTitle>
              <CardDescription className="text-stone-300">
                {selectedVillage.coordinates} · {selectedVillage.population ?? "?"} pop
              </CardDescription>
              <p className="text-xs uppercase tracking-[0.18em] text-stone-400">
                Actualizado {formatRelativeTime(selectedVillage.scrapedAt)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <VillageStatusBadge status={selectedVillage.status} />
              <Badge className="bg-white/10 text-stone-200 hover:bg-white/10">
                Prioridad {selectedVillage.recommendationPriority}
              </Badge>
              <Badge className="bg-white/5 text-stone-300 hover:bg-white/5">
                Score {selectedVillage.recommendationScore}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 md:space-y-4">
          {selectedVillage.status !== "complete" ? (
            <Alert className="border-orange-400/25 bg-orange-500/10 text-orange-100">
              <AlertTriangle className="size-4" />
              <AlertTitle>Captura parcial</AlertTitle>
              <AlertDescription>Puede haber datos faltantes o viejos.</AlertDescription>
            </Alert>
          ) : null}

          <div className="rounded-[1.5rem] border border-amber-300/20 bg-amber-300/10 p-4 md:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-3">
                <p className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-amber-200/80">
                  <Target className="size-3.5" />
                  Recomendación actual
                </p>
                <div className="space-y-2">
                  <p className="text-2xl font-semibold text-stone-50">
                    {selectedVillage.topRecommendation}
                  </p>
                  <p className="max-w-3xl text-sm leading-7 text-stone-200">
                    {selectedVillage.recommendationSummary}
                  </p>
                </div>
              </div>

              {selectedVillage.recommendationWaitTime ? (
                <div className="rounded-xl border border-amber-300/20 bg-black/20 px-4 py-3 text-right text-sm text-amber-100">
                  <p className="flex items-center justify-end gap-1 text-xs uppercase tracking-[0.18em]">
                    <Clock3 className="size-3.5" />
                    {selectedVillage.recommendationShouldWait ? "Espera" : "ETA"}
                  </p>
                  <p className="mt-2 text-lg font-semibold">
                    {selectedVillage.recommendationWaitTime}
                  </p>
                </div>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-white/8 bg-white/5 p-3">
                  <div className="flex items-center gap-2 text-stone-300">
                    <Wheat className="size-4 text-amber-300" />
                    Cultivo libre
                  </div>
                  <p className="mt-2 text-xl font-semibold text-stone-50">
                    {selectedVillage.freeCrop ?? "?"}
                  </p>
                </div>
                <div className="rounded-xl border border-white/8 bg-white/5 p-3">
                  <div className="flex items-center gap-2 text-stone-300">
                    <Castle className="size-4 text-emerald-300" />
                    Tropas visibles
                  </div>
                  <p className="mt-2 text-xl font-semibold text-stone-50">
                    {selectedVillage.visibleTroops}
                  </p>
                </div>
                <div className="rounded-xl border border-white/8 bg-white/5 p-3">
                  <div className="flex items-center gap-2 text-stone-300">
                    <Pickaxe className="size-4 text-amber-300" />
                    Mejoras disponibles
                  </div>
                  <p className="mt-2 text-xl font-semibold text-stone-50">
                    {selectedVillage.availableUpgrades}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
                <p className="mb-3 text-xs uppercase tracking-[0.18em] text-stone-400">
                  Recursos
                </p>
                <div className="grid gap-2">
                  {(["wood", "clay", "iron", "crop"] as const).map((resource) => {
                    const bucket = selectedVillage.resources[resource];

                    return (
                      <div
                        key={resource}
                        className="grid gap-1 rounded-xl border border-white/8 bg-black/15 px-3 py-3 text-sm text-stone-300 md:grid-cols-[90px_minmax(0,1fr)_130px]"
                      >
                        <span className="font-mono text-xs uppercase tracking-[0.18em] text-stone-400">
                          {resource}
                        </span>
                        <span className="font-medium text-stone-100">
                          {bucket?.amount ?? "?"} / {bucket?.capacity ?? "?"}
                        </span>
                        <span className="text-stone-400 md:text-right">
                          +{bucket?.productionPerHour ?? "?"}/h
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-stone-400">Enfoque</p>
                    <p className="mt-2 text-sm font-medium text-stone-50">
                      {selectedVillage.recommendationFocus}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge className="bg-white/10 text-stone-200 hover:bg-white/10">
                        {selectedVillage.recommendationPriority}
                      </Badge>
                      <Badge className="bg-white/5 text-stone-300 hover:bg-white/5">
                        Score {selectedVillage.recommendationScore}
                      </Badge>
                    </div>
                  </div>
                  <Button
                    className="min-h-11 border border-white/10 bg-white/8 text-stone-100 hover:bg-white/14"
                    onClick={() => setIsSupportOpen((current) => !current)}
                    size="lg"
                    type="button"
                    variant="outline"
                  >
                    <ChevronDown
                      className={`transition-transform ${isSupportOpen ? "rotate-180" : ""}`}
                    />
                    {isSupportOpen ? "Menos" : "Más"}
                  </Button>
                </div>

                <div className="mt-4 space-y-2">
                  {selectedVillage.recommendationReasons.slice(0, 3).map((reason) => (
                    <div
                      key={reason}
                      className="rounded-xl border border-white/8 bg-black/15 px-3 py-2 text-sm text-stone-200"
                    >
                      {reason}
                    </div>
                  ))}
                </div>
              </div>

              {isSupportOpen ? (
                <div className="space-y-4">
                  {selectedVillage.strictRouteTitle ? (
                    <div className="rounded-2xl border border-amber-300/20 bg-black/15 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-amber-200/80">
                            Ruta estricta
                          </p>
                          <p className="mt-2 text-sm font-semibold text-stone-50">
                            {selectedVillage.strictRouteTitle}
                          </p>
                        </div>
                        {selectedVillage.strictRouteWaitTime ? (
                          <span className="rounded-lg border border-amber-300/20 bg-amber-300/10 px-2 py-1 text-xs font-medium text-amber-100">
                            {selectedVillage.strictRouteWaitTime}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-3 text-sm leading-6 text-stone-300">
                        {selectedVillage.strictRouteSummary}
                      </p>
                    </div>
                  ) : null}

                  <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-stone-400">Alternativa</p>
                    <p className="mt-2 text-sm font-semibold text-stone-50">
                      {selectedVillage.snapshotRecommendationTitle}
                    </p>
                    <p className="mt-3 text-sm leading-6 text-stone-300">
                      {selectedVillage.snapshotRecommendationSummary}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-stone-400">Memoria</p>
                    <p className="mt-3 text-sm leading-7 text-stone-300">
                      {selectedVillage.recommendationMemorySummary}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
