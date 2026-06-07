import { NextResponse } from "next/server";
import { getDashboardData } from "@/lib/dashboard";

export async function GET() {
  const dashboard = await getDashboardData();

  return NextResponse.json({
    ok: true,
    dashboard,
  });
}
