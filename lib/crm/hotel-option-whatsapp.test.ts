import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { EXAMPLE_ACCESS_TOKEN, accessNextPath } from "./access-resend";
import { hotelOptionContentDrafts, hotelOptionContentVariables, hotelOptionTemplatePreview } from "./hotel-option-whatsapp";

const TOKEN = EXAMPLE_ACCESS_TOKEN;

test("option_hotel_activee a un seul bouton vers le même lien, pour les hôtels", () => {
  const draft = hotelOptionContentDrafts()[0];
  const actions = draft.create.types["twilio/call-to-action"].actions;
  assert.equal(draft.friendlyName, "option_hotel_activee");
  assert.equal(draft.env, "TWILIO_CONTENT_OPTION_HOTEL");
  assert.equal(draft.create.language, "fr");
  assert.equal(actions.length, 1);
  assert.equal(actions[0].title, "Ouvrir mon espace");
  assert.equal(actions[0].url, "https://travelba.fr/acces/{{2}}");
  const body = draft.create.types["twilio/call-to-action"].body;
  assert.equal(body.includes("http"), false);
  assert.match(body, /membre privilégié/);
  assert.match(body, /avantages VIP\./);
  assert.match(body, /Le Concierge$/);
  assert.equal(draft.create.variables["2"], TOKEN);
  const variables = hotelOptionContentVariables("Camille", "camille.exemple@travelba.fr", TOKEN);
  assert.equal(variables?.["2"], TOKEN);
  assert.equal(variables && "3" in variables, false);
  const preview = hotelOptionTemplatePreview("Camille");
  assert.match(preview || "", /Bonjour Camille/);
  assert.equal((preview || "").includes(TOKEN), false);
  assert.equal(accessNextPath("/mon-compte/hotels"), "/mon-compte/hotels");
  assert.equal(accessNextPath("/mon-compte"), "/mon-compte");
  assert.equal(accessNextPath("https://travelba.fr/admin"), "/mon-compte");
  const card = readFileSync(new URL("../../components/admin/HotelAccessCard.tsx", import.meta.url), "utf8");
  assert.match(card, /Annoncer par WhatsApp/);
  assert.match(card, /ConfirmAction/);
  assert.match(card, /hotels\/annoncer/);
  const script = readFileSync(new URL("../../scripts/arm-whatsapp-concierge.ts", import.meta.url), "utf8");
  assert.match(script, /hotelOptionContentDrafts\(\)/);
});
