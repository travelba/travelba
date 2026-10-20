import { CONCIERGE_TEMPLATES, renderConciergeTemplate, templateDestination, templateIsArmed } from "../lib/crm/concierge-templates.ts";

const stay = { destination: "Paris · Tel Aviv · Seychelles" };
const sample = {
  fr: templateDestination(stay, "fr"),
  en: templateDestination(stay, "en"),
  he: templateDestination(stay, "he"),
};

console.log(
  JSON.stringify(
    {
      submitted: false,
      armed: CONCIERGE_TEMPLATES.some((template) => templateIsArmed(template)),
      destination: sample,
      templates: CONCIERGE_TEMPLATES.map((template) => ({
        ...template,
        exemple: {
          fr: renderConciergeTemplate(template.key, "fr", { prenom: "Camille", destination: sample.fr }),
          en: renderConciergeTemplate(template.key, "en", { prenom: "Camille", destination: sample.en }),
          he: renderConciergeTemplate(template.key, "he", { prenom: "Camille", destination: sample.he }),
        },
      })),
    },
    null,
    2
  )
);
console.log("Ces modèles ne sont pas soumis à Meta et ne sont pas armés.");
