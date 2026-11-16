import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  applyFreshFlightParse,
  decideFlightAutoAttach,
  dossierSpansTooLong,
  flightExtractIsStale,
  FLIGHT_PARSER_REVISION,
  planFlightDeposit,
  planQueuedFlightAttach,
  sumFlightTicketCounts,
} from "./email-flight-deposit";
import { emptyBookingExtract } from "./ingest-types";
import { parsedItemsFromText } from "./ingest-parse";

const transavia = {
  kind: "flight",
  title: "Paris → Hurghada",
  confirmation_ref: "WFPMHG",
  start_at: "2026-11-01T06:00:00",
  amount: null,
  details: { flight_number: "TO 4338", pnr: "WFPMHG", document_amount: 420 },
};
const easyjet = {
  kind: "flight",
  title: "Hurghada → Le Caire",
  confirmation_ref: "KDQ68JS",
  start_at: "2026-11-02T09:10:00",
  amount: null,
  details: { flight_number: "EJU4692", pnr: "KDQ68JS" },
};

function ticket() {
  return {
    document_status: "confirmed" as const,
    start_date: "2026-11-01",
    end_date: "2026-11-02",
    travelers: [{ first_name: "Pax", last_name: "Test" }],
    items: [transavia, easyjet],
  };
}

describe("dépôt des vols", () => {
  it("prépare une carte cachée par PNR, prix 0, coût seulement s’il est imprimé", () => {
    const plan = planFlightDeposit(ticket());
    assert.equal(plan.cartes.length, 2);
    assert.deepEqual(
      plan.cartes.map((card) => card.pnr),
      ["WFPMHG", "KDQ68JS"]
    );
    assert.equal(plan.cartes[0]?.lignes.length, 1);
    assert.equal(plan.cartes[0]?.prix_vente, 0);
    assert.equal(plan.cartes[0]?.cachee, true);
    assert.equal(plan.cartes[0]?.cout, 420);
    assert.equal(plan.cartes[1]?.cout, null);
  });

  it("additionne les billets repliés sur le même vol", () => {
    const summed = sumFlightTicketCounts(
      ticket(),
      [],
      "mail-1",
      [
        {
          items: [{ ...easyjet, details: { flight_number: "EJU4692", pnr: "KDQ68JS", ticket_count: 1 } }],
          travelers: [{ first_name: "Lou", last_name: "Test" }],
        },
      ]
    );
    const hurghada = (summed.items || []).find((item) => item.confirmation_ref === "KDQ68JS");
    assert.equal((hurghada?.details as { ticket_count?: number } | undefined)?.ticket_count, 2);
    assert.equal(hurghada?.amount, 0);
    assert.equal((summed.travelers || []).length, 2);
  });
});

