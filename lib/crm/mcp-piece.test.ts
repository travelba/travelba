import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { previewMcpTool } from "./mcp-registry";
import { addTravelPiece, notifyTravelPiece, prepareTravelPiece, requalifyPiece } from "./mcp-piece";
import { McpWriteError } from "./mcp-write";
import { customerDocumentStoragePath } from "./travel-document-write";

const CLIENT = "11111111-1111-4111-8111-111111111111";
const BOOKING = "22222222-2222-4222-8222-222222222222";
const TRAVELER = "33333333-3333-4333-8333-333333333333";
const OTHER = "44444444-4444-4444-8444-444444444444";
const DOC = "55555555-5555-4555-8555-555555555555";

const PDF = Buffer.from("%PDF-1.4 eta").toString("base64");

function piece(extra: Record<string, unknown> = {}) {
  return {
    client_id: CLIENT,
    type: "visa",
    pays: "Israël",
    numero: "ETA-9",
    expiration: "2027-04-01",
    nom_fichier: "eta-il.pdf",
    type_mime: "application/pdf",
    contenu: PDF,
    ...extra,
  };
}

test("the travel document path is the client vault", () => {
  assert.equal(
    customerDocumentStoragePath(CLIENT, "ETA IL.pdf", 1710000000000),
    `customers/${CLIENT}/documents/1710000000000-ETA_IL.pdf`
  );
});

test("a piece names the client or the dossier and keeps a readable file", () => {
  const draft = prepareTravelPiece(piece({ type: "Carte d’identité", nom_fichier: "scan.png", type_mime: "image/png" }));
  assert.equal(draft.docType, "id_card");
  assert.equal(draft.issuingCountry, "Israël");
  assert.equal(draft.number, "ETA-9");
  assert.equal(prepareTravelPiece(piece({ type: "eta" })).docType, "eta");
  assert.equal(prepareTravelPiece(piece({ type: "esta" })).docType, "visa");
  assert.equal(prepareTravelPiece(piece({ type: "passeport" })).docType, "passport");
  assert.throws(() => prepareTravelPiece(piece({ client_id: undefined, contenu: PDF })), /client ou le dossier/);
  assert.throws(() => prepareTravelPiece(piece({ type: "contrat" })), /Type de pièce inconnu/);
  assert.throws(() => prepareTravelPiece(piece({ type: "" })), /Type de pièce requis/);
  assert.throws(() => prepareTravelPiece(piece({ expiration: "01/04/2027" })), /Date d’expiration/);
  assert.throws(() => prepareTravelPiece(piece({ nom_fichier: "  " })), /Nom de fichier/);
  assert.throws(() => prepareTravelPiece(piece({ contenu: "@@@" })), /illisible/);
  assert.throws(() => prepareTravelPiece(piece({ contenu: "" })), /Fichier vide/);
  assert.throws(() => prepareTravelPiece(piece({ contenu: "data:application/pdf;base64," })), /Fichier vide/);
  assert.throws(
    () => prepareTravelPiece(piece({ nom_fichier: "note.txt", type_mime: "text/plain", contenu: Buffer.from("bonjour").toString("base64") })),
    /Format non pris en charge/
  );
  const companionDraft = prepareTravelPiece(piece({ voyageur_id: TRAVELER, client_id: CLIENT, dossier_id: undefined }));
  assert.equal(companionDraft.voyageurId, TRAVELER);
  assert.equal(companionDraft.dossierId, "");
  assert.throws(() => prepareTravelPiece(piece({ client_id: "cyril" })), /Client invalide/);
  const heavy = "A".repeat(4 * Math.ceil((25 * 1024 * 1024) / 3) + 4);
  assert.throws(() => prepareTravelPiece(piece({ contenu: heavy })), /25 Mo/);
});

test("a data url is accepted as the file", () => {
  const draft = prepareTravelPiece(piece({ contenu: `data:application/pdf;base64,${PDF}` }));
  assert.equal(draft.bytes.toString(), "%PDF-1.4 eta");
});

test("adding a visa stores it in the client vault and does not notify", async () => {
  const { admin, writes, uploads } = fakeCrm();
  let reconciled = "";
  const result = await addTravelPiece(piece(), admin, {
    upload: async (path, bytes, mime) => {
      uploads.push({ path, bytes, mime });
    },
    reconcile: async (customerId) => {
      reconciled = customerId;
    },
  });
  assert.equal(uploads.length, 1);
  assert.match(uploads[0].path, new RegExp(`^customers/${CLIENT}/documents/\\d+-eta-il\\.pdf$`));
  assert.equal(uploads[0].mime, "application/pdf");
  assert.equal(uploads[0].bytes.toString(), "%PDF-1.4 eta");
  assert.deepEqual(
    writes.map((row) => `${row.op}:${row.table}`),
    ["insert:crm_travel_documents"]
  );
  assert.equal(writes[0].payload.customer_id, CLIENT);
  assert.equal(writes[0].payload.doc_type, "visa");
  assert.equal(writes[0].payload.issuing_country, "IL");
  assert.equal(writes[0].payload.nationality, null);
  assert.equal(writes[0].payload.number, "ETA-9");
  assert.equal(writes[0].payload.expires_on, "2027-04-01");
  assert.equal(writes[0].payload.booking_id, null);
  assert.equal(writes[0].payload.file_name, "eta-il.pdf");
  assert.equal(writes[0].payload.storage_path, uploads[0].path);
  assert.equal(result.id, "doc-1");
  assert.equal(result.endroit, "Espace client · Pièces");
  assert.equal(result.lien, "/mon-compte/profil/documents");
  assert.equal(result.notifie, false);
  assert.equal(result.raison, "La pièce n’est pas liée à un séjour.");
  assert.equal("numero" in result, false);
  assert.equal("number" in result, false);
  assert.equal(reconciled, CLIENT);
});

