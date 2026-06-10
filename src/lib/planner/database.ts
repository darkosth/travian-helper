import { db, ensureDatabase } from "@/lib/db";

type SqliteTableColumn = { name: string };

const tableHasColumn = async (tableName: string, columnName: string) => {
  const columns = (await db.$queryRawUnsafe(
    `PRAGMA table_info("${tableName}");`,
  )) as SqliteTableColumn[];
  return columns.some((column) => column.name === columnName);
};

const plannerBootstrapStatements = [
  `CREATE TABLE IF NOT EXISTS "VillagePlanTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "tribeId" INTEGER,
    "serverSpeed" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS "VillagePlanTemplateRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "stage" INTEGER NOT NULL,
    "summaryJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("templateId") REFERENCES "VillagePlanTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE
  );`,
  `CREATE TABLE IF NOT EXISTS "VillagePlanTemplateStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "revisionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "stage" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "gid" INTEGER NOT NULL,
    "targetLevel" INTEGER NOT NULL,
    FOREIGN KEY ("revisionId") REFERENCES "VillagePlanTemplateRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE
  );`,
  `CREATE TABLE IF NOT EXISTS "VillagePlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "villageId" TEXT NOT NULL,
    "templateRevisionId" TEXT,
    "revision" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "stage" INTEGER NOT NULL,
    "basedOnSnapshotId" TEXT,
    "blockedReason" TEXT,
    "originalEtaSeconds" INTEGER,
    "recalculatedEtaSeconds" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    FOREIGN KEY ("villageId") REFERENCES "Village"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY ("templateRevisionId") REFERENCES "VillagePlanTemplateRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE
  );`,
  `CREATE TABLE IF NOT EXISTS "VillagePlanStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "stage" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "gid" INTEGER NOT NULL,
    "targetLevel" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "metadataJson" TEXT,
    FOREIGN KEY ("planId") REFERENCES "VillagePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "VillagePlanTemplateRevision_templateId_revision_key" ON "VillagePlanTemplateRevision"("templateId", "revision");`,
  `CREATE INDEX IF NOT EXISTS "VillagePlanTemplateRevision_templateId_status_idx" ON "VillagePlanTemplateRevision"("templateId", "status");`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "VillagePlanTemplateStep_revisionId_position_key" ON "VillagePlanTemplateStep"("revisionId", "position");`,
  `CREATE INDEX IF NOT EXISTS "VillagePlan_villageId_status_idx" ON "VillagePlan"("villageId", "status");`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "VillagePlanStep_planId_position_key" ON "VillagePlanStep"("planId", "position");`,
  `CREATE INDEX IF NOT EXISTS "VillagePlanStep_planId_status_position_idx" ON "VillagePlanStep"("planId", "status", "position");`,
  `CREATE INDEX IF NOT EXISTS "AutoApplyJob_planStepId_idx" ON "AutoApplyJob"("planStepId");`,
];

let plannerBootstrap: Promise<void> | null = null;

/**
 * Bootstrap aditivo para instalaciones existentes. La migración Prisma sigue
 * incluida, pero este guard evita que una instancia antigua arranque sin tablas.
 */
export const ensurePlannerDatabase = async () => {
  await ensureDatabase();
  if (!plannerBootstrap) {
    plannerBootstrap = (async () => {
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
      for (const statement of plannerBootstrapStatements) {
        await db.$executeRawUnsafe(statement);
      }
    })();
  }

  return plannerBootstrap;
};
