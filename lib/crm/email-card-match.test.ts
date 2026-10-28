import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchEmailToCard, type EmailCardRef, type EmailMention } from "./email-card-match";

function flight(partial: Partial<EmailCardRef> & { id: string }): EmailCardRef {
  return { kind: "flight", lifecycle: "active", supplier: "Arkia", ...partial };
}

const outbound = flight({
  id: "out",
  confirmation_ref: "14028540",
  start_at: "2026-11-02T08:00:00",
  supplier: "Arkia",
  details: { pnr: "14028540", airline: "Arkia", airline_iata: "IZ", flight_number: "IZ611", from: "TLV", to: "CDG" },
});

const inbound = flight({
  id: "back",
  confirmation_ref: "14028540",
  start_at: "2026-11-09T14:00:00",
  supplier: "Arkia",
  details: { pnr: "14028540", airline: "Arkia", airline_iata: "IZ", flight_number: "IZ612", from: "CDG", to: "TLV" },
});

const hollow = flight({
  id: "hollow",
  confirmation_ref: null,
  supplier: null,
  start_at: null,
  details: { needs_review: true },
});

describe("pièces du mail sur la carte qui correspond", () => {
  it("le PNR 14028540 retrouve IZ611, pas une carte vide", () => {
    const mention: EmailMention = {
      kind: "flight",
      supplier: "Arkia",
      confirmation_ref: "14028540",
      details: { pnr: "14028540", airline: "Arkia", from: "TLV", to: "CDG", flight_number: "IZ611" },
    };
    assert.equal(matchEmailToCard([hollow, inbound, outbound], [mention]), "out");
  });

  it("aller et retour du même PNR : une seule carte, la plus tôt", () => {
    const mentions: EmailMention[] = [
      { kind: "flight", confirmation_ref: "14028540", details: { from: "TLV", to: "CDG", airline_iata: "IZ", flight_number: "IZ611" } },
      { kind: "flight", confirmation_ref: "14028540", details: { from: "CDG", to: "TLV", airline_iata: "IZ", flight_number: "IZ612" } },
    ];
    assert.equal(matchEmailToCard([inbound, outbound, hollow], mentions), "out");
  });

  it("sans PNR, la compagnie et le trajet suffisent", () => {
    const mention: EmailMention = {
      kind: "flight",
      supplier: "Arkia",
      details: { airline: "Arkia", airline_iata: "IZ", flight_number: "IZ612", from: "CDG", to: "TLV" },
    };
    const bare = flight({
      id: "bare",
      confirmation_ref: null,
      supplier: "Arkia",
      details: { airline: "Arkia", airline_iata: "IZ", flight_number: "IZ612", from: "CDG", to: "TLV" },
    });
    assert.equal(matchEmailToCard([outbound, bare], [mention]), "bare");
  });

  it("sans trajet, le fournisseur seul s’il n’y a qu’une carte", () => {
    const mention: EmailMention = { kind: "flight", supplier: "Arkia", details: {} };
    assert.equal(matchEmailToCard([outbound], [mention]), "out");
  });

  it("deux fournisseurs Arkia sans PNR commun : les pièces restent sur le dossier", () => {
    const other = flight({
      id: "other",
      confirmation_ref: "99999999",
      supplier: "Arkia",
      details: { pnr: "99999999", airline: "Arkia", from: "CDG", to: "ATH" },
    });
    const mention: EmailMention = { kind: "flight", supplier: "Arkia", details: {} };
    assert.equal(matchEmailToCard([outbound, other], [mention]), null);
  });

  it("rien qui corresponde : le dossier, pas une carte nouvelle", () => {
    const mention: EmailMention = {
      kind: "flight",
      supplier: "El Al",
      confirmation_ref: "ABCDE1",
      details: { pnr: "ABCDE1", airline: "El Al", from: "TLV", to: "JFK" },
    };
    assert.equal(matchEmailToCard([outbound, inbound, hollow], [mention]), null);
  });
});
