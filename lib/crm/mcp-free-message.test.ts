import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { envoyerMessageLibre } from "./mcp-free-message";
import { McpWriteError } from "./mcp-write";
import { FREE_MESSAGE_TEMPLATE } from "./free-message-whatsapp";
import { VISA_GRANT_SENTENCE_V2 } from "./visa-grant-whatsapp";

const DOC = "c529ab8a-5777-4faf-8bb9-9b1014705dca";
const TRAVEL_DOC = "5912da19-11e3-4976-a91d-98fe8a99dd9a";
const BOOKING = "deee933c-62d2-4744-82be-f8f914f6b44a";
const CLIENT = "3f50d3ab-39d3-4ba0-a0dc-ab129538168f";
const TRAVELER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const COMPANION = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const MESSAGE = "Amin, voici votre attestation signée.";

function rejection(run: () => Promise<unknown>) {
  return assert.rejects(run, McpWriteError);
}

function fakeCrm(
  extra: {
    messages?: Record<string, unknown>[];
    optOut?: string | null;
    phone?: string | null;
    traveler?: boolean;
    bookingPdf?: boolean;
  } = {}
) {
  const bookingPdf = extra.bookingPdf !== false;
  const tables: Record<string, Record<string, unknown>[]> = {
    crm_booking_documents: bookingPdf
      ? [
          {
            id: DOC,
            booking_id: BOOKING,
            mime_type: "application/pdf",
            file_name: "attestation-cdc-ebola-amin-khiari-signee.pdf",
            storage_path: "bookings/attestation.pdf",
          },
        ]
      : [],
    crm_travel_documents: [
      {
        id: TRAVEL_DOC,
        customer_id: CLIENT,
        booking_id: extra.traveler ? BOOKING : null,
        traveler_id: extra.traveler ? TRAVELER : null,
        mime_type: "application/pdf",
        file_name: "attestation.pdf",
        storage_path: "customers/attestation.pdf",
      },
    ],
    crm_bookings: [{ id: BOOKING, customer_id: CLIENT, reference: "TB-2026-0124" }],
    crm_customers: [
      {
        id: CLIENT,
        phone: extra.phone === undefined ? "+33600000000" : extra.phone,
        phone_secondary: null,
        auth_user_id: null,
        whatsapp_opt_in_at: extra.optOut === "missing" ? null : "2026-01-01",
        whatsapp_opt_out_at: extra.optOut === "out" ? "2026-02-01" : null,
      },
    ],
    crm_booking_travelers: extra.traveler
      ? [{ id: TRAVELER, booking_id: BOOKING, companion_id: COMPANION, is_account_holder: false }]
      : [],
    crm_travel_companions: extra.traveler ? [{ id: COMPANION, phone: "+33611111111" }] : [],
    crm_whatsapp_messages: extra.messages ? extra.messages.map((row) => ({ ...row })) : [],
    crm_customer_activity: [],
    crm_audit_events: [],
  };
  const sends: { phone: string | null | undefined; contentSid: string; variables: Record<string, string> | null }[] = [];

  function from(table: string) {
    const filters: [string, unknown][] = [];
    let op = "select";
    let payload: Record<string, unknown> = {};
    let error: { code?: string; message?: string } | null = null;
    let inserted: Record<string, unknown> | null = null;
    const api = {
      select() {
        return api;
      },
      insert(value: Record<string, unknown>) {
        op = "insert";
        payload = value;
        const rows = tables[table] || (tables[table] = []);
        if (value.dedupe_key && rows.some((row) => row.dedupe_key === value.dedupe_key)) {
          error = { code: "23505", message: "duplicate" };
        } else {
          inserted = { id: `${table}-${rows.length + 1}`, ...value };
          rows.push(inserted);
        }
        return api;
      },
      update(value: Record<string, unknown>) {
        op = "update";
        payload = value;
        return api;
      },
      eq(column: string, value: unknown) {
        filters.push([column, value]);
        return api;
      },
      maybeSingle() {
        return Promise.resolve(one());
      },
      single() {
        return Promise.resolve(one());
      },
      then(resolve: (value: { data: unknown; error: typeof error }) => void, reject?: (err: unknown) => void) {
        try {
          resolve(finish());
        } catch (err) {
          reject?.(err);
        }
      },
    };
    function matching() {
      return (tables[table] || []).filter((row) => filters.every(([column, value]) => row[column] === value));
    }
    function finish() {
      if (op === "update") {
        for (const row of matching()) Object.assign(row, payload);
        return { data: null, error };
      }
      if (op === "insert") return { data: inserted, error };
      return { data: matching(), error };
    }
    function one() {
      const result = finish();
      const data = Array.isArray(result.data) ? result.data[0] || null : result.data;
      return { data, error: result.error };
    }
    return api;
  }

  return {
    admin: { from } as unknown as SupabaseClient,
    tables,
    sends,
    deps(approved = true) {
      return {
        resolveSid: async () => (approved ? "HXmessagelibre000000000000000000" : ""),
        approved: async () => approved,
        send: async (input: { phone: string | null | undefined; contentSid: string; variables: Record<string, string> | null }) => {
          sends.push(input);
          return { ok: true as const, sid: "SMlibre" };
        },
        sign: (documentId: string, filename: string) => `token.${documentId}/${filename}`,
      };
    },
  };
}

