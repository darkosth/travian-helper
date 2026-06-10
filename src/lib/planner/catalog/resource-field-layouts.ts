/**
 * Distribución inicial estándar 4-4-4-6 de los campos exteriores.
 *
 * Cada entrada representa un campo físico distinto. Aunque varios campos
 * comparten el mismo gid, el slot permite que el planner sepa exactamente
 * cuál debe mejorar el worker.
 *
 * Los casos especiales (9c, 15c y otras distribuciones) se agregarán como
 * layouts separados cuando el editor permita elegir el tipo de aldea.
 */
export type ResourceFieldSlotDefinition = {
  slot: number;
  gid: 1 | 2 | 3 | 4;
};

export const STANDARD_4446_RESOURCE_FIELD_LAYOUT: ResourceFieldSlotDefinition[] = [
  { slot: 1, gid: 1 }, // Leñador
  { slot: 2, gid: 4 }, // Granja
  { slot: 3, gid: 3 }, // Mina de hierro
  { slot: 4, gid: 4 }, // Granja
  { slot: 5, gid: 2 }, // Barrera
  { slot: 6, gid: 2 }, // Barrera
  { slot: 7, gid: 3 }, // Mina de hierro
  { slot: 8, gid: 4 }, // Granja
  { slot: 9, gid: 4 }, // Granja
  { slot: 10, gid: 3 }, // Mina de hierro
  { slot: 11, gid: 1 }, // Leñador
  { slot: 12, gid: 4 }, // Granja
  { slot: 13, gid: 1 }, // Leñador
  { slot: 14, gid: 2 }, // Barrera
  { slot: 15, gid: 4 }, // Granja
  { slot: 16, gid: 1 }, // Leñador
  { slot: 17, gid: 2 }, // Barrera
  { slot: 18, gid: 3 }, // Mina de hierro
];

export const getResourceFieldSelectionValue = (
  field: { gid: number; slot: number },
) => `${field.gid}:${field.slot}`;

export const parseResourceFieldSelectionValue = (
  value: string,
): ResourceFieldSlotDefinition | null => {
  const [rawGid, rawSlot] = value.split(":");
  const gid = Number(rawGid);
  const slot = Number(rawSlot);

  const match = STANDARD_4446_RESOURCE_FIELD_LAYOUT.find(
    (field) => field.gid === gid && field.slot === slot,
  );

  return match ?? null;
};
