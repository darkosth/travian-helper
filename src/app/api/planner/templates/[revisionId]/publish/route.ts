import { NextResponse } from "next/server";
import { publishTemplateRevision } from "@/lib/planner/template-service";

type RouteContext = { params: Promise<{ revisionId: string }> };

export const POST = async (request: Request, context: RouteContext) => {
  try {
    const { revisionId } = await context.params;
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(
      await publishTemplateRevision({
        revisionId,
        initialState: body?.initialState,
      }),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo publicar la revisión." },
      { status: 400 },
    );
  }
};