test("a piece linked to a stay names the traveller and replaces the same type", async () => {
  const { admin, writes, uploads } = fakeCrm();
  const result = await addTravelPiece(
    piece({
      client_id: undefined,
      reference: "TB-2026-0082",
      voyageur_id: TRAVELER,
      type: "eta",
    }),
    admin,
    {
      upload: async (path, bytes, mime) => {
        uploads.push({ path, bytes, mime });
      },
      reconcile: async () => {},
    }
  );
  assert.equal(uploads.length, 1);
  assert.deepEqual(
    writes.map((row) => `${row.op}:${row.table}`),
    ["insert:crm_travel_documents", "delete:crm_travel_documents"]
  );
  assert.equal(writes[0].payload.customer_id, CLIENT);
  assert.equal(writes[0].payload.booking_id, BOOKING);
  assert.equal(writes[0].payload.traveler_id, TRAVELER);
  assert.equal(writes[0].payload.doc_type, "eta");
  assert.equal(writes[0].payload.nationality, null);
  assert.equal(result.dossier_id, BOOKING);
  assert.equal(result.reference, "TB-2026-0082");
  assert.equal(result.voyageur_id, TRAVELER);
  assert.equal(result.type, "eta");
  assert.equal(result.libelle, "Autorisation de voyage (ETA)");
  assert.equal(result.endroit, "Espace client · séjour TB-2026-0082");
  assert.equal(result.lien, "/mon-compte/reservations/TB-2026-0082");
  assert.equal(result.lien_agence, `/admin/reservations/${BOOKING}`);
  assert.equal(result.notifie, false);
  assert.equal(result.raison, "Le séjour n’est pas visible.");
});

test("a piece is refused before upload when the stay is not the client's", async () => {
  const { admin, writes, uploads } = fakeCrm();
  await assert.rejects(
    () =>
      addTravelPiece(piece({ dossier_id: BOOKING, client_id: OTHER }), admin, {
        upload: async () => {
          uploads.push({ path: "x", bytes: Buffer.alloc(0), mime: "application/pdf" });
        },
        reconcile: async () => {
          throw new Error("ne pas rapprocher");
        },
      }),
    (err: unknown) => err instanceof McpWriteError && /pas celui de ce client/.test(err.message)
  );
  assert.equal(uploads.length, 0);
  assert.deepEqual(writes, []);
});

const PASSPORT = {
  id: "pass-1",
  customer_id: CLIENT,
  companion_id: null as string | null,
  booking_id: null as string | null,
  traveler_id: null as string | null,
  doc_type: "passport",
  number: "12AB34567",
  issuing_country: "FR",
  issued_on: "2018-03-12",
  expires_on: "2028-03-11",
  first_name: "Maëlle Louise",
  last_name: "Martin",
  usage_name: "Durand",
  birth_date: "1985-10-12",
  nationality: "FR",
  sex: "F",
  place_of_birth: "PARIS",
  authority: "Préfecture de Paris",
  personal_number: "PN-1",
  created_at: "2024-01-01",
};

function passportScan(extra: Record<string, unknown> = {}) {
  return piece({
    type: "passeport",
    pays: "France",
    numero: "12AB34567",
    expiration: "2028-03-11",
    nom_fichier: "passeport.pdf",
    ...extra,
  });
}

test("a passport scan keeps the identity already on file and writes the file", async () => {
  const { admin, writes, uploads } = fakeCrm({ documents: [{ ...PASSPORT }] });
  const result = await addTravelPiece(
    passportScan({ numero: "99ZZ00001", expiration: "2034-01-01", pays: undefined }),
    admin,
    { upload: async (path, bytes, mime) => uploads.push({ path, bytes, mime }), reconcile: async () => {} }
  );
  assert.equal(uploads.length, 1);
  assert.equal(writes.filter((row) => row.op === "insert").length, 0);
  assert.equal(writes.filter((row) => row.op === "delete").length, 0);
  const patch = writes.find((row) => row.op === "update" && row.table === "crm_travel_documents");
  assert.equal(patch?.eqs.some(([column, value]) => column === "id" && value === "pass-1"), true);
  assert.equal(patch?.payload.number, "99ZZ00001");
  assert.equal(patch?.payload.expires_on, "2034-01-01");
  assert.equal(patch?.payload.file_name, "passeport.pdf");
  assert.match(String(patch?.payload.storage_path), /^customers\/.+\/documents\/\d+-passeport\.pdf$/);
  for (const key of ["issued_on", "authority", "first_name", "last_name", "usage_name", "birth_date", "nationality", "sex", "place_of_birth", "personal_number"]) {
    assert.equal(key in (patch?.payload || {}), false);
  }
  assert.equal(result.id, "pass-1");
  assert.equal(result.notifie, false);
  assert.equal(result.raison, "La pièce n’est pas liée à un séjour.");
  assert.equal(writes.some((row) => row.table === "crm_whatsapp_messages"), false);
  assert.equal(JSON.stringify(result).includes("12AB34567"), false);
  assert.equal(JSON.stringify(result).includes("PN-1"), false);
  assert.equal(JSON.stringify(result).includes("Préfecture"), false);
});

