import { NextResponse } from "next/server";
import { approveAgentProposal } from "@/lib/agent-proposals";
import { db, ensureDatabase } from "@/lib/db";
import { runCaptureAndGenerateProposals } from "@/lib/agent-runner";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ villageId: string }> },
) {
  const { villageId } = await params;
  const body = (await request.json().catch(() => null)) as
    | {
        candidateId?: string;
      }
    | null;

  if (!body?.candidateId) {
    return NextResponse.json(
      {
        ok: false,
        error: "candidateId is required.",
      },
      { status: 400 },
    );
  }

  try {
    await ensureDatabase();
    await runCaptureAndGenerateProposals();

    const proposal = await db.agentProposal.findFirst({
      where: {
        villageId,
      },
      orderBy: {
        createdAt: "desc",
      },
      include: {
        candidates: {
          orderBy: {
            rank: "asc",
          },
        },
      },
    });

    if (!proposal) {
      return NextResponse.json(
        {
          ok: false,
          error: "No proposal was generated for this village after refresh.",
        },
        { status: 404 },
      );
    }

    const candidate = proposal.candidates.find((entry) => entry.id === body.candidateId);

    if (!candidate) {
      return NextResponse.json(
        {
          ok: false,
          error: "The selected recommendation changed after refresh. Review the latest top 3.",
        },
        { status: 409 },
      );
    }

    const executionId = await approveAgentProposal(proposal.id, candidate.id);

    return NextResponse.json({
      ok: true,
      executionId,
      proposalId: proposal.id,
      candidateId: candidate.id,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown village apply error",
      },
      { status: 500 },
    );
  }
}
