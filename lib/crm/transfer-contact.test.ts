import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CarnetItinerary } from "../../components/account/CarnetItinerary";
import { IngestItemCard } from "../../components/crm/IngestItemCard";
import type { CrmBookingItem } from "./types";
import type { PublicBooking } from "./public-booking";
import { ajouterCarte, modifierCarte } from "./mcp-desk";
import { McpWriteError } from "./mcp-write";
import { applyTransferContact, transferClientContact, transferPhoneE164 } from "./transfer-contact";
import { buildConciergeDossier, conciergeContextText, planConciergeTurn, routerCanAnswerAlone } from "./whatsapp-concierge";

const DOSSIER = "22222222-2222-4222-8222-222222222222";
const CARTE = "33333333-3333-4333-8333-333333333333";

function fakeAdmin(): SupabaseClient {
  return { from() { throw new Error("Le test ne doit pas interroger Supabase."); } } as unknown as SupabaseClient;
}

const booking = {
  id: DOSSIER,
  reference: "TB-2026-0159",
  visible_to_client: true,
  archived_at: null,
  status: "confirmed",
};

test("le téléphone du prestataire est un E.164, le contact caché ne sort pas", () => {
  assert.equal(transferPhoneE164("06 12 34 56 78"), "+33612345678");
  assert.equal(transferPhoneE164("+1 202 555 0123"), "+12025550123");
  assert.equal(transferPhoneE164("pas un numéro"), null);
  const shown = transferClientContact({
    kind: "transfer",
    supplier: "Alpine Transfers",
    visible_to_client: true,
    details: { phone: "+33612345678", driver: "Marc", document_amount: 987654, notes: "NOTE-INTERNE-XYZ" },
  });
  assert.equal(shown?.phone, "+33612345678");
  assert.equal(shown?.name, "Alpine Transfers");
  assert.equal(shown?.driver, "Marc");
  assert.equal(shown?.tel, "tel:+33612345678");
  assert.equal(shown?.whatsapp, "https://wa.me/33612345678");
  assert.equal("document_amount" in (shown || {}), false);
  assert.equal(transferClientContact({ kind: "transfer", supplier: "Alpine", visible_to_client: true, details: { driver: "Marc" } }), null);
  assert.equal(
    transferClientContact({
      kind: "transfer",
      supplier: "Alpine",
      visible_to_client: false,
      details: { phone: "+33612345678" },
    }),
    null
  );
  assert.equal(transferClientContact({ kind: "car", supplier: "SIXT", visible_to_client: true, details: { phone: "+33612345678", driver: "Marc" } }), null);
  assert.equal(transferClientContact({ kind: "hotel", visible_to_client: true, details: { phone: "+33612345678" } }), null);
});

