import "dotenv/config";

import { copyFileSync, existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import Database from "better-sqlite3";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl || !databaseUrl.startsWith("file:")) {
  throw new Error("DATABASE_URL must use the SQLite file: prefix.");
}

const rawPath = databaseUrl.slice("file:".length).split("?")[0];
const dbPath = resolve(process.cwd(), rawPath);

if (!existsSync(dbPath)) {
  throw new Error(`SQLite database was not found at ${dbPath}`);
}

const backupPath = `${dbPath}.bak-multi-profile-${new Date()
  .toISOString()
  .replace(/[:.]/g, "-")}`;

copyFileSync(dbPath, backupPath);
console.log(`SQLite backup created: ${backupPath}`);

const db = new Database(dbPath);

const hasColumn = (tableName: string, columnName: string) =>
  (
    db.prepare(`PRAGMA table_info("${tableName}")`).all() as Array<{
      name: string;
    }>
  ).some((column) => column.name === columnName);

const addColumnIfMissing = (
  tableName: string,
  columnName: string,
  definition: string,
) => {
  if (hasColumn(tableName, columnName)) {
    return;
  }

  db.exec(`ALTER TABLE "${tableName}" ADD COLUMN "${columnName}" ${definition};`);
  console.log(`Added ${tableName}.${columnName}`);
};

const getIndexColumns = (indexName: string) =>
  (
    db.prepare(`PRAGMA index_info("${indexName}")`).all() as Array<{
      name: string;
    }>
  ).map((column) => column.name);

const villageTableNeedsRebuild = () => {
  const indexes = db.prepare(`PRAGMA index_list("Village")`).all() as Array<{
    name: string;
    unique: number;
  }>;

  const hasCompoundIdentity = indexes.some(
    (index) =>
      index.unique === 1 &&
      getIndexColumns(index.name).join(",") === "accountId,externalId",
  );

  const hasLegacyGlobalExternalIdIdentity = indexes.some(
    (index) =>
      index.unique === 1 &&
      getIndexColumns(index.name).join(",") === "externalId",
  );

  return !hasCompoundIdentity || hasLegacyGlobalExternalIdIdentity;
};

const rebuildVillageTableIfNeeded = () => {
  if (!villageTableNeedsRebuild()) {
    return;
  }

  console.log("Rebuilding Village table with accountId + externalId identity...");

  db.pragma("foreign_keys = OFF");

  const transaction = db.transaction(() => {
    db.exec(`
      DROP TABLE IF EXISTS "Village_multi_profile";

      CREATE TABLE "Village_multi_profile" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "externalId" INTEGER NOT NULL,
        "accountId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "x" INTEGER,
        "y" INTEGER,
        "autoApplyEnabled" BOOLEAN NOT NULL DEFAULT false,
        "autoApplyPausedAt" DATETIME,
        "autoApplyPauseReason" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL,
        FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE
      );

      INSERT INTO "Village_multi_profile" (
        "id",
        "externalId",
        "accountId",
        "name",
        "x",
        "y",
        "autoApplyEnabled",
        "autoApplyPausedAt",
        "autoApplyPauseReason",
        "createdAt",
        "updatedAt"
      )
      SELECT
        "id",
        "externalId",
        "accountId",
        "name",
        "x",
        "y",
        "autoApplyEnabled",
        "autoApplyPausedAt",
        "autoApplyPauseReason",
        "createdAt",
        "updatedAt"
      FROM "Village";

      DROP TABLE "Village";
      ALTER TABLE "Village_multi_profile" RENAME TO "Village";

      CREATE UNIQUE INDEX "Village_accountId_externalId_key"
        ON "Village"("accountId", "externalId");
    `);
  });

  transaction();
  db.pragma("foreign_keys = ON");

  const foreignKeyProblems = db.prepare("PRAGMA foreign_key_check").all();

  if (foreignKeyProblems.length > 0) {
    throw new Error(
      `Foreign key validation failed after Village migration: ${JSON.stringify(foreignKeyProblems)}`,
    );
  }
};

