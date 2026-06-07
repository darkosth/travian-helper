"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Radar } from "lucide-react";
import { Button } from "@/components/ui/button";

type CaptureButtonProps = {
  disabled?: boolean;
};

export function CaptureButton({ disabled = false }: CaptureButtonProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const runCapture = () => {
    setMessage(null);

    startTransition(async () => {
      const response = await fetch("/api/capture-runs", {
        method: "POST",
      });

      const result = (await response.json()) as {
        ok: boolean;
        error?: string;
        proposalIds?: string[];
      };

      if (!response.ok || !result.ok) {
        setMessage(result.error ?? "Actualización fallida.");
        return;
      }

      setMessage(
        result.proposalIds && result.proposalIds.length > 0
          ? `${result.proposalIds.length} propuesta${result.proposalIds.length === 1 ? "" : "s"} lista${result.proposalIds.length === 1 ? "" : "s"}.`
          : "Barrido listo.",
      );
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col items-start gap-3">
      <Button
        disabled={disabled || isPending}
        onClick={runCapture}
        size="lg"
        className="min-h-11 min-w-44 bg-amber-300 text-stone-950 hover:bg-amber-200"
      >
        {isPending ? <LoaderCircle className="animate-spin" /> : <Radar />}
        {isPending ? "Actualizando..." : "Actualizar y proponer"}
      </Button>
      {message || disabled ? (
        <p className="text-sm text-stone-300">{message ?? "Configura un perfil."}</p>
      ) : null}
    </div>
  );
}
