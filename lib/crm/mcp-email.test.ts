import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { previewMcpTool } from "./mcp-registry";
import { McpWriteError, settleEmail } from "./mcp-write";
import { createDossierFromEmail, emailTicketView, readLireEmail, redactEmailReadText } from "./mcp-email";

const MAIL = "33333333-3333-4333-8333-333333333333";
const CLIENT = "11111111-1111-4111-8111-111111111111";
const CLIENT_2 = "44444444-4444-4444-8444-444444444444";
const BOOKING = "22222222-2222-4222-8222-222222222222";

const TICKET = {
  document_status: "confirmed",
  title: "Tel Aviv",
  destination: "Tel Aviv",
  start_date: "2026-11-01",
  end_date: "2026-11-08",
  currency: "EUR",
  customer_first_name: "Camille",
  customer_last_name: "Martin",
  customer_email: null,
  notes_internal: "Passeport 12AB34567",
  items: [
    {
      kind: "flight",
      title: "Tel Aviv → Paris",
      supplier: "Arkia",
      confirmation_ref: "14028540",
      start_at: "2026-11-01T10:00:00",
      details: {
        from: "TLV",
        to: "CDG",
        flight_number: "IZ611",
        pnr: "14028540",
        airline: "Arkia",
        document_amount: 500,
        document_currency: "EUR",
      },
    },
    {
      kind: "flight",
      title: "Paris → Tel Aviv",
      supplier: "Arkia",
      confirmation_ref: "14028540",
      start_at: "2026-11-08T18:00:00",
      details: {
        from: "CDG",
        to: "TLV",
        flight_number: "IZ612",
        pnr: "14028540",
        airline: "Arkia",
        document_amount: 500,
        document_currency: "EUR",
      },
    },
  ],
  travelers: [{ first_name: "Camille", last_name: "Martin" }],
};

