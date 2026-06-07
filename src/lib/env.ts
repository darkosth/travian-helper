const requiredEnv = (name: string) => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

export const env = {
  databaseUrl: requiredEnv("DATABASE_URL"),
  companionSecret: requiredEnv("TRAVIAN_COMPANION_SECRET"),
};
