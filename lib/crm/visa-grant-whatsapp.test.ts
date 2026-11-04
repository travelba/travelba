import assert from "node:assert/strict";
import { test } from "node:test";
import { visaGrantSignedPath, verifyVisaGrantToken } from "./visa-grant-link";
import {
  VISA_GRANT_SAMPLE_AUTHORIZATION,
  VISA_GRANT_SAMPLE_IMAGE_PATH,
  VISA_GRANT_SAMPLE_PDF_PATH,
  VISA_GRANT_SENTENCE,
  VISA_GRANT_SENTENCE_V2,
  isVisaGrantTemplate,
  pickVisaGrantFile,
  visaGrantAuthorizationName,
  visaGrantContentDrafts,
  visaGrantContentVariables,
  visaGrantFileName,
  visaGrantHeader,
  visaGrantLegacyPreview,
  visaGrantPendingMessage,
  visaGrantPreview,
  visaGrantSamplePdf,
  visaGrantSendBlock,
} from "./visa-grant-whatsapp";

const DOC = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PASSPORT = "12AB34567";

test("le texte joint le document et nomme l’autorisation", () => {
  const preview = visaGrantPreview("Camille", "ESTA");
  assert.match(preview || "", /Bonjour Camille,/);
  assert.match(preview || "", /Bonne nouvelle ! Votre autorisation ESTA a été validée\. Vous la trouverez ci-jointe\./);
  assert.match(preview || "", /Le Concierge/);
  assert.equal(preview?.includes("http"), false);
  assert.equal(preview?.includes("{{"), false);
  assert.equal(visaGrantPreview(PASSPORT, "ETA")?.includes(PASSPORT), false);
  assert.match(visaGrantPreview(null, "ETA-IL") || "", /Bonjour voyageur,/);
  assert.match(visaGrantPreview(null, "ETA-IL") || "", /autorisation ETA-IL a été validée/);
  assert.match(visaGrantLegacyPreview("Camille") || "", new RegExp(VISA_GRANT_SENTENCE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(visaGrantAuthorizationName({ country: "US" }), "ESTA");
  assert.equal(visaGrantAuthorizationName({ country: "GB" }), "ETA");
  assert.equal(visaGrantAuthorizationName({ country: "IL" }), "ETA-IL");
  assert.equal(visaGrantAuthorizationName({ country: "CA" }), "eTA Canada");
  assert.equal(visaGrantAuthorizationName({ country: "NZ" }), "NZeTA");
  assert.equal(visaGrantAuthorizationName({ country: "KE" }), "eTA");
  assert.equal(visaGrantAuthorizationName({ country: "IN", docType: "visa" }), "e-Visa Inde");
  assert.equal(visaGrantAuthorizationName({ country: "ZZ", docType: "eta" }), "ETA");
  assert.equal(visaGrantAuthorizationName({ docType: "visa" }), "Visa");
  assert.equal(isVisaGrantTemplate("autorisation_validee_document"), true);
  assert.equal(isVisaGrantTemplate("autorisation_validee_image_v2"), true);
  assert.equal(isVisaGrantTemplate("formalite_prete_carte_photo"), false);
});

test("l’en-tête suit le type du fichier", () => {
  assert.equal(visaGrantHeader("application/pdf", "visa.pdf"), "document");
  assert.equal(visaGrantHeader(null, "ESTA.PDF"), "document");
  assert.equal(visaGrantHeader("image/jpeg", "photo.jpg"), "image");
  assert.equal(visaGrantHeader("image/png", "scan.png"), "image");
  assert.equal(visaGrantHeader("image/webp", "scan.webp"), null);
  assert.equal(visaGrantFileName({ label: "ESTA", firstName: "Andréa", lastName: "Martin", header: "document" }), "ESTA-Andrea-Martin.pdf");
  assert.equal(
    visaGrantFileName({ label: "ETA", firstName: "Léa", lastName: "Bernard", header: "image", mime: "image/png" }),
    "ETA-Lea-Bernard.png"
  );
  assert.equal(visaGrantFileName({ label: "ESTA", firstName: PASSPORT, lastName: "Martin", header: "document" }), null);
});

test("deux modèles v2, les v1 restent, et rien ne part sans approbation", () => {
  const drafts = visaGrantContentDrafts();
  assert.deepEqual(
    drafts.map((row) => row.friendlyName),
    [
      "autorisation_validee_document_v2",
      "autorisation_validee_image_v2",
      "autorisation_validee_document",
      "autorisation_validee_image",
    ]
  );
  assert.equal(drafts[0].env, "TWILIO_CONTENT_AUTORISATION_VALIDEE_DOCUMENT_V2");
  assert.equal(drafts[1].env, "TWILIO_CONTENT_AUTORISATION_VALIDEE_IMAGE_V2");
  assert.equal(drafts[2].env, "TWILIO_CONTENT_AUTORISATION_VALIDEE_DOCUMENT");
  assert.equal(drafts[3].env, "TWILIO_CONTENT_AUTORISATION_VALIDEE_IMAGE");
  const pdf = drafts[0].create.types["twilio/media"];
  const image = drafts[1].create.types["twilio/media"];
  const legacy = drafts[2].create.types["twilio/media"];
  assert.match(pdf.media[0], /\/api\/whatsapp\/autorisations\/\{\{1\}\}$/);
  assert.equal(pdf.body, image.body);
  assert.equal(pdf.body, ["Bonjour {{2}},", "", VISA_GRANT_SENTENCE_V2, "", "Le Concierge"].join("\n"));
  assert.match(legacy.body, /Bonne nouvelle ! Votre ESTA ou ETA a été validé/);
  assert.equal(visaGrantSamplePdf().subarray(0, 5).toString(), "%PDF-");
  assert.equal(drafts[0].create.variables["1"], VISA_GRANT_SAMPLE_PDF_PATH);
  assert.equal(drafts[0].create.variables["3"], VISA_GRANT_SAMPLE_AUTHORIZATION);
  assert.equal(drafts[1].create.variables["1"], VISA_GRANT_SAMPLE_IMAGE_PATH);
  assert.equal(drafts[1].create.variables["2"], "Camille");
  assert.equal("3" in drafts[2].create.variables, false);
  const block = visaGrantSendBlock({
    phone: "+33601020304",
    optInAt: "2026-01-01",
    file: { mime: "application/pdf", fileName: "eta.pdf" },
  });
  assert.match(block || "", /autorisation_validee_document_v2/);
  assert.match(block || "", /n’est pas encore approuvé/);
  assert.match(block || "", /deposer_modeles_autorisation_whatsapp/);
  assert.match(drafts[0].create.types["twilio/media"].media[0], /^https:\/\/travelba\.fr\/api\/whatsapp\/autorisations\/\{\{1\}\}$/);
  assert.match(drafts[1].create.types["twilio/media"].media[0], /^https:\/\/travelba\.fr\/api\/whatsapp\/autorisations\/\{\{1\}\}$/);
  assert.equal(
    visaGrantSendBlock({ phone: "+33601020304", optInAt: "2026-01-01", file: null }),
    "Le document du visa n’est pas dans l’espace."
  );
  assert.match(visaGrantPendingMessage("image"), /autorisation_validee_image_v2/);
});

test("le jeton ne sert qu’au fichier signé", () => {
  const previous = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
  try {
    const filename = "ESTA-Camille-Martin.pdf";
    const path = visaGrantSignedPath(DOC, filename, Date.parse("2026-11-04T10:00:00Z"));
    assert.ok(path);
    const token = path!.slice(0, path!.lastIndexOf("/"));
    assert.equal(verifyVisaGrantToken(token, filename, Date.parse("2026-11-04T10:30:00Z"))?.documentId, DOC);
    assert.equal(verifyVisaGrantToken(token, "autre.pdf", Date.parse("2026-11-04T10:30:00Z")), null);
    assert.equal(verifyVisaGrantToken(token, filename, Date.parse("2026-11-04T12:00:00Z")), null);
    assert.equal(visaGrantContentVariables(path!, "Camille")?.["2"], "Camille");
    assert.equal(visaGrantContentVariables(path!, "Camille")?.["3"], undefined);
    assert.equal(visaGrantContentVariables(path!, "Camille", "ESTA")?.["3"], "ESTA");
    assert.equal(visaGrantContentVariables(path!, "Camille", "e-Visa Inde")?.["3"], "e-Visa Inde");
    assert.equal(visaGrantContentVariables("https://example.com/a.pdf", "Camille"), null);
    assert.equal(path!.includes(PASSPORT), false);
  } finally {
    if (previous === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previous;
  }
});

test("la pièce du voyageur et du pays est choisie", () => {
  const rows = [
    {
      id: "1",
      doc_type: "passport",
      issuing_country: "US",
      storage_path: "a",
      traveler_id: "t1",
    },
    {
      id: "2",
      doc_type: "eta",
      issuing_country: "US",
      storage_path: "b",
      traveler_id: "t2",
      booking_id: "stay",
    },
    {
      id: "3",
      doc_type: "visa",
      issuing_country: "US",
      storage_path: "c",
      traveler_id: "t1",
      booking_id: "stay",
    },
  ];
  assert.equal(pickVisaGrantFile(rows, { country: "US", travelerId: "t1", bookingId: "stay" })?.id, "3");
  assert.equal(pickVisaGrantFile(rows, { country: "GB", travelerId: "t1" }), null);
  assert.equal(pickVisaGrantFile(rows, { country: "US", bookingId: "autre" }), null);
});
