import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/lib/env";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaBootstrap?: Promise<void>;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaBetterSqlite3({
      url: env.databaseUrl,
    }),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

const bootstrapStatements = [
  `PRAGMA foreign_keys = ON;`,
  `CREATE TABLE IF NOT EXISTS "CredentialProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL UNIQUE,
    "serverUrl" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "encryptedPassword" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "accountId" TEXT,
    "autoApplyCooldownUntil" DATETIME,
    "autoApplyCooldownReason" TEXT,
    "autoApplyConnectivityFailureCount" INTEGER NOT NULL DEFAULT 0,
    "lastAutoApplyRefreshAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE
  );`,
  `CREATE TABLE IF NOT EXISTS "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playerName" TEXT NOT NULL,
    "tribeId" INTEGER,
    "serverUrl" TEXT NOT NULL,
    "language" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Account_serverUrl_playerName_key" ON "Account"("serverUrl", "playerName");`,
  `CREATE TABLE IF NOT EXISTS "Village" (
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
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Village_accountId_externalId_key" ON "Village"("accountId", "externalId");`,
  `CREATE TABLE IF NOT EXISTS "CaptureRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "errorMessage" TEXT,
    "accountId" TEXT,
    "credentialProfileId" TEXT,
    FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    FOREIGN KEY ("credentialProfileId") REFERENCES "CredentialProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE
  );`,
  `CREATE TABLE IF NOT EXISTS "CaptureRunVillage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "captureRunId" TEXT NOT NULL,
    "villageId" TEXT,
    "villageExternalId" INTEGER NOT NULL,
    "villageName" TEXT,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "hasDorf1" BOOLEAN NOT NULL DEFAULT false,
    "hasDorf2" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    FOREIGN KEY ("captureRunId") REFERENCES "CaptureRun"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY ("villageId") REFERENCES "Village"("id") ON DELETE SET NULL ON UPDATE CASCADE
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "CaptureRunVillage_captureRunId_villageExternalId_key" ON "CaptureRunVillage"("captureRunId", "villageExternalId");`,
  `CREATE TABLE IF NOT EXISTS "AccountSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "captureRunId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "gold" INTEGER,
    "silver" INTEGER,
    "usedVillageSlots" INTEGER,
    "maxControllableVillages" INTEGER,
    "cpProducedForNextSlot" INTEGER,
    "cpNeededForNextSlot" INTEGER,
    "cpProductionTotal" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("captureRunId") REFERENCES "CaptureRun"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "AccountSnapshot_captureRunId_accountId_key" ON "AccountSnapshot"("captureRunId", "accountId");`,
  `CREATE TABLE IF NOT EXISTS "VillageSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "captureRunId" TEXT NOT NULL,
    "villageId" TEXT NOT NULL,
    "scrapedAt" DATETIME NOT NULL,
    "population" INTEGER,
    "loyalty" INTEGER,
    "freeCrop" INTEGER,
    "incomingAttacksAmount" INTEGER,
    "activeConstructionSlots" INTEGER,
    "constructionQueueJson" TEXT,
    "hasDorf1" BOOLEAN NOT NULL DEFAULT false,
    "hasDorf2" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("captureRunId") REFERENCES "CaptureRun"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY ("villageId") REFERENCES "Village"("id") ON DELETE CASCADE ON UPDATE CASCADE
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "VillageSnapshot_captureRunId_villageId_key" ON "VillageSnapshot"("captureRunId", "villageId");`,
  `CREATE TABLE IF NOT EXISTS "ResourceSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "villageSnapshotId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" INTEGER,
    "productionPerHour" INTEGER,
    "capacity" INTEGER,
    FOREIGN KEY ("villageSnapshotId") REFERENCES "VillageSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE
  );`,
  `CREATE TABLE IF NOT EXISTS "TroopSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "villageSnapshotId" TEXT NOT NULL,
    "unitCode" TEXT,
    "unitName" TEXT NOT NULL,
    "amount" INTEGER,
    FOREIGN KEY ("villageSnapshotId") REFERENCES "VillageSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE
  );`,
  `CREATE TABLE IF NOT EXISTS "ResourceFieldSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "villageSnapshotId" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "gid" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER,
    "isMaxLevel" BOOLEAN NOT NULL,
    "upgradeStatus" TEXT NOT NULL,
    "canAffordUpgrade" BOOLEAN,
    "canStartUpgradeNow" BOOLEAN,
    "nextLevelWood" INTEGER,
    "nextLevelClay" INTEGER,
    "nextLevelIron" INTEGER,
    "nextLevelCrop" INTEGER,
    "upgradeDurationText" TEXT,
    FOREIGN KEY ("villageSnapshotId") REFERENCES "VillageSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE
  );`,
  `CREATE TABLE IF NOT EXISTS "BuildingSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "villageSnapshotId" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "buildingId" INTEGER,
    "gid" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER,
    "isEmpty" BOOLEAN NOT NULL,
    "isMaxLevel" BOOLEAN NOT NULL,
    "upgradeStatus" TEXT NOT NULL,
    "canStartUpgradeNow" BOOLEAN,
    "nextLevelWood" INTEGER,
    "nextLevelClay" INTEGER,
    "nextLevelIron" INTEGER,
    "nextLevelCrop" INTEGER,
    "upgradeDurationText" TEXT,
    "href" TEXT,
    FOREIGN KEY ("villageSnapshotId") REFERENCES "VillageSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE
  );`,
  `CREATE TABLE IF NOT EXISTS "RawSnapshotPayload" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "captureRunId" TEXT NOT NULL,
    "villageExternalId" INTEGER,
    "source" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("captureRunId") REFERENCES "CaptureRun"("id") ON DELETE CASCADE ON UPDATE CASCADE
  );`,
  `CREATE TABLE IF NOT EXISTS "AutoApplyJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "villageId" TEXT NOT NULL,
    "credentialProfileId" TEXT,
    "status" TEXT NOT NULL,
    "runAt" DATETIME NOT NULL,
    "notBefore" DATETIME,
    "jitterMinutes" INTEGER,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "proposalId" TEXT,
    "captureRunId" TEXT,
    "lockToken" TEXT,
    "lockedAt" DATETIME,
    "processedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    FOREIGN KEY ("villageId") REFERENCES "Village"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY ("credentialProfileId") REFERENCES "CredentialProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE
  );`,
  `CREATE INDEX IF NOT EXISTS "AutoApplyJob_status_runAt_idx" ON "AutoApplyJob"("status", "runAt");`,
  `CREATE INDEX IF NOT EXISTS "AutoApplyJob_villageId_status_runAt_idx" ON "AutoApplyJob"("villageId", "status", "runAt");`,
  `CREATE TABLE IF NOT EXISTS "AgentProposal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "villageId" TEXT NOT NULL,
    "villageSnapshotId" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "focus" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "selectedCandidateRank" INTEGER,
    "selectedCandidateId" TEXT,
    "decidedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    FOREIGN KEY ("villageId") REFERENCES "Village"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY ("villageSnapshotId") REFERENCES "VillageSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE
  );`,
  `CREATE INDEX IF NOT EXISTS "AgentProposal_villageId_status_createdAt_idx" ON "AgentProposal"("villageId", "status", "createdAt");`,
  `CREATE INDEX IF NOT EXISTS "AgentProposal_villageSnapshotId_createdAt_idx" ON "AgentProposal"("villageSnapshotId", "createdAt");`,
  `CREATE TABLE IF NOT EXISTS "AgentProposalCandidate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "proposalId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "isRecommended" BOOLEAN NOT NULL DEFAULT false,
    "label" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "level" INTEGER,
    "category" TEXT NOT NULL,
    "affordableNow" BOOLEAN NOT NULL,
    "totalCost" INTEGER NOT NULL,
    "timeToAffordHours" REAL,
    "heuristicScore" REAL NOT NULL,
    "learnedScore" REAL NOT NULL,
    "finalScore" REAL NOT NULL,
    "confidence" REAL NOT NULL,
    "featuresJson" TEXT NOT NULL,
    "reasonsJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("proposalId") REFERENCES "AgentProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "AgentProposalCandidate_proposalId_rank_key" ON "AgentProposalCandidate"("proposalId", "rank");`,
  `CREATE INDEX IF NOT EXISTS "AgentProposalCandidate_proposalId_isRecommended_idx" ON "AgentProposalCandidate"("proposalId", "isRecommended");`,
  `CREATE TABLE IF NOT EXISTS "AgentExecution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "proposalId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "executedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    FOREIGN KEY ("proposalId") REFERENCES "AgentProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY ("candidateId") REFERENCES "AgentProposalCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "AgentExecution_proposalId_key" ON "AgentExecution"("proposalId");`,
  `CREATE INDEX IF NOT EXISTS "AgentExecution_status_createdAt_idx" ON "AgentExecution"("status", "createdAt");`,
  `CREATE TABLE IF NOT EXISTS "AgentOutcome" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "executionId" TEXT NOT NULL,
    "villageSnapshotId" TEXT,
    "status" TEXT NOT NULL,
    "reward" REAL,
    "contaminationReason" TEXT,
    "populationDelta" INTEGER,
    "totalProductionDelta" INTEGER,
    "freeCropDelta" INTEGER,
    "changedTargetsCount" INTEGER,
    "primaryProductionResource" TEXT,
    "primaryProductionDelta" INTEGER,
    "detailsJson" TEXT,
    "evaluatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    FOREIGN KEY ("executionId") REFERENCES "AgentExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY ("villageSnapshotId") REFERENCES "VillageSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "AgentOutcome_executionId_key" ON "AgentOutcome"("executionId");`,
  `CREATE INDEX IF NOT EXISTS "AgentOutcome_status_createdAt_idx" ON "AgentOutcome"("status", "createdAt");`,
];