function fold(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function memoryAdmin(seed: Record<string, Record<string, unknown>[]>) {
  const tables: Record<string, Record<string, unknown>[]> = {};
  for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map((row) => ({ ...row }));
  const inserts: { table: string; row: Record<string, unknown> }[] = [];
  function from(table: string) {
    if (!tables[table]) tables[table] = [];
    const filters: { op: "eq" | "neq" | "in" | "ilike"; column: string; value: unknown }[] = [];
    let payload: Record<string, unknown> | null = null;
    let mode: "select" | "insert" | "update" = "select";
    const matches = (row: Record<string, unknown>) =>
      filters.every((filter) => {
        if (filter.op === "eq") return row[filter.column] === filter.value;
        if (filter.op === "neq") return row[filter.column] !== filter.value;
        if (filter.op === "in") return Array.isArray(filter.value) && filter.value.includes(row[filter.column]);
        return fold(String(row[filter.column] || "")) === fold(String(filter.value || ""));
      });
    const api = {
      select() {
        return api;
      },
      eq(column: string, value: unknown) {
        filters.push({ op: "eq", column, value });
        return api;
      },
      neq(column: string, value: unknown) {
        filters.push({ op: "neq", column, value });
        return api;
      },
      in(column: string, value: unknown) {
        filters.push({ op: "in", column, value });
        return api;
      },
      ilike(column: string, value: unknown) {
        filters.push({ op: "ilike", column, value });
        return api;
      },
      limit() {
        return api;
      },
      order() {
        return api;
      },
      insert(value: Record<string, unknown>) {
        mode = "insert";
        payload = value;
        return api;
      },
      update(value: Record<string, unknown>) {
        mode = "update";
        payload = value;
        return api;
      },
      maybeSingle() {
        return Promise.resolve(one());
      },
      single() {
        return Promise.resolve(one());
      },
      then(resolve: (value: { data: unknown; error: null }) => void) {
        resolve(many());
      },
    };
    function one() {
      if (mode === "insert") {
        const row = { id: crypto.randomUUID(), ...payload };
        tables[table].push(row);
        inserts.push({ table, row });
        return { data: row, error: null };
      }
      if (mode === "update") {
        const hits = tables[table].filter(matches);
        for (const row of hits) Object.assign(row, payload);
        return { data: hits[0] ?? null, error: null };
      }
      return { data: tables[table].find(matches) ?? null, error: null };
    }
    function many() {
      if (mode === "insert" || mode === "update") return one();
      return { data: tables[table].filter(matches), error: null };
    }
    return api;
  }
  return {
    from,
    tables,
    inserts,
    client: { from } as unknown as SupabaseClient,
  };
}

function mailRow(patch: Record<string, unknown> = {}) {
  return {
    id: MAIL,
    status: "matched",
    from_email: "reservations@expedia.com",
    subject: "Votre billet",
    received_at: "2026-10-21T13:05:09.000Z",
    body_text: "Passeport 12AB34567. Visa 4111111111111111. PNR X97UJQ.",
    body_html: "",
    extract: TICKET,
    attachments: [
      { name: "billet.pdf", path: "email-ingest/secret/billet.pdf", mime_type: "application/pdf" },
      { name: "logo.png", path: "email-ingest/secret/logo.png", mime_type: "image/png" },
    ],
    candidates: [],
    warnings: [],
    error: null,
    ...patch,
  };
}

test("le texte lu masque le passeport et la carte, et garde le PNR", () => {
  const out = redactEmailReadText(
    "Passeport 12AB34567\nP<FRADUPONT<<CAMILLE<<<<<<<<<<<<<<<<<<<\nVisa 4111 1111 1111 1111\nPNR X97UJQ\nVol IZ611"
  );
  assert.equal(out.includes("12AB34567"), false);
  assert.equal(out.includes("4111 1111 1111 1111"), false);
  assert.equal(out.includes("P<FRADUPONT"), false);
  assert.match(out, /X97UJQ/);
  assert.match(out, /IZ611/);
  assert.match(out, /567/);
});

test("le billet lu regroupe l’aller-retour et ne répète pas le total", () => {
  const view = emailTicketView(TICKET);
  assert.equal(view.cartes.length, 2);
  assert.equal(view.cartes[0]?.montant_lu, 500);
  assert.equal(view.cartes[1]?.montant_lu, null);
  assert.equal(view.cartes[0]?.vol, "IZ611");
  assert.equal(view.cartes[0]?.aller_retour, 1);
  assert.equal(view.cartes[1]?.aller_retour, 1);
  assert.equal(view.aller_retour.length, 1);
  assert.equal(view.notes?.includes("12AB34567"), false);
  assert.match(view.notes || "", /567/);
});

test("lire_email rend le corps, le texte du PDF et le billet, sans chemin ni numéro complet", async () => {
  const store = memoryAdmin({ crm_email_ingest: [mailRow()] });
  const calls: string[] = [];
  const read = await readLireEmail({ id: MAIL }, store.client, {
    pdfText: async (attachment) => {
      calls.push(attachment.name);
      return "Passeport 12AB34567\nCarte 4111111111111111\nPNR X97UJQ";
    },
  });
  assert.deepEqual(calls, ["billet.pdf"]);
  assert.equal(read.corps.includes("12AB34567"), false);
  assert.equal(read.corps.includes("4111111111111111"), false);
  assert.match(read.corps, /X97UJQ/);
  assert.equal(read.pieces[0]?.nom, "billet.pdf");
  assert.equal(read.pieces[0]?.type, "application/pdf");
  assert.equal(read.pieces[0]?.texte?.includes("12AB34567"), false);
  assert.match(read.pieces[0]?.texte || "", /X97UJQ/);
  assert.equal(read.pieces[1]?.texte, null);
  assert.equal(read.billet.cartes.length, 2);
  const packed = JSON.stringify(read);
  assert.equal(packed.includes("email-ingest/secret"), false);
  assert.equal(packed.includes("gmail"), false);
  const shown = JSON.parse(previewMcpTool("lire_email", read).content[0].text) as {
    corps: string;
    pieces: { texte: string | null }[];
  };
  assert.equal(JSON.stringify(shown).includes("4111111111111111"), false);
  assert.equal(JSON.stringify(shown).includes("email-ingest/secret"), false);
  assert.match(shown.corps, /X97UJQ/);
  assert.equal(shown.pieces[0]?.texte?.includes("12AB34567"), false);
});

test("creer_dossier crée la fiche sans e-mail et le dossier caché, avec les deux trajets", async () => {
  const store = memoryAdmin({ crm_email_ingest: [mailRow()], crm_bookings: [] });
  const persisted: { customerId: string; files: string[]; secondAmount: unknown }[] = [];
  const result = await createDossierFromEmail({ id: MAIL, action: "creer_dossier" }, store.client, {
    loadFiles: async () => [new File(["pdf"], "billet.pdf", { type: "application/pdf" })],
    persist: async (opts) => {
      persisted.push({
        customerId: opts.customerId,
        files: opts.files.map((file) => file.name),
        secondAmount: opts.extract.items[1]?.details?.document_amount,
      });
      return { id: BOOKING, reference: "TB-2026-0199", visible_to_client: false };
    },
  });
  assert.equal(result.visible, false);
  assert.equal(result.invitation, false);
  assert.equal(result.cartes, true);
  assert.equal(result.client_cree, true);
  assert.equal(result.reference, "TB-2026-0199");
  assert.equal(persisted.length, 1);
  assert.deepEqual(persisted[0]?.files, ["billet.pdf"]);
  assert.equal(persisted[0]?.secondAmount, undefined);
  const created = store.inserts.find((row) => row.table === "crm_customers");
  assert.equal(created?.row.email, null);
  assert.equal(created?.row.first_name, "Camille");
  assert.equal(store.tables.crm_email_ingest[0]?.status, "attached");
  assert.equal(store.tables.crm_email_ingest[0]?.created_booking_id, BOOKING);
  assert.equal(store.inserts.some((row) => row.table === "crm_audit_events"), true);
});

test("un homonyme sans e-mail n’est pas choisi, et une annulation ne crée rien", async () => {
  const homonyms = memoryAdmin({
    crm_email_ingest: [mailRow()],
    crm_customers: [
      { id: CLIENT, first_name: "Camille", last_name: "Martin", email: null },
      { id: CLIENT_2, first_name: "Camille", last_name: "Martin", email: "autre@exemple.fr" },
    ],
  });
  let persisted = 0;
  await assert.rejects(
    () =>
      createDossierFromEmail({ id: MAIL, action: "creer_dossier" }, homonyms.client, {
        loadFiles: async () => [],
        persist: async () => {
          persisted += 1;
          return { id: BOOKING, reference: "TB-1", visible_to_client: false };
        },
      }),
    (err: unknown) => err instanceof McpWriteError && /Plusieurs fiches/.test(err.message)
  );
  assert.equal(persisted, 0);
  assert.equal(homonyms.inserts.some((row) => row.table === "crm_customers"), false);

  const cancelled = memoryAdmin({
    crm_email_ingest: [mailRow({ extract: { ...TICKET, document_status: "cancelled" } })],
  });
  await assert.rejects(
    () =>
      settleEmail({ id: MAIL, action: "creer_dossier" }, cancelled.client),
    (err: unknown) => err instanceof McpWriteError && /annulation/i.test(err.message)
  );
  assert.equal(cancelled.inserts.length, 0);
  assert.equal(cancelled.tables.crm_email_ingest[0]?.status, "matched");
});

test("l’e-mail du billet retrouve la fiche, le client_id aussi, et un dossier montré est recaché", async () => {
  const byEmail = memoryAdmin({
    crm_email_ingest: [mailRow({ extract: { ...TICKET, customer_email: "camille@exemple.fr" } })],
    crm_customers: [{ id: CLIENT, first_name: "Camille", last_name: "Martin", email: "camille@exemple.fr" }],
    crm_bookings: [{ id: BOOKING, visible_to_client: true }],
  });
  const result = await createDossierFromEmail({ id: MAIL, action: "creer_dossier" }, byEmail.client, {
    loadFiles: async () => [],
    persist: async (opts) => {
      assert.equal(opts.customerId, CLIENT);
      assert.equal(opts.emailIngestId, MAIL);
      return { id: BOOKING, reference: "TB-2026-0200", visible_to_client: true };
    },
  });
  assert.equal(result.client_cree, false);
  assert.equal(result.client_id, CLIENT);
  assert.equal(result.visible, false);
  assert.equal(byEmail.inserts.some((row) => row.table === "crm_customers"), false);
  assert.equal(byEmail.tables.crm_bookings[0]?.visible_to_client, false);

  const byId = memoryAdmin({
    crm_email_ingest: [mailRow({ extract: { ...TICKET, customer_email: "reservations@expedia.com" } })],
    crm_customers: [{ id: CLIENT, first_name: "Ada", last_name: "Lovelace", email: "ada@exemple.fr" }],
  });
  const named = await createDossierFromEmail(
    { id: MAIL, action: "creer_dossier", client_id: CLIENT },
    byId.client,
    {
      loadFiles: async () => [],
      persist: async (opts) => {
        assert.equal(opts.customerId, CLIENT);
        return { id: BOOKING, reference: "TB-2026-0201", visible_to_client: false };
      },
    }
  );
  assert.equal(named.client_cree, false);
  assert.equal(byId.inserts.some((row) => row.table === "crm_customers"), false);
});

test("un e-mail fournisseur ou incomplet ne crée pas la fiche", async () => {
  const store = memoryAdmin({ crm_email_ingest: [mailRow()] });
  await assert.rejects(
    () => createDossierFromEmail({ id: MAIL, action: "creer_dossier", email: "crm@travelba.fr" }, store.client),
    /voyageur/
  );
  await assert.rejects(
    () => createDossierFromEmail({ id: MAIL, action: "creer_dossier", email: "pas-un-mail" }, store.client),
    /e-mail/
  );
  assert.equal(store.inserts.some((row) => row.table === "crm_customers"), false);
});
