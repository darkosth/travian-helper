"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bot, ChevronDown, Clock3, LoaderCircle, Route, Wheat } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
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

type Village = {
  dbId: string;
  name: string;
  coordinates: string;
  population: number | null;
  status: string;
  scrapedAt: Date | string;
  freeCrop: number | null;
  visibleTroops: number;
  incomingAttacksAmount: number | null;
  availableUpgrades: number;
  resources: {
    wood: ResourceBucket;
    clay: ResourceBucket;
    iron: ResourceBucket;
    crop: ResourceBucket;
  };
  queue: {
    activeSlots: number;
    expiredByClock: boolean;
    entries: ActiveConstruction[];
  };
  nextMove: {
    source: "heuristic" | "planner";
    sourceLabel: string;
    summary: string;
    title: string;
    waitTime: string | null;
  };
  planner: {
    href: string;
    mode: string;
    modeLabel: string;
    planName: string | null;
    planStatus: string | null;
    summary: string;
  };
  autoApply: {
    enabled: boolean;
    pausedAt: Date | string | null;
    pauseReason: string | null;
    job: {
      attemptCount: number;
      id: string;
      lastError: string | null;
      runAt: Date | string;
      status: string;
    } | null;
  };
};

type VillageDashboardProps = {
  villages: Village[];
};

const RESOURCE_LABELS = {
  clay: "Barro",
  crop: "Cereal",
  iron: "Hierro",
  wood: "Madera",
} as const;

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "?";
  }

  return new Intl.NumberFormat("es-US").format(value);
}

const queueLabel = (activeSlots: number) => `${activeSlots}/2 cola`;

const autoApplyStatusText = (village: Village) => {
  if (village.autoApply.pausedAt) {
    return `Pausado: ${village.autoApply.pauseReason ?? "sin motivo"}`;
  }

  if (!village.autoApply.job) {
    return village.autoApply.enabled
      ? "Sin job pendiente. La próxima captura reprogramará la cola."
      : "Auto-apply apagado.";
  }

  if (village.autoApply.job.status === "running") {
    return "Procesando ahora.";
  }

  return `Siguiente intento ${formatRelativeTime(village.autoApply.job.runAt)}`;
};

