import "dotenv/config";

import { db, ensureDatabase } from "../src/lib/db.ts";

const run = async () => {
  await ensureDatabase();

  const profiles = await db.credentialProfile.findMany({
    orderBy: {
      createdAt: "asc",
    },
  });

  console.log("Credential profiles:");

  for (const [index, profile] of profiles.entries()) {
    const safeName = profile.label.replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
    const startupDelayMs = index * 30_000;

    console.log(
      `- ${profile.label} | profileId=${profile.id} | accountId=${profile.accountId ?? "unlinked"}`,
    );
    console.log(
      `  TRAVIAN_PROFILE_ID=${profile.id} AUTO_APPLY_STARTUP_DELAY_MS=${startupDelayMs} pm2 start npm --name travian-worker-${safeName} --update-env -- run worker:auto-apply`,
    );
  }
};

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
