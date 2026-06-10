import { NextResponse } from "next/server";
import { resolvePlannerWorkerDirective } from "@/lib/planner/worker-directive";

type RouteContext = { params: Promise<{ villageId: string }> };

export const GET = async (_request: Request, context: RouteContext) => {
  const { villageId } = await context.params;
  return NextResponse.json(await resolvePlannerWorkerDirective(villageId));
};
