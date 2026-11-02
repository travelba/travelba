import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizePieceKind } from "./concierge-notices";
import { whatsappCatalog } from "./whatsapp-catalog";
import {
  BOARDING_PASS_KIND,
  BOARDING_PASS_SAMPLE_NAME,
  BOARDING_PASS_SAMPLE_PATH,
  BOARDING_PASS_SEND_MODE,
  boardingPassChannelBlock,
  boardingPassContentDisposition,
  boardingPassContentDrafts,
  boardingPassContentVariables,
  boardingPassDownloadHeaders,
  boardingPassDraftBody,
  boardingPassFields,
  boardingPassFileName,
  boardingPassJournal,
  boardingPassPreview,
  boardingPassTemplateForCount,
  checkinAirportPreview,
  checkinJournal,
  suggestBoardingPass,
} from "./boarding-pass-whatsapp";
import { boardingPassSignedPath, verifyBoardingPassToken } from "./boarding-pass-link";

const DOC = "11111111-1111-4111-8111-111111111111";

function separated(body: string) {
  const trimmed = body.trim();
  assert.equal(/^\{\{/.test(trimmed), false, body);
  assert.equal(/\}\}$/.test(trimmed), false, body);
  assert.equal(/\{\{\d+\}\}(?:\s|[,:;.])*\{\{\d+\}\}/.test(body), false, body);
}

test("les modèles sont en français, avec un PDF en en-tête document", () => {
  const drafts = boardingPassContentDrafts();
  assert.equal(drafts.length, 3);
  assert.equal(new Set(drafts.map((row) => row.create.language)).size, 1);
  assert.equal(drafts[0].create.language, "fr");
  for (const draft of drafts) separated(boardingPassDraftBody(draft.template) || "");
  const single = drafts[0].create.types;
  assert.ok("twilio/media" in single);
  assert.match(single["twilio/media"].media[0], /\/api\/whatsapp\/cartes\/\{\{1\}\}$/);
  assert.equal(drafts[0].create.variables["1"], BOARDING_PASS_SAMPLE_PATH);
  assert.match(BOARDING_PASS_SAMPLE_PATH, /\.pdf$/);
  const group = drafts[1].create.types;
  assert.ok("twilio/media" in group);
  assert.equal(group["twilio/media"].media.length, 1);
  const airport = drafts[2].create.types;
  assert.ok("twilio/text" in airport);
  assert.equal(airport["twilio/text"].body.includes("aéroport"), true);
  assert.equal("twilio/media" in airport, false);
  assert.equal(BOARDING_PASS_SEND_MODE, "un message par pdf");
});

test("une carte ou plusieurs : un message par PDF, le modèle change", () => {
  assert.equal(boardingPassTemplateForCount(0), null);
  assert.equal(boardingPassTemplateForCount(1), "carte_embarquement");
  assert.equal(boardingPassTemplateForCount(3), "cartes_embarquement");
});

test("le nom de fichier reprend le voyageur et le vol, sans numéro de pièce", () => {
  assert.equal(
    boardingPassFileName({ lastName: "Levy", firstName: "Meryl", flight: "AF 1234" }),
    "Carte embarquement LEVY Meryl AF1234.pdf"
  );
  assert.equal(boardingPassFileName({ lastName: "Lévy", firstName: "Meryl", flight: "AF1234" }), "Carte embarquement LEVY Meryl AF1234.pdf");
  assert.equal(boardingPassFileName({ lastName: "AB3456789", firstName: "Meryl", flight: "AF1234" }), null);
  const headers = boardingPassDownloadHeaders("Carte embarquement LEVY Meryl AF1234.pdf");
  assert.equal(headers["Content-Type"], "application/pdf");
  assert.match(headers["Content-Disposition"], /filename="Carte embarquement LEVY Meryl AF1234.pdf"/);
  assert.match(boardingPassContentDisposition("Carte embarquement LEVY Meryl AF1234.pdf"), /filename\*=UTF-8''Carte%20embarquement%20LEVY%20Meryl%20AF1234.pdf/);
});

test("l’aperçu et les variables refusent un siège qui est un numéro de passeport", () => {
  const fields = boardingPassFields({
    firstName: "Meryl",
    lastName: "Levy",
    flight: "AF 1234",
    route: "Paris → Tel Aviv",
    when: "12 oct. 2026 à 11h20",
    seat: "12A",
  });
  assert.ok(fields);
  const preview = boardingPassPreview("carte_embarquement", fields);
  assert.match(preview || "", /Bonjour Meryl/);
  assert.match(preview || "", /AF 1234/);
  assert.match(preview || "", /siège 12A/);
  assert.equal(preview?.includes("{{"), false);
  assert.equal(
    boardingPassFields({ ...fields, seat: "AB3456789" }),
    null
  );
  const variables = boardingPassContentVariables("exemple/carte.pdf", fields);
  assert.equal(variables?.["1"], "exemple/carte.pdf");
  assert.equal(boardingPassContentVariables("https://evil.example/a.pdf", fields), null);
});

test("le journal ne contient ni passeport, ni lien, ni chemin", () => {
  const row = boardingPassJournal({
    names: ["Meryl"],
    flight: "AF 1234",
    route: "Paris → Tel Aviv AB3456789",
    count: 1,
  });
  const blob = JSON.stringify(row);
  assert.equal(blob.includes("AB3456789"), false);
  assert.equal(blob.includes("http"), false);
  assert.equal(blob.includes("storage"), false);
  assert.match(row.summary, /Carte d’embarquement envoyée · Meryl · AF 1234/);
  const airport = checkinJournal({
    firstName: "Meryl",
    flight: "AF1234",
    route: "Paris → Tel Aviv",
    situation: "comptoir",
  });
  assert.match(airport.summary, /à terminer à l’aéroport/);
  assert.equal(JSON.stringify(airport).includes("+33"), false);
});

