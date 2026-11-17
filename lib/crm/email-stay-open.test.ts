import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { sumFlightTicketCounts } from "./email-flight-deposit";
import { suggestBookingByReference, suggestCustomerFromExtract } from "./email-match";
import { decideStayAutoAttach, decideStayAutoCreate } from "./email-stay-open";

const client = { customer_id: "c-raphael", booking_id: null, score: 92, reason: "Nom et prénom", label: "Raphaël Boukris" };

function flight(start = "2027-04-13T10:00:00") {
  return {
    document_status: "confirmed" as const,
    start_date: "2027-04-13",
    end_date: "2027-04-20",
    travelers: [{ first_name: "Raphaël", last_name: "Boukris" }],
    items: [
      {
        kind: "flight" as const,
        title: "Nice → Dubaï",
        supplier: "Emirates",
        confirmation_ref: "KDP4AS",
        start_at: start,
        end_at: null,
        amount: 1200,
        details: { flight_number: "EK 78", pnr: "KDP4AS", document_amount: 1200, passengers: [{ first_name: "Raphaël", last_name: "Boukris" }] },
      },
    ],
  };
}

function hotel() {
  return {
    document_status: "confirmed" as const,
    start_date: "2027-04-13",
    end_date: "2027-04-20",
    travelers: [{ first_name: "Raphaël", last_name: "Boukris" }],
    items: [
      {
        kind: "hotel" as const,
        title: "Ocean Park",
        supplier: "Expedia",
        confirmation_ref: "HTL99881",
        start_at: "2027-04-13",
        end_at: "2027-04-20",
        amount: 800,
        details: { hotel_name: "Ocean Park", document_amount: 800, rooms: [{ guests: "Raphaël Boukris" }] },
      },
    ],
  };
}

