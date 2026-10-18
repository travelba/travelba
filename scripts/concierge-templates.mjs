import { CONCIERGE_TEMPLATES } from "../lib/crm/concierge-templates.ts";

console.log(JSON.stringify({ submitted: false, templates: CONCIERGE_TEMPLATES }, null, 2));
console.log("Ces modèles ne sont pas soumis à Meta et ne sont pas armés.");
