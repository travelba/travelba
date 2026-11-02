import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { boardingPassSendKey } from "./boarding-pass-pdf";
import { boardingPassDedupeKey, boardingPassUnapprovedMessage } from "./boarding-pass-whatsapp";
import { notifyBoardingPass } from "./mcp-boarding-pass";
import { McpWriteError } from "./mcp-write";

const DOC = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOOKING = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CLIENT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const flight = {
  id: "flight-1",
  booking_id: BOOKING,
  kind: "flight",
  title: "Paris → Tel Aviv",
  start_at: "2026-10-12T11:20:00",
  lifecycle: "active",
  details: {
    flight_number: "AF 1234",
    city_from: "Paris",
    city_to: "Tel Aviv",
    seat: "12A",
    passengers: [{ first_name: "Meryl", last_name: "Levy" }],
  },
  source_document_id: null,
};

function rejection(run: () => Promise<unknown>) {
  return assert.rejects(run, McpWriteError);
}

function fakeCrm(extra: { messages?: Record<string, unknown>[]; duplicateInsert?: boolean; seat?: string | null; kind?: string } = {}) {
  const tables: Record<string, Record<string, unknown>[]> = {
    crm_booking_documents: [
      {
        id: DOC,
        booking_id: BOOKING,
        booking_item_id: "flight-1",
        kind: extra.kind ?? "carte d'embarquement",
        mime_type: "application/pdf",
        file_name: "levy.pdf",
        storage_path: "bookings/levy.pdf",
      },
    ],
    crm_bookings: [{ id: BOOKING, customer_id: CLIENT, reference: "TB-2026-0042" }],
    crm_customers: [
      {
        id: CLIENT,
        phone: "+33600000000",
        auth_user_id: null,
        whatsapp_opt_in_at: "2026-01-01",
        whatsapp_opt_out_at: null,
      },
    ],
    crm_booking_items: [{ ...flight, details: { ...flight.details, seat: extra.seat === undefined ? "12A" : extra.seat } }],
    crm_booking_travelers: [],
    crm_whatsapp_messages: extra.messages ? extra.messages.map((row) => ({ ...row })) : [],
    crm_customer_activity: [],
    crm_audit_events: [],
  };
  const sends: { contentSid: string; variables: Record<string, string> | null }[] = [];

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
        if (extra.duplicateInsert && value.dedupe_key) {
          error = { code: "23505", message: "duplicate" };
        } else if (value.dedupe_key && rows.some((row) => row.dedupe_key === value.dedupe_key)) {
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
        resolveSid: async () => (approved ? "HXtest" : ""),
        approved: async () => approved,
        send: async (input: { contentSid: string; variables: Record<string, string> | null }) => {
          sends.push({ contentSid: input.contentSid, variables: input.variables });
          return { ok: true as const, sid: "SMtest" };
        },
      };
    },
  };
}

test("le refus nomme le modèle, le corps, les variables et l’en-tête Document", () => {
  const text = boardingPassUnapprovedMessage();
  assert.match(text, /carte_embarquement/);
  assert.match(text, /Utility/);
  assert.match(text, /français/);
  assert.match(text, /En-tête : Document/);
  assert.match(text, /exemple\/carte-embarquement-exemple\.pdf/);
  assert.match(text, /\/api\/whatsapp\/cartes\/\{\{1\}\}/);
  for (const key of ["{{1}}", "{{2}}", "{{3}}", "{{4}}", "{{5}}", "{{6}}"]) assert.match(text, new RegExp(key.replace(/[{}]/g, "\\$&")));
  assert.match(text, /Bonjour \{\{2\}\}/);
  assert.match(text, /carte d’embarquement pour le vol \{\{3\}\}/);
  assert.match(text, /TWILIO_CONTENT_CARTE_EMBARQUEMENT/);
  assert.equal(text.includes("HX"), false);
  assert.equal(/[A-Z]{1,2}\d{6,9}/.test(text), false);
});

