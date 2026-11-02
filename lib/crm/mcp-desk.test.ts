import assert from "node:assert/strict";
import test from "node:test";
import { DELETE_CUSTOMER_CONFIRM_ERROR } from "./delete-confirm";
import { bookingDocumentKind } from "./booking-document-write";
import { reactiverMembre } from "./mcp-agency";
import {
  type DeskDeps,
  ajouterCarte,
  archiverDossier,
  cacherCarnet,
  deposerPieceDossier,
  enregistrerSocietes,
  journalReadDenial,
  lireJournal,
  reglerAccesHotels,
  retirerPieceDossier,
  supprimerClient,
} from "./mcp-desk";
import { mcpWriteJournalDraft } from "./mcp-journal";
import { McpWriteError } from "./mcp-write";
import { permissionFlags } from "./agency-access";

const CLIENT = "11111111-1111-4111-8111-111111111111";
const DOSSIER = "22222222-2222-4222-8222-222222222222";
const CARTE = "33333333-3333-4333-8333-333333333333";
const DOC = "44444444-4444-4444-8444-444444444444";

test("supprimer un client exige son nom complet", async () => {
  let removed = false;
  await assert.rejects(
    () =>
      supprimerClient(
        { client_id: CLIENT, confirmer: "Autre Nom" },
        {
          loadCustomer: async () => ({ first_name: "Léa", last_name: "Martin" }),
          deleteCustomer: async () => {
            removed = true;
            return { ok: true, name: "Léa Martin" };
          },
        }
      ),
    (err: unknown) => err instanceof McpWriteError && err.message === DELETE_CUSTOMER_CONFIRM_ERROR
  );
  assert.equal(removed, false);
  const done = await supprimerClient(
    { client_id: CLIENT, confirmer: "lea martin" },
    {
      loadCustomer: async () => ({ first_name: "Léa", last_name: "Martin" }),
      deleteCustomer: async () => ({ ok: true, name: "Léa Martin" }),
    }
  );
  assert.equal(done.supprime, true);
  assert.equal(done.nom, "Léa Martin");
});

test("les sociétés remplacent la liste seulement avec confirmer", async () => {
  await assert.rejects(
    () => enregistrerSocietes({ client_id: CLIENT, societes: [] }, { saveCompanies: async () => ({ ok: true, companies: [] }) }),
    /confirmer true/
  );
  let payload: unknown = null;
  const saved = await enregistrerSocietes(
    {
      client_id: CLIENT,
      confirmer: true,
      societes: [{ raison_sociale: "Martin SAS", siret: "12345678901234", ville: "Paris" }],
    },
    {
      saveCompanies: (async (_db, _id, raw) => {
        payload = raw;
        return {
          ok: true as const,
          companies: [
            {
              id: "soc",
              customer_id: CLIENT,
              company_name: "Martin SAS",
              siret: null,
              vat_number: null,
              billing_email: null,
              billing_address_line: null,
              billing_postal_code: null,
              billing_city: "Paris",
              billing_country: null,
              sort_order: 0,
            },
          ],
        };
      }) as DeskDeps["saveCompanies"],
    }
  );
  assert.equal((payload as { company_name: string }[])[0].company_name, "Martin SAS");
  assert.equal(saved.societes[0].raison_sociale, "Martin SAS");
});

test("l’accès hôtels passe par le même geste que la fiche", async () => {
  let seen: unknown = null;
  const opened = await reglerAccesHotels(
    { client_id: CLIENT, actif: true, mode_reel: true },
    {
      writeHotelAccess: async (input) => {
        seen = input;
        return { ok: true, enabled: true, live: true };
      },
    }
  );
  assert.equal((seen as { actor: string }).actor, "admin");
  assert.equal((seen as { live: boolean }).live, true);
  assert.equal(opened.mode_reel, true);
  const refused = await reglerAccesHotels(
    { client_id: CLIENT, demande: "refuser" },
    {
      reviewHotelAccess: async () => ({ ok: true, enabled: false, status: "refused" }),
    }
  );
  assert.equal(refused.demande, "refused");
});

