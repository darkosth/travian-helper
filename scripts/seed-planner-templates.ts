import { db } from "../src/lib/db";
import { initialVillagePlanTemplates } from "../src/lib/planner/initial-templates";
import { createTemplate, listTemplates } from "../src/lib/planner/template-service";

const main = async () => {
  const existingNames = new Set((await listTemplates()).map((template) => template.name));
  let created = 0;

  for (const template of initialVillagePlanTemplates) {
    if (existingNames.has(template.name)) continue;
    await createTemplate(template);
    created += 1;
  }

  console.log(`Plantillas creadas: ${created}`);
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