test("sans confirmer, l’aperçu part et aucun WhatsApp", async () => {
  const crm = fakeCrm();
  const result = await envoyerMessageLibre(
    { document_id: DOC, message: MESSAGE, destinataires: "client" },
    crm.admin,
    crm.deps()
  );
  assert.equal(result.confirme, false);
  assert.equal(result.notifie, false);
  assert.equal(result.modele, FREE_MESSAGE_TEMPLATE);
  assert.equal(result.dossier_id, BOOKING);
  assert.equal(result.client_id, CLIENT);
  assert.equal(result.fichier, "attestation-cdc-ebola-amin-khiari-signee.pdf");
  assert.match(result.apercu, /Amin, voici votre attestation signée/);
  assert.match(result.apercu, /Travel BA/);
  assert.match(result.apercu, /Le Concierge/);
  assert.equal(result.apercu.includes(VISA_GRANT_SENTENCE_V2), false);
  assert.match(result.note, /Rien n’a été envoyé/);
  assert.equal(result.destinataires.length, 1);
  assert.equal(result.destinataires[0].qui, "client");
  assert.equal(result.destinataires[0].notifie, false);
  assert.equal(crm.sends.length, 0);
  assert.equal(crm.tables.crm_whatsapp_messages.length, 0);
  assert.equal(JSON.stringify(result).includes("+336"), false);
});

test("confirmer envoie le PDF du dossier avec le texte libre", async () => {
  const previous = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
  try {
    const crm = fakeCrm();
    const result = await envoyerMessageLibre(
      { document_id: DOC, message: MESSAGE, confirmer: true, destinataires: "tous" },
      crm.admin,
      crm.deps()
    );
    assert.equal(result.notifie, true);
    assert.equal(result.destinataires.length, 1);
    assert.equal(result.destinataires[0].qui, "client");
    assert.equal(result.destinataires[0].twilio_sid, "SMlibre");
    assert.equal(crm.sends.length, 1);
    assert.equal(crm.sends[0].contentSid, "HXmessagelibre000000000000000000");
    assert.equal(crm.sends[0].phone, "+33600000000");
    assert.equal(crm.sends[0].variables?.["2"], MESSAGE);
    assert.match(crm.sends[0].variables?.["1"] || "", /attestation-cdc-ebola-amin-khiari-signee\.pdf$/);
    assert.equal(/^https?:/i.test(crm.sends[0].variables?.["1"] || ""), false);
    const stored = crm.tables.crm_whatsapp_messages[0];
    assert.equal(stored.template_key, FREE_MESSAGE_TEMPLATE);
    assert.equal(stored.status, "sent");
    assert.equal(String(stored.template_key).includes("autorisation"), false);
    assert.equal(JSON.stringify(stored).includes("+336"), false);
    assert.equal(crm.tables.crm_customer_activity[0].action, "whatsapp_message_libre");

    const second = await envoyerMessageLibre(
      { document_id: DOC, message: MESSAGE, confirmer: true },
      crm.admin,
      crm.deps()
    );
    assert.equal(second.notifie, false);
    assert.equal(second.destinataires[0].raison, "Déjà envoyé.");
    assert.equal(crm.sends.length, 1);
  } finally {
    if (previous === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previous;
  }
});

test("un client qui a coupé WhatsApp n’est pas écrit", async () => {
  const crm = fakeCrm({ optOut: "out" });
  const result = await envoyerMessageLibre(
    { document_id: DOC, message: MESSAGE, confirmer: true, destinataires: "client" },
    crm.admin,
    crm.deps()
  );
  assert.equal(result.notifie, false);
  assert.match(result.destinataires[0].raison || "", /activé/);
  assert.equal(crm.sends.length, 0);
  assert.equal(crm.tables.crm_whatsapp_messages.length, 0);
});

test("un modèle non approuvé n’envoie rien", async () => {
  const crm = fakeCrm();
  await rejection(() =>
    envoyerMessageLibre({ document_id: DOC, message: MESSAGE, confirmer: true }, crm.admin, crm.deps(false))
  );
  assert.equal(crm.sends.length, 0);
  assert.equal(crm.tables.crm_whatsapp_messages.length, 0);
});

test("le voyageur d’un autre numéro reçoit le PDF, le client peut être omis", async () => {
  const crm = fakeCrm({ traveler: true, bookingPdf: false });
  const only = await envoyerMessageLibre(
    { document_id: TRAVEL_DOC, message: MESSAGE, confirmer: true, destinataires: "voyageur" },
    crm.admin,
    crm.deps()
  );
  assert.equal(only.destinataires.length, 1);
  assert.equal(only.destinataires[0].qui, "voyageur");
  assert.equal(only.notifie, true);
  assert.equal(crm.sends[0].phone, "+33611111111");
  assert.equal(crm.sends.length, 1);
});

test("une pièce du dossier sans voyageur ne cible pas un voyageur en trop", async () => {
  const crm = fakeCrm();
  const preview = await envoyerMessageLibre({ document_id: DOC, message: MESSAGE, destinataires: "voyageur" }, crm.admin, crm.deps());
  assert.equal(preview.destinataires[0].raison, "La pièce n’est pas liée à un voyageur.");
  assert.equal(crm.sends.length, 0);
  await rejection(() => envoyerMessageLibre({ document_id: DOC, message: "12AB34567", confirmer: true }, crm.admin, crm.deps()));
  await rejection(() => envoyerMessageLibre({ document_id: "pas-un-id", message: MESSAGE }, crm.admin, crm.deps()));
});

test("un fichier qui n’est pas un PDF est refusé", async () => {
  const crm = fakeCrm();
  crm.tables.crm_booking_documents[0].mime_type = "image/jpeg";
  crm.tables.crm_booking_documents[0].file_name = "photo.jpg";
  await rejection(() => envoyerMessageLibre({ document_id: DOC, message: MESSAGE, confirmer: true }, crm.admin, crm.deps()));
  assert.equal(crm.sends.length, 0);
});
