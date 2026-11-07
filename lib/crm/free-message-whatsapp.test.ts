import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ensureFreeMessageTemplates,
  freeMessageTemplateDrafts,
} from "./agency-templates-arm";
import { verifyVisaGrantToken } from "./visa-grant-link";
import { freeMessageSignedPath, verifyFreeMessageToken } from "./free-message-link";
import { freeMessagePublicFile } from "./free-message-file";
import { envoyerMessageLibre } from "./mcp-free-message";
import { deposerModelesMessageLibreWhatsapp } from "./mcp-agency-templates";
import { McpWriteError } from "./mcp-write";
import { MCP_TOOLS } from "./mcp-registry";
import { memoryContentSidStore } from "./whatsapp-content-sid-store";
import { whatsappCatalog } from "./whatsapp-catalog";
import {
  FREE_MESSAGE_MEDIA_BODY,
  FREE_MESSAGE_SAMPLE_PDF_URL,
  FREE_MESSAGE_SAMPLE_TEXT,
  FREE_MESSAGE_TEXT_BODY,
  freeMessageContentDrafts,
  freeMessageRatio,
  freeMessageTemplatePreview,
} from "./free-message-whatsapp";

const DOC = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOOKING = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CLIENT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SID = "HXdddddddddddddddddddddddddddddddd";
const NOW = new Date("2026-11-07T10:00:00Z");
const ACCOUNT = "ACtestaccount000000000000000000000";
const TOKEN = "secret-token-that-must-never-leak";

test("le corps a assez de français fixe, et ce n’est pas l’autorisation", () => {
  for (const body of [FREE_MESSAGE_TEXT_BODY, FREE_MESSAGE_MEDIA_BODY]) {
    const ratio = freeMessageRatio(body);
    assert.equal(ratio.ok, true, body);
    assert.ok(ratio.words >= ratio.needed);
    assert.match(body, /Travel BA/);
    assert.match(body, /Le Concierge/);
    assert.equal(body.includes("Bonne nouvelle"), false);
    assert.equal(body.includes("autorisation"), false);
  }
  assert.equal(freeMessageRatio("{{1}}").ok, false);
  const text = freeMessageTemplatePreview("message_libre_texte", "Amin", "Voici votre attestation.");
  const media = freeMessageTemplatePreview("message_libre_document", "Amin", "Voici votre attestation.");
  assert.match(text || "", /Bonjour Amin/);
  assert.match(text || "", /Voici votre attestation/);
  assert.match(media || "", /ci-joint/);
  assert.equal((text || "").includes("{{"), false);
  assert.equal(freeMessageTemplatePreview("message_libre_texte", "Amin", "AB345678"), null);

  const drafts = freeMessageContentDrafts();
  assert.deepEqual(
    drafts.map((draft) => draft.friendlyName),
    ["message_libre_texte", "message_libre_document", "message_libre_image"]
  );
  const pdf = drafts[1].create.types as { "twilio/media": { media: string[]; body: string } };
  const samples = drafts[1].create.variables as Record<string, string>;
  assert.equal(pdf["twilio/media"].media[0], "https://travelba.fr/api/whatsapp/autorisations/{{1}}");
  assert.equal(samples["1"], "exemple/esta-exemple.pdf");
  assert.equal(`${"https://travelba.fr/api/whatsapp/autorisations/"}${samples["1"]}`, FREE_MESSAGE_SAMPLE_PDF_URL);
  assert.equal(samples["3"], FREE_MESSAGE_SAMPLE_TEXT);
  assert.equal((drafts[0].create.variables as Record<string, string>)["2"], FREE_MESSAGE_SAMPLE_TEXT);
  assert.deepEqual(
    freeMessageTemplateDrafts().map((draft) => draft.env),
    [
      "TWILIO_CONTENT_MESSAGE_LIBRE_TEXTE",
      "TWILIO_CONTENT_MESSAGE_LIBRE_DOCUMENT",
      "TWILIO_CONTENT_MESSAGE_LIBRE_IMAGE",
    ]
  );
  const bubble = whatsappCatalog()
    .flatMap((group) => group.messages)
    .find((message) => message.id === "message-libre-texte");
  assert.match(bubble?.bubble.body || "", /Travel BA/);
  assert.equal((bubble?.bubble.body || "").includes("Bonne nouvelle"), false);
  assert.match(MCP_TOOLS.find((tool) => tool.name === "notifier_piece")?.description || "", /autorisation_validee_document_v2/);
  assert.equal((MCP_TOOLS.find((tool) => tool.name === "notifier_piece")?.description || "").includes("message_libre"), false);
});

