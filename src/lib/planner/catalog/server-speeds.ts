export const supportedServerSpeeds = [1, 2, 3, 5, 10] as const;

export type ServerSpeed = (typeof supportedServerSpeeds)[number];

export const normalizeServerSpeed = (speed: number) => {
  if (!Number.isFinite(speed) || speed <= 0) {
    return 1;
  }

  return speed;
};
