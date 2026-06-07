import { NextResponse } from "next/server";
import { runCaptureAndGenerateProposals } from "@/lib/agent-runner";

export async function POST() {
  try {
    const { runId, proposalIds } = await runCaptureAndGenerateProposals();

    return NextResponse.json({
      ok: true,
      runId,
      proposalIds,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown capture error",
      },
      { status: 500 },
    );
  }
}
