"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, LoaderCircle, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ProposalCandidate = {
  id: string;
  rank: number;
  label: string;
  category: string;
  affordableNow: boolean;
  finalScore: number;
  heuristicScore: number;
  learnedScore: number;
  confidence: number;
  timeToAffordText: string | null;
  reasons: string[];
};

type LatestProposal = {
  id: string;
  goal: string;
  status: string;
  headline: string;
  summary: string;
  confidence: number;
  focus: string;
  createdAt: Date | string;
  decidedAt: Date | string | null;
  candidates: ProposalCandidate[];
  executionStatus: string | null;
  executionError: string | null;
  outcomeStatus: string | null;
  outcomeReward: number | null;
  outcomeSummary: string | null;
} | null;

type VillageProposalCard = {
  id: number;
  name: string;
  latestProposal: LatestProposal;
};

type AgentProposalsPanelProps = {
  villages: VillageProposalCard[];
};

export function AgentProposalsPanel({ villages }: AgentProposalsPanelProps) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pendingProposalId, setPendingProposalId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const actOnProposal = (proposalId: string, action: "approve" | "reject") => {
    setFeedback(null);
    setPendingProposalId(proposalId);

    startTransition(async () => {
      const response = await fetch(`/api/agent-proposals/${proposalId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
        }),
      });
      const result = (await response.json()) as { ok: boolean; error?: string };

      if (!response.ok || !result.ok) {
        setFeedback(result.error ?? "La acción falló.");
        setPendingProposalId(null);
        return;
      }

      setFeedback(action === "approve" ? "Propuesta aplicada." : "Propuesta rechazada.");
      setPendingProposalId(null);
      router.refresh();
    });
  };

  return (
    <section className="grid gap-4">
      <Card className="border-white/10 bg-black/20">
        <CardHeader className="gap-2">
          <CardTitle className="text-stone-50">Agente de decisiones</CardTitle>
          {feedback ? <p className="text-sm text-stone-300">{feedback}</p> : null}
        </CardHeader>
      </Card>

      <div className="grid gap-4">
        {villages.map((village) => {
          const proposal = village.latestProposal;
          const recommended = proposal?.candidates[0] ?? null;
          const isBusy = pendingProposalId === proposal?.id;

          return (
            <Card key={village.id} className="border-white/10 bg-black/20">
              <CardHeader className="gap-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <CardTitle className="text-stone-50">{village.name}</CardTitle>
                    <p className="mt-2 text-sm text-stone-300">
                      {proposal ? proposal.summary : "Todavía no hay propuesta persistida para esta aldea."}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge
                      className={
                        proposal?.status === "pending"
                          ? "bg-amber-300/15 text-amber-200 hover:bg-amber-300/15"
                          : proposal?.status === "evaluated"
                            ? "bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/15"
                            : proposal?.status === "failed" || proposal?.status === "rejected"
                              ? "bg-rose-500/15 text-rose-200 hover:bg-rose-500/15"
                              : "bg-white/10 text-stone-200 hover:bg-white/10"
                      }
                    >
                      {proposal?.status ?? "sin propuesta"}
                    </Badge>
                    {proposal ? (
                      <Badge className="bg-white/5 text-stone-300 hover:bg-white/5">
                        Confianza {Math.round(proposal.confidence * 100)}%
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {proposal && recommended ? (
                  <>
                    <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-amber-200/80">
                        Recomendación
                      </p>
                      <p className="mt-2 text-lg font-semibold text-stone-50">{proposal.headline}</p>
                      <div className="mt-3 flex flex-wrap gap-2 text-sm text-stone-200">
                        <Badge className="bg-black/20 text-stone-100 hover:bg-black/20">
                          Score {recommended.finalScore}
                        </Badge>
                        <Badge className="bg-black/15 text-stone-200 hover:bg-black/15">
                          Heurística {recommended.heuristicScore.toFixed(0)}
                        </Badge>
                        <Badge className="bg-black/15 text-stone-200 hover:bg-black/15">
                          Aprendido {recommended.learnedScore.toFixed(1)}
                        </Badge>
                        {recommended.timeToAffordText ? (
                          <Badge className="bg-black/15 text-stone-200 hover:bg-black/15">
                            ETA {recommended.timeToAffordText}
                          </Badge>
                        ) : null}
                      </div>
                    </div>

                    <div className="grid gap-3 xl:grid-cols-2">
                      {proposal.candidates.slice(0, 3).map((candidate) => (
                        <div
                          key={candidate.id}
                          className="rounded-2xl border border-white/8 bg-white/5 p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-stone-50">
                                #{candidate.rank + 1} {candidate.label}
                              </p>
                              <p className="mt-1 text-xs uppercase tracking-[0.18em] text-stone-400">
                                {candidate.category}
                              </p>
                            </div>
                            <Badge className="bg-white/10 text-stone-200 hover:bg-white/10">
                              {candidate.finalScore}
                            </Badge>
                          </div>
                          <div className="mt-3 space-y-2">
                            {candidate.reasons.slice(0, 2).map((reason) => (
                              <p key={reason} className="text-sm leading-6 text-stone-300">
                                {reason}
                              </p>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        className="min-h-11 bg-emerald-400 text-stone-950 hover:bg-emerald-300"
                        disabled={!recommended.affordableNow || isBusy || isPending || proposal.status !== "pending"}
                        onClick={() => actOnProposal(proposal.id, "approve")}
                        type="button"
                      >
                        {isBusy ? <LoaderCircle className="animate-spin" /> : <Check />}
                        Aplicar
                      </Button>
                      <Button
                        className="min-h-11 border border-white/10 bg-white/8 text-stone-100 hover:bg-white/14"
                        disabled={isBusy || isPending || proposal.status !== "pending"}
                        onClick={() => actOnProposal(proposal.id, "reject")}
                        type="button"
                        variant="outline"
                      >
                        <X />
                        Rechazar
                      </Button>
                      {!recommended.affordableNow ? (
                        <p className="self-center text-sm text-stone-400">
                          Solo se puede aplicar si ya está affordable ahora.
                        </p>
                      ) : null}
                    </div>

                    {proposal.executionStatus || proposal.outcomeSummary ? (
                      <div className="rounded-2xl border border-white/8 bg-white/5 p-4 text-sm text-stone-300">
                        <p className="font-medium text-stone-100">
                          Ejecución {proposal.executionStatus ?? "pendiente"}
                        </p>
                        {proposal.executionError ? <p className="mt-2">{proposal.executionError}</p> : null}
                        {proposal.outcomeSummary ? <p className="mt-2">{proposal.outcomeSummary}</p> : null}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-4 text-sm text-stone-400">
                    Sin propuesta fresca
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