test("ajouter et modifier un transfert gardent le trajet et n’ouvrent pas la carte", async () => {
  const added: { body: Record<string, unknown> | null } = { body: null };
  const created = await ajouterCarte(
    {
      dossier_id: DOSSIER,
      type: "transfert",
      titre: "Gare de Moûtiers → Hôtel Le Savoy Méribel",
      prestataire: "Alpine Transfers",
      telephone: "06 12 34 56 78",
      chauffeur: "Marc",
      details: { pickup: "Gare de Moûtiers", dropoff: "Hôtel Le Savoy Méribel", document_amount: 987654 },
    },
    {
      admin: fakeAdmin(),
      findBooking: async () => booking,
      addCard: async (_db, _id, body) => {
        added.body = body;
        return { item: { id: CARTE }, ledgerWarning: null };
      },
    }
  );
  assert.equal(created.carte_id, CARTE);
  assert.equal(added.body?.supplier, "Alpine Transfers");
  assert.equal(added.body ? "visible_to_client" in added.body : false, false);
  const details = added.body?.details as Record<string, unknown>;
  assert.equal(details.phone, "+33612345678");
  assert.equal(details.driver, "Marc");
  assert.equal(details.pickup, "Gare de Moûtiers");
  assert.equal(details.document_amount, 987654);

  const patched: { body: Record<string, unknown> | null } = { body: null };
  await modifierCarte(
    { dossier_id: DOSSIER, carte_id: CARTE, telephone: "", chauffeur: "Léa" },
    {
      admin: fakeAdmin(),
      findBooking: async () => booking,
      readCard: async () => ({
        id: CARTE,
        kind: "transfer",
        supplier: "Alpine Transfers",
        visible_to_client: false,
        details: { pickup: "Gare de Moûtiers", phone: "+33612345678", driver: "Marc", document_amount: 987654 },
      }),
      patchCard: async (_db, _booking, _item, body) => {
        patched.body = body;
        return { item: { id: CARTE }, ledgerWarning: null };
      },
    }
  );
  const next = patched.body?.details as Record<string, unknown>;
  assert.equal(next.pickup, "Gare de Moûtiers");
  assert.equal(next.phone, undefined);
  assert.equal(next.driver, "Léa");
  assert.equal(next.document_amount, 987654);
  assert.equal(patched.body ? "visible_to_client" in patched.body : false, false);
  assert.equal(patched.body ? "supplier" in patched.body : false, false);

  await assert.rejects(
    () =>
      ajouterCarte(
        { dossier_id: DOSSIER, type: "transfert", titre: "Transfert", telephone: "abc" },
        { admin: fakeAdmin(), findBooking: async () => booking, addCard: async () => { throw new Error("ne doit pas écrire"); } }
      ),
    (err: unknown) => err instanceof McpWriteError && /format international/.test(err.message)
  );
  await assert.rejects(
    () =>
      modifierCarte(
        { dossier_id: DOSSIER, carte_id: CARTE, telephone: "+33612345678" },
        {
          admin: fakeAdmin(),
          findBooking: async () => booking,
          readCard: async () => ({ id: CARTE, kind: "hotel", supplier: null, visible_to_client: true, details: {} }),
          patchCard: async () => { throw new Error("ne doit pas écrire"); },
        }
      ),
    (err: unknown) => err instanceof McpWriteError && /carte transfert/.test(err.message)
  );
});

test("le détail client montre Appeler et WhatsApp, pas le prix d’achat", () => {
  function card(partial: Partial<CrmBookingItem> & Pick<CrmBookingItem, "id" | "kind" | "title">): CrmBookingItem {
    return {
      booking_id: "b1",
      supplier: null,
      confirmation_ref: null,
      start_at: "2026-12-20T12:56:00",
      end_at: null,
      amount: null,
      include_in_ledger: false,
      sort_order: 0,
      details: {},
      visible_to_client: true,
      source_document_id: null,
      created_at: "",
      updated_at: "",
      ...partial,
    };
  }
  const stay = {
    id: "b1",
    reference: "TB-2026-0159",
    title: "Méribel",
    destination: "Méribel",
    start_date: "2026-12-20",
    end_date: "2026-12-27",
    currency: "EUR",
    status: "confirmed",
    cover_image_path: null,
    cover_credit: null,
    notes_client: null,
    prices_visible: false,
    visible_to_client: true,
    offer_chauffeur: false,
    offer_greeter: false,
    updated_at: "2026-12-01T12:00:00.000Z",
  } as PublicBooking;
  const html = renderToStaticMarkup(
    createElement(CarnetItinerary, {
      booking: stay,
      docs: [],
      items: [
        card({
          id: "transfert",
          kind: "transfer",
          title: "Gare de Moûtiers → Hôtel Le Savoy Méribel",
          supplier: "Alpine Transfers",
          details: {
            pickup: "Gare de Moûtiers",
            dropoff: "Hôtel Le Savoy Méribel",
            phone: "+33612345678",
            driver: "Marc",
            document_amount: 987654,
            notes: "NOTE-INTERNE-XYZ",
          },
        }),
        card({
          id: "cache",
          kind: "transfer",
          title: "Transfert caché",
          supplier: "Secret Transfer",
          visible_to_client: false,
          details: { phone: "+33699999999", driver: "Inconnu" },
        }),
        card({
          id: "voiture",
          kind: "car",
          title: "Voiture",
          supplier: "SIXT",
          details: { phone: "+33600000000", driver: "Marc" },
        }),
      ],
    })
  );
  assert.match(html, /Alpine Transfers/);
  assert.match(html, /Chauffeur Marc/);
  assert.match(html, /href="tel:\+33612345678"/);
  assert.match(html, /href="https:\/\/wa\.me\/33612345678"/);
  assert.match(html, />Appeler</);
  assert.match(html, />WhatsApp</);
  assert.equal(html.includes("+33699999999"), false);
  assert.equal(html.includes("987654"), false);
  assert.equal(html.includes("NOTE-INTERNE-XYZ"), false);
  assert.equal(html.includes("Prix d’achat"), false);
  assert.equal(html.includes("+33600000000"), false);

  const editor = renderToStaticMarkup(
    createElement(IngestItemCard, {
      item: {
        kind: "transfer",
        title: "Gare de Moûtiers → Hôtel Le Savoy Méribel",
        supplier: "Alpine Transfers",
        confirmation_ref: null,
        start_at: "2026-12-20T12:56:00",
        end_at: null,
        amount: null,
        details: { pickup: "Gare de Moûtiers", dropoff: "Hôtel Le Savoy Méribel", phone: "+33612345678", driver: "Marc" },
      },
      onChange: () => {},
      onRemove: () => {},
    })
  );
  assert.match(editor, /Prestataire/);
  assert.match(editor, /Téléphone du prestataire/);
  assert.match(editor, /Chauffeur/);
  assert.equal(editor.includes(">Fournisseur<"), false);
  const kept = applyTransferContact({
    kind: "transfer",
    supplier: "Alpine Transfers",
    details: { pickup: "Gare" },
    setPrestataire: false,
    setTelephone: false,
    setChauffeur: false,
  });
  assert.equal(kept.ok && kept.changed, false);
});

