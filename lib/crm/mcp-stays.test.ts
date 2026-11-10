import assert from "node:assert/strict";
import test from "node:test";
import type { DirectStay } from "./hotel-direct";
import { carteArrivee, describeStay, formalitePreview, ratehawk, reprendreFormalite, sejourHotel } from "./mcp-stays";
import { McpWriteError } from "./mcp-write";

const CLIENT = "11111111-1111-4111-8111-111111111111";
const STAY = "22222222-2222-4222-8222-222222222222";
const DOSSIER = "33333333-3333-4333-8333-333333333333";
const CARTE = "44444444-4444-4444-8444-444444444444";

const stay: DirectStay = {
  phase: "transmitted",
  payMethod: "agency",
  stripe: "none",
  authorizedAt: null,
  pliant: "none",
  mail: "sent",
  hotelPay: "none",
  priceState: "quoted",
  partnerRate: false,
  confirmation: null,
  sellCents: 12000,
  hotelCents: 12000,
  currency: "EUR",
  freeCancellation: true,
  cancelDeadline: "2026-12-01",
  conditions: "",
  keys: [],
  clientRefunded: false,
  reason: "",
  mailSentAt: null,
  draft: null,
  guests: ["Ada Lovelace"],
  arrival: null,
  stripeIntent: null,
  pliantCardId: null,
  reference: "HS-1",
  hotelName: "Bristol",
  leBookingId: null,
  supplier: "email",
  placingAt: null,
};

test("marquer payé n’envoie rien, annuler après un courrier prévient", () => {
  const paid = describeStay(stay, { type: "mark_paid" }, "2026-11-10T12:00:00.000Z");
  assert.equal(paid.envoie, false);
  assert.equal(paid.phase, "confirming");
  const cancelled = describeStay(stay, { type: "cancel_agency" }, "2026-11-10T12:00:00.000Z");
  assert.equal(cancelled.envoie, true);
  assert.ok(cancelled.effets.some((line) => line.includes("courrier")));
});

test("un séjour direct n’est pas modifié sans confirmer", async () => {
  let written = 0;
  const preview = await sejourHotel(
    { client_id: CLIENT, sejour_id: STAY, action: "paye" },
    {
      preview: async () => ({ phase: "confirming", effets: [], envoie: false }),
      apply: async () => {
        written += 1;
        return { phase: "confirming" };
      },
    }
  );
  assert.equal(preview.apercu, true);
  assert.equal(preview.ecrit, false);
  assert.equal(written, 0);
  const done = await sejourHotel(
    { client_id: CLIENT, sejour_id: STAY, action: "paye", confirmer: true },
    {
      preview: async () => ({ phase: "confirming", effets: [], envoie: false }),
      apply: async () => {
        written += 1;
        return { phase: "confirming" };
      },
    }
  );
  assert.equal(done.ecrit, true);
  assert.equal(written, 1);
});

test("recommencer une formalité n’efface rien sans confirmer et n’envoie pas", async () => {
  const shown = formalitePreview("US");
  assert.equal(shown.envoie, false);
  assert.match(shown.message, /Aucun message/);
  let written = 0;
  const preview = await reprendreFormalite({ dossier_id: DOSSIER, pays: "US" }, { apply: async () => ((written += 1), { recommence: true }) });
  assert.equal(preview.apercu, true);
  assert.equal(written, 0);
  await reprendreFormalite({ dossier_id: DOSSIER, pays: "GB", confirmer: true }, { apply: async () => ((written += 1), { recommence: true }) });
  assert.equal(written, 1);
  await assert.rejects(() => reprendreFormalite({ dossier_id: DOSSIER, pays: "FR" }), /Pays/);
});

test("la carte d’arrivée et Ratehawk attendent confirmer", async () => {
  let cards = 0;
  let booked = 0;
  const card = await carteArrivee(
    { dossier_id: DOSSIER, carte_id: CARTE },
    { preview: async () => ({ message: "Aucun numéro complet" }), apply: async () => ((cards += 1), { fin: "4242" }) }
  );
  assert.equal(card.envoye, false);
  assert.equal(cards, 0);
  await carteArrivee(
    { dossier_id: DOSSIER, carte_id: CARTE, confirmer: true },
    { preview: async () => ({ message: "Aucun numéro complet" }), apply: async () => ((cards += 1), { fin: "4242" }) }
  );
  assert.equal(cards, 1);

  const held = await ratehawk(
    { action: "prereserver", hash: "h-abc", hid: 12, prix: 200 },
    { preview: async () => ({ message: "pas encore réservée" }), apply: async () => ((booked += 1), { reserve: false }) }
  );
  assert.equal((held as { apercu?: boolean }).apercu, true);
  assert.equal(booked, 0);
  const status = await ratehawk({ action: "statut", commande: "ord-1" }, { read: async () => ({ statut: "ok", ecrit: false, envoye: false }) });
  assert.equal(status.ecrit, false);
  assert.equal(booked, 0);
  await assert.rejects(() => ratehawk({ action: "reserver", hid: 1 }, { preview: async () => ({}) }), /incomplète/);
  await assert.rejects(() => sejourHotel({ client_id: CLIENT, sejour_id: STAY, action: "paye", confirmer: "oui" }, { preview: async () => ({ envoie: false }) }), McpWriteError);
});