test("le jeton du message libre n’ouvre pas l’autorisation, et une pièce d’identité ne sort pas", () => {
  const previous = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.VERCEL_ENV;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
  try {
    const path = freeMessageSignedPath(DOC, "Document-Travel-BA.pdf", Date.parse("2026-11-07T10:00:00Z"));
    assert.ok(path);
    const token = path!.slice(0, path!.lastIndexOf("/"));
    assert.equal(verifyFreeMessageToken(token, "Document-Travel-BA.pdf", Date.parse("2026-11-07T10:30:00Z"))?.documentId, DOC);
    assert.equal(verifyVisaGrantToken(token, "Document-Travel-BA.pdf", Date.parse("2026-11-07T10:30:00Z")), null);
    assert.equal(verifyFreeMessageToken(token, "autre.pdf", Date.parse("2026-11-07T10:30:00Z")), null);
    assert.equal(
      freeMessagePublicFile(
        { docType: "passport", mime: "application/pdf", storagePath: "customers/a.pdf", fileName: "passeport.pdf" },
        "Document-Travel-BA.pdf"
      ),
      null
    );
    assert.equal(
      freeMessagePublicFile(
        { docType: "other", mime: "application/pdf", storagePath: "customers/a.pdf", fileName: "attestation.pdf" },
        "Document-Travel-BA.pdf"
      )?.contentType,
      "application/pdf"
    );
  } finally {
    if (previous === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previous;
  }
});

function fakeCrm(extra?: { inbound?: boolean; docType?: string; fileName?: string }) {
  const tables: Record<string, Record<string, unknown>[]> = {
    crm_bookings: [{ id: BOOKING, reference: "TB-2026-0124", customer_id: CLIENT }],
    crm_customers: [
      {
        id: CLIENT,
        first_name: "Amin",
        phone: "+33612345678",
        whatsapp_opt_in_at: "2026-01-01T00:00:00Z",
        whatsapp_opt_out_at: null,
      },
    ],
    crm_travel_documents: [
      {
        id: DOC,
        customer_id: CLIENT,
        booking_id: BOOKING,
        doc_type: extra?.docType ?? "other",
        mime_type: "application/pdf",
        file_name: extra?.fileName ?? "attestation-cdc.pdf",
        storage_path: "customers/attestation.pdf",
      },
    ],
    crm_booking_documents: [],
    crm_whatsapp_messages: extra?.inbound
      ? [{ id: "in-1", customer_id: CLIENT, direction: "inbound", created_at: NOW.toISOString(), phone: "+33612345678" }]
      : [],
    crm_whatsapp_threads: [],
  };
  const sends: { kind: string; body?: string; mediaUrl?: string | null; variables?: Record<string, string> }[] = [];

  function from(table: string) {
    const filters: ((row: Record<string, unknown>) => boolean)[] = [];
    let op = "select";
    let payload: Record<string, unknown> = {};
    const error: { code?: string } | null = null;
    let inserted: Record<string, unknown> | null = null;
    const api = {
      select() {
        return api;
      },
      insert(value: Record<string, unknown>) {
        op = "insert";
        payload = value;
        inserted = { id: `${table}-${(tables[table] || []).length + 1}`, ...value };
        (tables[table] || (tables[table] = [])).push(inserted);
        return api;
      },
      upsert(value: Record<string, unknown>) {
        (tables[table] || (tables[table] = [])).push(value);
        return Promise.resolve({ error: null });
      },
      update(value: Record<string, unknown>) {
        op = "update";
        payload = value;
        return api;
      },
      eq(column: string, value: unknown) {
        filters.push((row) => row[column] === value);
        return api;
      },
      gte(column: string, value: unknown) {
        filters.push((row) => String(row[column] ?? "") >= String(value));
        return api;
      },
      limit() {
        return api;
      },
      order() {
        return api;
      },
      maybeSingle() {
        return Promise.resolve(one());
      },
      then(resolve: (value: { data: unknown; error: typeof error }) => void) {
        resolve(finish());
      },
    };
    function matching() {
      return (tables[table] || []).filter((row) => filters.every((keep) => keep(row)));
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
    deps(approved = false) {
      return {
        now: NOW,
        store: memoryContentSidStore({ TWILIO_CONTENT_MESSAGE_LIBRE_DOCUMENT: SID, TWILIO_CONTENT_MESSAGE_LIBRE_TEXTE: SID }),
        approved: async () => approved,
        sendSession: async (message: { to: string; body: string; mediaUrl?: string | null }) => {
          sends.push({ kind: "session", body: message.body, mediaUrl: message.mediaUrl });
          return { ok: true as const, sid: "SMsession" };
        },
        sendTemplate: async (message: { phone: string; contentSid: string; variables: Record<string, string> }) => {
          sends.push({ kind: "modele", variables: message.variables });
          return { ok: true as const, sid: "SMmodele" };
        },
      };
    },
  };
}

test("sans confirmer, rien ne part, même hors fenêtre", async () => {
  const crm = fakeCrm();
  const preview = await envoyerMessageLibre(
    {
      reference: "TB-2026-0124",
      texte: "Voici votre attestation CDC signée.",
      document_id: DOC,
    },
    crm.admin,
    crm.deps(false)
  );
  assert.equal(preview.envoye, false);
  assert.equal(preview.apercu, true);
  assert.equal(preview.canal, "modele");
  assert.equal(preview.modele, "message_libre_document");
  assert.equal(preview.modele_pret, false);
  assert.match(String(preview.texte), /Bonjour Amin/);
  assert.match(String(preview.texte), /attestation CDC/);
  assert.match(String(preview.message), /deposer_modeles_message_libre_whatsapp/);
  assert.equal(crm.sends.length, 0);
  assert.equal(JSON.stringify(preview).includes("customers/attestation"), false);
  assert.equal(JSON.stringify(preview).includes("+336"), false);
  await assert.rejects(
    () =>
      envoyerMessageLibre(
        { reference: "TB-2026-0124", texte: "Voici votre attestation CDC signée.", document_id: DOC, confirmer: true },
        crm.admin,
        crm.deps(false)
      ),
    (error: unknown) => error instanceof McpWriteError && /pas encore approuvé/.test(error.message)
  );
  assert.equal(crm.sends.length, 0);
});

test("dans la fenêtre, confirmer envoie le texte et le PDF, pas le modèle d’autorisation", async () => {
  const previous = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.VERCEL_ENV;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
  try {
    const crm = fakeCrm({ inbound: true });
    const quiet = await envoyerMessageLibre(
      { dossier_id: BOOKING, texte: "Voici votre attestation CDC signée.", document_id: DOC },
      crm.admin,
      crm.deps(false)
    );
    assert.equal(quiet.canal, "session");
    assert.equal(quiet.envoye, false);
    assert.equal(crm.sends.length, 0);
    const sent = await envoyerMessageLibre(
      { dossier_id: BOOKING, texte: "Voici votre attestation CDC signée.", document_id: DOC, confirmer: true },
      crm.admin,
      crm.deps(false)
    );
    assert.equal(sent.envoye, true);
    assert.equal(sent.twilio_sid, "SMsession");
    assert.equal(crm.sends.length, 1);
    assert.equal(crm.sends[0].kind, "session");
    assert.match(crm.sends[0].body || "", /attestation CDC/);
    assert.match(crm.sends[0].mediaUrl || "", /^https:\/\/travelba\.fr\/api\/whatsapp\/autorisations\//);
    assert.equal((crm.sends[0].body || "").includes("Bonne nouvelle"), false);
    const journal = crm.tables.crm_whatsapp_messages.find((row) => row.direction === "outbound");
    assert.equal(journal?.status, "sent");
    assert.equal(String(journal?.body).includes("http"), false);
    assert.equal(JSON.stringify(sent).includes(TOKEN), false);
    assert.equal(JSON.stringify(sent).includes("service-role"), false);
  } finally {
    if (previous === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previous;
  }
});

test("hors fenêtre, le modèle part avec le texte, et un passeport est refusé", async () => {
  const previous = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.VERCEL_ENV;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
  try {
    const crm = fakeCrm();
    const sent = await envoyerMessageLibre(
      { client_id: CLIENT, texte: "Voici votre attestation CDC signée.", document_id: DOC, confirmer: true },
      crm.admin,
      crm.deps(true)
    );
    assert.equal(sent.canal, "modele");
    assert.equal(sent.modele, "message_libre_document");
    assert.equal(crm.sends[0].kind, "modele");
    assert.equal(crm.sends[0].variables?.["2"], "Amin");
    assert.match(crm.sends[0].variables?.["3"] || "", /attestation CDC/);
    assert.match(crm.sends[0].variables?.["1"] || "", /attestation-cdc\.pdf$/);
    const passport = fakeCrm({ docType: "passport", fileName: "passeport.pdf" });
    await assert.rejects(
      () =>
        envoyerMessageLibre(
          { client_id: CLIENT, texte: "Voici le document.", document_id: DOC, confirmer: true },
          passport.admin,
          passport.deps(true)
        ),
      /passeport/
    );
    assert.equal(passport.sends.length, 0);
  } finally {
    if (previous === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previous;
  }
});

test("le dépôt est idempotent et ne renvoie pas le jeton", async () => {
  delete process.env.VERCEL_ENV;
  process.env.TWILIO_ACCOUNT_SID = ACCOUNT;
  process.env.TWILIO_AUTH_TOKEN = TOKEN;
  const store = memoryContentSidStore();
  const calls: string[] = [];
  let counter = 0;
  const approvals: Record<string, string> = {};
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method || "GET";
    calls.push(`${method} ${url}`);
    const json = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), { status });
    if (method === "POST" && url.endsWith("/Content")) {
      counter += 1;
      const sid = `HX${String(counter).padStart(32, "b")}`;
      return json({ sid }, 201);
    }
    const approval = url.match(/\/Content\/(HX[^/]+)\/ApprovalRequests(\/whatsapp)?$/);
    if (approval && method === "POST") {
      approvals[approval[1]] = "pending";
      return json({ status: "pending" }, 201);
    }
    if (approval) return json({ whatsapp: { status: approvals[approval[1]] || "unsubmitted" } });
    return json({ contents: [], meta: { next_page_url: null } });
  };
  const first = await deposerModelesMessageLibreWhatsapp({}, fetchImpl, store);
  assert.equal(first.ok, true);
  assert.equal(first.categorie, "UTILITY");
  assert.deepEqual(
    first.modeles.map((row) => row.nom),
    ["message_libre_texte", "message_libre_document", "message_libre_image"]
  );
  assert.equal(JSON.stringify(first).includes(TOKEN), false);
  assert.equal(JSON.stringify(first).includes(ACCOUNT), false);
  const again = await ensureFreeMessageTemplates(fetchImpl, store);
  assert.equal(again.modeles.every((row) => row.cree === false), true);
  assert.equal(calls.filter((call) => call.startsWith("POST") && call.endsWith("/Content")).length, 3);
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
});
