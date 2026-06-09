import { access, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { BrowserContext } from "playwright";

const getProfileSessionDirectory = (profileId: string) =>
  join(process.cwd(), ".cache", "playwright", "profiles", profileId);

export const getSessionStatePath = (profileId: string) =>
  join(getProfileSessionDirectory(profileId), "travian-storage-state.json");

export const hasSavedSessionState = async (profileId: string) => {
  try {
    await access(getSessionStatePath(profileId));
    return true;
  } catch {
    return false;
  }
};

export const persistSessionState = async (
  context: BrowserContext,
  profileId: string,
) => {
  await mkdir(getProfileSessionDirectory(profileId), { recursive: true });
  await context.storageState({ path: getSessionStatePath(profileId) });
};

export const clearSavedSessionState = async (profileId?: string) => {
  if (profileId) {
    await rm(getProfileSessionDirectory(profileId), {
      recursive: true,
      force: true,
    }).catch(() => undefined);

    return;
  }

  // Compatibilidad con la sesión única usada antes de separar perfiles.
  await rm(join(process.cwd(), ".cache", "playwright", "travian-storage-state.json"), {
    force: true,
  }).catch(() => undefined);
};
