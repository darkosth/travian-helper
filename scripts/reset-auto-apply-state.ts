import "dotenv/config";

import { db, ensureDatabase } from "../src/lib/db.ts";

const run = async () => {
  await ensureDatabase();

  const resetJobs = await db.autoApplyJob.updateMany({
    where: {
      status: {
        in: ["pending", "running", "paused"],
      },
    },
    data: {
      status: "cancelled",
      lastError: "Reset before simplified MVP worker restart.",
      lockToken: null,
      lockedAt: null,
      completedAt: new Date(),
    },
  });

  const resumedVillages = await db.village.updateMany({
    where: {
      autoApplyEnabled: true,
    },
    data: {
      autoApplyPausedAt: null,
      autoApplyPauseReason: null,
    },
  });

  console.log(`Jobs activos cancelados: ${resetJobs.count}`);
  console.log(`Aldeas auto-apply reactivadas: ${resumedVillages.count}`);
};

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
