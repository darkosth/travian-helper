"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, LoaderCircle, Plus, Radar, Trash2 } from "lucide-react";
import { SettingsForm } from "@/components/settings-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type CredentialProfileSummary = {
  id: string;
  isActive: boolean;
  label: string;
  serverUrl: string;
  updatedAt: Date | string;
  username: string;
};

type VillagesProfileHeaderProps = {
  activeProfileId: string | null;
  autoApplyEnabledCount: number;
  profiles: CredentialProfileSummary[];
};

export function VillagesProfileHeader({
  activeProfileId,
  autoApplyEnabledCount,
  profiles,
}: VillagesProfileHeaderProps) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();

  const orderedProfiles = useMemo(() => profiles, [profiles]);
  const activeProfile =
    orderedProfiles.find((profile) => profile.id === activeProfileId) ?? null;

  const activateProfile = (profileId: string) => {
    setFeedback(null);

    startTransition(async () => {
      const response = await fetch("/api/settings/credentials", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ profileId }),
      });

      const result = (await response.json()) as { error?: string; ok: boolean };

      if (!response.ok || !result.ok) {
        setFeedback(result.error ?? "No se pudo activar el perfil.");
        return;
      }

      setIsMenuOpen(false);
      setFeedback("Perfil activo actualizado.");
      router.refresh();
    });
  };

  const deleteProfile = (profileId: string, username: string) => {
    if (
      !window.confirm(
        `Delete profile ${username}? This will remove its linked account, villages, snapshots, runs, proposals, and queued jobs.`,
      )
    ) {
      return;
    }

    setFeedback(null);

    startDeleteTransition(async () => {
      const response = await fetch("/api/settings/credentials", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ profileId }),
      });

      const result = (await response.json()) as { error?: string; ok: boolean };

      if (!response.ok || !result.ok) {
        setFeedback(result.error ?? "No se pudo borrar el perfil.");
        return;
      }

      setIsMenuOpen(false);
      setFeedback("Perfil borrado.");
      router.refresh();
    });
  };

  const runCapture = () => {
    setFeedback(null);

    startTransition(async () => {
      const response = await fetch("/api/capture-runs", {
        method: "POST",
      });

      const result = (await response.json()) as {
        error?: string;
        ok: boolean;
        proposalIds?: string[];
      };

      if (!response.ok || !result.ok) {
        setFeedback(result.error ?? "No se pudo actualizar la captura.");
        return;
      }

      setFeedback(
        result.proposalIds && result.proposalIds.length > 0
          ? `Captura lista. ${result.proposalIds.length} aldea${result.proposalIds.length === 1 ? "" : "s"} actualizada${result.proposalIds.length === 1 ? "" : "s"}.`
          : "Captura lista.",
      );
      router.refresh();
    });
  };

  return (
    <>
      <section className="sticky top-0 z-30 border-b border-white/10 bg-stone-950/95 px-4 pb-3 pt-4 backdrop-blur">
        <div className="relative">
          <button
            className="flex w-full items-center justify-between gap-3 text-left"
            onClick={() => setIsMenuOpen((current) => !current)}
            type="button"
          >
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-stone-50">
                {activeProfile?.label ?? "Sin perfil activo"}
              </p>
              <p className="mt-1 truncate text-xs text-stone-400">
                {activeProfile?.username ?? "Agrega un perfil para empezar"}
              </p>
            </div>
            <ChevronDown
              className={cn("size-4 shrink-0 text-stone-300 transition-transform", isMenuOpen && "rotate-180")}
            />
          </button>

          {isMenuOpen ? (
            <div className="absolute left-0 right-0 top-[calc(100%+0.75rem)] rounded-3xl border border-white/10 bg-stone-950/98 p-3 shadow-2xl shadow-black/40">
              <div className="space-y-2">
                {orderedProfiles.map((profile) => {
                  const isActive = profile.id === activeProfileId;

                  return (
                    <div
                      key={profile.id}
                      className="rounded-2xl border border-white/8 bg-white/5 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-stone-50">
                            {profile.label}
                          </p>
                          <p className="mt-1 truncate text-xs text-stone-400">
                            {profile.serverUrl}
                          </p>
                        </div>
                        <Badge
                          className={cn(
                            "rounded-full",
                            isActive
                              ? "bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/15"
                              : "bg-white/10 text-stone-300 hover:bg-white/10",
                          )}
                        >
                          {isActive ? "Activo" : "Inactivo"}
                        </Badge>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <Button
                          className="min-h-10 flex-1"
                          disabled={isActive || isPending || isDeleting}
                          onClick={() => activateProfile(profile.id)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          {isActive ? "En uso" : "Usar perfil"}
                        </Button>
                        <Button
                          className="min-h-10"
                          disabled={isDeleting}
                          onClick={() => deleteProfile(profile.id, profile.username)}
                          size="icon"
                          type="button"
                          variant="destructive"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <Button
                className="mt-3 min-h-11 w-full"
                onClick={() => {
                  setIsMenuOpen(false);
                  setIsModalOpen(true);
                }}
                type="button"
                variant="outline"
              >
                <Plus className="size-4" />
                Agregar perfil
              </Button>
            </div>
          ) : null}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-xs text-stone-400">
            {activeProfile?.serverUrl ?? "Sin servidor"}
          </p>
          <Badge
            className={cn(
              "rounded-full",
              autoApplyEnabledCount > 0
                ? "bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/15"
                : "bg-white/10 text-stone-300 hover:bg-white/10",
            )}
          >
            {autoApplyEnabledCount > 0 ? "Activo" : "Inactivo"}
          </Badge>
          <Button
            className="min-h-10 shrink-0"
            disabled={!activeProfile || isPending}
            onClick={runCapture}
            size="sm"
            type="button"
          >
            {isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Radar className="size-4" />}
            Actualizar captura
          </Button>
        </div>

        {feedback ? <p className="mt-3 text-sm text-stone-300">{feedback}</p> : null}
      </section>

      <Dialog
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Nuevo perfil"
      >
        <SettingsForm
          mode="create"
          onSaved={() => {
            setIsModalOpen(false);
            setFeedback("Perfil guardado.");
          }}
        />
      </Dialog>
    </>
  );
}
