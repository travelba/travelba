import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanClientPath,
  clientPathSummary,
  companionActivitySummary,
  documentActivitySummary,
  formalitiesActivitySummary,
  payActivitySummary,
  openedStaySummary,
  pieceActivityDetail,
  profileActivityDetail,
  profileActivitySummary,
  stayActivityDetail,
  stayMention,
  serviceActivitySummary,
  shareActivitySummary,
  shouldRecordView,
  visaActivitySummary,
} from "./customer-activity";

test("une page client a un libellé, un chemin étranger n’en a pas", () => {
  assert.equal(clientPathSummary("/mon-compte"), "A ouvert l’accueil");
  assert.equal(clientPathSummary("/mon-compte/"), "A ouvert l’accueil");
  assert.equal(clientPathSummary("/mon-compte/profil/documents"), "A ouvert ses pièces");
  assert.equal(clientPathSummary("/mon-compte/reservations/TB-2026-0055"), "A ouvert le séjour TB-2026-0055");
  assert.equal(clientPathSummary("/mon-compte/reservations/TB-2026-0055?x=1"), "A ouvert le séjour TB-2026-0055");
  assert.equal(clientPathSummary("/admin"), null);
  assert.equal(cleanClientPath("/mon-compte/../admin"), null);
});

test("la fiche dit les champs touchés, et le détail donne les valeurs sauf l’IBAN", () => {
  assert.equal(
    profileActivitySummary(["phone", "address_line", "city", "iban"]),
    "A mis à jour sa fiche : téléphone, IBAN, adresse"
  );
  const detail = profileActivityDetail(
    { phone: "+33601020304", address_line: "12 rue de Rivoli", postal_code: "75001", city: "Paris", iban: "FR761234" },
    true
  );
  assert.match(detail || "", /\+33601020304/);
  assert.match(detail || "", /12 rue de Rivoli/);
  assert.match(detail || "", /IBAN modifié/);
  assert.equal((detail || "").includes("FR761234"), false);
  assert.equal(profileActivitySummary([]), "A mis à jour sa fiche");
});

test("les pièces et les voyageurs se lisent sans numéro de document", () => {
  assert.equal(documentActivitySummary("add", "passport"), "A ajouté un passeport");
  assert.equal(documentActivitySummary("add", "id_card"), "A ajouté une carte d’identité");
  assert.equal(documentActivitySummary("scan"), "A lancé la lecture d’une pièce");
  assert.equal(documentActivitySummary("scan", "passport"), "A lancé la lecture d’un passeport");
  assert.equal(
    pieceActivityDetail({
      first_name: "Olga Eve",
      last_name: "Deddouch",
      issuing_country: "IL",
      expires_on: "2036-06-10",
    }),
    "Olga Eve Deddouch · Israël · expire le 10 juin 2036"
  );
  assert.equal(
    pieceActivityDetail({ first_name: "Ada", last_name: "Martin", issuing_country: "FR" })?.includes("12AB"),
    false
  );
  assert.equal(documentActivitySummary("remove"), "A retiré une pièce");
  assert.equal(companionActivitySummary("add", "Marie Martin"), "A ajouté le voyageur Marie Martin");
  assert.equal(companionActivitySummary("remove", ""), "A retiré un voyageur");
});

test("un service, un règlement et une formalité nomment le séjour", () => {
  assert.equal(
    serviceActivitySummary({ change: "ask", kind: "chauffeur", leg: "departure", reference: "TB-1" }),
    "A demandé un transfert à l’aller sur le séjour TB-1"
  );
  assert.equal(
    serviceActivitySummary({ change: "decline", kind: "greeter", leg: "arrival", reference: "TB-1" }),
    "A refusé un accueil VIP au retour sur le séjour TB-1"
  );
  assert.equal(payActivitySummary("revolut", "personal"), "A demandé un virement pour l’encours particulier");
  assert.equal(payActivitySummary("card", "company"), "A commencé un règlement par carte de l’encours société");
  assert.equal(visaActivitySummary("TB-1", "IL"), "A validé la formalité pour Israël sur le séjour TB-1");
  assert.equal(formalitiesActivitySummary("TB-1"), "A envoyé des pièces de formalité pour le séjour TB-1");
  assert.equal(shareActivitySummary("Léa"), "A envoyé le lien du séjour à Léa");
});

test("un geste de séjour porte toujours son nom", () => {
  assert.equal(stayMention("TB-2026-0055", null, "Tel-Aviv"), "Tel-Aviv (TB-2026-0055)");
  assert.equal(stayMention("TB-2026-0055", "40 ans", "Dinant"), "40 ans (TB-2026-0055)");
  assert.equal(openedStaySummary("TB-2026-0055", null, "Tel-Aviv"), "A ouvert le séjour Tel-Aviv (TB-2026-0055)");
  assert.equal(
    serviceActivitySummary({
      change: "ask",
      kind: "chauffeur",
      leg: "departure",
      reference: "TB-1",
      destination: "Tel-Aviv",
    }),
    "A demandé un transfert à l’aller sur le séjour Tel-Aviv (TB-1)"
  );
  assert.equal(
    shareActivitySummary("Léa", stayMention("TB-1", null, "Tel-Aviv")),
    "A envoyé le lien du séjour Tel-Aviv (TB-1) à Léa"
  );
  assert.equal(
    documentActivitySummary("add", "passport", "Tel-Aviv (TB-1)"),
    "A ajouté un passeport sur le séjour Tel-Aviv (TB-1)"
  );
  assert.equal(
    stayActivityDetail({
      destination: "Tel-Aviv",
      start: "2026-10-12",
      end: "2026-10-18",
      shown: "Tel-Aviv",
    }),
    "12 — 18 Octobre 2026"
  );
  assert.equal(
    stayActivityDetail({
      title: "40 ans",
      destination: "Dinant",
      start: "2026-10-12",
      end: "2026-10-18",
      shown: "40 ans",
    }),
    "Dinant · 12 — 18 Octobre 2026"
  );
  assert.equal(
    stayActivityDetail({ destination: "Tel-Aviv", start: "2026-10-12", end: "2026-10-18" }),
    "Tel-Aviv · 12 — 18 Octobre 2026"
  );
});

test("la même page revue tout de suite ne se réécrit pas", () => {
  const now = new Date("2026-10-06T09:20:00.000Z");
  assert.equal(shouldRecordView(null, now), true);
  assert.equal(shouldRecordView("2026-10-06T09:19:00.000Z", now), false);
  assert.equal(shouldRecordView("2026-10-06T09:17:00.000Z", now), true);
});
