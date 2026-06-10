import { NextResponse } from "next/server";
import { applyTemplateToVillage } from "@/lib/planner/village-plan-service";

type RouteContext = { params: Promise<{ villageId: string }> };

export const POST = async (request: Request, context: RouteContext) => {
  try {
    const { villageId } = await context.params;
    const body = await request.json();
    if (typeof body?.templateRevisionId !== "string") {
      return NextResponse.json({ error: "templateRevisionId es obligatorio." }, { status: 400 });
    }

    return NextResponse.json(
      await applyTemplateToVillage({
        villageId,
        templateRevisionId: body.templateRevisionId,
        snapshotId: typeof body.snapshotId === "string" ? body.snapshotId : undefined,
      }),
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo aplicar el plan." },
      { status: 400 },
    );
  }
};
