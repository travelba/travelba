import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DELETE_CUSTOMER_CONFIRM_ERROR } from "./delete-confirm";
import { bookingDocumentKind } from "./booking-document-write";
import { reactiverMembre } from "./mcp-agency";
import {
  type DeskDeps,
  ajouterCarte,
  archiverDossier,
  cacherCarnet,
  ajouterSociete,
  deposerPieceDossier,
  enregistrerSocietes,
  modifierSociete,
  journalReadDenial,
  lireJournal,
  reglerAccesHotels,
  retirerPieceDossier,
  supprimerClient,
} from "./mcp-desk";
import { mcpWriteJournalDraft } from "./mcp-journal";
import { McpWriteError } from "./mcp-write";
import { permissionFlags } from "./agency-access";

function fakeAdmin(): SupabaseClient {
  return {
    from() {
      throw new Error("Le test ne doit pas interroger Supabase.");
    },
  } as unknown as SupabaseClient;
}

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
          admin: fakeAdmin(),
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
      admin: fakeAdmin(),
      loadCustomer: async () => ({ first_name: "Léa", last_name: "Martin" }),
      deleteCustomer: async () => ({ ok: true, name: "Léa Martin" }),
    }
  );
  assert.equal(done.supprime, true);
  assert.equal(done.nom, "Léa Martin");
});

test("les sociétés remplacent la liste seulement avec confirmer", async () => {
  await assert.rejects(
    () =>
      enregistrerSocietes(
        { client_id: CLIENT, societes: [] },
        { admin: fakeAdmin(), saveCompanies: async () => ({ ok: true, companies: [] }) }
      ),
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
      admin: fakeAdmin(),
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
    { client_id: CLIENT, actif: true, mode_reel: true, reservation_api: true },
    {
      admin: fakeAdmin(),
      writeHotelAccess: async (input) => {
        seen = input;
        return { ok: true, enabled: true, live: true, leApi: input.leApi === true };
      },
    }
  );
  assert.equal((seen as { actor: string }).actor, "admin");
  assert.equal((seen as { live: boolean }).live, true);
  assert.equal((seen as { leApi?: boolean }).leApi, true);
  assert.equal(opened.mode_reel, true);
  assert.equal(opened.reservation_api, true);
  const refused = await reglerAccesHotels(
    { client_id: CLIENT, demande: "refuser" },
    {
      admin: fakeAdmin(),
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
        {
          admin: fakeAdmin(),
          findBooking: async () => ({ id: DOSSIER, reference: "TB-1" }),
          archive: async () => {
            archived = true;
            return {};
          },
        }
      ),
    /confirmer true/
  );
  assert.equal(archived, false);
  const hidden = await cacherCarnet(
    { dossier_id: DOSSIER, confirmer: true },
    {
      admin: fakeAdmin(),
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
      admin: fakeAdmin(),
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
        { admin: fakeAdmin(), findBooking: async () => ({ id: DOSSIER, reference: "TB-1" }) }
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
      admin: fakeAdmin(),
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
        { admin: fakeAdmin(), findBooking: async () => ({ id: DOSSIER, reference: "TB-1" }) }
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

test("ajouter et modifier une société ne remplacent pas la liste", async () => {
  await assert.rejects(() => ajouterSociete({ client_id: CLIENT }, { admin: fakeAdmin() }), /raison sociale ou le SIRET/);
  const added: { id: string; raw: { company_name?: unknown; billing_email?: unknown; siret?: unknown } | null } = {
    id: "",
    raw: null,
  };
  const created = await ajouterSociete(
    { client_id: CLIENT, raison_sociale: "Bureau LLC", email: "Compta@Bureau.test", pays: "US" },
    {
      admin: fakeAdmin(),
      appendCompany: async (_db, id, raw) => {
        added.id = id;
        added.raw = raw;
        return {
          ok: true as const,
          company: {
            id: "soc-2",
            customer_id: CLIENT,
            company_name: "Bureau LLC",
            siret: null,
            vat_number: null,
            billing_email: "compta@bureau.test",
            billing_address_line: null,
            billing_postal_code: null,
            billing_city: null,
            billing_country: "US",
            sort_order: 1,
          },
          companies: [
            {
              id: "soc-1",
              customer_id: CLIENT,
              company_name: "Atelier",
              siret: "73282932000074",
              vat_number: null,
              billing_email: null,
              billing_address_line: null,
              billing_postal_code: null,
              billing_city: "Paris",
              billing_country: "FR",
              sort_order: 0,
            },
            {
              id: "soc-2",
              customer_id: CLIENT,
              company_name: "Bureau LLC",
              siret: null,
              vat_number: null,
              billing_email: "compta@bureau.test",
              billing_address_line: null,
              billing_postal_code: null,
              billing_city: null,
              billing_country: "US",
              sort_order: 1,
            },
          ],
        };
      },
    }
  );
  assert.equal(added.raw?.company_name, "Bureau LLC");
  assert.equal(added.raw?.billing_email, "Compta@Bureau.test");
  assert.equal("siret" in (added.raw || {}), false);
  assert.equal(created.ajoutee, true);
  assert.equal(created.societes[0]?.raison_sociale, "Atelier");
  assert.equal(created.societes[0]?.principale, true);
  assert.equal(created.societes[1]?.principale, false);
  const edited: { societeId: string; billing_city?: unknown } = { societeId: "" };
  await modifierSociete(
    { client_id: CLIENT, societe_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", ville: "Lyon" },
    {
      admin: fakeAdmin(),
      updateCompany: async (_db, _id, societeId, raw) => {
        edited.societeId = societeId;
        edited.billing_city = raw.billing_city;
        return {
          ok: true as const,
          company: {
            id: societeId,
            customer_id: CLIENT,
            company_name: "Atelier",
            siret: null,
            vat_number: null,
            billing_email: null,
            billing_address_line: null,
            billing_postal_code: null,
            billing_city: "Lyon",
            billing_country: null,
            sort_order: 0,
          },
          companies: [],
        };
      },
    }
  );
  assert.deepEqual(edited, { societeId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", billing_city: "Lyon" });
  const journal = mcpWriteJournalDraft("ajouter_societe", { client_id: CLIENT }, "Raphael");
  assert.equal(journal.action, "create");
  assert.equal(journal.entityType, "client");
  assert.match(journal.summary, /Société de facturation ajoutée/);
  const changed = mcpWriteJournalDraft("modifier_societe", { client_id: CLIENT }, "Raphael");
  assert.equal(changed.action, "update");
  assert.match(changed.summary, /Société de facturation modifiée/);
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