export function VillageDashboard({ villages }: VillageDashboardProps) {
  const router = useRouter();
  const [openVillageId, setOpenVillageId] = useState<string | null>(villages[0]?.dbId ?? null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (villages.length === 0) {
    return (
      <section className="px-4 py-4">
        <Card className="border-white/10 bg-black/20">
          <CardHeader>
            <CardTitle className="text-stone-50">Todavía no hay aldeas capturadas</CardTitle>
          </CardHeader>
        </Card>
      </section>
    );
  }

  const toggleAutoApply = (village: Village, enabled: boolean) => {
    setFeedback(null);

    startTransition(async () => {
      const response = await fetch(`/api/villages/${village.dbId}/auto-apply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ enabled }),
      });
      const result = (await response.json()) as { error?: string; ok: boolean };

      if (!response.ok || !result.ok) {
        setFeedback(result.error ?? "No se pudo cambiar auto-apply.");
        return;
      }

      setFeedback(
        enabled
          ? "Auto-apply encendido. Se forzó nueva captura y reprogramación."
          : "Auto-apply apagado. Se limpió la cola pendiente.",
      );
      router.refresh();
    });
  };

  return (
    <section className="mx-auto w-full max-w-3xl px-4 pb-28 pt-4">
      {feedback ? (
        <p className="mb-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-stone-200">
          {feedback}
        </p>
      ) : null}

      <div className="space-y-3">
        {villages.map((village) => {
          const isOpen = openVillageId === village.dbId;

          return (
            <article
              key={village.dbId}
              className="overflow-hidden rounded-3xl border border-white/10 bg-white/5"
            >
              <button
                className="w-full px-4 py-4 text-left"
                onClick={() => setOpenVillageId((current) => (current === village.dbId ? null : village.dbId))}
                type="button"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-base font-semibold text-stone-50">{village.name}</p>
                      <Badge
                        className={cn(
                          "rounded-full",
                          village.autoApply.enabled
                            ? "bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/15"
                            : "bg-white/10 text-stone-300 hover:bg-white/10",
                        )}
                      >
                        {village.autoApply.enabled ? "ON" : "OFF"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-stone-400">
                      {village.coordinates} · {formatNumber(village.population)} pop
                    </p>
                  </div>
                  <ChevronDown
                    className={cn("size-4 shrink-0 text-stone-400 transition-transform", isOpen && "rotate-180")}
                  />
                </div>

                <div className="mt-3 flex items-center gap-2 text-xs text-stone-300">
                  <span>{queueLabel(village.queue.activeSlots)}</span>
                  <span>•</span>
                  <span>{formatNumber(village.freeCrop)} cultivo</span>
                  <span>•</span>
                  <span>{formatNumber(village.resources.wood.amount)}/{formatNumber(village.resources.clay.amount)}/{formatNumber(village.resources.iron.amount)}/{formatNumber(village.resources.crop.amount)}</span>
                </div>
              </button>

              {isOpen ? (
                <div className="space-y-4 border-t border-white/8 px-4 pb-4 pt-4">
                  {village.status !== "complete" ? (
                    <Alert className="border-orange-400/25 bg-orange-500/10 text-orange-100">
                      <AlertTitle>Captura parcial</AlertTitle>
                      <AlertDescription>
                        Puede haber datos faltantes o desactualizados.
                      </AlertDescription>
                    </Alert>
                  ) : null}

                  {(village.incomingAttacksAmount ?? 0) > 0 ? (
                    <Alert className="border-red-400/25 bg-red-500/10 text-red-100">
                      <AlertTitle>Ataques entrantes</AlertTitle>
                      <AlertDescription>
                        Se detectaron {village.incomingAttacksAmount} ataques.
                      </AlertDescription>
                    </Alert>
                  ) : null}

                  <section className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.14em] text-amber-200/80">
                          Próximo movimiento
                        </p>
                        <h2 className="mt-2 text-lg font-semibold text-stone-50">
                          {village.nextMove.title}
                        </h2>
                      </div>
                      <Badge className="rounded-full bg-black/20 text-stone-200 hover:bg-black/20">
                        {village.nextMove.sourceLabel}
                      </Badge>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-stone-200">
                      {village.nextMove.summary}
                    </p>
                    {village.nextMove.waitTime ? (
                      <p className="mt-3 flex items-center gap-2 text-xs text-amber-100">
                        <Clock3 className="size-3.5" />
                        ETA {village.nextMove.waitTime}
                      </p>
                    ) : null}
                  </section>

                  <section className="rounded-2xl border border-white/8 bg-black/15 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.14em] text-stone-500">
                          Auto-apply
                        </p>
                        <p className="mt-2 text-sm text-stone-200">{autoApplyStatusText(village)}</p>
                      </div>
                      <Badge
                        className={cn(
                          "rounded-full",
                          village.autoApply.enabled
                            ? "bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/15"
                            : "bg-white/10 text-stone-300 hover:bg-white/10",
                        )}
                      >
                        {village.autoApply.enabled ? "Activo" : "Apagado"}
                      </Badge>
                    </div>

                    <div className="mt-4 flex items-center gap-2">
                      <Button
                        className="min-h-11 flex-1"
                        disabled={isPending}
                        onClick={() => toggleAutoApply(village, !village.autoApply.enabled)}
                        type="button"
                        variant="outline"
                      >
                        {isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Bot className="size-4" />}
                        {village.autoApply.enabled ? "Apagar" : "Encender"}
                      </Button>
                      {village.autoApply.job ? (
                        <Badge className="rounded-full bg-black/20 text-stone-200 hover:bg-black/20">
                          {village.autoApply.job.status}
                        </Badge>
                      ) : null}
                    </div>

                    {village.autoApply.job?.lastError ? (
                      <p className="mt-3 text-xs text-stone-400">
                        Último error: {village.autoApply.job.lastError}
                      </p>
                    ) : null}
                  </section>

                  <section className="rounded-2xl border border-white/8 bg-black/15 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.14em] text-stone-500">
                          Construcción
                        </p>
                        <p className="mt-2 text-sm text-stone-200">
                          {queueLabel(village.queue.activeSlots)} · {formatNumber(village.availableUpgrades)} mejoras
                        </p>
                      </div>
                      <Badge className="rounded-full bg-black/20 text-stone-200 hover:bg-black/20">
                        {queueLabel(village.queue.activeSlots)}
                      </Badge>
                    </div>

                    <div className="mt-4 space-y-2">
                      {village.queue.entries.length > 0 ? (
                        village.queue.entries.map((entry, index) => (
                          <div
                            key={`${entry.name}-${entry.slot ?? index}-${entry.targetLevel ?? "?"}`}
                            className="rounded-2xl border border-white/8 bg-white/5 px-3 py-3"
                          >
                            <p className="text-sm font-semibold text-stone-50">
                              {entry.name}
                              {entry.targetLevel !== null ? ` → nivel ${entry.targetLevel}` : ""}
                            </p>
                            <p className="mt-1 text-xs text-stone-400">
                              {entry.remainingTime ?? entry.finishTime ?? "En cola"}
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className="rounded-2xl border border-dashed border-white/10 bg-black/10 px-3 py-3 text-sm text-stone-400">
                          {village.queue.expiredByClock
                            ? "La cola del último snapshot ya venció por reloj; falta recaptura para confirmarlo."
                            : "No se detectaron construcciones en curso."}
                        </p>
                      )}
                    </div>
                  </section>

                  <section className="rounded-2xl border border-white/8 bg-black/15 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.14em] text-stone-500">
                          Planner
                        </p>
                        <p className="mt-2 text-sm text-stone-200">{village.planner.summary}</p>
                      </div>
                      <Badge className="rounded-full bg-black/20 text-stone-200 hover:bg-black/20">
                        {village.planner.modeLabel}
                      </Badge>
                    </div>

                    {village.planner.planName ? (
                      <p className="mt-3 text-xs text-stone-400">
                        Plan actual: {village.planner.planName}
                      </p>
                    ) : null}

                    <Link
                      className={cn(
                        buttonVariants({ variant: "outline" }),
                        "mt-4 flex min-h-11 w-full items-center justify-center gap-1.5",
                      )}
                      href={village.planner.href}
                    >
                      <Route className="size-4" />
                      Ver plan / aplicar plantilla
                    </Link>
                  </section>

                  <section className="grid grid-cols-2 gap-2">
                    {(["wood", "clay", "iron", "crop"] as const).map((resource) => {
                      const bucket = village.resources[resource];

                      return (
                        <div
                          key={resource}
                          className="rounded-2xl border border-white/8 bg-black/15 p-3"
                        >
                          <p className="text-xs uppercase tracking-[0.12em] text-stone-500">
                            {RESOURCE_LABELS[resource]}
                          </p>
                          <p className="mt-2 text-sm font-semibold text-stone-50">
                            {formatNumber(bucket.amount)}
                          </p>
                          <p className="mt-1 text-xs text-stone-400">
                            +{formatNumber(bucket.productionPerHour)}/h
                          </p>
                        </div>
                      );
                    })}
                  </section>

                  <div className="flex items-center justify-between gap-3 text-xs text-stone-500">
                    <span className="flex items-center gap-1">
                      <Wheat className="size-3.5" />
                      {formatNumber(village.freeCrop)} cultivo libre
                    </span>
                    <span>Actualizado {formatRelativeTime(village.scrapedAt)}</span>
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
