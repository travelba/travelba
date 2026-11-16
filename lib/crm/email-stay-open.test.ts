import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
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