test("le concierge donne le numéro d’une carte transfert visible", () => {
  const stay = {
    id: "stay",
    reference: "TB-2026-0159",
    title: "Méribel",
    destination: "Méribel",
    start_date: "2026-12-20",
    end_date: "2026-12-27",
    currency: "EUR",
    total_amount: 0,
    visible_to_client: true,
    cover_image_path: null,
    prices_visible: false,
    notes_client: null,
    notes_internal: "NOTE-INTERNE-XYZ",
  };
  const dossier = buildConciergeDossier({
    firstName: "Camille",
    bookings: [stay],
    items: [
      {
        id: "transfert",
        booking_id: "stay",
        kind: "transfer",
        title: "Gare de Moûtiers → Hôtel Le Savoy Méribel",
        supplier: "Alpine Transfers",
        start_at: "2026-12-20T12:56:00",
        end_at: null,
        amount: 120,
        visible_to_client: true,
        details: {
          pickup: "Gare de Moûtiers",
          dropoff: "Hôtel Le Savoy Méribel",
          phone: "+33612345678",
          driver: "Marc",
          document_amount: 987654,
          notes: "NOTE-INTERNE-XYZ",
        },
      },
      {
        id: "cache",
        booking_id: "stay",
        kind: "transfer",
        title: "Transfert caché",
        supplier: "Secret Transfer",
        start_at: "2026-12-20T18:00:00",
        end_at: null,
        amount: null,
        visible_to_client: false,
        details: { phone: "+33699999999" },
      },
    ],
  });
  const packed = conciergeContextText(dossier);
  assert.match(packed, /\+33612345678/);
  assert.equal(packed.includes("+33699999999"), false);
  assert.equal(packed.includes("987654"), false);
  assert.equal(packed.includes("NOTE-INTERNE-XYZ"), false);
  const now = new Date("2026-12-01T10:00:00Z");
  const turn = planConciergeTurn("Quel est le numéro du chauffeur ?", dossier, now);
  assert.match(turn.text, /Alpine Transfers/);
  assert.match(turn.text, /\+33 6 12 34 56 78/);
  assert.match(turn.text, /Marc/);
  assert.equal(turn.text.includes("987654"), false);
  assert.equal(turn.text.includes("NOTE-INTERNE-XYZ"), false);
  assert.equal(turn.handoff, null);
  assert.equal(routerCanAnswerAlone("Quel est le numéro du transfert ?", turn, dossier, now), true);
  const missing = planConciergeTurn("Quel est le numéro du chauffeur ?", buildConciergeDossier({
    firstName: "Camille",
    bookings: [stay],
    items: [
      {
        id: "transfert",
        booking_id: "stay",
        kind: "transfer",
        title: "Gare de Moûtiers → Hôtel",
        supplier: "Alpine Transfers",
        start_at: "2026-12-20T12:56:00",
        end_at: null,
        amount: null,
        visible_to_client: true,
        details: { pickup: "Gare" },
      },
    ],
  }), now);
  assert.match(missing.text, /numéro du transfert/);
  assert.equal(missing.text.includes("Alpine"), false);
});
