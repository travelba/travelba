import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { DirectStay } from "./hotel-direct";
import { MCP_TOOLS } from "./mcp-registry";
import { carteArrivee, describeStay, formalitePreview, ratehawk, ratehawkPrebookAnswer, reprendreFormalite, sejourHotel } from "./mcp-stays";
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

test("rechercher Ratehawk ne réserve pas, même avec confirmer", async () => {
  let booked = 0;
  const day = (offset: number) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  };
  const found = await ratehawk(
    {
      action: "rechercher",
      hid: 8473727,
      arrivee: day(40),
      depart: day(42),
      recherche: [{ adultes: 2, enfants: [5] }],
      confirmer: true,
    },
    {
      read: async () => ({ action: "rechercher", ecrit: false, envoye: false }),
      preview: async () => ((booked += 1), {}),
      apply: async () => ((booked += 1), {}),
    }
  );
  assert.equal(booked, 0);
  assert.equal(found.ecrit, false);
  assert.equal(found.envoye, false);
  await assert.rejects(() => ratehawk({ action: "rechercher", hid: 8473727 }, { read: async () => ({}) }), /incomplète/);
  await assert.rejects(() => ratehawk({ action: "chercher" }), /inconnue/);
});

const QUOTE = "jeton.signe";

test("un prereserver confirmé renvoie le devis à recopier dans reserver", async () => {
  const answer = ratehawkPrebookAnswer({
    quote: QUOTE,
    price: { increased: true, delta: 10, percent: 5, before: 200, after: 210 },
    rate: { show_currency_code: "EUR" },
  });
  assert.deepEqual(answer, {
    devis: QUOTE,
    prix: 210,
    prix_depart: 200,
    prix_augmente: true,
    ecart: 10,
    ecart_pourcent: 5,
    devise: "EUR",
    reserve: false,
  });
  let booked = 0;
  const done = await ratehawk(
    { action: "prereserver", hash: "h-abc", hid: 12, prix: 200, confirmer: true },
    {
      preview: async () => ({ hid: 12, prix: 200, message: "pas encore réservée" }),
      apply: async () => {
        booked += 1;
        return answer;
      },
    }
  );
  assert.equal(booked, 1);
  const row = done as { ecrit?: boolean; apercu?: boolean; devis?: string; prix?: number; prix_augmente?: boolean; reserve?: boolean };
  assert.equal(row.ecrit, true);
  assert.equal(row.apercu, false);
  assert.equal(row.devis, QUOTE);
  assert.equal(row.prix, 210);
  assert.equal(row.prix_augmente, true);
  assert.equal(row.reserve, false);
  const source = readFileSync(new URL("./mcp-stays.ts", import.meta.url), "utf8");
  assert.match(source, /return ratehawkPrebookAnswer\(result\)/);
  const tool = MCP_TOOLS.find((item) => item.name === "ratehawk");
  assert.match(tool?.description || "", /confirmer true renvoie devis/);
  assert.match(tool?.description || "", /argument devis de reserver/);
  assert.match(tool?.input?.devis.meta()?.description || "", /prereserver/);
  const instructions = readFileSync(new URL("../../app/api/mcp/route.ts", import.meta.url), "utf8");
  assert.match(instructions, /ce devis est l’argument devis de reserver/);
});

function reservation(telephone?: string) {
  return {
    action: "reserver",
    devis: QUOTE,
    hid: 12,
    hotel: "Hôtel test",
    arrivee: "2026-12-01",
    depart: "2026-12-03",
    chambres: [{ voyageurs: [{ prenom: "Ada", nom: "Martin" }] }],
    recherche: [{ adultes: 1 }],
    ...(telephone === undefined ? {} : { telephone }),
  };
}

test("un téléphone absent ou hors limites est refusé dès l’aperçu de reserver", async () => {
  let previewed = 0;
  let booked = 0;
  const effects = {
    preview: async () => {
      previewed += 1;
      return { message: "aperçu" };
    },
    apply: async () => {
      booked += 1;
      return { commande: "ord-1" };
    },
  };
  await assert.rejects(() => ratehawk(reservation(), effects), /5 caractères/);
  await assert.rejects(() => ratehawk(reservation("1234"), effects), /5 caractères/);
  await assert.rejects(() => ratehawk(reservation("   "), effects), /5 caractères/);
  await assert.rejects(() => ratehawk(reservation("1".repeat(36)), effects), /35 caractères/);
  await assert.rejects(() => ratehawk({ ...reservation("1234"), confirmer: true }, effects), /5 caractères/);
  assert.equal(previewed, 0);
  assert.equal(booked, 0);
  const held = (await ratehawk(reservation("  +33 6 12 34 56 78  "), effects)) as { apercu?: boolean; ecrit?: boolean };
  assert.equal(held.apercu, true);
  assert.equal(held.ecrit, false);
  assert.equal(booked, 0);
  const done = (await ratehawk({ ...reservation("+33123456789"), confirmer: true }, effects)) as { ecrit?: boolean };
  assert.equal(done.ecrit, true);
  assert.equal(booked, 1);
  const booking = readFileSync(new URL("./ratehawk/book.ts", import.meta.url), "utf8");
  assert.match(booking, /validateUserPhone\(input\.phone\)/);
});