test("a second nationality does not replace the passport already on file", async () => {
  const { admin, writes } = fakeCrm({ documents: [{ ...PASSPORT }] });
  const result = await addTravelPiece(passportScan({ pays: "Israël", numero: "IL998877", expiration: "2035-06-01" }), admin, {
    upload: async () => {},
    reconcile: async () => {},
  });
  assert.equal(writes.some((row) => row.op === "update"), false);
  const inserted = writes.find((row) => row.op === "insert" && row.table === "crm_travel_documents");
  assert.equal(inserted?.payload.issuing_country, "IL");
  assert.equal(inserted?.payload.number, "IL998877");
  assert.equal(inserted?.payload.authority, null);
  assert.equal(inserted?.payload.first_name, null);
  assert.equal(inserted?.payload.nationality, null);
  const removed = writes.find((row) => row.op === "delete");
  assert.equal(removed?.eqs.some(([column, value]) => column === "issuing_country" && value === "IL"), true);
  assert.equal(result.notifie, false);
  assert.equal(writes.some((row) => row.table === "crm_whatsapp_messages"), false);
});

test("two passports without a country wait for the country", async () => {
  const { admin, writes, uploads } = fakeCrm({
    documents: [
      { ...PASSPORT },
      { ...PASSPORT, id: "pass-il", issuing_country: "IL", number: "IL1", authority: "Misrad Hapnim" },
    ],
  });
  await assert.rejects(
    () =>
      addTravelPiece(passportScan({ pays: undefined, numero: undefined }), admin, {
        upload: async () => {
          uploads.push({ path: "x", bytes: Buffer.alloc(0), mime: "application/pdf" });
        },
        reconcile: async () => {
          throw new Error("ne pas rapprocher");
        },
      }),
    /Indiquez le pays/
  );
  assert.equal(uploads.length, 0);
  assert.equal(writes.some((row) => row.op !== "select"), false);
});

test("a companion already on the client receives the scan without a dossier", async () => {
  const { admin, writes, uploads } = fakeCrm({
    companions: [{ id: COMPANION, customer_id: CLIENT }],
    documents: [{ ...PASSPORT, id: "lea", companion_id: COMPANION, first_name: "Léa", personal_number: null }],
  });
  const result = await addTravelPiece(
    passportScan({ client_id: undefined, voyageur_id: COMPANION, numero: undefined, expiration: undefined, pays: "France" }),
    admin,
    { upload: async (path) => uploads.push({ path, bytes: Buffer.alloc(0), mime: "application/pdf" }), reconcile: async () => {} }
  );
  assert.equal(uploads.length, 1);
  const patch = writes.find((row) => row.op === "update");
  assert.equal(patch?.eqs.some(([column, value]) => column === "id" && value === "lea"), true);
  assert.equal("number" in (patch?.payload || {}), false);
  assert.equal("expires_on" in (patch?.payload || {}), false);
  assert.equal(patch?.payload.issuing_country, "FR");
  assert.equal("first_name" in (patch?.payload || {}), false);
  assert.equal("authority" in (patch?.payload || {}), false);
  assert.equal(result.client_id, CLIENT);
  assert.equal(result.dossier_id, null);
  assert.equal(result.voyageur_id, COMPANION);
  assert.equal(result.endroit, "Espace client · Pièces");
  assert.equal(result.notifie, false);
  assert.equal(writes.some((row) => row.table === "crm_whatsapp_messages"), false);
});

test("a visa for a companion is filed without a stay or a message", async () => {
  const { admin, writes } = fakeCrm({ companions: [{ id: COMPANION, customer_id: CLIENT }] });
  const result = await addTravelPiece(piece({ voyageur_id: COMPANION, dossier_id: undefined, type: "visa" }), admin, {
    upload: async () => {},
    reconcile: async () => {},
  });
  const inserted = writes.find((row) => row.op === "insert" && row.table === "crm_travel_documents");
  assert.equal(inserted?.payload.companion_id, COMPANION);
  assert.equal(inserted?.payload.booking_id, null);
  assert.equal(inserted?.payload.traveler_id, null);
  assert.equal(inserted?.payload.doc_type, "visa");
  assert.equal(result.voyageur_id, COMPANION);
  assert.equal(result.notifie, false);
  assert.equal(result.raison, "La pièce n’est pas liée à un séjour.");
  assert.equal(writes.some((row) => row.table === "crm_whatsapp_messages"), false);
});

test("a new passport for a companion is stored on that companion", async () => {
  const { admin, writes } = fakeCrm({ companions: [{ id: COMPANION, customer_id: CLIENT }] });
  const result = await addTravelPiece(passportScan({ voyageur_id: COMPANION, dossier_id: undefined }), admin, {
    upload: async () => {},
    reconcile: async () => {},
  });
  const inserted = writes.find((row) => row.op === "insert" && row.table === "crm_travel_documents");
  assert.equal(inserted?.payload.companion_id, COMPANION);
  assert.equal(inserted?.payload.booking_id, null);
  assert.equal(inserted?.payload.traveler_id, null);
  assert.equal(inserted?.payload.customer_id, CLIENT);
  assert.equal(result.voyageur_id, COMPANION);
  assert.equal(result.notifie, false);
});

test("a traveller who is not a companion still needs the dossier", async () => {
  const { admin, writes, uploads } = fakeCrm();
  await assert.rejects(
    () =>
      addTravelPiece(piece({ voyageur_id: TRAVELER, dossier_id: undefined }), admin, {
        upload: async () => {
          uploads.push({ path: "x", bytes: Buffer.alloc(0), mime: "application/pdf" });
        },
      }),
    /dossier pour rattacher/
  );
  assert.equal(uploads.length, 0);
  assert.deepEqual(writes, []);
});

