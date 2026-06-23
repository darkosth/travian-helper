import { NextResponse } from "next/server";

import { getResolvedInitialSimulationState } from "@/lib/planner/initial-state-profile-service";
import {
  simulatePlan,
  type PlannerStep,
  type SimulationState,
} from "@/lib/planner/simulator";

type SimulationRequest = {
  initialState?: SimulationState;
  steps?: PlannerStep[];
  serverSpeed?: number;
};

export const POST = async (request: Request) => {
  try {
    const body = (await request.json()) as SimulationRequest;

    if (!Array.isArray(body.steps)) {
      return NextResponse.json(
        { error: "steps es obligatorio." },
        { status: 400 },
      );
    }

    const serverSpeed = body.serverSpeed ?? 1;
    const initialState =
      body.initialState ??
      (await getResolvedInitialSimulationState(serverSpeed));

    return NextResponse.json(
      simulatePlan({
        initialState,
        steps: body.steps,
        serverSpeed,
      }),
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo simular la ruta.",
      },
      { status: 400 },
    );
  }
};