const additiveBootstrapStatements = [
  `UPDATE "CredentialProfile"
   SET "isActive" = true
   WHERE "id" IN (
     SELECT "id"
     FROM "CredentialProfile"
     ORDER BY "updatedAt" DESC, "createdAt" DESC
     LIMIT 1
   )
   AND NOT EXISTS (
     SELECT 1 FROM "CredentialProfile" WHERE "isActive" = true
   );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "CredentialProfile_active_key" ON "CredentialProfile"("isActive") WHERE "isActive" = true;`,
  `CREATE INDEX IF NOT EXISTS "CredentialProfile_accountId_idx" ON "CredentialProfile"("accountId");`,
  `CREATE INDEX IF NOT EXISTS "CaptureRun_credentialProfileId_startedAt_idx" ON "CaptureRun"("credentialProfileId", "startedAt");`,
  `CREATE INDEX IF NOT EXISTS "AutoApplyJob_credentialProfileId_status_runAt_idx" ON "AutoApplyJob"("credentialProfileId", "status", "runAt");`,
  `CREATE INDEX IF NOT EXISTS "AutoApplyJob_credentialProfileId_villageId_status_runAt_idx" ON "AutoApplyJob"("credentialProfileId", "villageId", "status", "runAt");`,
];

type SqliteTableColumn = {
  name: string;
};