test("a companion of another client is refused", async () => {
  const { admin, uploads } = fakeCrm({ companions: [{ id: COMPANION, customer_id: OTHER }] });
  await assert.rejects(
    () =>
      addTravelPiece(piece({ voyageur_id: COMPANION, dossier_id: undefined }), admin, {
        upload: async () => {
          uploads.push({ path: "x", bytes: Buffer.alloc(0), mime: "application/pdf" });
        },
      }),
    /pas rattaché à ce client/
  );
  assert.equal(uploads.length, 0);
});

test("a passport already on the stay keeps its identity when the scan is replaced", async () => {
  const { admin, writes } = fakeCrm({
    documents: [
      {
        ...PASSPORT,
        booking_id: BOOKING,
        traveler_id: TRAVELER,
        issued_on: "2019-04-02",
        authority: "Préfecture de Lyon",
      },
    ],
  });
  const result = await addTravelPiece(
    passportScan({ client_id: undefined, reference: "TB-2026-0082", voyageur_id: TRAVELER, expiration: "2031-04-02" }),
    admin,
    { upload: async () => {}, reconcile: async () => {} }
  );
  const patch = writes.find((row) => row.op === "update");
  assert.equal(patch?.payload.expires_on, "2031-04-02");
  assert.equal("issued_on" in (patch?.payload || {}), false);
  assert.equal("authority" in (patch?.payload || {}), false);
  assert.equal("birth_date" in (patch?.payload || {}), false);
  assert.equal(result.dossier_id, BOOKING);
  assert.equal(result.voyageur_id, TRAVELER);
  assert.equal(result.notifie, false);
  assert.equal(result.raison, "La pièce n’est pas une formalité.");
  assert.equal(writes.some((row) => row.table === "crm_whatsapp_messages"), false);
});

test("a stay scan copies the vault passport instead of opening a blank one", async () => {
  const { admin, writes } = fakeCrm({ documents: [{ ...PASSPORT }] });
  await addTravelPiece(passportScan({ dossier_id: BOOKING, voyageur_id: TRAVELER, numero: "99ZZ00001" }), admin, {
    upload: async () => {},
    reconcile: async () => {},
  });
  const inserted = writes.find((row) => row.op === "insert" && row.table === "crm_travel_documents");
  assert.equal(inserted?.payload.booking_id, BOOKING);
  assert.equal(inserted?.payload.traveler_id, TRAVELER);
  assert.equal(inserted?.payload.number, "99ZZ00001");
  assert.equal(inserted?.payload.issued_on, "2018-03-12");
  assert.equal(inserted?.payload.authority, "Préfecture de Paris");
  assert.equal(inserted?.payload.first_name, "Maëlle Louise");
  assert.equal(inserted?.payload.last_name, "Martin");
  assert.equal(inserted?.payload.birth_date, "1985-10-12");
  assert.equal(inserted?.payload.nationality, "FR");
  assert.equal(inserted?.payload.sex, "F");
  assert.equal(inserted?.payload.place_of_birth, "PARIS");
  assert.equal(inserted?.payload.usage_name, "Durand");
  assert.equal(writes.some((row) => row.op === "update"), false);
  assert.equal(
    writes.some((row) => row.op === "delete" && row.eqs.some(([, value]) => value === "pass-1")),
    false
  );
});

test("an unknown traveller is refused before the file is stored", async () => {
  const { admin, writes, uploads } = fakeCrm();
  await assert.rejects(
    () =>
      addTravelPiece(piece({ dossier_id: BOOKING, voyageur_id: OTHER }), admin, {
        upload: async () => {
          uploads.push({ path: "x", bytes: Buffer.alloc(0), mime: "application/pdf" });
        },
      }),
    /Voyageur introuvable/
  );
  assert.equal(uploads.length, 0);
  assert.deepEqual(writes, []);
});

test("an insurance file on a stay does not use the formality WhatsApp", async () => {
  const { admin, writes } = fakeCrm({ visible: true });
  const result = await addTravelPiece(piece({ dossier_id: BOOKING, type: "assurance" }), admin, {
    upload: async () => {},
    reconcile: async () => {},
  });
  assert.equal(result.type, "insurance");
  assert.equal(result.notifie, false);
  assert.equal(result.raison, "La pièce n’est pas une formalité.");
  assert.equal(writes.some((row) => row.table === "crm_whatsapp_messages"), false);
});

test("a country without a formality name is not notified", async () => {
  const { admin, writes } = fakeCrm({ visible: true });
  const result = await addTravelPiece(piece({ dossier_id: BOOKING, type: "eta", pays: "France" }), admin, {
    upload: async () => {},
    reconcile: async () => {},
  });
  assert.equal(result.notifie, false);
  assert.equal(result.raison, "Formalité inconnue pour ce pays.");
  assert.equal(writes.some((row) => row.table === "crm_whatsapp_messages"), false);
});

test("ajouter_piece does not keep the document number and notifies through the formality path", () => {
  const shown = JSON.parse(
    previewMcpTool("ajouter_piece", {
      id: "doc-1",
      number: "ETA-9",
      numero_piece: "ETA-9",
      notifie: false,
      raison: "Le séjour n’est pas visible.",
    }).content[0].text
  ) as Record<string, unknown>;
  assert.equal(shown.id, "doc-1");
  assert.equal(shown.notifie, false);
  assert.equal(shown.raison, "Le séjour n’est pas visible.");
  assert.equal("number" in shown, false);
  assert.equal("numero_piece" in shown, false);
  const source = readFileSync(new URL("./mcp-piece.ts", import.meta.url), "utf8");
  assert.equal(source.includes("notifyFormalitiesReady"), true);
  assert.equal(source.includes("saveVisaUploads"), false);
  assert.equal(source.includes("markPaidVisasFiled"), false);
  const route = readFileSync(new URL("../../app/api/admin/travel-documents/route.ts", import.meta.url), "utf8");
  assert.equal(route.includes("saveUploadedTravelDocument"), true);
});

