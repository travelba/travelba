/**
 * Crée le template Content Twilio « opt-in dossier » (quick-reply Oui / Non merci)
 * et demande l’approbation WhatsApp.
 *
 * Usage: node --env-file=.env.local scripts/create-whatsapp-optin-template.mjs
 */
const sid = process.env.TWILIO_ACCOUNT_SID;
const token = process.env.TWILIO_AUTH_TOKEN;
if (!sid || !token) {
  console.error("TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN manquants");
  process.exit(1);
}

const auth = Buffer.from(`${sid}:${token}`).toString("base64");

const bodyText = [
  "Bonjour {{1}},",
  "Je suis Le Concierge de Travel Business Agency, je suis là pour t'accompagner (info pratique, rappels utiles, réponses à vos questions) pendant ton séjour.",
  "Veux-tu recevoir ton dossier voyage ?",
].join("\n");

async function main() {
  const create = await fetch("https://content.twilio.com/v1/Content", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      friendly_name: "tba_concierge_optin_dossier_fr_v1",
      language: "fr",
      variables: { 1: "Marie" },
      types: {
        "twilio/quick-reply": {
          body: bodyText,
          actions: [
            { title: "Oui", id: "dossier_oui" },
            { title: "Non merci", id: "dossier_non" },
          ],
        },
      },
    }),
  });
  const created = await create.json();
  console.log("create", create.status, created.sid, created.friendly_name);
  if (!created.sid) {
    console.log(JSON.stringify(created, null, 2));
    process.exit(1);
  }

  const approve = await fetch(
    `https://content.twilio.com/v1/Content/${created.sid}/ApprovalRequests/whatsapp`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "tba_concierge_optin_dossier_fr_v1",
        category: "UTILITY",
        allow_category_change: true,
      }),
    }
  );
  const appr = await approve.json();
  console.log("approve", approve.status);
  console.log(JSON.stringify(appr, null, 2).slice(0, 1200));
  console.log("\n→ Ajouter dans .env.local :");
  console.log(`TWILIO_WHATSAPP_OPTIN_CONTENT_SID=${created.sid}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
