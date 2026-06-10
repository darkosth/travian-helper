import type {
  PlannerStep,
  SimulatedStep,
  SimulatePlanResult,
  SimulationState,
} from "@/lib/planner/simulator/types";
import { simulateStep } from "@/lib/planner/simulator/simulate-step";

const BLOCKING_STATUSES = new Set([
  "blocked-capacity",
  "blocked-prerequisite",
  "blocked-resources",
  "invalid-level",
  "missing-catalog",
]);

/** Ejecuta la ruta en orden. Ante el primer error, detiene la simulación. */
export const simulatePlan = (input: {
  initialState: SimulationState;
  steps: PlannerStep[];
  serverSpeed?: number;
}): SimulatePlanResult => {
  const initialState = structuredClone(input.initialState);
  let currentState = structuredClone(input.initialState);
  const simulatedSteps: SimulatedStep[] = [];
  let firstBlockingStep: SimulatedStep | null = null;

  for (const step of [...input.steps].sort((left, right) => left.position - right.position)) {
    const simulated = simulateStep(currentState, step, input.serverSpeed ?? 1);
    simulatedSteps.push(simulated.result);

    if (BLOCKING_STATUSES.has(simulated.result.status)) {
      firstBlockingStep = simulated.result;
      break;
    }

    currentState = simulated.state;
  }

  return {
    valid: firstBlockingStep === null,
    steps: simulatedSteps,
    initialState,
    finalState: currentState,
    totalElapsedSeconds: currentState.elapsedSeconds - initialState.elapsedSeconds,
    firstBlockingStep,
  };
};