test("notifier false skips the formality WhatsApp", async () => {
  const { admin, writes } = fakeCrm({ visible: true });
  const result = await addTravelPiece(piece({ dossier_id: BOOKING, type: "eta", notifier: false }), admin, {
    upload: async () => {},
    reconcile: async () => {},
  });
  assert.equal(result.notifie, false);
  assert.equal(result.raison, "Notification non demandée.");
  assert.equal(writes.some((row) => row.table === "crm_whatsapp_messages"), false);
});

test("a visible formality queues the ready WhatsApp when the client has not opted in", async () => {
  const { admin, writes } = fakeCrm({ visible: true });
  const result = await addTravelPiece(
    piece({ client_id: undefined, reference: "TB-2026-0082", type: "eta", voyageur_id: TRAVELER }),
    admin,
    { upload: async () => {}, reconcile: async () => {} }
  );
  assert.equal(result.notifie, false);
  assert.equal(result.raison, "Le client n’a pas activé WhatsApp.");
  const queued = writes.find((row) => row.op === "insert" && row.table === "crm_whatsapp_messages");
  assert.equal(queued?.payload.dedupe_key, `formalite-prete:${BOOKING}:IL`);
  assert.equal(queued?.payload.template_key, "formalite_prete");
});

test("a formality already sent is not sent again", async () => {
  const { admin, writes } = fakeCrm({
    visible: true,
    messages: [{ id: "msg-sent", dedupe_key: `formalite-prete:${BOOKING}:IL`, status: "sent" }],
  });
  const result = await addTravelPiece(piece({ dossier_id: BOOKING, type: "eta" }), admin, {
    upload: async () => {},
    reconcile: async () => {},
  });
  assert.equal(result.notifie, false);
  assert.equal(result.raison, "Déjà envoyé.");
  assert.equal(writes.some((row) => row.table === "crm_whatsapp_messages" && row.op === "insert"), false);
});

test("a failed notice still keeps the uploaded piece", async () => {
  const { admin } = fakeCrm({ visible: true });
  const result = await addTravelPiece(piece({ dossier_id: BOOKING, type: "eta" }), admin, {
    upload: async () => {},
    reconcile: async () => {},
    notify: async () => {
      throw new Error("twilio down");
    },
  });
  assert.equal(result.id, "doc-1");
  assert.equal(result.notifie, false);
  assert.equal(result.raison, "Message non parti.");
});

test("notifier_piece resends for an existing formality without a new file", async () => {
  const docId = "55555555-5555-4555-8555-555555555555";
  const { admin, writes, uploads } = fakeCrm({
    visible: true,
    documents: [{ id: docId, booking_id: BOOKING, doc_type: "visa", issuing_country: "IL", customer_id: CLIENT }],
  });
  const result = await notifyTravelPiece({ document_id: docId }, admin);
  assert.equal(uploads.length, 0);
  assert.equal(result.id, docId);
  assert.equal(result.dossier_id, BOOKING);
  assert.equal(result.notifie, false);
  assert.equal(result.raison, "Le client n’a pas activé WhatsApp.");
  assert.equal(writes.some((row) => row.table === "crm_whatsapp_messages" && row.op === "insert"), true);
  await assert.rejects(() => notifyTravelPiece({ document_id: TRAVELER }, admin), /Pièce introuvable/);
});

const COMPANION = "66666666-6666-4666-8666-666666666666";
const OTHER_CLIENT = "77777777-7777-4777-8777-777777777777";

function otherTraveler(phone: string | null) {
  return {
    visible: true,
    travelers: [
      { id: TRAVELER, booking_id: BOOKING, companion_id: COMPANION, is_account_holder: false, first_name: "Léa" },
    ],
    companions: [{ id: COMPANION, phone }],
    customers: [
      {
        id: CLIENT,
        first_name: "Camille",
        last_name: "Martin",
        email: "client@example.com",
        phone: "+33611111111",
        whatsapp_opt_in_at: "2026-01-01",
      },
    ],
    messages: [{ id: "msg-sent", dedupe_key: `formalite-prete:${BOOKING}:IL`, status: "sent" }],
  };
}

