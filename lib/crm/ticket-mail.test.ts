import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emlToText, parseTicketMail, ticketFlightPatch } from "./ticket-mail";

describe("e-mail de billet", () => {
  it("lit le PNR, le billet, le passager et le prix", () => {
    const read = parseTicketMail(
      "Référence du dossier ABC123. Passager LOVELACE/ADA. Billet 057-2123456789. Total : 420,00 EUR."
    );
    assert.equal(read.pnr, "ABC123");
    assert.equal(read.ticketNumber, "0572123456789");
    assert.deepEqual(read.passenger, { firstName: "Ada", lastName: "Lovelace" });
    assert.equal(read.price, 420);
    assert.equal(read.currency, "EUR");
  });

  it("ignore un code agence à huit chiffres", () => {
    const read = parseTicketMail("PNR 20287864. Total 10,00 EUR.");
    assert.equal(read.pnr, null);
  });

  it("déplie le texte d’un .eml", () => {
    const text = emlToText(
      "Content-Type: text/plain; charset=utf-8\n\nR=C3=A9f=C3=A9rence du dossier XYZ789\n"
    );
    assert.match(text, /Référence du dossier XYZ789/);
  });

  it("met à jour le vol sans écraser un prix déjà saisi", () => {
    const patch = ticketFlightPatch(
      { confirmation_ref: null, amount: 500, details: { passengers: [{ first_name: "Ada", last_name: "Lovelace" }] } },
      parseTicketMail("PNR ABC123. Ticket 0572123456789. Passenger Ada Lovelace. Total 420.00 EUR.")
    );
    assert.equal(patch.confirmation_ref, "ABC123");
    assert.equal(patch.amount, undefined);
    assert.equal(patch.details.ticket_number, "0572123456789");
    assert.equal(patch.details.pnr, "ABC123");
    assert.equal(patch.details.document_amount, 420);
  });
});
