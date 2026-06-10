import { NextResponse } from "next/server";
import {
  confirmVillagePlanRecalculation,
  previewVillagePlanRecalculation,
} from "@/lib/planner/recalculate-plan";

type RouteContext = { params: Promise<{ villageId: string }> };

export const POST = async (request: Request, context: RouteContext) => {
  try {
    const { villageId } = await context.params;
    const body = await request.json();
    if (typeof body?.templateRevisionId !== "string") {
      return NextResponse.json({ error: "templateRevisionId es obligatorio." }, { status: 400 });
    }

    const input = {
      villageId,
      templateRevisionId: body.templateRevisionId,
      snapshotId: typeof body.snapshotId === "string" ? body.snapshotId : undefined,
    };
    return NextResponse.json(
      body.confirm === true
        ? await confirmVillagePlanRecalculation(input)
        : await previewVillagePlanRecalculation(input),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo recalcular el plan." },
      { status: 400 },
    );
  }
};
