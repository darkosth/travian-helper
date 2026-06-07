import { NextResponse } from "next/server";
import { z } from "zod";
import {
  activateCredentialProfile,
  getCredentialSummary,
  saveCredentialProfile,
} from "@/lib/credentials";

const credentialsSchema = z
  .object({
    profileId: z.string().min(1).optional(),
    serverUrl: z.string().url(),
    username: z.string().min(1),
    password: z.string().min(1).optional(),
  })
  .superRefine((value, context) => {
    if (!value.profileId && (!value.password || value.password.length === 0)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["password"],
        message: "Password is required when creating a profile.",
      });
    }
  });

const activateSchema = z.object({
  profileId: z.string().min(1),
});

export async function GET() {
  const summary = await getCredentialSummary();

  return NextResponse.json({
    ok: true,
    profiles: summary.profiles,
    activeProfileId: summary.activeProfileId,
  });
}

export async function PUT(request: Request) {
  try {
    const payload = credentialsSchema.parse(await request.json());
    const saved = await saveCredentialProfile(payload);

    return NextResponse.json({
      ok: true,
      profile: {
        id: saved.id,
        label: saved.label,
        serverUrl: saved.serverUrl,
        username: saved.username,
        isActive: saved.isActive,
        updatedAt: saved.updatedAt,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          ok: false,
          errors: error.issues,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = activateSchema.parse(await request.json());
    await activateCredentialProfile(payload.profileId);

    return NextResponse.json({
      ok: true,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          ok: false,
          errors: error.issues,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