test("a traveller with another number is not blocked by the client's already sent notice", async () => {
  const { admin, writes } = fakeCrm(otherTraveler("+33601020304"));
  const result = await addTravelPiece(piece({ dossier_id: BOOKING, type: "eta", voyageur_id: TRAVELER }), admin, {
    upload: async () => {},
    reconcile: async () => {},
  });
  assert.equal(result.notifie, false);
  assert.deepEqual(
    result.destinataires.map((row) => `${row.qui}:${row.raison}`),
    ["client:Déjà envoyé.", "voyageur:Modèle WhatsApp voyageur pas encore approuvé."]
  );
  assert.equal(writes.some((row) => row.table === "crm_whatsapp_messages" && row.op === "insert"), false);

  process.env.TWILIO_CONTENT_FORMALITE_PRETE_VOYAGEUR = "HXvoyageur";
  try {
    const armed = fakeCrm(otherTraveler("+33601020304"));
    const sent = await addTravelPiece(piece({ dossier_id: BOOKING, type: "eta", voyageur_id: TRAVELER }), armed.admin, {
      upload: async () => {},
      reconcile: async () => {},
    });
    const queued = armed.writes.find((row) => row.op === "insert" && row.table === "crm_whatsapp_messages");
    assert.equal(queued?.payload.template_key, "formalite_prete_voyageur");
    assert.equal(queued?.payload.customer_id, CLIENT);
    assert.equal(queued?.payload.dedupe_key, `formalite-prete:${BOOKING}:IL:voyageur:${TRAVELER}`);
    assert.equal(JSON.stringify(queued?.payload).includes("+33601020304"), false);
    assert.equal(JSON.stringify(queued?.payload).includes("http"), false);
    assert.match(String(queued?.payload.body), /Léa/);
    assert.match(String(queued?.payload.body), /ETA-IL/);
    assert.match(String(queued?.payload.body), /TB-2026-0082/);
    assert.match(String(queued?.payload.body), /Travel Business Agency/);
    assert.equal(sent.destinataires.find((row) => row.qui === "voyageur")?.raison, "Message non parti.");
    assert.equal(sent.destinataires.find((row) => row.qui === "client")?.raison, "Déjà envoyé.");
  } finally {
    delete process.env.TWILIO_CONTENT_FORMALITE_PRETE_VOYAGEUR;
  }
});

test("the same handset is not notified twice", async () => {
  const { admin, writes } = fakeCrm(otherTraveler("+33611111111"));
  const result = await addTravelPiece(piece({ dossier_id: BOOKING, type: "eta", voyageur_id: TRAVELER }), admin, {
    upload: async () => {},
    reconcile: async () => {},
  });
  assert.equal(result.destinataires.find((row) => row.qui === "voyageur")?.raison, "Même numéro que le client.");
  assert.equal(writes.some((row) => row.table === "crm_whatsapp_messages" && row.op === "insert"), false);
});

test("notifier_piece can target only the traveller", async () => {
  const docId = "55555555-5555-4555-8555-555555555555";
  const { admin, writes } = fakeCrm({
    ...otherTraveler(null),
    documents: [
      {
        id: docId,
        booking_id: BOOKING,
        traveler_id: TRAVELER,
        doc_type: "visa",
        issuing_country: "IL",
        customer_id: CLIENT,
      },
    ],
  });
  const skipped = await notifyTravelPiece({ document_id: docId, destinataires: "voyageur" }, admin);
  assert.equal(skipped.raison, "Le voyageur n’a pas de numéro WhatsApp.");
  assert.equal(skipped.destinataires.length, 1);
  assert.equal(skipped.destinataires[0].qui, "voyageur");
  assert.equal(writes.some((row) => row.table === "crm_whatsapp_messages"), false);

  const opted = fakeCrm({
    ...otherTraveler("+33601020304"),
    documents: [
      {
        id: docId,
        booking_id: BOOKING,
        traveler_id: TRAVELER,
        doc_type: "eta",
        issuing_country: "IL",
        customer_id: CLIENT,
      },
    ],
    customers: [
      {
        id: CLIENT,
        first_name: "Camille",
        email: "client@example.com",
        phone: "+33611111111",
        whatsapp_opt_in_at: "2026-01-01",
      },
      {
        id: OTHER_CLIENT,
        first_name: "Léa",
        email: "voyageur@example.com",
        phone: "+33601020304",
        whatsapp_opt_in_at: "2026-01-02",
      },
    ],
  });
  const sent = await notifyTravelPiece({ document_id: docId, destinataires: "voyageur" }, opted.admin);
  const queued = opted.writes.find((row) => row.op === "insert" && row.table === "crm_whatsapp_messages");
  assert.equal(queued?.payload.customer_id, OTHER_CLIENT);
  assert.equal(queued?.payload.template_key, "formalite_prete");
  assert.equal(queued?.payload.dedupe_key, `formalite-prete:${BOOKING}:IL:voyageur:${TRAVELER}`);
  assert.equal(sent.destinataires.some((row) => row.qui === "client"), false);
  await assert.rejects(
    () => notifyTravelPiece({ document_id: docId, destinataires: "tout" }, admin),
    /Destinataires/
  );
});

test("carte d’embarquement is a piece type", () => {
  assert.equal(prepareTravelPiece(piece({ type: "carte_embarquement" })).docType, "carte_embarquement");
  assert.equal(prepareTravelPiece(piece({ type: "carte d'embarquement" })).docType, "carte_embarquement");
  assert.equal(prepareTravelPiece(piece({ type: "carte d’embarquement" })).docType, "carte_embarquement");
  assert.throws(() => prepareTravelPiece(piece({ type: "billet" })), /carte_embarquement/);
});

