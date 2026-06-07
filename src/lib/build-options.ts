import type { Dorf2Snapshot } from "@/lib/travian-types";
import { dorf2Schema } from "@/lib/travian-schemas";

type BuildMenuOption = Dorf2Snapshot["villageCenter"]["buildMenuSlots"][number]["options"][number];

type BuildMenuSlot = Dorf2Snapshot["villageCenter"]["buildMenuSlots"][number];

const getSlotKind = (slot: number) => {
  if (slot === 39) return "rallyPoint";
  if (slot === 40) return "wall";
  return "normal";
};

const dedupeOptions = (options: BuildMenuOption[]) => {
  const deduped = new Map<number, BuildMenuOption>();

  for (const option of options) {
    const existing = deduped.get(option.gid);

    if (!existing || (!existing.availableNow && option.availableNow)) {
      deduped.set(option.gid, option);
    }
  }

  return [...deduped.values()];
};

export const parseDorf2BuildMenuPayload = (payloadJson: string) => {
  try {
    const parsed = dorf2Schema.safeParse(JSON.parse(payloadJson));

    if (!parsed.success) {
      return null;
    }

    return parsed.data.villageCenter.buildMenuSlots;
  } catch {
    return null;
  }
};

export const attachBuildMenuSlotsToSnapshot = <
  T extends {
    village: { externalId: number };
    buildings: Array<{
      slot: number;
      isEmpty: boolean;
    }>;
  },
>(
  snapshot: T,
  buildMenuSlots: BuildMenuSlot[] | null | undefined,
) => {
  if (!buildMenuSlots?.length) {
    return snapshot;
  }

  const optionsByExactSlot = new Map<number, BuildMenuOption[]>();
  const optionsBySlotKind = new Map<string, BuildMenuOption[]>();

  for (const slotPayload of buildMenuSlots) {
    if (slotPayload.slot === null) {
      continue;
    }

    const deduped = dedupeOptions(slotPayload.options);
    optionsByExactSlot.set(
      slotPayload.slot,
      dedupeOptions([...(optionsByExactSlot.get(slotPayload.slot) ?? []), ...deduped]),
    );

    const slotKind = getSlotKind(slotPayload.slot);
    optionsBySlotKind.set(
      slotKind,
      dedupeOptions([...(optionsBySlotKind.get(slotKind) ?? []), ...deduped]),
    );
  }

  return {
    ...snapshot,
    buildings: snapshot.buildings.map((building) => {
      if (!building.isEmpty) {
        return building;
      }

      const constructOptions =
        optionsByExactSlot.get(building.slot) ??
        optionsBySlotKind.get(getSlotKind(building.slot)) ??
        [];

      return {
        ...building,
        constructOptions,
      };
    }),
  };
};
