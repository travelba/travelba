import assert from "node:assert/strict";
import test from "node:test";
import {
  agencyAttentionLines,
  departures72hEnd,
  missingPassportCards,
  travelersMissingPassport,
} from "./admin-now";

test("le briefing suit l’ordre du travail et cache les zéros", () => {
  const lines = agencyAttentionLines({
    pendingMessages: 2,
    conciergeRequests: 1,
    departures72h: 3,
    missingDocuments: 0,
    importToReview: 4,
  });
  assert.deepEqual(
    lines.map((line) => line.id),
    ["pending-messages", "concierge-requests", "departures-72h", "import-review"]
  );
  assert.equal(lines[0].label, "2 messages à envoyer");
  assert.equal(lines[0].href, "/admin/whatsapp?vue=valider");
  assert.equal(lines[1].href, "/admin/whatsapp?filtre=escalade");
  assert.equal(lines[2].label, "3 départs sous 72 h");
  assert.equal(lines[2].href, "/admin/reservations?etat=a-venir&sous=72h");
  assert.equal(lines[3].label, "4 imports à valider");
  assert.equal(departures72hEnd("2026-10-24"), "2026-10-26");
});

test("un passeport de coffre couvre le titulaire, pas un autre voyageur", () => {
  const travelers = [
    { id: "t1", bookingId: "b1", companionId: null, holder: true },
    { id: "t2", bookingId: "b1", companionId: "c2", holder: false },
  ];
  const missing = travelersMissingPassport(
    travelers,
    [{ travelerId: null, companionId: null, bookingId: null, customerId: "client" }],
    { b1: "client" }
  );
  assert.deepEqual(
    missing.map((row) => row.id),
    ["t2"]
  );
  const cards = missingPassportCards(missing, [{ id: "b1", reference: "TB-1", place: "Tel Aviv" }], { t2: "Inès" });
  assert.equal(cards[0].label, "Inès · TB-1 · Tel Aviv");
  assert.match(JSON.stringify(cards), /TB-1/);
  assert.doesNotMatch(JSON.stringify(cards), /\d{6,}/);
});