test("le message d’échec ne joint pas de PDF et reste en français", () => {
  const text = checkinAirportPreview({
    firstName: "Meryl",
    flight: "AF 1234",
    route: "Paris → Tel Aviv",
    when: "12 oct. 2026 à 11h20",
    situation: "echec",
  });
  assert.match(text || "", /enregistrement en ligne a échoué/);
  assert.match(text || "", /comptoir de la compagnie/);
  assert.equal(text?.includes("http"), false);
  const comptoir = checkinAirportPreview({
    firstName: "Meryl",
    flight: "AF 1234",
    route: "Paris → Tel Aviv",
    when: "12 oct. 2026 à 11h20",
    situation: "comptoir",
  });
  assert.match(comptoir || "", /terminer au comptoir/);
});

test("la proposition reprend le vol et le siège déjà connus, pas un siège inventé pour le groupe", () => {
  const item = {
    id: "flight-1",
    booking_id: "b",
    kind: "flight" as const,
    title: "Paris → Tel Aviv",
    supplier: "Air France",
    confirmation_ref: null,
    start_at: "2026-10-12T11:20:00",
    end_at: null,
    amount: null,
    include_in_ledger: true,
    sort_order: 0,
    details: {
      flight_number: "AF 1234",
      city_from: "Paris",
      city_to: "Tel Aviv",
      from: "CDG",
      to: "TLV",
      seat: "12A",
      passengers: [{ first_name: "Meryl", last_name: "Levy" }],
    },
    visible_to_client: true,
    source_document_id: null,
    created_at: "",
    updated_at: "",
  };
  const one = suggestBoardingPass({
    doc: {
      id: DOC,
      kind: BOARDING_PASS_KIND,
      file_name: "levy.pdf",
      booking_item_id: "flight-1",
      mime_type: "application/pdf",
    },
    items: [item],
    travelers: [],
  });
  assert.equal(one.firstName, "Meryl");
  assert.equal(one.lastName, "Levy");
  assert.equal(one.flight, "AF 1234");
  assert.equal(one.route, "Paris → Tel Aviv");
  assert.match(one.when, /11h20/);
  assert.equal(one.seat, "12A");

  const group = suggestBoardingPass({
    doc: {
      id: DOC,
      kind: BOARDING_PASS_KIND,
      file_name: "cartes.pdf",
      booking_item_id: "flight-1",
      mime_type: "application/pdf",
    },
    items: [
      {
        ...item,
        details: {
          ...item.details,
          passengers: [
            { first_name: "Meryl", last_name: "Levy" },
            { first_name: "Paul", last_name: "Levy" },
          ],
        },
      },
    ],
    travelers: [],
  });
  assert.equal(group.seat, "");
  assert.equal(group.firstName, "");
});

test("montrer la carte au client ne prépare pas un message de pièce", () => {
  assert.equal(normalizePieceKind(BOARDING_PASS_KIND), null);
  assert.equal(normalizePieceKind("flight"), "flight");
});

test("rien ne part sans téléphone accepté", () => {
  assert.match(boardingPassChannelBlock({ phone: "", optInAt: "2026-01-01" }) || "", /téléphone/);
  assert.match(boardingPassChannelBlock({ phone: "+33600000000", optInAt: null }) || "", /accepté/);
  assert.equal(boardingPassChannelBlock({ phone: "+33600000000", optInAt: "2026-01-01", optOutAt: "2026-02-01" }), "Ce client n’a pas accepté WhatsApp.");
  assert.equal(boardingPassChannelBlock({ phone: "+33600000000", optInAt: "2026-01-01", optOutAt: null }), null);
});

test("l’URL signée expire et ne sert pas un autre nom de fichier", () => {
  const previous = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const preview = process.env.VERCEL_ENV;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
  delete process.env.VERCEL_ENV;
  try {
    const filename = "Carte embarquement LEVY Meryl AF1234.pdf";
    const now = Date.parse("2026-10-26T10:00:00Z");
    const path = boardingPassSignedPath(DOC, filename, now);
    assert.ok(path);
    assert.match(path, /\.pdf$/);
    const [token, encoded] = path.split("/");
    assert.equal(decodeURIComponent(encoded), filename);
    assert.deepEqual(verifyBoardingPassToken(token, filename, now), {
      documentId: DOC,
      exp: Math.floor(now / 1000) + 3600,
    });
    assert.equal(verifyBoardingPassToken(token, "autre.pdf", now), null);
    assert.equal(verifyBoardingPassToken(token, filename, now + 3600 * 1000), null);
    assert.match(BOARDING_PASS_SAMPLE_NAME, /Carte embarquement EXEMPLE\.pdf/);
  } finally {
    if (previous === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previous;
    if (preview === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = preview;
  }
});

test("le récapitulatif WhatsApp montre les trois textes, en français", () => {
  const group = whatsappCatalog().find((row) => row.id === "embarquement");
  assert.ok(group);
  assert.match(group.intro, /un message par PDF/);
  assert.match(group.intro, /français/);
  const names = group.messages.map((message) => message.bubble.modelName);
  assert.deepEqual(names, ["carte_embarquement", "cartes_embarquement", "enregistrement_aeroport"]);
  assert.match(group.messages[0].bubble.body, /carte d’embarquement pour le vol AF 1234/);
  assert.equal(group.messages[0].bubble.photo, false);
  assert.match(group.messages[1].when, /un PDF/);
  assert.match(group.messages[2].bubble.body, /aéroport/);
  assert.equal(group.messages.some((message) => message.bubble.body.includes("{{")), false);
});
