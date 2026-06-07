import type { ActiveConstructionLike, VillageSnapshotLike } from "@/lib/recommendations";

type ConstructionStateInput = {
  activeConstructionSlots?: number | null;
  constructionQueue?: ActiveConstructionLike[] | null;
  scrapedAt?: Date | string | null;
};

export type EffectiveConstructionState = {
  activeConstructionSlots: number;
  constructionQueue: ActiveConstructionLike[];
  hadQueuedConstruction: boolean;
  queueExpiredByClock: boolean;
};

export const parseDurationMs = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  const match = value.match(/(?:(\d+):)?(\d{1,2}):(\d{2})/);

  if (!match) {
    return null;
  }

  const [, hoursText, minutesText, secondsText] = match;
  const hours = Number(hoursText ?? 0);
  const minutes = Number(minutesText ?? 0);
  const seconds = Number(secondsText ?? 0);

  return ((hours * 60 + minutes) * 60 + seconds) * 1000;
};

export const getEffectiveConstructionState = (
  input: ConstructionStateInput,
  now: Date = new Date(),
): EffectiveConstructionState => {
  const originalQueue = input.constructionQueue ?? [];
  const scrapedAt =
    input.scrapedAt instanceof Date
      ? input.scrapedAt
      : input.scrapedAt
        ? new Date(input.scrapedAt)
        : null;
  const hadQueuedConstruction = originalQueue.length > 0;

  if (!scrapedAt || Number.isNaN(scrapedAt.getTime()) || originalQueue.length === 0) {
    return {
      activeConstructionSlots: input.activeConstructionSlots ?? originalQueue.length,
      constructionQueue: originalQueue,
      hadQueuedConstruction,
      queueExpiredByClock: false,
    };
  }

  const effectiveQueue = originalQueue.filter((entry) => {
    const remainingMs = parseDurationMs(entry.remainingTime);

    if (remainingMs === null) {
      return true;
    }

    return scrapedAt.getTime() + remainingMs > now.getTime();
  });

  const queueExpiredByClock =
    originalQueue.length > 0 && effectiveQueue.length === 0 && originalQueue.length !== effectiveQueue.length;

  if (effectiveQueue.length === 0) {
    return {
      activeConstructionSlots: queueExpiredByClock ? 0 : Math.max(0, input.activeConstructionSlots ?? 0),
      constructionQueue: effectiveQueue,
      hadQueuedConstruction,
      queueExpiredByClock,
    };
  }

  return {
    activeConstructionSlots: Math.min(
      Math.max(0, input.activeConstructionSlots ?? effectiveQueue.length),
      effectiveQueue.length,
    ),
    constructionQueue: effectiveQueue,
    hadQueuedConstruction,
    queueExpiredByClock,
  };
};

export const withEffectiveConstructionState = <T extends ConstructionStateInput>(
  snapshot: T,
  now?: Date,
) => {
  const effective = getEffectiveConstructionState(snapshot, now);

  return {
    ...snapshot,
    activeConstructionSlots: effective.activeConstructionSlots,
    constructionQueue: effective.constructionQueue,
  };
};

export const getSoonestQueueDelayMs = (input: ConstructionStateInput, now?: Date) => {
  const { constructionQueue } = getEffectiveConstructionState(input, now);
  const waits = constructionQueue
    .map((entry) => parseDurationMs(entry.remainingTime))
    .filter((value): value is number => value !== null);

  if (waits.length === 0) {
    return null;
  }

  return Math.min(...waits);
};

export const getSoonestQueueWaitHours = (snapshot: VillageSnapshotLike) => {
  const delayMs = getSoonestQueueDelayMs(snapshot);

  return delayMs === null ? null : delayMs / 3_600_000;
};
