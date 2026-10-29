/**
 * Affiche les trois modèles restaurants à soumettre à Meta.
 * `npx tsx scripts/create-restaurant-whatsapp-templates.ts`
 * `npx tsx scripts/create-restaurant-whatsapp-templates.ts --create`
 * --create crée le contenu Twilio et demande l’approbation Utility.
 * Aucun WhatsApp n’est envoyé. Aucun secret n’est affiché.
 */
import {
  restaurantCarouselContentCreateBody,
  restaurantIntroContentCreateBody,
  restaurantTemplateSubmission,
  RESTAURANT_CAROUSEL_ENV,
  RESTAURANT_CAROUSEL_MENU_ENV,
  RESTAURANT_CAROUSEL_MENU_NAME,
  RESTAURANT_CAROUSEL_NAME,
  RESTAURANT_INTRO_ENV,
  RESTAURANT_INTRO_NAME,
} from "../lib/crm/restaurant-whatsapp";

const CONTENT_URL = "https://content.twilio.com/v1/Content";

const DRAFTS = [
  { env: RESTAURANT_INTRO_ENV, name: RESTAURANT_INTRO_NAME, body: restaurantIntroContentCreateBody() },
  { env: RESTAURANT_CAROUSEL_ENV, name: RESTAURANT_CAROUSEL_NAME, body: restaurantCarouselContentCreateBody(false) },
  { env: RESTAURANT_CAROUSEL_MENU_ENV, name: RESTAURANT_CAROUSEL_MENU_NAME, body: restaurantCarouselContentCreateBody(true) },
];

function quiet(error: unknown) {
  const message = error instanceof Error ? error.message : "échec";
  console.error(message.replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim().slice(0, 180));
}

async function createOne(body: unknown) {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim() || "";
  const token = process.env.TWILIO_AUTH_TOKEN?.trim() || "";
  if (!sid || !token) throw new Error("TWILIO_ACCOUNT_SID ou TWILIO_AUTH_TOKEN absent.");
  const response = await fetch(CONTENT_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as { sid?: string; message?: string } | null;
  if (!response.ok || !payload?.sid) throw new Error(payload?.message || `HTTP ${response.status}`);
  const approval = await fetch(`${CONTENT_URL}/${payload.sid}/ApprovalRequests/whatsapp`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: (body as { friendly_name: string }).friendly_name, category: "UTILITY" }),
  });
  if (!approval.ok) {
    const detail = (await approval.json().catch(() => null)) as { message?: string } | null;
    const message = detail?.message || `HTTP ${approval.status}`;
    if (!/already|submitted|approved/i.test(message)) throw new Error(message);
  }
  return payload.sid;
}

async function main() {
  console.log(restaurantTemplateSubmission());
  if (!process.argv.includes("--create")) {
    console.log("\nAjoutez --create pour déposer les modèles chez Twilio. Sans ça, rien n’est créé.");
    return;
  }
  for (const draft of DRAFTS) {
    try {
      const sid = await createOne(draft.body);
      console.log(`${draft.name} → ${sid} → ${draft.env}`);
    } catch (error) {
      quiet(error);
      process.exitCode = 1;
    }
  }
}

main().catch((error) => {
  quiet(error);
  process.exitCode = 1;
});
