import "server-only";
import { db, ensureDatabase } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { clearSavedSessionState } from "@/lib/playwright-session";

type SaveCredentialProfileInput = {
  password?: string;
  profileId?: string;
  serverUrl: string;
  username: string;
};

const buildProfileLabel = async (
  username: string,
  serverUrl: string,
  excludedId?: string,
) => {
  const host = new URL(serverUrl).host.replace(/^www\./i, "");
  const baseLabel = `${username}@${host}`;

  const existingProfiles = await db.credentialProfile.findMany({
    where: excludedId
      ? {
          id: {
            not: excludedId,
          },
        }
      : undefined,
    select: {
      label: true,
    },
  });

  const existingLabels = new Set(existingProfiles.map((profile) => profile.label));

  if (!existingLabels.has(baseLabel)) {
    return baseLabel;
  }

  let counter = 2;

  while (existingLabels.has(`${baseLabel}-${counter}`)) {
    counter += 1;
  }

  return `${baseLabel}-${counter}`;
};

export const listCredentialProfiles = async () => {
  await ensureDatabase();

  const profiles = await db.credentialProfile.findMany({
    orderBy: [
      {
        isActive: "desc",
      },
      {
        updatedAt: "desc",
      },
    ],
  });

  return profiles.map((profile) => ({
    id: profile.id,
    label: profile.label,
    serverUrl: profile.serverUrl,
    username: profile.username,
    isActive: profile.isActive,
    updatedAt: profile.updatedAt,
  }));
};

export const getActiveCredentialProfile = async () => {
  await ensureDatabase();

  return db.credentialProfile.findFirst({
    where: {
      isActive: true,
    },
    orderBy: {
      updatedAt: "desc",
    },
  });
};

export const getCredentialSummary = async () => {
  const profiles = await listCredentialProfiles();
  const activeProfile = profiles.find((profile) => profile.isActive) ?? null;

  return {
    profiles,
    activeProfileId: activeProfile?.id ?? null,
  };
};

export const getCredentialSecret = async () => {
  const profile = await getActiveCredentialProfile();

  if (!profile) {
    return null;
  }

  return {
    profileId: profile.id,
    serverUrl: profile.serverUrl,
    username: profile.username,
    password: decryptSecret(profile),
  };
};

export const saveCredentialProfile = async (input: SaveCredentialProfileInput) => {
  await ensureDatabase();

  if (input.profileId) {
    const existingProfile = await db.credentialProfile.findUnique({
      where: {
        id: input.profileId,
      },
    });

    if (!existingProfile) {
      throw new Error("Credential profile not found.");
    }

    const label = await buildProfileLabel(input.username, input.serverUrl, existingProfile.id);
    const encrypted =
      input.password && input.password.length > 0 ? encryptSecret(input.password) : null;

    const updatedProfile = await db.credentialProfile.update({
      where: {
        id: existingProfile.id,
      },
      data: {
        label,
        serverUrl: input.serverUrl,
        username: input.username,
        ...(encrypted ?? {}),
      },
    });

    if (updatedProfile.isActive) {
      await clearSavedSessionState();
    }

    return updatedProfile;
  }

  if (!input.password || input.password.length === 0) {
    throw new Error("Password is required when creating a profile.");
  }

  const encrypted = encryptSecret(input.password);
  const label = await buildProfileLabel(input.username, input.serverUrl);

  await db.credentialProfile.updateMany({
    data: {
      isActive: false,
    },
  });

  const createdProfile = await db.credentialProfile.create({
    data: {
      label,
      serverUrl: input.serverUrl,
      username: input.username,
      isActive: true,
      ...encrypted,
    },
  });

  await clearSavedSessionState();

  return createdProfile;
};

export const activateCredentialProfile = async (profileId: string) => {
  await ensureDatabase();

  const existingProfile = await db.credentialProfile.findUnique({
    where: {
      id: profileId,
    },
  });

  if (!existingProfile) {
    throw new Error("Credential profile not found.");
  }

  await db.$transaction([
    db.credentialProfile.updateMany({
      where: {
        isActive: true,
      },
      data: {
        isActive: false,
      },
    }),
    db.credentialProfile.update({
      where: {
        id: profileId,
      },
      data: {
        isActive: true,
      },
    }),
  ]);

  await clearSavedSessionState();
};
