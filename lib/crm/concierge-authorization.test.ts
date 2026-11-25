import assert from "node:assert/strict";
import test from "node:test";
import { conciergeBrief, planConciergeTurn, type ConciergeDossier } from "./whatsapp-concierge";
import { authorizationBriefLine, planAuthorizationReply, replyClaimsEmptyPromise } from "./concierge-authorization";

const ROW = {
  bookingId: "stay-1",
  travelerId: "trav-1",
  traveler: "Michael",
  kind: "esta" as const,
  status: "approuve",
  validUntil: "2027-03-26",
  checkedAt: "2026-11-25T10:00:00Z",
};

function dossier(): ConciergeDossier {
  return {
    firstName: "Michael",
    preferences: [],
    language: "fr",
    stays: [
      {
        id: "stay-1",
        reference: "TB-2026-0261",
        title: "New York",
        destination: "New York",
        startDate: "2026-12-01",
        endDate: "2026-12-08",
        totalAmount: null,
        currency: "EUR",
        notesClient: null,
        cover: null,
        shareCode: null,
        items: [],
        documents: [],
        formalities: [],
      },
    ],
    documents: [],
    movements: [],
    balances: [],
    authorizations: [ROW],
  };
}

test("le brief donne le statut ESTA sans numéro", () => {
  const line = authorizationBriefLine(ROW);
  assert.match(line, /ESTA de Michael : approuvé, valable jusqu’au 26\/03\/2027, contrôlé le 25\/11\/2026/);
  const brief = conciergeBrief(dossier(), new Date("2026-11-25T12:00:00Z"));
  assert.match(brief, /ESTA de Michael/);
  assert.equal(/\d{6,}/.test(line), false);
  assert.equal(/application/i.test(brief), false);
  assert.equal(brief.includes("12AB34567"), false);
});

test("un statut déjà connu se dit, une mise à jour lance le contrôle", () => {
  const known = planAuthorizationReply("Vérifie si mon ESTA est autorisé", [ROW], "stay-1");
  assert.match(known?.text || "", /approuvée, valable jusqu’au 26\/03\/2027/);
  assert.equal(known?.check, null);
  assert.deepEqual(known?.tools, ["lire_autorisation"]);
  assert.equal(replyClaimsEmptyPromise(known?.text || ""), false);

  const refresh = planConciergeTurn("Mets à jour mon ESTA", dossier(), new Date("2026-11-25T12:00:00Z"));
  assert.match(refresh.text, /je lance la vérification/i);
  assert.equal(refresh.authorizationCheck?.kind, "esta");
  assert.equal(refresh.authorizationCheck?.travelerId, "trav-1");
  assert.deepEqual(refresh.tools, ["verifier_esta"]);
  assert.equal(refresh.handoff, null);
});

test("le filet reconnaît une promesse vide et laisse le coffre", () => {
  assert.equal(replyClaimsEmptyPromise("Je vérifie le statut de votre ESTA et je vous fais un retour."), true);
  assert.equal(replyClaimsEmptyPromise("Votre demande de mise à jour de l'ESTA est enregistrée."), true);
  assert.equal(replyClaimsEmptyPromise("C’est enregistré."), true);
  assert.equal(replyClaimsEmptyPromise("La pièce est ajoutée au dossier."), true);
  assert.equal(replyClaimsEmptyPromise("Votre pièce est enregistrée dans votre coffre."), false);
  assert.equal(replyClaimsEmptyPromise("Je lance la vérification de votre ESTA."), false);
  assert.equal(replyClaimsEmptyPromise("Souhaitez-vous que j’en parle à Benjamin ?"), false);
});