const credentialProfileHasIsActiveColumn = async () => {
  const columns = await db.$queryRawUnsafe<SqliteTableColumn[]>(
    `PRAGMA table_info("CredentialProfile");`,
  );

  return columns.some((column) => column.name === "isActive");
};

const tableHasColumn = async (tableName: string, columnName: string) => {
  const columns = await db.$queryRawUnsafe<SqliteTableColumn[]>(
    `PRAGMA table_info("${tableName}");`,
  );

  return columns.some((column) => column.name === columnName);
};

export const ensureDatabase = async () => {
  if (!globalForPrisma.prismaBootstrap) {
    globalForPrisma.prismaBootstrap = (async () => {
      for (const statement of bootstrapStatements) {
        await db.$executeRawUnsafe(statement);
      }

      if (!(await credentialProfileHasIsActiveColumn())) {
        await db.$executeRawUnsafe(
          `ALTER TABLE "CredentialProfile" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT false;`,
        );
      }

      if (!(await tableHasColumn("CredentialProfile", "accountId"))) {
        await db.$executeRawUnsafe(
          `ALTER TABLE "CredentialProfile" ADD COLUMN "accountId" TEXT;`,
        );
      }

      if (!(await tableHasColumn("CredentialProfile", "autoApplyCooldownUntil"))) {
        await db.$executeRawUnsafe(
          `ALTER TABLE "CredentialProfile" ADD COLUMN "autoApplyCooldownUntil" DATETIME;`,
        );
      }

      if (!(await tableHasColumn("CredentialProfile", "autoApplyCooldownReason"))) {
        await db.$executeRawUnsafe(
          `ALTER TABLE "CredentialProfile" ADD COLUMN "autoApplyCooldownReason" TEXT;`,
        );
      }

      if (!(await tableHasColumn("CredentialProfile", "autoApplyConnectivityFailureCount"))) {
        await db.$executeRawUnsafe(
          `ALTER TABLE "CredentialProfile" ADD COLUMN "autoApplyConnectivityFailureCount" INTEGER NOT NULL DEFAULT 0;`,
        );
      }

      if (!(await tableHasColumn("CredentialProfile", "lastAutoApplyRefreshAt"))) {
        await db.$executeRawUnsafe(
          `ALTER TABLE "CredentialProfile" ADD COLUMN "lastAutoApplyRefreshAt" DATETIME;`,
        );
      }

      if (!(await tableHasColumn("CaptureRun", "credentialProfileId"))) {
        await db.$executeRawUnsafe(
          `ALTER TABLE "CaptureRun" ADD COLUMN "credentialProfileId" TEXT;`,
        );
      }

      if (!(await tableHasColumn("AutoApplyJob", "credentialProfileId"))) {
        await db.$executeRawUnsafe(
          `ALTER TABLE "AutoApplyJob" ADD COLUMN "credentialProfileId" TEXT;`,
        );
      }

      if (!(await tableHasColumn("VillageSnapshot", "activeConstructionSlots"))) {
        await db.$executeRawUnsafe(
          `ALTER TABLE "VillageSnapshot" ADD COLUMN "activeConstructionSlots" INTEGER;`,
        );
      }

      if (!(await tableHasColumn("VillageSnapshot", "constructionQueueJson"))) {
        await db.$executeRawUnsafe(
          `ALTER TABLE "VillageSnapshot" ADD COLUMN "constructionQueueJson" TEXT;`,
        );
      }

      if (!(await tableHasColumn("Village", "autoApplyEnabled"))) {
        await db.$executeRawUnsafe(
          `ALTER TABLE "Village" ADD COLUMN "autoApplyEnabled" BOOLEAN NOT NULL DEFAULT false;`,
        );
      }

      if (!(await tableHasColumn("Village", "autoApplyPausedAt"))) {
        await db.$executeRawUnsafe(
          `ALTER TABLE "Village" ADD COLUMN "autoApplyPausedAt" DATETIME;`,
        );
      }

      if (!(await tableHasColumn("Village", "autoApplyPauseReason"))) {
        await db.$executeRawUnsafe(
          `ALTER TABLE "Village" ADD COLUMN "autoApplyPauseReason" TEXT;`,
        );
      }

      if (!(await tableHasColumn("Village", "plannerMode"))) {
        await db.$executeRawUnsafe(
          `ALTER TABLE "Village" ADD COLUMN "plannerMode" TEXT NOT NULL DEFAULT 'off';`,
        );
      }

      if (!(await tableHasColumn("AutoApplyJob", "planStepId"))) {
        await db.$executeRawUnsafe(
          `ALTER TABLE "AutoApplyJob" ADD COLUMN "planStepId" TEXT;`,
        );
      }

      if (!(await tableHasColumn("ResourceFieldSnapshot", "canStartUpgradeNow"))) {
        await db.$executeRawUnsafe(
          `ALTER TABLE "ResourceFieldSnapshot" ADD COLUMN "canStartUpgradeNow" BOOLEAN;`,
        );
      }

      for (const statement of additiveBootstrapStatements) {
        await db.$executeRawUnsafe(statement);
      }
    })();
  }

  return globalForPrisma.prismaBootstrap;
};