describe("rattachement automatique", () => {
  const dossier = { booking_id: "b1", customer_id: "c1", score: 90, reason: "Référence fournisseur" };
  const traveler = { booking_id: "b1", customer_id: "c1", score: 88, reason: "Voyageur et dates" };

  it("rattache un PNR unique, y compris un séjour Visible", () => {
    const decision = decideFlightAutoAttach(ticket(), [dossier]);
    assert.equal(decision?.bookingId, "b1");
    assert.equal(decision?.customerId, "c1");
    assert.match(decision?.reason || "", /fournisseur/);
  });

  it("rattache un voyageur unique aux dates qui se croisent", () => {
    const decision = decideFlightAutoAttach(ticket(), [traveler]);
    assert.equal(decision?.bookingId, "b1");
  });

  it("laisse un dossier trop long, un vol antérieur ou un PNR d’exemple", () => {
    const traveler = {
      booking_id: "b-long",
      customer_id: "c1",
      score: 88,
      reason: "Voyageur et dates",
      start_date: "2023-09-15",
      end_date: "2026-10-09",
      covers_passengers: true,
    };
    assert.equal(dossierSpansTooLong("2023-09-15", "2026-10-09"), true);
    assert.equal(decideFlightAutoAttach(ticket(), [traveler], { receivedAt: "2026-10-09" }), null);
    const dated = { ...traveler, start_date: "2026-11-01", end_date: "2026-11-08" };
    assert.equal(
      decideFlightAutoAttach(ticket(), [dated], { receivedAt: "2026-11-20T15:42:00.000Z" }),
      null
    );
    const example = {
      ...ticket(),
      items: [{ ...transavia, confirmation_ref: "ABC123", details: { ...transavia.details, pnr: "DEF456" } }],
    };
    assert.equal(decideFlightAutoAttach(example, [dated]), null);
  });

  it("parmi plusieurs clients, le dossier qui couvre les passagers est choisi", () => {
    const flight = {
      document_status: "confirmed" as const,
      travelers: [
        { first_name: "Leo", last_name: "Periol" },
        { first_name: "Guillian", last_name: "Dupin" },
      ],
      items: [easyjet],
    };
    const dossier = {
      booking_id: "b-0152",
      customer_id: "c-holder",
      score: 88,
      reason: "Voyageur et dates",
      start_date: "2026-11-01",
      end_date: "2026-11-08",
      covers_passengers: true,
    };
    const clients = [
      { customer_id: "c-jeanne", booking_id: null, score: 92, reason: "Nom et prénom", label: "Manuel Jeanne" },
      dossier,
      { customer_id: "c-heather", booking_id: null, score: 85, reason: "Nom de famille", label: "Heather Devigne" },
    ];
    const decision = decideFlightAutoAttach(flight, clients, { receivedAt: "2026-11-01" });
    assert.equal(decision?.bookingId, "b-0152");
    const partial = { ...dossier, booking_id: "b-autre", covers_passengers: false };
    assert.equal(decideFlightAutoAttach(flight, [clients[0], partial, clients[2]]), null);
    assert.equal(
      decideFlightAutoAttach(flight, [dossier, { ...dossier, booking_id: "b-autre" }]),
      null
    );
  });

  it("laisse la file décider quand il y a zéro ou plusieurs dossiers, ou un score bas", () => {
    assert.equal(decideFlightAutoAttach(ticket(), []), null);
    assert.equal(
      decideFlightAutoAttach(ticket(), [dossier, { ...dossier, booking_id: "b2" }]),
      null
    );
    assert.equal(
      decideFlightAutoAttach(ticket(), [
        { booking_id: "b1", customer_id: "c1", score: 80, reason: "Même client, même destination" },
      ]),
      null
    );
    assert.equal(decideFlightAutoAttach({ ...ticket(), document_status: "cancelled" }, [dossier]), null);
    assert.equal(decideFlightAutoAttach({ document_status: "confirmed", items: [] }, [dossier]), null);
  });

  it("l’ingestion appelle le rattachement, sans invitation ni envoi", () => {
    const ingest = readFileSync(new URL("./email-ingest.ts", import.meta.url), "utf8");
    assert.match(ingest, /autoSettleStay/);
    assert.match(ingest, /decideStayAutoAttach/);
    assert.match(ingest, /autoCreateStayFromMail/);
    assert.equal(ingest.includes("inviteCustomer"), false);
    assert.equal(ingest.includes("visibleToClient: true"), false);
    assert.equal(ingest.includes("notifyStayPublished"), false);
    const run = readFileSync(new URL("./email-flight-deposit-run.ts", import.meta.url), "utf8");
    assert.match(run, /visibleToClient: false/);
    assert.match(run, /skipTicketingFee: opts\?\.automatic \? false : true/);
    assert.match(run, /auto_attach/);
    assert.equal(run.includes("inviteCustomer"), false);
    assert.equal(run.includes("notifyStayPublished"), false);
    assert.equal(run.includes("envoyer"), false);
  });
});

const STALE_EASYJET = `
Reçu de Billet Electronique
Référence du dossier WFPMHG
Référence du dossier compagnie U2/KDQ68JS
Passager / Numéro De Billet
TEST/PAX MR 000-0000001234
Compagnie émettrice : EASYJET
Lundi 03 novembre 2026
EASYJET U2 4692 (Opéré Par easyJet, )
03 November 09:10 Aéroport international Hurghada
Départ
03 November 11:40 Le Caire
Arrivée
Distance 3 610,00 km
`;

