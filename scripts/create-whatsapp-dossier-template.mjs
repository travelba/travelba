/**
 * Crée le template Content Twilio « dossier voyage » (2 liens courts).
 * Usage: node --env-file=.env.local scripts/create-whatsapp-dossier-template.mjs
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
  "",
  "Voici ton dossier voyage :",
  "",
  "Suivie des dépenses",
  "{{2}}",
  "",
  "Récapitulatif du voyage",
  "{{3}}",
  "",
  "— Le Concierge",
].join("\n");

async function main() {
  const create = await fetch("https://content.twilio.com/v1/Content", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      friendly_name: "tba_concierge_dossier_liens_fr_v2",
      language: "fr",
      variables: {
        1: "Marie",
        2: "https://travelba.fr/d/xk7m2npq",
        3: "https://travelba.fr/v/xk7m2npq",
      },
      types: {
        "twilio/text": {
          body: bodyText,
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
        name: "tba_concierge_dossier_liens_fr_v2",
        category: "UTILITY",
        allow_category_change: true,
      }),
    }
  );
  const appr = await approve.json();
  console.log("approve", approve.status);
  console.log(JSON.stringify(appr, null, 2).slice(0, 1000));
  console.log("\n→ TWILIO_WHATSAPP_DOSSIER_CONTENT_SID=" + created.sid);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
