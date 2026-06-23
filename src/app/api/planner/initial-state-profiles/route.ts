import { NextResponse } from "next/server";

import {
  listStoredInitialStateProfiles,
  resetStoredInitialStateProfile,
  saveStoredInitialStateProfile,
} from "@/lib/planner/initial-state-profile-service";

export const GET = async () =>
  NextResponse.json({ profiles: await listStoredInitialStateProfiles() });

export const PUT = async (request: Request) => {
  try {
    const body = await request.json();

    if (typeof body?.serverSpeed !== "number") {
      return NextResponse.json(
        { error: "serverSpeed es obligatorio." },
        { status: 400 },
      );
    }

    return NextResponse.json({
      serverSpeed: body.serverSpeed,
      profile: await saveStoredInitialStateProfile({
        serverSpeed: body.serverSpeed,
        profile: body.profile,
      }),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo guardar el perfil inicial.",
      },
      { status: 400 },
    );
  }
};

export const DELETE = async (request: Request) => {
  try {
    const { searchParams } = new URL(request.url);
    const serverSpeed = Number(searchParams.get("serverSpeed"));

    return NextResponse.json({
      serverSpeed,
      profile: await resetStoredInitialStateProfile(serverSpeed),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo restaurar el perfil inicial.",
      },
      { status: 400 },
    );
  }
};
