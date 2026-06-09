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
    accountId: profile.accountId,
    isActive: profile.isActive,
    updatedAt: profile.updatedAt,
  }));
};

export const getCredentialProfile = async (profileId: string) => {
  await ensureDatabase();

  return db.credentialProfile.findUnique({
    where: {
      id: profileId,
    },
  });
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

export const getScopedAccount = async (profileId: string) => {
  await ensureDatabase();

  const profile = await db.credentialProfile.findUnique({
    where: {
      id: profileId,
    },
    include: {
      account: true,
    },
  });

  if (!profile) {
    return null;
  }

  if (profile.account) {
    const latestRun = await db.captureRun.findFirst({
      where: {
        credentialProfileId: profile.id,
        accountId: profile.account.id,
        status: {
          in: ["complete", "partial"],
        },
      },
      orderBy: {
        startedAt: "desc",
      },
    });

    return {
      profile,
      account: profile.account,
      latestRunId: latestRun?.id ?? null,
    };
  }

  const latestRun = await db.captureRun.findFirst({
    where: {
      credentialProfileId: profile.id,
      accountId: {
        not: null,
      },
      status: {
        in: ["complete", "partial"],
      },
    },
    orderBy: {
      startedAt: "desc",
    },
    include: {
      account: true,
    },
  });

  if (!latestRun?.account) {
    return {
      profile,
      account: null,
      latestRunId: null,
    };
  }

  const linkedProfile = await db.credentialProfile.update({
    where: {
      id: profile.id,
    },
    data: {
      accountId: latestRun.account.id,
    },
    include: {
      account: true,
    },
  });

  return {
    profile: linkedProfile,
    account: linkedProfile.account,
    latestRunId: latestRun.id,
  };
};

export const getActiveScopedAccount = async () => {
  const profile = await getActiveCredentialProfile();

  if (!profile) {
    return null;
  }

  return getScopedAccount(profile.id);
};

export const getCredentialSecret = async (profileId?: string) => {
  const profile = profileId
    ? await getCredentialProfile(profileId)
    : await getActiveCredentialProfile();

  if (!profile) {
    return null;
  }

  return {
    profileId: profile.id,
    accountId: profile.accountId,
    serverUrl: profile.serverUrl,
    username: profile.username,
    password: decryptSecret(profile),
  };
};

export const getCredentialSecretForAccount = async (accountId: string) => {
  await ensureDatabase();

  const profile = await db.credentialProfile.findFirst({
    where: {
      accountId,
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  if (!profile) {
    return null;
  }

  return {
    profileId: profile.id,
    accountId: profile.accountId,
    serverUrl: profile.serverUrl,
    username: profile.username,
    password: decryptSecret(profile),
  };
};

export const linkCredentialProfileToAccount = async (
  profileId: string,
  accountId: string,
) => {
  await ensureDatabase();

  const profile = await db.credentialProfile.findUnique({
    where: {
      id: profileId,
    },
  });

  if (!profile) {
    throw new Error("Credential profile not found.");
  }

  if (profile.accountId && profile.accountId !== accountId) {
    throw new Error(
      `Credential profile ${profile.label} is already linked to a different Travian account.`,
    );
  }

  const otherLinkedProfile = await db.credentialProfile.findFirst({
    where: {
      accountId,
      id: {
        not: profile.id,
      },
    },
  });

  if (otherLinkedProfile) {
    throw new Error(
      `Travian account is already linked to credential profile ${otherLinkedProfile.label}.`,
    );
  }

  if (profile.accountId === accountId) {
    return profile;
  }

  return db.credentialProfile.update({
    where: {
      id: profile.id,
    },
    data: {
      accountId,
    },
  });
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
    const identityChanged =
      existingProfile.serverUrl !== input.serverUrl ||
      existingProfile.username !== input.username;

    const updatedProfile = await db.credentialProfile.update({
      where: {
        id: existingProfile.id,
      },
      data: {
        label,
        serverUrl: input.serverUrl,
        username: input.username,
        ...(identityChanged ? { accountId: null } : {}),
        ...(encrypted ?? {}),
      },
    });

    await clearSavedSessionState(updatedProfile.id);

    if (identityChanged) {
      await db.autoApplyJob.updateMany({
        where: {
          credentialProfileId: updatedProfile.id,
          status: {
            in: ["pending", "running", "paused"],
          },
        },
        data: {
          status: "cancelled",
          lastError: "Credential profile identity changed. Generate a fresh scoped queue.",
          completedAt: new Date(),
          lockToken: null,
          lockedAt: null,
        },
      });
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

  await clearSavedSessionState(createdProfile.id);

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

  // Cambiar qué perfil se ve en la interfaz no debe cerrar la sesión
  // Playwright de otros workers. Cada perfil usa su propio storageState.
};