describe("relecture des mails déjà en file", () => {
  it("corrige un PNR tronqué et un montant lu sur une distance", () => {
    const stale = {
      ...emptyBookingExtract(),
      document_status: "confirmed" as const,
      items: [
        {
          kind: "flight" as const,
          title: "Vol",
          supplier: null,
          confirmation_ref: "WFPMHG",
          start_at: "2026-11-03T09:10:00",
          end_at: null,
          amount: null,
          details: { pnr: "KDQ68J", flight_number: "U2 4692", document_amount: 3610, document_currency: "EUR" },
        },
      ],
    };
    assert.equal(flightExtractIsStale(stale), true);
    const fresh = parsedItemsFromText(STALE_EASYJET);
    const next = applyFreshFlightParse(stale, fresh);
    assert.equal(next.parser_revision, FLIGHT_PARSER_REVISION);
    assert.equal(flightExtractIsStale(next), false);
    const flight = next.items?.find((item) => item.kind === "flight");
    assert.equal(flight?.details?.pnr, "KDQ68JS");
    assert.equal(flight?.details?.document_amount ?? null, null);
    assert.equal(JSON.stringify(next).includes("3610"), false);
    const again = applyFreshFlightParse(next, { items: [], travelers: [] });
    assert.equal(again.items?.find((item) => item.kind === "flight")?.details?.pnr, "KDQ68JS");
  });

  it("rattache un billet en file au voyageur d’un dossier Visible", () => {
    const extract = {
      ...emptyBookingExtract(),
      document_status: "confirmed" as const,
      start_date: "2026-11-02",
      end_date: "2026-11-02",
      travelers: [{ first_name: "Inès", last_name: "Morel" }],
      items: [
        {
          kind: "flight" as const,
          title: "Hurghada → Le Caire",
          supplier: "easyJet",
          confirmation_ref: "KDQ68JS",
          start_at: "2026-11-02T09:10:00",
          end_at: "2026-11-02T11:40:00",
          amount: null,
          details: { flight_number: "U2 4692", pnr: "KDQ68JS" },
        },
      ],
    };
    const visible = {
      id: "b-visible",
      customer_id: "c-holder",
      reference: "TB-2026-0152",
      title: "Égypte",
      destination: "Hurghada",
      start_date: "2026-11-01",
      end_date: "2026-11-08",
      status: "confirmed",
      visible_to_client: true,
    };
    const decision = planQueuedFlightAttach({
      extract,
      bookings: [visible],
      travelers: [{ booking_id: "b-visible", first_name: "Inès", last_name: "Morel" }],
      customers: [{ id: "c-holder", first_name: "Paul", last_name: "Titulaire", company_name: null, email: "paul@example.com" }],
    });
    assert.equal(decision?.bookingId, "b-visible");
    assert.equal(decision?.reason, "Voyageur et dates");
    const other = { ...visible, id: "b-autre", reference: "TB-2026-0199" };
    assert.equal(
      planQueuedFlightAttach({
        extract,
        bookings: [visible, other],
        travelers: [
          { booking_id: "b-visible", first_name: "Inès", last_name: "Morel" },
          { booking_id: "b-autre", first_name: "Inès", last_name: "Morel" },
        ],
      }),
      null
    );
  });

  it("le cron et l’ajout d’un voyageur relancent un lot, sans bloquer l’écran", () => {
    const cron = readFileSync(new URL("../../app/api/cron/gmail-ingest/route.ts", import.meta.url), "utf8");
    const travelers = readFileSync(new URL("../../app/api/admin/bookings/[id]/travelers/route.ts", import.meta.url), "utf8");
    const items = readFileSync(new URL("../../app/api/admin/bookings/[id]/items/route.ts", import.meta.url), "utf8");
    const rematch = readFileSync(new URL("./email-flight-rematch.ts", import.meta.url), "utf8");
    assert.match(cron, /rematchStoredEmailIngest\(8\)/);
    assert.match(travelers, /schedulePendingFlightRematch/);
    assert.match(items, /schedulePendingFlightRematch/);
    assert.match(rematch, /after\(/);
    assert.match(rematch, /depth > 0/);
  });
});
