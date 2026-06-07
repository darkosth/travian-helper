import { NextResponse } from "next/server";
import { approveAgentProposal, rejectAgentProposal } from "@/lib/agent-proposals";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ proposalId: string }> },
) {
  const { proposalId } = await params;
  const body = (await request.json().catch(() => null)) as
    | {
        action?: "approve" | "reject";
      }
    | null;

  try {
    if (body?.action === "approve") {
      const executionId = await approveAgentProposal(proposalId);

      return NextResponse.json({
        ok: true,
        action: "approve",
        executionId,
      });
    }

    if (body?.action === "reject") {
      await rejectAgentProposal(proposalId);

      return NextResponse.json({
        ok: true,
        action: "reject",
      });
    }

    return NextResponse.json(
      {
        ok: false,
        error: "Unsupported proposal action.",
      },
      { status: 400 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown proposal action error",
      },
      { status: 500 },
    );
  }
}
