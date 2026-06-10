/**
 * Factor aplicado al tiempo base según Edificio Principal.
 * Se mantiene en catálogo para poder corregirlo sin tocar el motor.
 */
export const mainBuildingTimeFactorByLevel = [
  1,
  0.96,
  0.92,
  0.88,
  0.84,
  0.8,
  0.76,
  0.72,
  0.68,
  0.64,
  0.6,
  0.56,
  0.52,
  0.48,
  0.44,
  0.4,
  0.36,
  0.32,
  0.28,
  0.24,
  0.2,
] as const;

export const getMainBuildingTimeFactor = (level: number) =>
  mainBuildingTimeFactorByLevel[
    Math.max(0, Math.min(level, mainBuildingTimeFactorByLevel.length - 1))
  ] ?? 1;
