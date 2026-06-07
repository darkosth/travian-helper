import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;

  const run = await db.captureRun.findUnique({
    where: {
      id: runId,
    },
    include: {
      villageRuns: {
        orderBy: {
          villageExternalId: "asc",
        },
      },
    },
  });

  if (!run) {
    return NextResponse.json(
      {
        ok: false,
        error: "Capture run not found.",
      },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok: true,
    run,
  });
}
