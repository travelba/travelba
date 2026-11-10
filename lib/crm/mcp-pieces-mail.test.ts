import assert from "node:assert/strict";
import test from "node:test";
import type { BookingExtract } from "./ingest-types";
import { McpWriteError } from "./mcp-write";
import {
  decodePieceFiles,
  deposerBillet,
  detacherEmail,
  importerPieces,
  planTicketDeposit,
  planTicketFromText,
  summarizeExtract,
  type PieceRead,
} from "./mcp-pieces-mail";

const CLIENT = "11111111-1111-4111-8111-111111111111";
const DOSSIER = "22222222-2222-4222-8222-222222222222";
const CARTE = "33333333-3333-4333-8333-333333333333";
const MAIL = "44444444-4444-4444-8444-444444444444";

const read: PieceRead = {
  titre: "Paris",
  destination: "Paris",
  debut: "2026-06-01",
  fin: "2026-06-03",
  devise: "EUR",
  annulation: false,
  voyageurs: [{ prenom: "Ada", nom: "Lovelace" }],
  cartes: [{ type: "hotel", titre: "Bristol", fournisseur: "Little Emperors", debut: null, fin: null }],
  avertissements: [],
};

function pdf(name = "sejour.pdf") {
  return { nom: name, type_mime: "application/pdf", contenu: Buffer.from("billet").toString("base64") };
}

test("le résumé d’un PDF ne contient que le séjour lu", () => {
  const extract = {
    title: "Paris",
    destination: "Paris",
    start_date: "2026-06-01",
    end_date: "2026-06-03",
    currency: "EUR",
    document_status: "cancelled",
    items: [{ kind: "hotel", title: "Bristol", supplier: null, start_at: null, end_at: null }],
    travelers: [{ first_name: "Ada", last_name: "Lovelace" }],
  } as BookingExtract;
  const summary = summarizeExtract(extract, ["page illisible"]);
  assert.equal(summary.annulation, true);
  assert.equal(summary.voyageurs[0]?.nom, "Lovelace");
  assert.equal(summary.cartes[0]?.titre, "Bristol");
  assert.deepEqual(summary.avertissements, ["page illisible"]);
});

test("un fichier vide ou trop lourd est refusé avant toute lecture", () => {
  assert.throws(() => decodePieceFiles([]), /PDF ou une photo/);
  assert.throws(
    () => decodePieceFiles([{ nom: "lourd.pdf", contenu: Buffer.alloc(8_000_001).toString("base64") }]),
    /trop lourd/
  );
});

test("importer des pièces n’écrit rien sans confirmer", async () => {
  let created = 0;
  const result = await importerPieces(
    { fichiers: [pdf()], client_id: CLIENT },
    { read: async () => read, create: async () => ((created += 1), { dossier_id: DOSSIER, reference: "TB-1" }) }
  );
  assert.equal(result.apercu, true);
  assert.equal(result.ecrit, false);
  assert.equal(result.envoye, false);
  assert.equal(created, 0);
  assert.equal(result.titre, "Paris");
});

test("confirmer crée un dossier caché, ou complète le séjour indiqué", async () => {
  const calls: string[] = [];
  const created = await importerPieces(
    { fichiers: [pdf()], client_id: CLIENT, confirmer: true },
    {
      read: async () => read,
      create: async () => ((calls.push("creer"), { dossier_id: DOSSIER, reference: "TB-1" })),
      complete: async () => ((calls.push("completer"), { dossier_id: DOSSIER })),
    }
  );
  assert.equal(created.ecrit, true);
  assert.equal(created.apercu, false);
  assert.deepEqual(calls, ["creer"]);

  calls.length = 0;
  await importerPieces(
    { fichiers: [pdf()], client_id: CLIENT, dossier_id: DOSSIER, confirmer: true },
    {
      read: async () => read,
      create: async () => ((calls.push("creer"), { dossier_id: DOSSIER, reference: null })),
      complete: async () => ((calls.push("completer"), { dossier_id: DOSSIER })),
    }
  );
  assert.deepEqual(calls, ["completer"]);
});

