import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { decideFlightAutoAttach, planFlightDeposit, sumFlightTicketCounts } from "./email-flight-deposit";

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
    assert.match(ingest, /autoAttachMatchedFlight/);
    assert.match(ingest, /decideFlightAutoAttach/);
    assert.equal(ingest.includes("inviteCustomer"), false);
    assert.equal(ingest.includes("visibleToClient: true"), false);
    assert.equal(ingest.includes("notifyStayPublished"), false);
    const run = readFileSync(new URL("./email-flight-deposit-run.ts", import.meta.url), "utf8");
    assert.match(run, /visibleToClient: false/);
    assert.match(run, /skipTicketingFee: true/);
    assert.match(run, /auto_attach/);
    assert.equal(run.includes("inviteCustomer"), false);
    assert.equal(run.includes("notifyStayPublished"), false);
    assert.equal(run.includes("envoyer"), false);
  });
});
