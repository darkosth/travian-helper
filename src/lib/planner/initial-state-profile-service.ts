import "server-only";

import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import {
  supportedServerSpeeds,
  type ServerSpeed,
} from "@/lib/planner/catalog";
import { ensurePlannerDatabase } from "@/lib/planner/database";
import {
  createDefaultInitialSimulationState,
  createDefaultInitialStateProfiles,
  resolveInitialSimulationState,
  sanitizeInitialSimulationState,
  toSupportedServerSpeed,
  type InitialStateProfiles,
} from "@/lib/planner/initial-state-profiles";
import type { SimulationState } from "@/lib/planner/simulator";

type StoredInitialStateProfileRow = {
  serverSpeed: number;
  stateJson: string;
};

let initialStateProfilesBootstrap: Promise<void> | null = null;

/**
 * Bootstrap aditivo para instalaciones existentes.
 *
 * La tabla también aparece en schema.prisma para mantener el modelo documentado,
 * pero este guard permite arrancar una instalación antigua sin esperar una
 * migración manual.
 */
const ensureInitialStateProfilesDatabase = async () => {
  await ensurePlannerDatabase();

  if (!initialStateProfilesBootstrap) {
    initialStateProfilesBootstrap = (async () => {
      await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "PlannerInitialStateProfile" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "serverSpeed" INTEGER NOT NULL,
          "stateJson" TEXT NOT NULL,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL
        );
      `);

      await db.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "PlannerInitialStateProfile_serverSpeed_key"
        ON "PlannerInitialStateProfile"("serverSpeed");
      `);
    })();
  }

  return initialStateProfilesBootstrap;
};

const saveProfileRow = async (
  serverSpeed: ServerSpeed,
  profile: SimulationState,
) => {
  const sanitized = sanitizeInitialSimulationState(profile);

  await db.$executeRawUnsafe(
    `
      INSERT INTO "PlannerInitialStateProfile" (
        "id",
        "serverSpeed",
        "stateJson",
        "createdAt",
        "updatedAt"
      ) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT("serverSpeed") DO UPDATE SET
        "stateJson" = excluded."stateJson",
        "updatedAt" = CURRENT_TIMESTAMP;
    `,
    randomUUID(),
    serverSpeed,
    JSON.stringify(sanitized),
  );

  return sanitized;
};

const parseProfileRow = (
  row: StoredInitialStateProfileRow | undefined,
  fallback: SimulationState,
) => {
  if (!row) return sanitizeInitialSimulationState(fallback);

  try {
    return sanitizeInitialSimulationState(JSON.parse(row.stateJson), fallback);
  } catch {
    return sanitizeInitialSimulationState(fallback);
  }
};

export const listStoredInitialStateProfiles = async (): Promise<InitialStateProfiles> => {
  await ensureInitialStateProfilesDatabase();

  const rows = await db.$queryRawUnsafe<StoredInitialStateProfileRow[]>(`
    SELECT "serverSpeed", "stateJson"
    FROM "PlannerInitialStateProfile";
  `);
  const rowsBySpeed = new Map(rows.map((row) => [row.serverSpeed, row]));
  const defaults = createDefaultInitialStateProfiles();

  const profiles = Object.fromEntries(
    supportedServerSpeeds.map((speed) => [
      speed,
      parseProfileRow(rowsBySpeed.get(speed), defaults[speed]),
    ]),
  ) as InitialStateProfiles;

  // Completa automáticamente los multiplicadores que todavía no existan en DB.
  await Promise.all(
    supportedServerSpeeds
      .filter((speed) => !rowsBySpeed.has(speed))
      .map((speed) => saveProfileRow(speed, profiles[speed])),
  );

  return profiles;
};

export const saveStoredInitialStateProfile = async (input: {
  serverSpeed: number;
  profile: unknown;
}) => {
  await ensureInitialStateProfilesDatabase();

  const serverSpeed = toSupportedServerSpeed(input.serverSpeed);
  if (serverSpeed !== input.serverSpeed) {
    throw new Error("La velocidad del servidor no es compatible.");
  }

  return saveProfileRow(
    serverSpeed,
    sanitizeInitialSimulationState(input.profile),
  );
};

export const resetStoredInitialStateProfile = async (serverSpeedValue: number) => {
  await ensureInitialStateProfilesDatabase();

  const serverSpeed = toSupportedServerSpeed(serverSpeedValue);
  if (serverSpeed !== serverSpeedValue) {
    throw new Error("La velocidad del servidor no es compatible.");
  }

  return saveProfileRow(serverSpeed, createDefaultInitialSimulationState());
};

export const getStoredInitialStateProfile = async (serverSpeedValue: number) => {
  const serverSpeed = toSupportedServerSpeed(serverSpeedValue);
  if (serverSpeed !== serverSpeedValue) {
    throw new Error("La velocidad del servidor no es compatible.");
  }

  const profiles = await listStoredInitialStateProfiles();
  return profiles[serverSpeed];
};

/**
 * Estado listo para el simulador.
 *
 * La DB guarda la producción base x1. Aquí se aplica el multiplicador del
 * servidor antes de entregar el estado al motor determinista.
 */
export const getResolvedInitialSimulationState = async (
  serverSpeedValue: number,
) => {
  const serverSpeed = toSupportedServerSpeed(serverSpeedValue);
  if (serverSpeed !== serverSpeedValue) {
    throw new Error("La velocidad del servidor no es compatible.");
  }

  const profile = await getStoredInitialStateProfile(serverSpeed);
  return resolveInitialSimulationState(profile, serverSpeed);
};