test("archiver et cacher exigent une confirmation", async () => {
  let archived = false;
  await assert.rejects(
    () =>
      archiverDossier(
        { dossier_id: DOSSIER },
        { findBooking: async () => ({ id: DOSSIER, reference: "TB-1" }), archive: async () => { archived = true; return {}; } }
      ),
    /confirmer true/
  );
  assert.equal(archived, false);
  const hidden = await cacherCarnet(
    { dossier_id: DOSSIER, confirmer: true },
    {
      findBooking: async () => ({ id: DOSSIER, reference: "TB-1", visible_to_client: true }),
      hideCarnet: async () => undefined,
      syncLedger: async () => undefined,
    }
  );
  assert.equal(hidden.cache, true);
});

test("une carte train réutilise l’ajout agence", async () => {
  let body: Record<string, unknown> = {};
  const card = await ajouterCarte(
    { dossier_id: DOSSIER, type: "train", titre: "Paris → Lyon", prix: 80 },
    {
      findBooking: async () => ({ id: DOSSIER, reference: "TB-1" }),
      addCard: async (_db, _id, next) => {
        body = next;
        return { item: { id: CARTE }, ledgerWarning: null };
      },
    }
  );
  assert.equal(body?.kind, "rail");
  assert.equal(body?.title, "Paris → Lyon");
  assert.equal(card.carte_id, CARTE);
  await assert.rejects(
    () =>
      ajouterCarte(
        { dossier_id: DOSSIER, type: "train", titre: "X", details: { passport_number: "123" } },
        { findBooking: async () => ({ id: DOSSIER, reference: "TB-1" }) }
      ),
    /numéros de pièce/
  );
});

test("déposer et retirer une pièce de dossier", async () => {
  const saved = await deposerPieceDossier(
    {
      dossier_id: DOSSIER,
      carte_id: CARTE,
      nom_fichier: "billet.pdf",
      type_mime: "application/pdf",
      contenu: Buffer.from("%PDF-1.4").toString("base64"),
      type: "confirmation",
    },
    {
      findBooking: async () => ({ id: DOSSIER, reference: "TB-1" }),
      attach: async () => ({
        document: { id: DOC, booking_item_id: CARTE, file_name: "billet.pdf", kind: "confirmation" },
      }),
    }
  );
  assert.equal(saved.document_id, DOC);
  assert.equal(saved.carte_id, CARTE);
  await assert.rejects(
    () =>
      retirerPieceDossier(
        { dossier_id: DOSSIER, document_id: DOC },
        { findBooking: async () => ({ id: DOSSIER, reference: "TB-1" }) }
      ),
    /confirmer true/
  );
});

test("le journal entier est fermé à l’agent, un dossier reste ouvert", async () => {
  const agent = { role: "agent", allows: permissionFlags("agent", null) };
  assert.match(journalReadDenial(agent, false) || "", /journal/);
  assert.equal(journalReadDenial(agent, true), null);
  assert.equal(journalReadDenial({ role: "admin", allows: null }, false), null);
  const page = await lireJournal(
    { entite: "dossier", id: DOSSIER },
    {
      readJournal: async (query) => {
        assert.equal(query.entity, "dossier");
        assert.equal(query.id, DOSSIER);
        return { lignes: [], chaine_intacte: true };
      },
    }
  );
  assert.equal(page.chaine_intacte, true);
});

test("le journal d’une suppression nomme le client", () => {
  const row = mcpWriteJournalDraft("supprimer_client", { client_id: CLIENT }, "Raphael");
  assert.equal(row.action, "delete");
  assert.equal(row.entityType, "client");
  assert.equal(row.entityId, CLIENT);
  assert.match(row.summary, /Client supprimé par Raphael/);
});

test("réactiver un membre refuse un identifiant vide", async () => {
  await assert.rejects(() => reactiverMembre({ staff_id: "pas-un-id" }), /Membre introuvable/);
});

test("le type de pièce dossier reprend le libellé carte d’embarquement", () => {
  assert.equal(bookingDocumentKind("carte d’embarquement"), "carte d'embarquement");
  assert.equal(bookingDocumentKind(""), "other");
});