test("adding a boarding pass stores the dossier PDF and does not notify", async () => {
  const { admin, writes, uploads } = fakeCrm();
  let reconciled = false;
  let notified = false;
  const result = await addTravelPiece(
    piece({
      type: "carte_embarquement",
      dossier_id: BOOKING,
      nom_fichier: "carte.pdf",
      numero: "12AB34567",
    }),
    admin,
    {
      upload: async (path, bytes, mime) => {
        uploads.push({ path, bytes, mime });
      },
      reconcile: async () => {
        reconciled = true;
      },
      notify: async () => {
        notified = true;
        return [];
      },
    }
  );
  assert.equal(uploads.length, 1);
  assert.match(uploads[0].path, new RegExp(`^bookings/${BOOKING}/\\d+-carte\\.pdf$`));
  assert.equal(uploads[0].mime, "application/pdf");
  assert.deepEqual(
    writes.map((row) => `${row.op}:${row.table}`),
    ["insert:crm_booking_documents"]
  );
  assert.equal(writes[0].payload.booking_id, BOOKING);
  assert.equal(writes[0].payload.kind, "carte d'embarquement");
  assert.equal(writes[0].payload.file_name, "carte.pdf");
  assert.equal(writes[0].payload.storage_path, uploads[0].path);
  assert.equal(writes[0].payload.visible_to_client, false);
  assert.equal(result.id, "doc-1");
  assert.equal(result.dossier_id, BOOKING);
  assert.equal(result.type, "carte_embarquement");
  assert.equal(result.libelle, "Carte d’embarquement");
  assert.equal(result.notifie, false);
  assert.equal(result.raison, "La carte d’embarquement ne part pas toute seule.");
  assert.deepEqual(result.destinataires, []);
  assert.equal(result.endroit, "Dossier TB-2026-0082 · cartes d’embarquement");
  assert.equal("numero" in result, false);
  assert.equal("storage_path" in result, false);
  assert.equal(reconciled, false);
  assert.equal(notified, false);
});

test("a boarding pass needs a dossier and a PDF", async () => {
  const loose = fakeCrm();
  await assert.rejects(
    () =>
      addTravelPiece(piece({ type: "carte_embarquement" }), loose.admin, {
        upload: async () => {
          loose.uploads.push({ path: "x", bytes: Buffer.alloc(0), mime: "application/pdf" });
        },
      }),
    /se dépose sur un dossier/
  );
  assert.equal(loose.uploads.length, 0);
  assert.deepEqual(loose.writes, []);

  const image = fakeCrm();
  await assert.rejects(
    () =>
      addTravelPiece(
        piece({
          type: "carte_embarquement",
          dossier_id: BOOKING,
          nom_fichier: "scan.png",
          type_mime: "image/png",
        }),
        image.admin,
        {
          upload: async () => {
            image.uploads.push({ path: "x", bytes: Buffer.alloc(0), mime: "image/png" });
          },
        }
      ),
    /doit être un PDF/
  );
  assert.equal(image.uploads.length, 0);
  assert.deepEqual(image.writes, []);
});

test("requalifying a deposited piece keeps the same id on the dossier PDF", async () => {
  const { admin, writes } = fakeCrm({
    documents: [
      {
        id: DOC,
        booking_id: BOOKING,
        doc_type: "other",
        file_name: "carte.pdf",
        mime_type: "application/pdf",
        storage_path: `customers/${CLIENT}/documents/carte.pdf`,
      },
    ],
  });
  const moved = await requalifyPiece({ document_id: DOC, type: "carte d’embarquement" }, admin);
  assert.equal(moved.id, DOC);
  assert.equal(moved.dossier_id, BOOKING);
  assert.equal(moved.type, "carte_embarquement");
  assert.equal(moved.libelle, "Carte d’embarquement");
  assert.equal(moved.fichier, "carte.pdf");
  assert.equal("numero" in moved, false);
  assert.equal("storage_path" in moved, false);
  const insert = writes.find((row) => row.op === "insert" && row.table === "crm_booking_documents");
  assert.equal(insert?.payload.id, DOC);
  assert.equal(insert?.payload.booking_id, BOOKING);
  assert.equal(insert?.payload.kind, "carte d'embarquement");
  assert.equal(insert?.payload.storage_path, `customers/${CLIENT}/documents/carte.pdf`);
  assert.equal(insert?.payload.visible_to_client, false);
  const removed = writes.find((row) => row.op === "delete" && row.table === "crm_travel_documents");
  assert.deepEqual(removed?.eqs, [
    ["id", DOC],
    ["booking_id", BOOKING],
  ]);
  const again = await requalifyPiece({ document_id: DOC, type: "carte_embarquement" }, admin);
  assert.equal(again.id, DOC);
  assert.equal(again.type, "carte_embarquement");
  assert.equal(writes.filter((row) => row.op === "insert").length, 1);
});

test("requalifying stays on the piece dossier", async () => {
  const visa = fakeCrm({
    documents: [
      {
        id: DOC,
        booking_id: BOOKING,
        doc_type: "visa",
        file_name: "visa.pdf",
        mime_type: "application/pdf",
        storage_path: "customers/x/visa.pdf",
      },
    ],
  });
  const updated = await requalifyPiece({ document_id: DOC, type: "eta" }, visa.admin);
  assert.equal(updated.type, "eta");
  assert.equal(updated.libelle, "Autorisation de voyage (ETA)");
  assert.deepEqual(visa.writes, [
    {
      op: "update",
      table: "crm_travel_documents",
      payload: { doc_type: "eta" },
      eqs: [
        ["id", DOC],
        ["booking_id", BOOKING],
      ],
    },
  ]);

  const loose = fakeCrm({
    documents: [
      {
        id: DOC,
        booking_id: null,
        doc_type: "other",
        file_name: "carte.pdf",
        mime_type: "application/pdf",
        storage_path: "customers/x/carte.pdf",
      },
    ],
  });
  await assert.rejects(
    () => requalifyPiece({ document_id: DOC, type: "carte_embarquement" }, loose.admin),
    /pas liée à un séjour/
  );
  assert.deepEqual(loose.writes, []);
  await assert.rejects(() => requalifyPiece({ document_id: OTHER, type: "visa" }, loose.admin), /Pièce introuvable/);
});

