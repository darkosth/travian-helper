export type InitialVillagePlanTemplate = {
  name: string;
  tribeId: number;
  serverSpeed: number;
  stage: 1 | 2 | 3;
  description: string;
};

/**
 * Plantillas base intencionalmente vacías. Primero se crean como borradores y
 * luego se completan desde el editor con slots reales y el orden elegido.
 */
export const initialVillagePlanTemplates: InitialVillagePlanTemplate[] = [
  {
    name: "Gaul x10 · Account Bootstrap",
    tribeId: 3,
    serverSpeed: 10,
    stage: 1,
    description: "Bootstrap determinista para una cuenta recién creada hasta Residencia 10.",
  },
  {
    name: "Gaul x10 · Founded Village Bootstrap",
    tribeId: 3,
    serverSpeed: 10,
    stage: 1,
    description: "Bootstrap determinista para una aldea recién fundada hasta Residencia 10.",
  },
  {
    name: "Gaul x10 · Economic Development",
    tribeId: 3,
    serverSpeed: 10,
    stage: 2,
    description: "Economía sólida: campos, capacidades e infraestructura central.",
  },
  {
    name: "Gaul x10 · DEF Specialization",
    tribeId: 3,
    serverSpeed: 10,
    stage: 3,
    description: "Especialización defensiva inicial para galos.",
  },
  {
    name: "Gaul x10 · ATK Specialization",
    tribeId: 3,
    serverSpeed: 10,
    stage: 3,
    description: "Especialización ofensiva inicial para galos.",
  },
];
