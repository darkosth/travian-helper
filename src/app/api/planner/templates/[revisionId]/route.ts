import { NextResponse } from "next/server";
import { updateDraftTemplate } from "@/lib/planner/template-service";

type RouteContext = { params: Promise<{ revisionId: string }> };

export const PUT = async (request: Request, context: RouteContext) => {
  try {
    const { revisionId } = await context.params;
    const body = await request.json();
    if (!Array.isArray(body?.steps)) {
      return NextResponse.json({ error: "steps debe ser un arreglo." }, { status: 400 });
    }

    return NextResponse.json(
      await updateDraftTemplate({
        revisionId,
        name: typeof body.name === "string" ? body.name.trim() : undefined,
        serverSpeed: typeof body.serverSpeed === "number" ? body.serverSpeed : undefined,
        description: typeof body.description === "string" ? body.description : undefined,
        stage: body.stage,
        steps: body.steps,
      }),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo editar la revisión." },
      { status: 400 },
    );
  }
};
