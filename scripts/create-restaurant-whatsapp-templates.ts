/**
 * Affiche les trois modèles restaurants à soumettre à Meta.
 * `npx tsx scripts/create-restaurant-whatsapp-templates.ts`
 * `npx tsx scripts/create-restaurant-whatsapp-templates.ts --create`
 * --create crée le contenu Twilio et demande l’approbation Utility, sans doublon :
 * un modèle qui porte déjà ce nom est repris. Même code que l’outil MCP
 * create_restaurant_whatsapp_templates, qui fait la même chose depuis le serveur.
 * Aucun WhatsApp n’est envoyé. Aucun secret n’est affiché.
 */
import { ensureRestaurantTemplates } from "../lib/crm/restaurant-templates-arm";
import { restaurantTemplateSubmission } from "../lib/crm/restaurant-whatsapp";

async function main() {
  console.log(restaurantTemplateSubmission());
  if (!process.argv.includes("--create")) {
    console.log("\nAjoutez --create pour déposer les modèles chez Twilio. Sans ça, rien n’est créé.");
    return;
  }
  const result = await ensureRestaurantTemplates();
  if (result.message) console.log(result.message);
  for (const row of result.modeles) {
    const state = row.erreur ? `erreur : ${row.erreur}` : `${row.statut}${row.cree ? ", créé" : ""}${row.soumis ? ", soumis" : ""}`;
    console.log(`${row.nom} → ${row.content_sid || "—"} → ${row.variable} (${state})`);
  }
  if (!result.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message.replace(/https?:\/\/\S+/g, "").slice(0, 180) : "échec");
  process.exitCode = 1;
});