const linkProfilesConservatively = () => {
  const profiles = db
    .prepare(`
      SELECT "id", "label", "serverUrl", "accountId"
      FROM "CredentialProfile"
      ORDER BY "createdAt" ASC
    `)
    .all() as Array<{
    id: string;
    label: string;
    serverUrl: string;
    accountId: string | null;
  }>;

  const accounts = db
    .prepare(`
      SELECT "id", "playerName", "serverUrl"
      FROM "Account"
      ORDER BY "createdAt" ASC
    `)
    .all() as Array<{
    id: string;
    playerName: string;
    serverUrl: string;
  }>;

  const linkedAccountIds = new Set(
    profiles
      .map((profile) => profile.accountId)
      .filter((accountId): accountId is string => Boolean(accountId)),
  );

  const updateProfile = db.prepare(`
    UPDATE "CredentialProfile"
    SET "accountId" = ?, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ?
  `);

  for (const profile of profiles) {
    if (profile.accountId) {
      continue;
    }

    const profilesOnSameServer = profiles.filter(
      (candidate) => candidate.serverUrl === profile.serverUrl,
    );
    const candidates = accounts.filter(
      (account) =>
        account.serverUrl === profile.serverUrl &&
        !linkedAccountIds.has(account.id),
    );

    // Solo heredamos un vínculo viejo cuando no existe ninguna ambigüedad:
    // un único perfil y una única cuenta conocida para ese servidor.
    if (profilesOnSameServer.length !== 1 || candidates.length !== 1) {
      console.log(
        `Profile ${profile.label} remains unlinked. Its first fresh capture will link it safely.`,
      );
      continue;
    }

    updateProfile.run(candidates[0].id, profile.id);
    linkedAccountIds.add(candidates[0].id);
    console.log(`Linked ${profile.label} -> ${candidates[0].playerName}`);
  }
};

const backfillHistoricalOwnership = () => {
  const profiles = db
    .prepare(`
      SELECT "id", "accountId"
      FROM "CredentialProfile"
      WHERE "accountId" IS NOT NULL
    `)
    .all() as Array<{
    id: string;
    accountId: string;
  }>;

  const updateRuns = db.prepare(`
    UPDATE "CaptureRun"
    SET "credentialProfileId" = ?
    WHERE "accountId" = ?
      AND "credentialProfileId" IS NULL
  `);

  const updateJobs = db.prepare(`
    UPDATE "AutoApplyJob"
    SET "credentialProfileId" = ?
    WHERE "credentialProfileId" IS NULL
      AND "villageId" IN (
        SELECT "id"
        FROM "Village"
        WHERE "accountId" = ?
      )
  `);

  for (const profile of profiles) {
    updateRuns.run(profile.id, profile.accountId);
    updateJobs.run(profile.id, profile.accountId);
  }
};

db.pragma("foreign_keys = ON");

addColumnIfMissing("CredentialProfile", "accountId", "TEXT");
addColumnIfMissing("CaptureRun", "credentialProfileId", "TEXT");
addColumnIfMissing("AutoApplyJob", "credentialProfileId", "TEXT");

rebuildVillageTableIfNeeded();

db.exec(`
  CREATE INDEX IF NOT EXISTS "CredentialProfile_accountId_idx"
    ON "CredentialProfile"("accountId");

  CREATE INDEX IF NOT EXISTS "CaptureRun_credentialProfileId_startedAt_idx"
    ON "CaptureRun"("credentialProfileId", "startedAt");

  CREATE INDEX IF NOT EXISTS "AutoApplyJob_credentialProfileId_status_runAt_idx"
    ON "AutoApplyJob"("credentialProfileId", "status", "runAt");

  CREATE INDEX IF NOT EXISTS "AutoApplyJob_credentialProfileId_villageId_status_runAt_idx"
    ON "AutoApplyJob"("credentialProfileId", "villageId", "status", "runAt");
`);

linkProfilesConservatively();
backfillHistoricalOwnership();

const cancelled = db
  .prepare(`
    UPDATE "AutoApplyJob"
    SET
      "status" = 'cancelled',
      "lastError" = 'Cancelled during multi-profile migration. A fresh scoped queue will be generated.',
      "lockToken" = NULL,
      "lockedAt" = NULL,
      "completedAt" = CURRENT_TIMESTAMP,
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "status" IN ('pending', 'running', 'paused')
  `)
  .run().changes;

const legacySessionPath = resolve(
  process.cwd(),
  ".cache",
  "playwright",
  "travian-storage-state.json",
);

if (existsSync(legacySessionPath)) {
  rmSync(legacySessionPath, { force: true });
  console.log("Removed legacy shared Playwright session.");
}

console.log(`Cancelled ${cancelled} legacy active jobs.`);
console.log("");
console.log("Credential profiles:");

const finalProfiles = db
  .prepare(`
    SELECT "id", "label", "accountId"
    FROM "CredentialProfile"
    ORDER BY "createdAt" ASC
  `)
  .all() as Array<{
  id: string;
  label: string;
  accountId: string | null;
}>;

for (const [index, profile] of finalProfiles.entries()) {
  const safeName = profile.label.replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
  const startupDelayMs = index * 30_000;

  console.log(
    `- ${profile.label} | profileId=${profile.id} | accountId=${profile.accountId ?? "unlinked"}`,
  );
  console.log(
    `  TRAVIAN_PROFILE_ID=${profile.id} AUTO_APPLY_STARTUP_DELAY_MS=${startupDelayMs} pm2 start npm --name travian-worker-${safeName} --update-env -- run worker:auto-apply`,
  );
}

db.close();
