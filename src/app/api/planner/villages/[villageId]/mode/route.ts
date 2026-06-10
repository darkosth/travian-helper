import { NextResponse } from "next/server";
import { setVillagePlannerMode } from "@/lib/planner/village-plan-service";

type RouteContext = { params: Promise<{ villageId: string }> };
const allowedModes = new Set(["off", "shadow", "active"]);

export const POST = async (request: Request, context: RouteContext) => {
  try {
    const { villageId } = await context.params;
    const body = await request.json();
    if (!allowedModes.has(body?.mode)) {
      return NextResponse.json({ error: "mode debe ser off, shadow o active." }, { status: 400 });
    }

    return NextResponse.json(
      await setVillagePlannerMode({ villageId, mode: body.mode }),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo cambiar el modo." },
      { status: 400 },
    );
  }
};