test("a dossier piece only becomes a boarding pass or other", async () => {
  const { admin, writes } = fakeCrm({
    bookingDocuments: [
      {
        id: DOC,
        booking_id: BOOKING,
        kind: "other",
        file_name: "carte.pdf",
        mime_type: "application/pdf",
        storage_path: `bookings/${BOOKING}/carte.pdf`,
      },
    ],
  });
  const updated = await requalifyPiece({ document_id: DOC, type: "carte_embarquement" }, admin);
  assert.equal(updated.id, DOC);
  assert.equal(updated.type, "carte_embarquement");
  assert.deepEqual(writes, [
    {
      op: "update",
      table: "crm_booking_documents",
      payload: { kind: "carte d'embarquement" },
      eqs: [
        ["id", DOC],
        ["booking_id", BOOKING],
      ],
    },
  ]);
  await assert.rejects(() => requalifyPiece({ document_id: DOC, type: "visa" }, admin), /carte d’embarquement ou autre/);
  await assert.rejects(
    () =>
      requalifyPiece(
        { document_id: DOC, type: "carte_embarquement" },
        fakeCrm({
          bookingDocuments: [
            {
              id: DOC,
              booking_id: BOOKING,
              kind: "other",
              file_name: "scan.png",
              mime_type: "image/png",
              storage_path: `bookings/${BOOKING}/scan.png`,
            },
          ],
        }).admin
      ),
    /doit être un PDF/
  );
});

type Write = { op: string; table: string; payload: Record<string, unknown>; eqs: [string, unknown][] };

function fakeCrm(
  options: {
    visible?: boolean;
    documents?: Record<string, unknown>[];
    messages?: Record<string, unknown>[];
    travelers?: Record<string, unknown>[];
    companions?: Record<string, unknown>[];
    customers?: Record<string, unknown>[];
    bookingDocuments?: Record<string, unknown>[];
  } = {}
) {
  const writes: Write[] = [];
  const uploads: { path: string; bytes: Buffer; mime: string }[] = [];
  const documents = (options.documents || []).map((row) => ({ ...row }));
  const bookingDocuments = (options.bookingDocuments || []).map((row) => ({ ...row }));
  const messages = (options.messages || []).map((row) => ({ ...row }));
  const customers = options.customers || [{ id: CLIENT, first_name: "Camille", last_name: "Martin" }];
  const bookings = [
    {
      id: BOOKING,
      reference: "TB-2026-0082",
      customer_id: CLIENT,
      visible_to_client: options.visible === true,
      start_date: "2026-06-04",
      end_date: "2026-06-11",
    },
  ];
  const travelers = options.travelers || [
    { id: TRAVELER, booking_id: BOOKING, companion_id: null, is_account_holder: true },
  ];
  const companions = options.companions || [];

  function from(table: string) {
    const eqs: [string, unknown][] = [];
    let op = "select";
    let payload: Record<string, unknown> = {};
    const api = {
      select() {
        return api;
      },
      insert(value: Record<string, unknown>) {
        op = "insert";
        payload = value;
        return api;
      },
      update(value: Record<string, unknown>) {
        op = "update";
        payload = value;
        return api;
      },
      delete() {
        op = "delete";
        return api;
      },
      eq(column: string, value: unknown) {
        eqs.push([column, value]);
        return api;
      },
      neq() {
        return api;
      },
      is() {
        return api;
      },
      in(column: string, value: unknown) {
        eqs.push([column, value]);
        return api;
      },
      order() {
        return api;
      },
      limit() {
        return api;
      },
      maybeSingle() {
        return Promise.resolve(finish(true));
      },
      single() {
        return Promise.resolve(finish(true));
      },
      then(resolve: (value: { data: unknown; error: null }) => void, reject?: (err: unknown) => void) {
        return Promise.resolve(finish(false)).then(resolve, reject);
      },
    };

    function matches(row: Record<string, unknown>) {
      return eqs.every(([column, value]) => {
        const cell = row[column];
        return Array.isArray(value) ? value.includes(cell) : cell === value;
      });
    }

    function finish(one: boolean) {
      if (op !== "select") writes.push({ op, table, payload, eqs: eqs.slice() as [string, unknown][] });
      if (op === "insert" && table === "crm_travel_documents") {
        const row = { id: "doc-1", ...payload };
        documents.push(row);
        return { data: row, error: null };
      }
      if (op === "insert" && table === "crm_booking_documents") {
        const row = { id: "doc-1", ...payload };
        bookingDocuments.push(row);
        return { data: row, error: null };
      }
      if (op === "insert" && table === "crm_whatsapp_messages") {
        const row = { id: "msg-1", status: "queued", ...payload };
        messages.push(row);
        return { data: row, error: null };
      }
      if (op === "insert") return { data: { id: "doc-1", ...payload }, error: null };
      if (op === "delete" || op === "update") return { data: null, error: null };
      const rows =
        table === "crm_customers"
          ? customers.filter((row) => matches(row))
          : table === "crm_bookings"
            ? bookings.filter((row) => matches(row))
              : table === "crm_booking_travelers"
                ? travelers.filter((row) => matches(row))
                : table === "crm_travel_companions"
                  ? companions.filter((row) => matches(row))
                : table === "crm_travel_documents"
                ? documents.filter((row) => matches(row))
                : table === "crm_booking_documents"
                  ? bookingDocuments.filter((row) => matches(row))
                : table === "crm_whatsapp_messages"
                  ? messages.filter((row) => matches(row))
                  : [];
      return { data: one ? rows[0] || null : rows, error: null };
    }
    return api;
  }

  return { admin: { from } as unknown as SupabaseClient, writes, uploads };
}
