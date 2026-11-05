import assert from "node:assert/strict";
import test from "node:test";
import { leImportExtract } from "./le-import";
import { assignLeIncluded, leIncludedLines, leRoomIsSuite } from "./le-included";
import { leCardFill } from "./mcp-le";
import { parseLeBooking, type LeBooking } from "./little-emperors";

const VIU = [
  "Priority upgrade at check-in*",
  "Daily breakfast for two guests",
  "Aperitif for two people on the terrace",
  "Suite Bookings: Bottle of Prosecco and fruit",
  "10% discount at BULK Restaurant",
  "Suite Bookings: Complimentary parking",
  "Early check in/late check out*",
];

const VIU_ROOM = [
  "Surclassement prioritaire à l'enregistrement (selon disponibilité)",
  "Petit-déjeuner quotidien pour deux personnes",
  "Apéritif pour deux en terrasse",
  "10 % de remise au restaurant BULK",
  "Enregistrement anticipé et départ tardif (selon disponibilité)",
];

const VIU_SUITE = [
  "Surclassement prioritaire à l'enregistrement (selon disponibilité)",
  "Petit-déjeuner quotidien pour deux personnes",
  "Apéritif pour deux en terrasse",
  "Bottle of Prosecco and fruit",
  "10 % de remise au restaurant BULK",
  "Parking offert",
  "Enregistrement anticipé et départ tardif (selon disponibilité)",
];

function viu(room: string): LeBooking {
  const parsed = parseLeBooking({
    id: 501,
    hotel_id: 88,
    hotel_name: "Viu Milan",
    city: "Milan",
    check_in: "2026-06-01",
    check_out: "2026-06-04",
    state: "booked",
    confirmation_number: "LEVIU",
    currency: "EUR",
    total_cost: "900",
    board: "Petit-déjeuner inclus",
    benefits: VIU,
    rooms: [{ room_type: room, guest_name: "Ada Lovelace", board: "Petit-déjeuner inclus" }],
  });
  if (!parsed) throw new Error("réservation illisible");
  return parsed;
}

test("Viu Milan : avantages traduits, astérisque et suites écartées hors suite", () => {
  assert.equal(leRoomIsSuite(["Deluxe Room"]), false);
  assert.equal(leRoomIsSuite(["Junior Suite"]), true);
  assert.deepEqual(leIncludedLines(VIU, ["Deluxe Room"]), VIU_ROOM);
  assert.deepEqual(leIncludedLines(VIU, ["Junior Suite"]), VIU_SUITE);
  assert.deepEqual(leIncludedLines(["- Priority upgrade at check-in*", "Priority upgrade at check-in*"], []), [
    "Surclassement prioritaire à l'enregistrement (selon disponibilité)",
  ]);
  assert.deepEqual(leIncludedLines(["Complimentary breakfast"], ["Superior Double-Double"]), ["Petit-déjeuner offert"]);
  assert.deepEqual(leIncludedLines([], ["Suite"]), []);
  assert.deepEqual(leIncludedLines(["Bottle of Prosecco and fruit"]), ["Bottle of Prosecco and fruit"]);
});

test("les motifs d’avantages se lisent en français, une phrase inconnue reste", () => {
  assert.deepEqual(
    leIncludedLines([
      "Aperitif for two people on the terrace",
      "Cocktail for two at the bar",
      "Glass of champagne for two on the terrace",
      "Drink for two at the bar",
      "10% discount at BULK Restaurant",
      "15% discount at Calm Spa",
      "20% off at Sky Bar",
      "USD 100 hotel credit",
      "EUR 50 food and beverage credit",
      "complimentary Wi-Fi",
      "room upgrade",
      "welcome amenity",
      "welcome gift",
      "early check-in",
      "late check-out",
      "VIP welcome",
      "spa access",
      "airport transfer",
      "breakfast for two guests",
      "continental breakfast",
      "breakfast included",
      "A private note about the garden roses",
    ]),
    [
      "Apéritif pour deux en terrasse",
      "Cocktail pour deux au bar",
      "Coupe de champagne pour deux en terrasse",
      "Boisson pour deux au bar",
      "10 % de remise au restaurant BULK",
      "15 % de remise au spa Calm",
      "20 % de remise au bar Sky",
      "Crédit hôtel de 100 USD",
      "Crédit restauration de 50 €",
      "Wifi offert",
      "Surclassement",
      "Attention de bienvenue",
      "Cadeau de bienvenue",
      "Enregistrement anticipé",
      "Départ tardif",
      "Accueil VIP",
      "Accès au spa",
      "Transfert aéroport",
      "Petit-déjeuner pour deux",
      "Petit-déjeuner continental",
      "Petit-déjeuner inclus",
      "A private note about the garden roses",
    ]
  );
});

test("une liste d’inclus déjà écrite n’est pas remplacée", () => {
  const details: Record<string, unknown> = { included: ["Accès au spa"] };
  assert.equal(assignLeIncluded(details, VIU, ["Deluxe Room"]), false);
  assert.deepEqual(details.included, ["Accès au spa"]);
  const empty: Record<string, unknown> = { included: ["  "] };
  assert.equal(assignLeIncluded(empty, VIU, ["Suite"]), true);
  assert.deepEqual(empty.included, VIU_SUITE);
});

test("l’import et le remplissage de carte copient les avantages Viu Milan", () => {
  const room = viu("Deluxe Room");
  assert.deepEqual(room.benefits, VIU);
  const imported = leImportExtract(room);
  assert.equal(imported.items[0]?.details?.board, "Petit-déjeuner inclus");
  assert.deepEqual(imported.items[0]?.details?.included, VIU_ROOM);
  assert.deepEqual(leCardFill(room).inclus, VIU_ROOM);
  const suite = viu("Junior Suite");
  assert.deepEqual(leImportExtract(suite).items[0]?.details?.included, VIU_SUITE);
  assert.deepEqual(leCardFill(suite).inclus, VIU_SUITE);
});