describe("création automatique d’un séjour", () => {
  it("ouvre un dossier caché pour un client unique sans séjour", () => {
    const created = decideStayAutoCreate(flight() as never, [client], { receivedAt: "2027-04-01" });
    assert.deepEqual(created, { customerId: "c-raphael" });
    const stay = decideStayAutoCreate(hotel() as never, [client], { receivedAt: "2027-04-01" });
    assert.equal(stay?.customerId, "c-raphael");
  });

  it("ne crée pas si le client est ambigu, inconnu, annulé, passé ou d’exemple", () => {
    const other = { ...client, customer_id: "c-autre", label: "Autre" };
    assert.equal(decideStayAutoCreate(flight() as never, [client, other], { receivedAt: "2027-04-01" }), null);
    assert.equal(decideStayAutoCreate(flight() as never, [], { receivedAt: "2027-04-01" }), null);
    assert.equal(
      decideStayAutoCreate({ ...flight(), document_status: "cancelled" } as never, [client], { receivedAt: "2027-04-01" }),
      null
    );
    assert.equal(decideStayAutoCreate(flight("2026-01-01T10:00:00") as never, [client], { receivedAt: "2027-04-01" }), null);
    const sample = flight();
    sample.items[0].confirmation_ref = "ABC123";
    sample.items[0].details.pnr = "ABC123";
    assert.equal(decideStayAutoCreate(sample as never, [client], { receivedAt: "2027-04-01" }), null);
    const le = hotel();
    le.items[0].details = { ...le.items[0].details, source_family: "little_emperors", state: "cancelled" } as never;
    assert.equal(decideStayAutoCreate(le as never, [client], { receivedAt: "2027-04-01" }), null);
  });

  it("rattache au dossier du même séjour au lieu d’en ouvrir un second", () => {
    const dossier = {
      booking_id: "b-0204",
      customer_id: "c-raphael",
      score: 88,
      reason: "Même séjour",
      start_date: "2027-04-13",
      end_date: "2027-04-20",
      covers_passengers: true,
    };
    const decision = decideStayAutoAttach(hotel() as never, [client, dossier], { receivedAt: "2027-04-01" });
    assert.equal(decision?.bookingId, "b-0204");
    assert.equal(decideStayAutoCreate(hotel() as never, [client, dossier], { receivedAt: "2027-04-01" }), null);
    const byPnr = {
      booking_id: "b-0204",
      customer_id: "c-raphael",
      score: 90,
      reason: "Référence fournisseur",
    };
    assert.equal(decideStayAutoAttach(flight() as never, [client, byPnr], { receivedAt: "2027-04-01" })?.bookingId, "b-0204");
  });

  it("crée si le même client a déjà un séjour vers la même ville, à d’autres dates", () => {
    const elsewhere = {
      booking_id: "b-juin",
      customer_id: "c-raphael",
      score: 80,
      reason: "Même client, même destination",
      label: "TB — Dubaï",
      start_date: "2026-06-01",
      end_date: "2026-06-08",
    };
    assert.deepEqual(
      decideStayAutoCreate(flight() as never, [client, elsewhere], { receivedAt: "2027-04-01" }),
      { customerId: "c-raphael" }
    );
    const near = { ...elsewhere, booking_id: "b-mai", start_date: "2027-05-02", end_date: "2027-05-09" };
    assert.equal(decideStayAutoCreate(flight() as never, [client, near], { receivedAt: "2027-04-01" }), null);
  });

  it("ouvre le dossier du titulaire pour le billet d’un accompagnant", () => {
    const holder = {
      id: "c-raphael",
      first_name: "Raphaël",
      last_name: "Fettaya",
      company_name: null,
      email: "raphael@example.com",
    };
    const ticket = flight();
    ticket.travelers = [{ first_name: "Noémie", last_name: "Becache" }];
    ticket.items[0].details.passengers = [{ first_name: "Noémie", last_name: "Becache" }];
    const matched = suggestCustomerFromExtract([holder], ticket as never, [
      { id: "comp-noe", customer_id: "c-raphael", first_name: "Noémie", last_name: "Becache" },
    ]);
    assert.equal(matched.candidates[0]?.reason, "Accompagnant de Raphaël Fettaya");
    assert.deepEqual(decideStayAutoCreate(ticket as never, matched.candidates, { receivedAt: "2027-04-01" }), {
      customerId: "c-raphael",
    });
  });

  it("crée pour un prénom exact malgré un nom partagé, et rien pour un homonyme complet", () => {
    const family = [
      { id: "amin", first_name: "Amin", last_name: "Khiari", company_name: null, email: "amin@example.com" },
      { id: "tahar", first_name: "Tahar", last_name: "Khiari", company_name: null, email: "tahar@example.com" },
    ];
    const amin = flight();
    amin.travelers = [{ first_name: "Amin", last_name: "Khiari" }];
    const shared = suggestCustomerFromExtract(family, amin as never);
    assert.equal(shared.candidates.find((row) => row.customer_id === "amin")?.score, 92);
    assert.equal(
      decideStayAutoCreate(amin as never, shared.candidates, { receivedAt: "2027-04-01" })?.customerId,
      "amin"
    );
    const twins = [
      { id: "a", first_name: "Amin", last_name: "Khiari", company_name: null, email: "a@example.com" },
      { id: "b", first_name: "Amin", last_name: "Khiari", company_name: null, email: "b@example.com" },
    ];
    const homonym = suggestCustomerFromExtract(twins, amin as never);
    assert.equal(homonym.autoCustomerId, null);
    assert.equal(decideStayAutoCreate(amin as never, homonym.candidates, { receivedAt: "2027-04-01" }), null);
  });

  it("rattache le second billet du même PNR, une carte par trajet avec les deux voyageurs", () => {
    const holder = {
      id: "c-raphael",
      first_name: "Raphaël",
      last_name: "Fettaya",
      company_name: null,
      email: "raphael@example.com",
    };
    const segment = (number: string, at: string, first: string, last: string, title: string) => ({
      kind: "flight" as const,
      title,
      supplier: "Ethiopian",
      confirmation_ref: "LQ7M2P",
      start_at: at,
      end_at: null,
      amount: 900,
      details: { flight_number: number, pnr: "LQ7M2P", passengers: [{ first_name: first, last_name: last }] },
    });
    const ticket = (first: string, last: string) => ({
      document_status: "confirmed" as const,
      start_date: "2026-12-16",
      end_date: "2026-12-21",
      travelers: [{ first_name: first, last_name: last }],
      items: [
        segment("ET 800", "2026-12-16T22:00:00", first, last, "Tel Aviv → Addis-Abeba"),
        segment("ET 901", "2026-12-17T08:00:00", first, last, "Addis-Abeba → Lagos"),
      ],
    });
    const first = ticket("Raphaël", "Fettaya");
    const matched = suggestCustomerFromExtract([holder], first as never);
    assert.deepEqual(decideStayAutoCreate(first as never, matched.candidates, { receivedAt: "2026-12-01" }), {
      customerId: "c-raphael",
    });
    const second = ticket("Noémie", "Becache");
    const byPnr = suggestBookingByReference(
      second as never,
      [
        {
          id: "b-lagos",
          customer_id: "c-raphael",
          reference: "TB-2026-0400",
          title: "Lagos",
          destination: "Lagos",
          status: "draft",
        },
      ],
      new Map([
        [
          "b-lagos",
          [
            { confirmation_ref: "LQ7M2P", details: { pnr: "LQ7M2P", flight_number: "ET 800" } },
            { confirmation_ref: "LQ7M2P", details: { pnr: "LQ7M2P", flight_number: "ET 901" } },
          ],
        ],
      ])
    );
    assert.equal(byPnr.autoBookingId, "b-lagos");
    const companion = suggestCustomerFromExtract([holder], second as never, [
      { id: "comp-noe", customer_id: "c-raphael", first_name: "Noémie", last_name: "Becache" },
    ]);
    const candidates = [
      ...companion.candidates,
      {
        booking_id: "b-lagos",
        customer_id: "c-raphael",
        score: 90,
        reason: "Référence fournisseur",
        label: "TB-2026-0400 — Lagos",
      },
    ];
    assert.equal(
      decideStayAutoAttach(second as never, candidates, { receivedAt: "2026-12-01" })?.bookingId,
      "b-lagos"
    );
    assert.equal(decideStayAutoCreate(second as never, candidates, { receivedAt: "2026-12-01" }), null);
    const summed = sumFlightTicketCounts(
      second,
      [
        segment("ET 800", "2026-12-16T22:00:00", "Raphaël", "Fettaya", "Tel Aviv → Addis-Abeba"),
        segment("ET 901", "2026-12-17T08:00:00", "Raphaël", "Fettaya", "Addis-Abeba → Lagos"),
      ],
      "mail-noemie"
    );
    assert.equal(summed.items?.length, 2);
    for (const item of summed.items || []) {
      const names = ((item.details as { passengers?: { first_name?: string }[] }).passengers || []).map(
        (row) => row.first_name
      );
      assert.deepEqual(names, ["Raphaël", "Noémie"]);
    }
  });

  it("la création est cachée, au prix de vente 0, journal auto_create, sans invitation", () => {
    const run = readFileSync(new URL("./email-stay-open-run.ts", import.meta.url), "utf8");
    assert.match(run, /auditAction: "auto_create"/);
    assert.match(run, /IMPORT_AUTO_NOTE/);
    assert.match(run, /visibleToClient: false/);
    assert.match(run, /amount: 0/);
    assert.equal(run.includes("inviteCustomer"), false);
    assert.equal(run.includes("createCustomer"), false);
  });
});
