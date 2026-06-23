import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type Pm2Process = {
  name?: string;
  pm2_env?: {
    env?: {
      TRAVIAN_PROFILE_ID?: string;
    };
    name?: string;
    pm_cwd?: string;
    TRAVIAN_PROFILE_ID?: string;
    status?: string;
  };
};

const buildProfileWorkerName = (label: string, profileId: string) => {
  const safeLabel = label.replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
  const normalized = safeLabel.replace(/-+/g, "-").replace(/^-|-$/g, "");
  const suffix = profileId.slice(-8).toLowerCase();
  return `travian-worker-${normalized || "profile"}-${suffix}`;
};

const getProcessName = (process: Pm2Process) => process.name ?? process.pm2_env?.name ?? null;

const getProcessProfileId = (process: Pm2Process) =>
  process.pm2_env?.TRAVIAN_PROFILE_ID ?? process.pm2_env?.env?.TRAVIAN_PROFILE_ID ?? null;

const getTravianHelperProcesses = async () => {
  const { stdout } = await execFileAsync("pm2", ["jlist"], {
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });

  const processes = JSON.parse(stdout) as Pm2Process[];
  return processes.filter(
    (entry) => entry.pm2_env?.pm_cwd === process.cwd(),
  );
};

export const ensureProfilePm2Worker = async (input: {
  profileId: string;
  label: string;
  startupDelayMs?: number;
}) => {
  const processes = await getTravianHelperProcesses();
  const workerName = buildProfileWorkerName(input.label, input.profileId);
  const existing = processes.filter(
    (process) => getProcessProfileId(process) === input.profileId,
  );

  if (existing.length > 0) {
    return {
      created: false,
      names: existing
        .map(getProcessName)
        .filter((name): name is string => Boolean(name)),
    };
  }

  const conflictingNames = processes
    .filter((process) => {
      const name = getProcessName(process);
      return name === workerName && getProcessProfileId(process) !== input.profileId;
    })
    .map(getProcessName)
    .filter((name): name is string => Boolean(name));

  if (conflictingNames.length > 0) {
    await execFileAsync("pm2", ["delete", ...conflictingNames], {
      env: process.env,
      maxBuffer: 10 * 1024 * 1024,
    });
  }

  const startupDelayMs = Math.max(0, input.startupDelayMs ?? 0);
  await execFileAsync(
    "pm2",
    [
      "start",
      "npm",
      "--name",
      workerName,
      "--update-env",
      "--",
      "run",
      "worker:auto-apply",
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        TRAVIAN_PROFILE_ID: input.profileId,
        AUTO_APPLY_STARTUP_DELAY_MS: String(startupDelayMs),
      },
      maxBuffer: 10 * 1024 * 1024,
    },
  );

  return {
    created: true,
    names: [workerName],
  };
};

export const removeProfilePm2Processes = async (profileId: string) => {
  const names = (await getTravianHelperProcesses())
    .filter((process) => getProcessProfileId(process) === profileId)
    .map(getProcessName)
    .filter((name): name is string => Boolean(name));

  if (names.length === 0) {
    return [];
  }

  await execFileAsync("pm2", ["delete", ...names], {
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });

  return names;
};

export const removeOrphanedProfilePm2Processes = async (profileIds: string[]) => {
  const liveProfileIds = new Set(profileIds);
  const names = (await getTravianHelperProcesses())
    .filter((process) => {
      const processProfileId = getProcessProfileId(process);
      return processProfileId && !liveProfileIds.has(processProfileId);
    })
    .map(getProcessName)
    .filter((name): name is string => Boolean(name));

  if (names.length === 0) {
    return [];
  }

  await execFileAsync("pm2", ["delete", ...names], {
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });

  return names;
};
