import { access, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { BrowserContext } from "playwright";

const sessionStatePath = join(process.cwd(), ".cache", "playwright", "travian-storage-state.json");

export const hasSavedSessionState = async () => {
  try {
    await access(sessionStatePath);
    return true;
  } catch {
    return false;
  }
};

export const persistSessionState = async (context: BrowserContext) => {
  await mkdir(join(process.cwd(), ".cache", "playwright"), { recursive: true });
  await context.storageState({ path: sessionStatePath });
};

export const clearSavedSessionState = async () => {
  await rm(sessionStatePath, { force: true }).catch(() => undefined);
};

export const getSessionStatePath = () => sessionStatePath;