test("notifier_carte_embarquement envoie le PDF du dossier une seule fois", async () => {
  const previous = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
  try {
    const crm = fakeCrm();
    const first = await notifyBoardingPass({ document_id: DOC }, crm.admin, crm.deps());
    assert.equal(first.notifie, true);
    assert.equal(first.statut, "envoye");
    assert.equal(first.deja_envoye, false);
    assert.equal(first.reference, "TB-2026-0042");
    assert.equal(first.modele, "carte_embarquement");
    assert.equal(crm.sends.length, 1);
    assert.equal(crm.sends[0].contentSid, "HXtest");
    const variables = crm.sends[0].variables;
    assert.ok(variables);
    assert.equal(variables["2"], "Meryl");
    assert.equal(variables["3"], "AF 1234");
    assert.equal(variables["6"], "12A");
    assert.match(variables["1"], /\.pdf$/);
    assert.equal(/^https?:/i.test(variables["1"]), false);
    const stored = crm.tables.crm_whatsapp_messages[0];
    assert.equal(stored.dedupe_key, boardingPassDedupeKey(DOC));
    assert.equal(stored.status, "sent");
    assert.equal((stored.payload as { document_id: string }).document_id, DOC);
    assert.equal(JSON.stringify(stored).includes("+336"), false);
    assert.equal(crm.tables.crm_customer_activity[0].action, "whatsapp_carte_embarquement");
    const blob = JSON.stringify(crm.tables.crm_audit_events);
    assert.equal(blob.includes("storage"), false);
    assert.equal(blob.includes("http"), false);

    const second = await notifyBoardingPass({ document_id: DOC }, crm.admin, crm.deps());
    assert.equal(second.notifie, false);
    assert.equal(second.deja_envoye, true);
    assert.equal(second.statut, "deja_envoye");
    assert.equal(crm.sends.length, 1);
  } finally {
    if (previous === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previous;
  }
});

test("un envoi déjà parti depuis le dossier ne repart pas", async () => {
  const crm = fakeCrm({
    messages: [
      {
        id: "deja",
        booking_id: BOOKING,
        status: "sent",
        twilio_sid: "SMdeja",
        template_key: "carte_embarquement",
        payload: { document_id: DOC },
        dedupe_key: null,
      },
    ],
  });
  const result = await notifyBoardingPass({ document_id: DOC }, crm.admin, crm.deps());
  assert.equal(result.statut, "deja_envoye");
  assert.equal(crm.sends.length, 0);
});

test("une file encore ouverte ne déclenche pas un second appel", async () => {
  const crm = fakeCrm({
    messages: [
      {
        id: "file",
        booking_id: BOOKING,
        status: "queued",
        template_key: "carte_embarquement",
        dedupe_key: boardingPassDedupeKey(DOC),
        payload: { document_id: DOC },
      },
    ],
  });
  const result = await notifyBoardingPass({ document_id: DOC }, crm.admin, crm.deps());
  assert.equal(result.statut, "en_cours");
  assert.equal(crm.sends.length, 0);
});

test("sans modèle approuvé, rien ne part et le texte décrit le dépôt Meta", async () => {
  const crm = fakeCrm();
  await rejection(() => notifyBoardingPass({ document_id: DOC }, crm.admin, crm.deps(false)));
  assert.equal(crm.sends.length, 0);
  assert.equal(crm.tables.crm_whatsapp_messages.length, 0);
  await assert.rejects(
    () => notifyBoardingPass({ document_id: DOC }, crm.admin, { ...crm.deps(true), approved: async () => false }),
    (err: unknown) => {
      assert.ok(err instanceof McpWriteError);
      assert.match(err.message, /carte_embarquement/);
      assert.match(err.message, /Document/);
      assert.match(err.message, /\{\{1\}\}/);
      assert.match(err.message, /Bonjour \{\{2\}\}/);
      return true;
    }
  );
});

test("un siège absent ou une autre pièce n’envoie rien", async () => {
  const missing = fakeCrm({ seat: "" });
  await rejection(() => notifyBoardingPass({ document_id: DOC }, missing.admin, missing.deps()));
  assert.equal(missing.sends.length, 0);
  const other = fakeCrm({ kind: "confirmation" });
  await rejection(() => notifyBoardingPass({ document_id: DOC }, other.admin, other.deps()));
  assert.equal(other.sends.length, 0);
  await rejection(() => notifyBoardingPass({ document_id: "levy" }, other.admin, other.deps()));
});

function transaviaPage(input: { seq: string; name: string; infant?: string; seat: string }) {
  return [
    "Carte d’embarquement",
    `Seq. nr. TO3004:${input.seq}`,
    input.name,
    input.infant ? `Avec bébé (${input.infant})` : "",
    "Référence de réservation: AB1CDE",
    "Ce bagage sera à placer à bord sous le siège devant vous.",
    "La porte d'embarquement ferme 20 minutes avant l’heure de départ.",
    `Seq. nr. TO3004:${input.seq}`,
    "Date/Date",
    "28-10-2026",
    "Heure de départ",
    "07:55",
    "Flight number/Numéro de vol",
    "TO 3004",
    "Seat/Siège",
    `${input.seat} (Zone 3)`,
    "PARIS (ORLY) (ORY) AGADIR (AGA)",
  ]
    .filter(Boolean)
    .join("\n");
}

const TRANSAVIA = [
  transaviaPage({ seq: "4", name: "Camille MARTIN", infant: "Noah MARTIN", seat: "2F" }),
  transaviaPage({ seq: "5", name: "Léa MARTIN", seat: "3A" }),
  transaviaPage({ seq: "6", name: "Adam MARTIN", seat: "2E" }),
];

test("un PDF Transavia part une fois par passager, puis plus", async () => {
  const previous = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
  try {
    const crm = fakeCrm({ seat: "" });
    const deps = { ...crm.deps(), readPages: async () => TRANSAVIA };
    const first = await notifyBoardingPass({ document_id: DOC, siege: "9Z" }, crm.admin, deps);
    assert.equal(first.statut, "envoye");
    assert.equal(crm.sends.length, 3);
    assert.deepEqual(
      crm.sends.map((row) => row.variables?.["2"]),
      ["Camille", "Léa", "Adam"]
    );
    assert.deepEqual(
      crm.sends.map((row) => row.variables?.["6"]),
      ["2F", "3A", "2E"]
    );
    assert.equal(crm.sends[0].variables?.["3"], "TO 3004");
    assert.equal(crm.sends[0].variables?.["4"], "Paris (Orly) → Agadir");
    assert.match(crm.sends[0].variables?.["5"] || "", /07h55/);
    assert.equal(JSON.stringify(crm.sends).includes("Noah"), false);
    assert.equal(JSON.stringify(crm.sends).includes("9Z"), false);
    assert.deepEqual(
      crm.tables.crm_whatsapp_messages.map((row) => row.dedupe_key),
      [boardingPassSendKey(DOC, 1, 3), boardingPassSendKey(DOC, 2, 3), boardingPassSendKey(DOC, 3, 3)]
    );
    const second = await notifyBoardingPass({ document_id: DOC }, crm.admin, deps);
    assert.equal(second.statut, "deja_envoye");
    assert.equal(second.notifie, false);
    assert.equal(crm.sends.length, 3);
  } finally {
    if (previous === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previous;
  }
});

test("un passager déjà envoyé ne repart pas, les autres oui", async () => {
  const previous = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
  try {
    const crm = fakeCrm({
      seat: "",
      messages: [
        {
          id: "page-1",
          booking_id: BOOKING,
          status: "sent",
          twilio_sid: "SMpage",
          template_key: "carte_embarquement",
          dedupe_key: boardingPassSendKey(DOC, 1, 3),
          payload: { document_id: DOC, page: 1 },
        },
      ],
    });
    const result = await notifyBoardingPass({ document_id: DOC }, crm.admin, {
      ...crm.deps(),
      readPages: async () => TRANSAVIA,
    });
    assert.equal(result.statut, "envoye");
    assert.equal(crm.sends.length, 2);
    assert.deepEqual(
      crm.sends.map((row) => row.variables?.["6"]),
      ["3A", "2E"]
    );
    assert.equal(result.passagers?.find((row) => row.siege === "2F")?.statut, "deja_envoye");
  } finally {
    if (previous === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previous;
  }
});

test("sans lecture, les champs saisis partent une fois et un champ manquant n’envoie rien", async () => {
  const previous = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
  try {
    const crm = fakeCrm({ seat: "" });
    const input = {
      document_id: DOC,
      prenom: "Camille",
      vol: "TO 3004",
      trajet: "Paris → Agadir",
      date_heure: "28 oct. 2026 à 07h55",
      siege: "2F",
    };
    const first = await notifyBoardingPass(input, crm.admin, crm.deps());
    assert.equal(first.statut, "envoye");
    assert.equal(crm.sends.length, 1);
    assert.equal(crm.sends[0].variables?.["2"], "Camille");
    assert.equal(crm.sends[0].variables?.["6"], "2F");
    assert.equal(crm.tables.crm_whatsapp_messages[0].dedupe_key, boardingPassDedupeKey(DOC));
    const second = await notifyBoardingPass(input, crm.admin, crm.deps());
    assert.equal(second.statut, "deja_envoye");
    assert.equal(crm.sends.length, 1);

    const gap = fakeCrm({ seat: "" });
    await rejection(() =>
      notifyBoardingPass({ document_id: DOC, prenom: "Camille", vol: "TO 3004" }, gap.admin, gap.deps())
    );
    assert.equal(gap.sends.length, 0);
    assert.equal(gap.tables.crm_whatsapp_messages.length, 0);
  } finally {
    if (previous === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previous;
  }
});

test("deux demandes simultanées ne partent qu’une fois", async () => {
  const crm = fakeCrm({ duplicateInsert: true });
  const previous = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
  try {
    const result = await notifyBoardingPass({ document_id: DOC }, crm.admin, crm.deps());
    assert.equal(result.statut, "en_cours");
    assert.equal(crm.sends.length, 0);
  } finally {
    if (previous === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previous;
  }
});
