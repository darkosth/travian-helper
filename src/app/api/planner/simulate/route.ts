import { NextResponse } from "next/server";
import { simulatePlan, type PlannerStep, type SimulationState } from "@/lib/planner/simulator";

type SimulationRequest = {
  initialState?: SimulationState;
  steps?: PlannerStep[];
  serverSpeed?: number;
};

export const POST = async (request: Request) => {
  try {
    const body = (await request.json()) as SimulationRequest;
    if (!body.initialState || !Array.isArray(body.steps)) {
      return NextResponse.json(
        { error: "initialState y steps son obligatorios." },
        { status: 400 },
      );
    }

    return NextResponse.json(
      simulatePlan({
        initialState: body.initialState,
        steps: body.steps,
        serverSpeed: body.serverSpeed ?? 1,
      }),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo simular la ruta." },
      { status: 400 },
    );
  }
};
