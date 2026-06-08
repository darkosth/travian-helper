"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Bot,
  Castle,
  Check,
  ChevronDown,
  Clock3,
  LoaderCircle,
  Pickaxe,
  Target,
  Wheat,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/time";

type ResourceBucket = {
  amount: number | null;
  capacity: number | null;
  productionPerHour: number | null;
};

type ActiveConstruction = {
  slot: number | null;
  kind: "resourceField" | "building" | null;
  name: string;
  currentLevel: number | null;
  targetLevel: number | null;
  remainingTime: string | null;
  finishTime: string | null;
};

type RecommendationCandidate = {
  id: string;
  label: string;
  category: string;
  affordableNow: boolean;
  blockedByConstructionQueue: boolean;
  score: number;
  reasons: string[];
  waitTimeText: string | null;
};

type Village = {
  id: number;
  dbId: string;
  name: string;
  coordinates: string;
  population: number | null;
  loyalty: number | null;
  freeCrop: number | null;
  incomingAttacksAmount: number | null;
  status: string;
  scrapedAt: Date | string;
  visibleTroops: number;
  activeConstructionSlots: number;
  queueExpiredByClock: boolean;
  autoApplyEnabled: boolean;
  autoApplyPausedAt: Date | string | null;
  autoApplyPauseReason: string | null;
  autoApplyJob: {
    id: string;
    status: string;
    runAt: Date | string;
    lastError: string | null;
    attemptCount: number;
  } | null;
  constructionQueue: ActiveConstruction[];
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
  recommendationCandidates: RecommendationCandidate[];
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

const RESOURCE_LABELS = {
  wood: "Madera",
  clay: "Barro",
  iron: "Hierro",
  crop: "Cereal",
} as const;

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "?";
  }

  return new Intl.NumberFormat("es-US").format(value);
}

function VillageStatusBadge({ status }: { status: string }) {
  const isComplete = status === "complete";

  return (
    <Badge
      className={cn(
        "h-6 rounded-full px-2 text-[10px] font-semibold uppercase tracking-[0.12em]",
        isComplete
          ? "bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/15"
          : "bg-orange-500/15 text-orange-200 hover:bg-orange-500/15",
      )}
    >
      {isComplete ? "Lista" : "Parcial"}
    </Badge>
  );
}

function SectionTitle({
  title,
  description,
  right,
}: {
  title: string;
  description?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">
          {title}
        </p>
        {description ? <p className="mt-1 text-sm text-stone-300">{description}</p> : null}
      </div>
      {right}
    </div>
  );
}

