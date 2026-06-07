"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Pencil, Plus, Server, User } from "lucide-react";
import { CaptureButton } from "@/components/capture-button";
import { SettingsForm } from "@/components/settings-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { formatRelativeTime } from "@/lib/time";

type CredentialProfileSummary = {
  id: string;
  isActive: boolean;
  label: string;
  serverUrl: string;
  updatedAt: Date | string;
  username: string;
};

type HomeHeroProps = {
  activeProfileId: string | null;
  latestRunCompletedAt?: Date | null;
  latestRunStatus?: string;
  profiles: CredentialProfileSummary[];
};

export function HomeHero({
  activeProfileId,
  latestRunCompletedAt,
  latestRunStatus,
  profiles,
}: HomeHeroProps) {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isProfilesOpen, setIsProfilesOpen] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [activationFeedback, setActivationFeedback] = useState<string | null>(null);
  const [isActivating, startActivationTransition] = useTransition();

  const editingProfile =
    profiles.find((profile) => profile.id === editingProfileId) ?? null;

  const orderedProfiles = useMemo(() => profiles, [profiles]);

  const openCreateModal = () => {
    setEditingProfileId(null);
    setIsModalOpen(true);
  };

  const openEditModal = (profileId: string) => {
    setEditingProfileId(profileId);
    setIsModalOpen(true);
  };

  const activateProfile = (profileId: string) => {
    setActivationFeedback(null);

    startActivationTransition(async () => {
      const response = await fetch("/api/settings/credentials", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          profileId,
        }),
      });

      const result = (await response.json()) as {
        ok: boolean;
        error?: string;
      };

      if (!response.ok || !result.ok) {
        setActivationFeedback(result.error ?? "Could not activate this profile.");
        return;
      }

      setActivationFeedback("Active profile updated.");
      router.refresh();
    });
  };

  const activeProfile =
    orderedProfiles.find((profile) => profile.id === activeProfileId) ?? null;

  return (
    <>
      <section className="grid gap-4">
        <div className="rounded-[1.75rem] border border-white/12 bg-white/6 p-4 shadow-2xl shadow-black/30 backdrop-blur md:p-5">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
            <div className="space-y-4">
              <div className="space-y-2">
                <Badge className="w-fit bg-amber-300/15 text-amber-200 hover:bg-amber-300/15">
                  Centro de mando
                </Badge>
                <div className="space-y-1">
                  <h1 className="text-2xl font-semibold tracking-tight text-stone-50 md:text-3xl">
                    Operaciones de captura
                  </h1>
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                <div className="rounded-[1.35rem] border border-white/10 bg-black/20 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-stone-400">
                    Perfil activo
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <p className="text-lg font-semibold text-stone-50">
                      {activeProfile?.username ?? "Sin perfil activo"}
                    </p>
                    {activeProfile ? (
                      <Badge className="bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/15">
                        Activo
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-2 flex items-center gap-2 text-sm text-stone-300">
                    <Server className="size-4 text-stone-400" />
                    {activeProfile?.serverUrl ?? "Aún no hay servidor configurado"}
                  </p>
                  <p className="mt-3 text-sm text-stone-400">
                    {orderedProfiles.length > 0
                      ? `${orderedProfiles.length} perfil${orderedProfiles.length === 1 ? "" : "es"} guardado${orderedProfiles.length === 1 ? "" : "s"}`
                      : "Sin perfiles guardados"}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 lg:flex-col">
                  <Button
                    className="min-h-11 border border-white/10 bg-white/8 text-stone-100 hover:bg-white/14"
                    onClick={() => setIsProfilesOpen((current) => !current)}
                    size="lg"
                    type="button"
                    variant="outline"
                  >
                    <ChevronDown
                      className={`transition-transform ${isProfilesOpen ? "rotate-180" : ""}`}
                    />
                    Gestionar perfiles
                  </Button>
                  <Button
                    className="min-h-11 bg-white/10 text-stone-100 hover:bg-white/15"
                    onClick={openCreateModal}
                    size="lg"
                    type="button"
                  >
                    <Plus />
                    Nuevo perfil
                  </Button>
                </div>
              </div>

              {activationFeedback ? (
                <p className="text-sm text-amber-100">{activationFeedback}</p>
              ) : null}
            </div>

            <div className="rounded-[1.35rem] border border-white/10 bg-black/20 p-4 md:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between xl:flex-col xl:justify-start">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-stone-400">
                    Último barrido
                  </p>
                  <p className="mt-3 text-3xl font-semibold text-stone-50">
                    {latestRunStatus ?? "Sin corridas"}
                  </p>
                <p className="mt-2 text-sm text-stone-300">
                  {latestRunCompletedAt
                    ? `Terminado ${formatRelativeTime(latestRunCompletedAt)}`
                    : "Sin capturas"}
                </p>
              </div>

                <CaptureButton disabled={!activeProfileId} />
              </div>
            </div>
          </div>
        </div>

        {isProfilesOpen ? (
          <section className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4 md:p-5">
            <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-stone-400">Perfiles</p>
                <p className="mt-2 text-lg font-semibold text-stone-50">Cuenta activa y edición</p>
              </div>
            </div>

            {orderedProfiles.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/12 bg-white/5 px-4 py-6 text-sm text-stone-300">
                Sin perfiles guardados.
              </div>
            ) : (
              <div className="grid gap-3">
                {orderedProfiles.map((profile) => {
                  const isActive = profile.id === activeProfileId;

                  return (
                    <div
                      key={profile.id}
                      className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <User className="size-4 text-stone-400" />
                          <p className="font-medium text-stone-50">{profile.username}</p>
                          {isActive ? (
                            <Badge className="bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/15">
                              Activo
                            </Badge>
                          ) : null}
                        </div>
                        <p className="flex items-center gap-2 text-sm text-stone-300">
                          <Server className="size-4 text-stone-400" />
                          {profile.serverUrl}
                        </p>
                        <p className="text-xs uppercase tracking-[0.18em] text-stone-500">
                          Actualizado {formatRelativeTime(profile.updatedAt)}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          className="min-h-11 bg-white/10 text-stone-100 hover:bg-white/15"
                          onClick={() => openEditModal(profile.id)}
                          size="lg"
                          type="button"
                        >
                          <Pencil />
                          Editar
                        </Button>
                        <Button
                          className="min-h-11"
                          disabled={isActive || isActivating}
                          onClick={() => activateProfile(profile.id)}
                          size="lg"
                          type="button"
                        >
                          {isActive ? "En uso" : "Usar este perfil"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        ) : null}
      </section>

      <Dialog
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingProfile ? "Editar perfil" : "Nuevo perfil"}
      >
        <SettingsForm
          key={editingProfile ? editingProfile.id : "create-profile"}
          mode={editingProfile ? "edit" : "create"}
          profile={editingProfile}
          onSaved={() => {
            setIsModalOpen(false);
            setEditingProfileId(null);
          }}
        />
      </Dialog>
    </>
  );
}
