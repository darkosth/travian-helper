import { NextResponse } from "next/server";
import { setVillageAutoApply } from "@/lib/auto-apply";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ villageId: string }> },
) {
  const { villageId } = await params;
  const body = (await request.json().catch(() => null)) as
    | {
        enabled?: boolean;
      }
    | null;

  if (typeof body?.enabled !== "boolean") {
    return NextResponse.json(
      {
        ok: false,
        error: "enabled boolean is required.",
      },
      { status: 400 },
    );
  }

  try {
    await setVillageAutoApply({
      villageId,
      enabled: body.enabled,
    });

    return NextResponse.json({
      ok: true,
      villageId,
      enabled: body.enabled,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown auto-apply toggle error",
      },
      { status: 500 },
    );
  }
}