export function VillageDashboard({ villages }: VillageDashboardProps) {
  const router = useRouter();
  const [selectedVillageId, setSelectedVillageId] = useState(villages[0]?.id ?? null);
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [autoApplyFeedback, setAutoApplyFeedback] = useState<string | null>(null);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Record<string, string>>({});

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

  const selectedCandidateId =
    selectedCandidateIds[selectedVillage.dbId] ??
    selectedVillage.recommendationCandidates[0]?.id ??
    null;

  const selectedCandidate =
    selectedVillage.recommendationCandidates.find(
      (candidate) => candidate.id === selectedCandidateId,
    ) ??
    selectedVillage.recommendationCandidates[0] ??
    null;

  const applyDisabledReason = (() => {
    if (!selectedCandidate) {
      return "No hay recomendación seleccionable.";
    }

    if (selectedVillage.autoApplyEnabled) {
      return "Auto-apply está activo.";
    }

    if (!selectedCandidate.affordableNow || selectedCandidate.blockedByConstructionQueue) {
      return "La opción elegida todavía no está disponible.";
    }

    return null;
  })();

  const autoApplyStatusText = (() => {
    if (selectedVillage.autoApplyPausedAt) {
      return `Pausado: ${selectedVillage.autoApplyPauseReason ?? "sin motivo"}`;
    }

    if (!selectedVillage.autoApplyJob) {
      return "Sin job programado.";
    }

    if (selectedVillage.autoApplyJob.status === "running") {
      return selectedVillage.activeConstructionSlots === 0
        ? "Procesando auto-apply ahora."
        : `Cola ${selectedVillage.activeConstructionSlots}/2 · procesando ahora`;
    }
    if (selectedVillage.activeConstructionSlots === 0) {
      return `Esperando jitter · próximo intento ${formatRelativeTime(
        selectedVillage.autoApplyJob.runAt,
      )}`;
    }

    return `Cola ${selectedVillage.activeConstructionSlots}/2 · próximo intento ${formatRelativeTime(
      selectedVillage.autoApplyJob.runAt,
    )}`;
  })();

  const toggleAutoApply = (village: Village, enabled: boolean) => {
    setAutoApplyFeedback(null);

    startTransition(async () => {
      const response = await fetch(`/api/villages/${village.dbId}/auto-apply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ enabled }),
      });
      const result = (await response.json()) as { ok: boolean; error?: string };

      if (!response.ok || !result.ok) {
        setAutoApplyFeedback(result.error ?? "No se pudo cambiar auto-apply.");
        return;
      }

      setAutoApplyFeedback(enabled ? "Auto-apply activado." : "Auto-apply desactivado.");
      router.refresh();
    });
  };

  const applySelectedRecommendation = (village: Village) => {
    if (!selectedCandidate) {
      return;
    }

    setAutoApplyFeedback(null);

    startTransition(async () => {
      const response = await fetch(`/api/villages/${village.dbId}/apply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ candidateId: selectedCandidate.id }),
      });
      const result = (await response.json()) as { ok: boolean; error?: string };

      if (!response.ok || !result.ok) {
        setAutoApplyFeedback(result.error ?? "No se pudo aplicar la recomendación.");
        return;
      }

      setAutoApplyFeedback("Recomendación aplicada tras refrescar la aldea.");
      router.refresh();
    });
  };

  return (
    <section className="mx-auto w-full max-w-6xl pb-28 lg:pb-6">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-stone-950/95 px-4 pb-3 pt-4 backdrop-blur lg:static lg:rounded-3xl lg:border lg:px-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200/75">
              Travian assistant
            </p>
            <h1 className="mt-1 text-xl font-semibold text-stone-50">Mis aldeas</h1>
          </div>
          <Badge className="rounded-full bg-white/10 px-3 py-1 text-stone-200 hover:bg-white/10">
            {villages.length} {villages.length === 1 ? "aldea" : "aldeas"}
          </Badge>
        </div>

        <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:-mx-0 lg:px-0">
          {villages.map((village) => {
            const isSelected = village.id === selectedVillage.id;

            return (
              <button
                key={village.id}
                aria-pressed={isSelected}
                className={cn(
                  "min-w-[168px] shrink-0 rounded-2xl border px-3 py-3 text-left transition-colors",
                  isSelected
                    ? "border-amber-300/40 bg-amber-300/12"
                    : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/8",
                )}
                onClick={() => setSelectedVillageId(village.id)}
                type="button"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-stone-50">{village.name}</p>
                  <VillageStatusBadge status={village.status} />
                </div>
                <p className="mt-1 text-xs text-stone-400">
                  {village.coordinates} · {formatNumber(village.population)} pop
                </p>
                <div className="mt-3 flex items-center justify-between text-xs text-stone-300">
                  <span>{village.activeConstructionSlots}/2 cola</span>
                  <span className={village.autoApplyEnabled ? "text-emerald-200" : "text-stone-400"}>
                    Auto {village.autoApplyEnabled ? "ON" : "OFF"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </header>

      <main className="space-y-3 px-4 pt-4 lg:px-0">
        {autoApplyFeedback ? (
          <p className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-stone-200">
            {autoApplyFeedback}
          </p>
        ) : null}

        <section className="rounded-3xl border border-white/10 bg-black/20 p-4 lg:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-2xl font-semibold text-stone-50">{selectedVillage.name}</h2>
                <VillageStatusBadge status={selectedVillage.status} />
              </div>
              <p className="mt-1 text-sm text-stone-300">
                {selectedVillage.coordinates} · {formatNumber(selectedVillage.population)} población
              </p>
              <p className="mt-2 text-[11px] uppercase tracking-[0.14em] text-stone-500">
                Actualizado {formatRelativeTime(selectedVillage.scrapedAt)}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-right">
              <p className="text-[10px] uppercase tracking-[0.16em] text-stone-400">Score</p>
              <p className="mt-1 text-lg font-semibold text-stone-100">
                {selectedVillage.recommendationScore}
              </p>
            </div>
          </div>

          {selectedVillage.status !== "complete" ? (
            <Alert className="mt-4 border-orange-400/25 bg-orange-500/10 text-orange-100">
              <AlertTriangle className="size-4" />
              <AlertTitle>Captura parcial</AlertTitle>
              <AlertDescription>Puede haber datos faltantes o desactualizados.</AlertDescription>
            </Alert>
          ) : null}
        </section>

        <section className="rounded-3xl border border-amber-300/25 bg-amber-300/10 p-4 lg:p-5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-200/85">
            <Target className="size-4" />
            Próximo movimiento
          </div>
          <h3 className="mt-3 text-xl font-semibold leading-tight text-stone-50 lg:text-2xl">
            {selectedVillage.topRecommendation}
          </h3>
          <p className="mt-2 text-sm leading-6 text-stone-200">
            {selectedVillage.recommendationSummary}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge className="rounded-full bg-black/20 text-stone-200 hover:bg-black/20">
              Prioridad {selectedVillage.recommendationPriority}
            </Badge>
            {selectedVillage.recommendationWaitTime ? (
              <Badge className="rounded-full bg-amber-300/15 text-amber-100 hover:bg-amber-300/15">
                <Clock3 className="mr-1 size-3.5" />
                {selectedVillage.recommendationShouldWait ? "Espera" : "ETA"}{" "}
                {selectedVillage.recommendationWaitTime}
              </Badge>
            ) : null}
          </div>
        </section>

        <section className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <Wheat className="size-4 text-amber-300" />
            <p className="mt-3 text-lg font-semibold text-stone-50">{formatNumber(selectedVillage.freeCrop)}</p>
            <p className="mt-1 text-xs text-stone-400">Cultivo libre</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <Castle className="size-4 text-emerald-300" />
            <p className="mt-3 text-lg font-semibold text-stone-50">
              {formatNumber(selectedVillage.visibleTroops)}
            </p>
            <p className="mt-1 text-xs text-stone-400">Tropas visibles</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <Pickaxe className="size-4 text-amber-300" />
            <p className="mt-3 text-lg font-semibold text-stone-50">
              {formatNumber(selectedVillage.availableUpgrades)}
            </p>
            <p className="mt-1 text-xs text-stone-400">Mejoras</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <Clock3 className="size-4 text-sky-300" />
            <p className="mt-3 text-lg font-semibold text-stone-50">
              {selectedVillage.activeConstructionSlots}/2
            </p>
            <p className="mt-1 text-xs text-stone-400">Slots ocupados</p>
          </div>
        </section>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.8fr)]">
          <div className="space-y-3">
            <section className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <SectionTitle
                description={
                  selectedVillage.activeConstructionSlots >= 2
                    ? "Los dos slots están ocupados."
                    : selectedVillage.activeConstructionSlots === 1
                      ? "Queda un slot libre."
                      : "No hay cola activa."
                }
                right={
                  <Badge className="rounded-full bg-black/20 text-stone-200 hover:bg-black/20">
                    {selectedVillage.activeConstructionSlots}/2
                  </Badge>
                }
                title="Construcciones"
              />

              <div className="mt-4 space-y-2">
                {selectedVillage.constructionQueue.length > 0 ? (
                  selectedVillage.constructionQueue.map((entry, index) => (
                    <div
                      key={`${entry.kind ?? "unknown"}-${entry.slot ?? index}-${entry.name}-${entry.targetLevel ?? "?"}`}
                      className="flex items-start justify-between gap-3 rounded-2xl border border-white/8 bg-black/15 px-3 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-stone-50">
                          {entry.name}
                          {entry.targetLevel !== null ? ` → nivel ${entry.targetLevel}` : ""}
                        </p>
                        <p className="mt-1 text-xs text-stone-400">
                          {entry.kind === "resourceField"
                            ? "Campo de recurso"
                            : entry.kind === "building"
                              ? "Edificio"
                              : "En cola"}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        {entry.remainingTime ? (
                          <p className="text-sm font-semibold text-sky-200">{entry.remainingTime}</p>
                        ) : null}
                        {entry.finishTime ? (
                          <p className="mt-1 text-xs text-stone-500">Listo {entry.finishTime}</p>
                        ) : null}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 px-3 py-3 text-sm leading-6 text-stone-400">
                    {selectedVillage.queueExpiredByClock
                      ? "La cola del último snapshot ya venció por reloj; falta recaptura para confirmarlo."
                      : "No se detectaron construcciones en curso."}
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <SectionTitle title="Recursos" />
              <div className="mt-4 grid grid-cols-2 gap-2">
                {(["wood", "clay", "iron", "crop"] as const).map((resource) => {
                  const bucket = selectedVillage.resources[resource];
                  const progress =
                    bucket?.amount !== null &&
                    bucket?.amount !== undefined &&
                    bucket?.capacity !== null &&
                    bucket?.capacity !== undefined &&
                    bucket.capacity > 0
                      ? Math.min(100, Math.round((bucket.amount / bucket.capacity) * 100))
                      : 0;

                  return (
                    <div key={resource} className="rounded-2xl border border-white/8 bg-black/15 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-400">
                          {RESOURCE_LABELS[resource]}
                        </p>
                        <p className="text-xs text-stone-400">+{formatNumber(bucket?.productionPerHour)}/h</p>
                      </div>
                      <p className="mt-3 text-base font-semibold text-stone-100">
                        {formatNumber(bucket?.amount)}
                      </p>
                      <p className="mt-1 text-xs text-stone-500">de {formatNumber(bucket?.capacity)}</p>
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full rounded-full bg-amber-300/70" style={{ width: `${progress}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          <div className="space-y-3">
            <section className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <SectionTitle
                description={autoApplyStatusText}
                right={
                  <Badge
                    className={cn(
                      "rounded-full",
                      selectedVillage.autoApplyEnabled
                        ? "bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/15"
                        : "bg-white/10 text-stone-300 hover:bg-white/10",
                    )}
                  >
                    {selectedVillage.autoApplyEnabled ? "Activo" : "Apagado"}
                  </Badge>
                }
                title="Auto-apply"
              />

              <div className="mt-4">
                <Button
                  className="w-full border border-white/10 bg-white/8 text-stone-100 hover:bg-white/14"
                  disabled={isPending}
                  onClick={() =>
                    toggleAutoApply(selectedVillage, !selectedVillage.autoApplyEnabled)
                  }
                  type="button"
                  variant="outline"
                >
                  <Bot />
                  {selectedVillage.autoApplyEnabled ? "Apagar auto-apply" : "Encender auto-apply"}
                </Button>
              </div>

              {selectedVillage.autoApplyJob ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Badge className="rounded-full bg-black/20 text-stone-200 hover:bg-black/20">
                    {selectedVillage.autoApplyJob.status}
                  </Badge>
                  <Badge className="rounded-full bg-black/20 text-stone-200 hover:bg-black/20">
                    Intentos {selectedVillage.autoApplyJob.attemptCount}
                  </Badge>
                </div>
              ) : null}
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <SectionTitle description={selectedVillage.recommendationFocus} title="Top recomendaciones" />

              <div className="mt-4 space-y-2">
                {selectedVillage.recommendationCandidates.map((candidate, index) => {
                  const isSelected = candidate.id === selectedCandidate?.id;
                  const isAvailable = candidate.affordableNow && !candidate.blockedByConstructionQueue;

                  return (
                    <button
                      key={candidate.id}
                      aria-pressed={isSelected}
                      className={cn(
                        "w-full rounded-2xl border px-3 py-3 text-left transition-colors",
                        isSelected
                          ? "border-amber-300/40 bg-amber-300/10"
                          : "border-white/8 bg-black/15 hover:border-white/15 hover:bg-black/25",
                      )}
                      onClick={() =>
                        setSelectedCandidateIds((current) => ({
                          ...current,
                          [selectedVillage.dbId]: candidate.id,
                        }))
                      }
                      type="button"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-stone-50">
                            #{index + 1} {candidate.label}
                          </p>
                          <p className="mt-1 text-xs uppercase tracking-[0.12em] text-stone-500">
                            {candidate.category}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-semibold text-stone-100">{candidate.score}</p>
                          <p className={cn("mt-1 text-xs", isAvailable ? "text-emerald-200" : "text-stone-400")}>
                            {isAvailable
                              ? "Disponible"
                              : candidate.waitTimeText
                                ? `ETA ${candidate.waitTimeText}`
                                : "Espera"}
                          </p>
                        </div>
                      </div>
                      {candidate.reasons[0] ? (
                        <p className="mt-3 line-clamp-2 text-sm leading-5 text-stone-300">
                          {candidate.reasons[0]}
                        </p>
                      ) : null}
                    </button>
                  );
                })}
              </div>

              {!selectedVillage.autoApplyEnabled ? (
                <div className="mt-4">
                  <p className="mb-3 text-sm leading-5 text-stone-300">
                    {applyDisabledReason ?? "La opción elegida se aplicará después de recapturar la aldea."}
                  </p>
                  <Button
                    className="w-full bg-emerald-400 text-stone-950 hover:bg-emerald-300"
                    disabled={Boolean(applyDisabledReason) || isPending}
                    onClick={() => applySelectedRecommendation(selectedVillage)}
                    type="button"
                  >
                    {isPending ? <LoaderCircle className="animate-spin" /> : <Check />}
                    Aplicar recomendación
                  </Button>
                </div>
              ) : null}
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between gap-3">
                <SectionTitle description="Ruta, razones y memoria" title="Detalles" />
                <Button
                  className="shrink-0 border border-white/10 bg-white/8 text-stone-100 hover:bg-white/14"
                  onClick={() => setIsSupportOpen((current) => !current)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <ChevronDown className={cn("transition-transform", isSupportOpen && "rotate-180")} />
                  {isSupportOpen ? "Cerrar" : "Abrir"}
                </Button>
              </div>

              <div className="mt-4 space-y-2">
                {selectedVillage.recommendationReasons.slice(0, 3).map((reason) => (
                  <p
                    key={reason}
                    className="rounded-2xl border border-white/8 bg-black/15 px-3 py-2 text-sm leading-5 text-stone-300"
                  >
                    {reason}
                  </p>
                ))}
              </div>

              {isSupportOpen ? (
                <div className="mt-4 space-y-3 border-t border-white/8 pt-4">
                  {selectedVillage.strictRouteTitle ? (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-200/80">
                        Ruta estricta
                      </p>
                      <p className="mt-2 text-sm font-semibold text-stone-50">
                        {selectedVillage.strictRouteTitle}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-stone-300">
                        {selectedVillage.strictRouteSummary}
                      </p>
                    </div>
                  ) : null}

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-400">
                      Alternativa
                    </p>
                    <p className="mt-2 text-sm font-semibold text-stone-50">
                      {selectedVillage.snapshotRecommendationTitle}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-stone-300">
                      {selectedVillage.snapshotRecommendationSummary}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-400">
                      Memoria
                    </p>
                    <p className="mt-2 text-sm leading-6 text-stone-300">
                      {selectedVillage.recommendationMemorySummary}
                    </p>
                  </div>
                </div>
              ) : null}
            </section>
          </div>
        </div>
      </main>
    </section>
  );
}