test("une annulation ne crée pas de dossier", async () => {
  let created = 0;
  await assert.rejects(
    () =>
      importerPieces(
        { fichiers: [pdf()], client_id: CLIENT, confirmer: true },
        {
          read: async () => ({ ...read, annulation: true }),
          create: async () => ((created += 1), { dossier_id: DOSSIER, reference: null }),
        }
      ),
    /annulation/i
  );
  assert.equal(created, 0);
});

test("un billet met à jour la carte du PNR, ou en crée une", () => {
  const flights = [
    {
      id: CARTE,
      confirmation_ref: "ABC123",
      amount: 100,
      details: { pnr: "ABC123" },
      sort_order: 1,
      lifecycle: "active",
    },
  ];
  const known = planTicketFromText({
    dossier_id: DOSSIER,
    flights,
    text: "Référence du dossier ABC123 Passager ADA LOVELACE Total 120,00 EUR",
  });
  assert.equal(known.cree, false);
  assert.equal(known.carte_id, CARTE);
  assert.equal(known.pnr, "ABC123");
  assert.equal(known.prix, 120);

  const fresh = planTicketDeposit({
    dossier_id: DOSSIER,
    flights,
    read: { pnr: "ZZZ999", ticketNumber: null, passenger: null, price: null, currency: null },
  });
  assert.equal(fresh.cree, true);
  assert.equal(fresh.carte_id, null);

  assert.throws(
    () =>
      planTicketDeposit({
        dossier_id: DOSSIER,
        flights,
        read: { pnr: null, ticketNumber: null, passenger: null, price: null, currency: null },
      }),
    /PNR/
  );
});

test("déposer un billet n’écrit rien sans confirmer", async () => {
  const plan = {
    dossier_id: DOSSIER,
    reference: "TB-1",
    pnr: "ABC123",
    prix: 120,
    cree: false,
    carte_id: CARTE,
    passager: "Ada Lovelace",
  };
  let applied = 0;
  const preview = await deposerBillet(
    { dossier_id: DOSSIER, fichier: pdf("billet.pdf") },
    { plan: async () => plan, apply: async () => ((applied += 1), plan) }
  );
  assert.equal(preview.apercu, true);
  assert.equal(preview.ecrit, false);
  assert.equal(applied, 0);

  const done = await deposerBillet(
    { dossier_id: DOSSIER, fichier: pdf("billet.pdf"), confirmer: true },
    { plan: async () => plan, apply: async () => ((applied += 1), plan) }
  );
  assert.equal(done.ecrit, true);
  assert.equal(done.apercu, false);
  assert.equal(applied, 1);
});

test("détacher un mail montre le plan puis retire seulement avec confirmer", async () => {
  const previewBody = {
    dossier_id: DOSSIER,
    cartes: 1,
    pieces: 1,
    voyageurs: 0,
    supprime_dossier: false,
    conserve: ["Train"],
  };
  let applied = 0;
  const preview = await detacherEmail(
    { id: MAIL },
    { preview: async () => previewBody, apply: async () => ((applied += 1), { ...previewBody, status: "parsed" }) }
  );
  assert.equal(preview.apercu, true);
  assert.equal(preview.ecrit, false);
  assert.equal(preview.cartes, 1);
  assert.equal(applied, 0);

  const done = await detacherEmail(
    { id: MAIL, confirmer: true },
    { preview: async () => previewBody, apply: async () => ((applied += 1), { ...previewBody, status: "parsed" }) }
  );
  assert.equal(done.ecrit, true);
  assert.equal(applied, 1);
  await assert.rejects(() => detacherEmail({ id: "pas-un-uuid" }, { preview: async () => previewBody }), /invalide/);
});

test("confirmer mal formé n’écrit pas", async () => {
  await assert.rejects(
    () => importerPieces({ fichiers: [pdf()], confirmer: "oui" }, { read: async () => read }),
    McpWriteError
  );
});
