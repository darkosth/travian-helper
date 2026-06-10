import { NextResponse } from "next/server";
import { createTemplate, listTemplates } from "@/lib/planner/template-service";

export const GET = async () => NextResponse.json(await listTemplates());

export const POST = async (request: Request) => {
  try {
    const body = await request.json();
    if (typeof body?.name !== "string" || body.name.trim().length === 0) {
      return NextResponse.json({ error: "El nombre es obligatorio." }, { status: 400 });
    }

    return NextResponse.json(
      await createTemplate({
        name: body.name.trim(),
        tribeId: typeof body.tribeId === "number" ? body.tribeId : null,
        serverSpeed: typeof body.serverSpeed === "number" ? body.serverSpeed : 1,
        description: typeof body.description === "string" ? body.description : null,
        stage: body.stage,
        steps: Array.isArray(body.steps) ? body.steps : [],
      }),
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo crear la plantilla." },
      { status: 400 },
    );
  }
};
