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

  it("lit le numéro de réservation Transavia, les deux vols et les passagers", () => {
    const read = parseTicketMail(`
      Confirmation Transavia
      Numéro de réservation: NHN3QN
      15-04-2027 TO 3458 12:10 Paris (Orly) (ORY) 17:45 Tel Aviv
      30-04-2027 TO 3451 13:35 Tel Aviv (TLV) 17:40 Paris (Orly)
      Passagers
      LEA MARTIN | Basic
      PAUL MARTIN | Basic
      ANNE MARTIN | Basic
      NOAH MARTIN | Basic
      LUCIE MARTIN | Basic
      Total des services additionnels
      Total 2391.01 €
    `);
    assert.equal(read.pnr, "NHN3QN");
    assert.equal(read.passengers?.length, 5);
    assert.equal(read.segments?.length, 2);
    assert.equal(read.segments?.[0]?.flightNumber.replace(/\s/g, ""), "TO3458");
    assert.equal(read.segments?.[0]?.from, "ORY");
    assert.equal(read.segments?.[0]?.to, "TLV");
    assert.equal(read.segments?.[0]?.departureAt, "2027-04-15T12:10:00");
    assert.equal(read.segments?.[1]?.flightNumber.replace(/\s/g, ""), "TO3451");
    assert.equal(read.price, 2391.01);
    assert.equal(read.currency, "EUR");
    assert.equal(parseTicketMail("Booking number: ABC123. Total 10,00 EUR.").pnr, "ABC123");
    assert.equal(parseTicketMail("Code de réservation ZZ9ZZ9").pnr, "ZZ9ZZ9");
  });

  it("ne recopie pas le total du billet dans le prix de vente", () => {
    const patch = ticketFlightPatch(
      { confirmation_ref: null, amount: null, details: {} },
      parseTicketMail("PNR ABC123. Total 420,00 EUR.")
    );
    assert.equal(patch.amount, undefined);
    assert.equal(patch.details.document_amount, 420);
    assert.equal(patch.details.document_currency, "EUR");
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
