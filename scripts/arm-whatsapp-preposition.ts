/**
 * Soumet à Meta une nouvelle version des modèles Utility dont le corps
 * écrit encore « à {{n}} » devant une destination.
 * N’efface rien, ne désactive rien, n’envoie aucun WhatsApp.
 * Affiche l’ancien SID, le nouveau, et le statut d’approbation.
 */
import { resubmitPrepositionTemplates, twilioContentConfigured } from "../lib/crm/whatsapp-preposition";
import { contentSidV2Name } from "../lib/crm/twilio-content-sid";

async function main() {
  if (!twilioContentConfigured()) {
    console.error("TWILIO_ACCOUNT_SID ou TWILIO_AUTH_TOKEN absent. Aucun modèle créé.");
    process.exitCode = 1;
    return;
  }
  const templates = await resubmitPrepositionTemplates();
  if (!templates.length) {
    console.log("Aucun modèle avec une préposition figée devant la destination.");
    return;
  }
  for (const row of templates) {
    const env = row.env ? contentSidV2Name(row.env) : "hors variable";
    console.log(
      `${row.friendlyName} → ${row.newName} | ancien ${row.oldSid} | nouveau ${row.newSid} | ${row.approval} | ${env}`
    );
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "échec";
  console.error(message.replace(/https?:\/\/\S+/g, "").slice(0, 200));
  process.exitCode = 1;
});
