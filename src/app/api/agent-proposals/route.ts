import { NextResponse } from "next/server";
import { generateAgentProposals } from "@/lib/agent-proposals";

export async function POST() {
  try {
    const proposalIds = await generateAgentProposals();

    return NextResponse.json({
      ok: true,
      proposalIds,
    });
  } catch (error) {
    console.error("generateAgentProposals failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown proposal error",
      },
      { status: 500 },
    );
  }
}
