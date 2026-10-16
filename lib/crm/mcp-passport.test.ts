import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runWithMcpAccess } from "./mcp-auth";
import {
  dossierVoyageurs,
  householdVoyageurs,
  journalReference,
  McpReadError,
  parsePassportQuery,
  parseScanQuery,
  passportScanPath,
  readPasseportVoyageur,
  readScanPasseport,
} from "./mcp-passport";
import type { CrmBookingTraveler, CrmTravelDocument } from "./types";

const CLIENT = "11111111-1111-4111-8111-111111111111";
const OTHER = "99999999-9999-4999-8999-999999999999";
const BOOKING = "22222222-2222-4222-8222-222222222222";
const BOOKING_B = "22222222-2222-4222-8222-222222222223";
const COMPANION = "33333333-3333-4333-8333-333333333333";
const HOLDER_TRAVELER = "44444444-4444-4444-8444-444444444444";
const COMPANION_TRAVELER = "55555555-5555-4555-8555-555555555555";
const NUMBER = "X12345678";
const OTHER_NUMBER = "Y87654321";

function doc(partial: Partial<CrmTravelDocument>): CrmTravelDocument {
  return {
    id: "d1",
    customer_id: CLIENT,
    companion_id: null,
    booking_id: null,
    traveler_id: null,
    doc_type: "passport",
    number: NUMBER,
    issuing_country: "FRA",
    issued_on: "2020-03-01",
    expires_on: "2030-03-01",
    first_name: "Maëlle Louise",
    last_name: "Martin",
    usage_name: "Durand",
    birth_date: "1985-10-12",
    nationality: "Française",
    sex: "f",
    place_of_birth: null,
    authority: null,
    personal_number: "999888777",
    storage_path: null,
    file_name: null,
    mime_type: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "",
    ...partial,
  };
}

function traveler(partial: Partial<CrmBookingTraveler>): CrmBookingTraveler {
  return {
    id: HOLDER_TRAVELER,
    booking_id: BOOKING,
    companion_id: null,
    is_account_holder: true,
    first_name: "Maëlle",
    last_name: "Martin",
    created_at: "2024-01-01T00:00:00Z",
    ...partial,
  };
}

const holder = {
  id: CLIENT,
  first_name: "Maëlle",
  last_name: "Martin",
  usage_name: null,
  birth_date: "1990-01-01",
  sex: "M",
  nationality: "FR",
};

test("a household keeps each passport and the name written on it", () => {
  const voyageurs = householdVoyageurs(
    holder,
    [
      {
        id: COMPANION,
        first_name: "Léa",
        last_name: "Martin",
        birth_date: "2014-05-02",
        sex: "F",
        nationality: "FR",
      },
    ],
    [
      doc({
        id: "fr",
        expires_on: "2030-03-01",
        place_of_birth: "PARIS",
        storage_path: `customers/${CLIENT}/documents/secret.pdf`,
        file_name: "secret.pdf",
        mime_type: "application/pdf",
      }),
      doc({
        id: "il",
        number: OTHER_NUMBER,
        issuing_country: "IL",
        nationality: "IL",
        expires_on: "2035-01-01",
        sex: "F",
      }),
      doc({ id: "carte", doc_type: "id_card", number: "C123", expires_on: "2028-01-01" }),
      doc({ id: "visa", doc_type: "visa", number: "V999" }),
      doc({ id: "lea", companion_id: COMPANION, number: "L1234567", first_name: "Léa", last_name: "Martin" }),
      doc({ id: "trip-only", number: "T000", booking_id: BOOKING }),
    ]
  );
  assert.equal(voyageurs[0].role, "titulaire");
  assert.equal(voyageurs[1].role, "accompagnateur");
  assert.equal(voyageurs[1].voyageur_id, COMPANION);
  const pieces = voyageurs[0].pieces;
  assert.deepEqual(
    pieces.map((piece) => piece.numero_piece),
    [OTHER_NUMBER, NUMBER, "C123"]
  );
  assert.equal(pieces[1].prenoms, "Maëlle Louise");
  assert.equal(pieces[1].nom, "Martin");
  assert.equal(pieces[1].nom_usage, "Durand");
  assert.equal(pieces[1].noms_sur_piece, true);
  assert.equal(pieces[1].date_naissance, "1985-10-12");
  assert.equal(pieces[1].sexe, "F");
  assert.equal(pieces[1].nationalite, "FR");
  assert.equal(pieces[1].pays_emission, "FR");
  assert.equal(pieces[1].type, "Passeport");
  assert.equal(pieces[1].lieu_naissance, "PARIS");
  assert.equal(pieces[1].a_un_scan, true);
  assert.equal(pieces[0].lieu_naissance, null);
  assert.equal(pieces[0].a_un_scan, false);
  assert.equal(pieces[2].type, "Carte d'identité");
  assert.equal(voyageurs[1].pieces[0].numero_piece, "L1234567");
  assert.equal(JSON.stringify(voyageurs).includes("999888777"), false);
  assert.equal(JSON.stringify(voyageurs).includes("secret.pdf"), false);
  assert.equal(JSON.stringify(voyageurs).includes("V999"), false);
  assert.equal(JSON.stringify(voyageurs).includes("T000"), false);
});

test("a trip copy is used only when the vault has no piece", () => {
  const onlyTrip = householdVoyageurs(holder, [], [doc({ id: "trip", number: "T000", booking_id: BOOKING })]);
  assert.equal(onlyTrip[0].pieces[0].numero_piece, "T000");
  const blank = householdVoyageurs(holder, [], [
    doc({ id: "blank", first_name: null, last_name: null, birth_date: "12/10/1985", number: "  X12 345678 " }),
  ]);
  assert.equal(blank[0].pieces[0].noms_sur_piece, false);
  assert.equal(blank[0].pieces[0].nom, "Martin");
  assert.equal(blank[0].pieces[0].prenoms, "Maëlle");
  assert.equal(blank[0].pieces[0].numero_piece, "X12345678");
  assert.equal(blank[0].pieces[0].date_naissance, "1990-01-01");
  assert.equal(blank[0].pieces[0].sexe, "F");
});

test("a dossier lists each traveler once and skips a placeholder", () => {
  const voyageurs = dossierVoyageurs(
    [
      traveler({}),
      traveler({
        id: COMPANION_TRAVELER,
        companion_id: COMPANION,
        is_account_holder: false,
        first_name: "Léa",
        last_name: "Martin",
      }),
      traveler({ id: "ph", is_account_holder: false, first_name: "Adulte", last_name: "1" }),
    ],
    holder,
    [{ id: COMPANION, first_name: "Léa", last_name: "Martin", birth_date: "2014-05-02", sex: "F" }],
    [
      doc({ id: "vault", expires_on: "2028-01-01" }),
      doc({ id: "newer", number: NUMBER, booking_id: BOOKING, traveler_id: HOLDER_TRAVELER, expires_on: "2032-06-01" }),
      doc({
        id: "lea",
        companion_id: COMPANION,
        traveler_id: COMPANION_TRAVELER,
        booking_id: BOOKING,
        number: OTHER_NUMBER,
        first_name: "Léa",
        last_name: "Martin",
      }),
    ]
  );
  assert.deepEqual(
    voyageurs.map((row) => row.voyageur_id),
    [HOLDER_TRAVELER, COMPANION_TRAVELER]
  );
  assert.equal(voyageurs[0].pieces.length, 1);
  assert.equal(voyageurs[0].pieces[0].expire_le, "2032-06-01");
  assert.equal(voyageurs[0].pieces[0].numero_piece, NUMBER);
  assert.equal(voyageurs[1].pieces[0].numero_piece, OTHER_NUMBER);
  assert.equal(voyageurs[1].role, "accompagnateur");
});

test("journal references stay agency references", () => {
  assert.equal(journalReference("TB-2026-0042"), "TB-2026-0042");
  assert.equal(journalReference(NUMBER), null);
  assert.equal(journalReference("passeport X123"), null);
  assert.deepEqual(parsePassportQuery({}), { kind: "missing" });
  assert.deepEqual(parsePassportQuery({ client_id: "ada" }), { kind: "invalid" });
  assert.deepEqual(parsePassportQuery({ client_id: CLIENT }), { kind: "client", customerId: CLIENT });
  assert.equal(parsePassportQuery({ reference: "TB-2026-0042", client_id: CLIENT }).kind, "dossier");
});

type Script = {
  customers?: Record<string, unknown> | null;
  companions?: Record<string, unknown>[];
  documents?: Record<string, unknown>[];
  bookings?: Record<string, unknown>[];
  travelers?: Record<string, unknown>[];
  fail?: Record<string, { code: string }>;
  inserts: Record<string, unknown>[];
  seen: string[];
};

function fakeAdmin(script: Script) {
  function from(table: string) {
    script.seen.push(table);
    const filters: { op: "eq" | "in"; key: string; value: unknown }[] = [];
    let inserted: Record<string, unknown> | null = null;
    const api = {
      select() {
        return api;
      },
      insert(value: Record<string, unknown>) {
        inserted = value;
        script.inserts.push(value);
        return api;
      },
      eq(key: string, value: unknown) {
        filters.push({ op: "eq", key, value });
        return api;
      },
      in(key: string, value: unknown) {
        filters.push({ op: "in", key, value });
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
      then(resolve: (value: unknown) => void, reject?: (reason: unknown) => void) {
        return Promise.resolve(finish(false)).then(resolve, reject);
      },
    };
    function rows() {
      if (table === "crm_customers") return script.customers ? [script.customers] : [];
      if (table === "crm_travel_companions") return script.companions || [];
      if (table === "crm_travel_documents") return script.documents || [];
      if (table === "crm_bookings") return script.bookings || [];
      if (table === "crm_booking_travelers") return script.travelers || [];
      return [];
    }
    function finish(single: boolean) {
      if (inserted) return { data: null, error: null };
      if (script.fail?.[table]) return { data: null, error: script.fail[table] };
      let list = rows();
      for (const filter of filters) {
        if (filter.op === "eq") list = list.filter((row) => row[filter.key] === filter.value);
        if (filter.op === "in") list = list.filter((row) => (filter.value as unknown[]).includes(row[filter.key]));
      }
      return { data: single ? (list[0] ?? null) : list, error: null };
    }
    return api;
  }
  return { from } as unknown as SupabaseClient;
}

function customerRow() {
  return {
    id: CLIENT,
    first_name: "Maëlle",
    last_name: "Martin",
    usage_name: null,
    birth_date: "1990-01-01",
    sex: "M",
    nationality: "FR",
  };
}

function passportRow(partial: Record<string, unknown> = {}) {
  return {
    id: "doc-1",
    customer_id: CLIENT,
    companion_id: null,
    booking_id: null,
    traveler_id: null,
    doc_type: "passport",
    number: ` ${NUMBER} `,
    issuing_country: "FRA",
    issued_on: "2020-03-01",
    expires_on: "2030-03-01",
    first_name: "Maëlle Louise",
    last_name: "Martin",
    usage_name: null,
    birth_date: "1985-10-12",
    nationality: "Française",
    sex: "F",
    created_at: "2024-01-01",
    personal_number: "999888777",
    storage_path: "secret.pdf",
    ...partial,
  };
}

test("without the passport scope the tool refuses before reading pieces", async () => {
  const script: Script = { customers: customerRow(), documents: [passportRow()], inserts: [], seen: [] };
  await assert.rejects(
    () => readPasseportVoyageur({ client_id: CLIENT }, fakeAdmin(script)),
    (err: unknown) => err instanceof McpReadError && /pas autorisé/.test(err.message)
  );
  assert.deepEqual(script.seen, ["crm_mcp_passport_reads"]);
  assert.equal(script.inserts[0].outcome, "refuse");
  assert.equal(script.inserts[0].actor, "mcp");
  assert.equal(script.inserts[0].customer_id, CLIENT);
  assert.equal(JSON.stringify(script.inserts).includes(NUMBER), false);
});

test("an authorized assistant receives the piece number and the journal does not", async () => {
  const script: Script = {
    customers: customerRow(),
    companions: [
      {
        id: COMPANION,
        customer_id: CLIENT,
        first_name: "Léa",
        last_name: "Martin",
        birth_date: "2014-05-02",
        sex: "F",
        nationality: "FR",
      },
    ],
    documents: [
      passportRow(),
      passportRow({
        id: "lea",
        companion_id: COMPANION,
        number: OTHER_NUMBER,
        first_name: "Léa",
        last_name: "Martin",
      }),
      passportRow({ id: "visa", doc_type: "visa", number: "V999" }),
    ],
    inserts: [],
    seen: [],
  };
  const result = await runWithMcpAccess({ actor: "amadeus", passport: true }, () =>
    readPasseportVoyageur({ client_id: CLIENT }, fakeAdmin(script))
  );
  const body = result as { voyageurs: { pieces: { numero_piece: string | null }[] }[] };
  assert.equal(body.voyageurs[0].pieces[0].numero_piece, NUMBER);
  assert.equal(body.voyageurs[1].pieces[0].numero_piece, OTHER_NUMBER);
  assert.equal(JSON.stringify(body).includes("V999"), false);
  assert.equal(JSON.stringify(body).includes("999888777"), false);
  assert.equal(script.inserts[0].actor, "amadeus");
  assert.equal(script.inserts[0].outcome, "ok");
  assert.equal(script.inserts[0].kind, "lecture");
  assert.equal(script.inserts[0].traveler_count, 2);
  assert.equal(JSON.stringify(script.inserts).includes(NUMBER), false);
  assert.equal(JSON.stringify(script.inserts).includes(OTHER_NUMBER), false);
  assert.equal("numero_piece" in script.inserts[0], false);
});

test("a dossier reference returns its travelers and a foreign client is refused", async () => {
  const script: Script = {
    customers: customerRow(),
    bookings: [{ id: BOOKING, reference: "TB-2026-0042", title: "Rome", customer_id: CLIENT }],
    travelers: [
      {
        id: HOLDER_TRAVELER,
        booking_id: BOOKING,
        companion_id: null,
        is_account_holder: true,
        first_name: "Maëlle",
        last_name: "Martin",
        created_at: "2024-01-01",
      },
      {
        id: "ph",
        booking_id: BOOKING,
        companion_id: null,
        is_account_holder: false,
        first_name: "Adulte",
        last_name: "1",
        created_at: "2024-01-02",
      },
    ],
    documents: [passportRow()],
    inserts: [],
    seen: [],
  };
  const result = await runWithMcpAccess({ actor: "amadeus", passport: true }, () =>
    readPasseportVoyageur({ reference: "TB-2026-0042" }, fakeAdmin(script))
  );
  const body = result as unknown as {
    dossier: { reference: string };
    voyageurs: { voyageur_id: string; pieces: { numero_piece: string }[] }[];
  };
  assert.equal(body.dossier.reference, "TB-2026-0042");
  assert.deepEqual(
    body.voyageurs.map((row) => row.voyageur_id),
    [HOLDER_TRAVELER]
  );
  assert.equal(body.voyageurs[0].pieces[0].numero_piece, NUMBER);
  assert.equal(script.inserts.at(-1)?.reference, "TB-2026-0042");
  assert.equal(script.inserts.at(-1)?.booking_id, BOOKING);
  assert.equal(JSON.stringify(script.inserts).includes(NUMBER), false);

  const mismatch: Script = {
    bookings: [{ id: BOOKING, reference: "TB-2026-0042", title: "Rome", customer_id: CLIENT }],
    documents: [passportRow()],
    inserts: [],
    seen: [],
  };
  const refused = await runWithMcpAccess({ actor: "amadeus", passport: true }, () =>
    readPasseportVoyageur({ dossier_id: BOOKING, client_id: OTHER }, fakeAdmin(mismatch))
  );
  assert.equal((refused as { message: string }).message.includes("pas à ce client"), true);
  assert.equal(mismatch.seen.includes("crm_travel_documents"), false);
  assert.equal(mismatch.inserts[0].outcome, "invalide");
  assert.equal(mismatch.inserts[0].customer_id, OTHER);
  assert.equal(mismatch.inserts[0].booking_id, BOOKING);
});

test("a missing dossier, a bad id, and a piece number used as reference stay out of the journal text", async () => {
  const missing: Script = { bookings: [], inserts: [], seen: [] };
  const introuvable = await runWithMcpAccess({ actor: "amadeus", passport: true }, () =>
    readPasseportVoyageur({ reference: NUMBER }, fakeAdmin(missing))
  );
  assert.equal((introuvable as { introuvable?: boolean }).introuvable, true);
  assert.equal(missing.inserts[0].outcome, "introuvable");
  assert.equal(missing.inserts[0].reference, null);
  assert.equal(JSON.stringify(missing.inserts).includes(NUMBER), false);

  const choix: Script = {
    bookings: [
      { id: BOOKING, reference: "TB-2026-0042", title: "Rome", customer_id: CLIENT },
      { id: BOOKING_B, reference: "TB-2026-0042", title: "Milan", customer_id: CLIENT },
    ],
    documents: [passportRow()],
    inserts: [],
    seen: [],
  };
  const many = await runWithMcpAccess({ actor: "amadeus", passport: true }, () =>
    readPasseportVoyageur({ reference: "TB-2026-0042" }, fakeAdmin(choix))
  );
  assert.equal((many as { choix: unknown[] }).choix.length, 2);
  assert.equal(JSON.stringify(many).includes(NUMBER), false);
  assert.equal(choix.seen.includes("crm_travel_documents"), false);
  assert.equal(choix.inserts[0].outcome, "choix");

  const invalid: Script = { inserts: [], seen: [] };
  const bad = await runWithMcpAccess({ actor: "amadeus", passport: true }, () =>
    readPasseportVoyageur({ client_id: "pas-un-id" }, fakeAdmin(invalid))
  );
  assert.equal((bad as { message: string }).message, "Identifiant inconnu.");
  assert.equal(invalid.inserts[0].outcome, "invalide");
  assert.equal(invalid.seen.includes("crm_customers"), false);

  const broken: Script = { fail: { crm_customers: { code: "57014" } }, inserts: [], seen: [] };
  await assert.rejects(
    () =>
      runWithMcpAccess({ actor: "amadeus", passport: true }, () =>
        readPasseportVoyageur({ client_id: CLIENT }, fakeAdmin(broken))
      ),
    /Lecture impossible/
  );
  assert.equal(broken.inserts[0].outcome, "erreur");
  assert.equal(broken.seen.includes("crm_travel_documents"), false);
});

const SCAN_PATH = `customers/${CLIENT}/documents/passeport.jpg`;
const SIGNED = `https://example.supabase.co/storage/v1/object/sign/crm-files/passeport.jpg?token=abc`;

test("a passport file path stays inside the customer documents folder", () => {
  assert.equal(passportScanPath(CLIENT, SCAN_PATH), SCAN_PATH);
  assert.equal(passportScanPath(CLIENT, `customers/${CLIENT}/documents/secret.pdf`), `customers/${CLIENT}/documents/secret.pdf`);
  assert.equal(passportScanPath(CLIENT, "customers/secret.pdf"), null);
  assert.equal(passportScanPath(CLIENT, `customers/${OTHER}/documents/passeport.jpg`), null);
  assert.equal(passportScanPath(CLIENT, `customers/${CLIENT}/documents/../passeport.jpg`), null);
  assert.equal(passportScanPath(CLIENT, `customers/${CLIENT}/documents/%2e%2e/passeport.jpg`), null);
  assert.equal(parseScanQuery({}).kind, "missing");
  assert.equal(parseScanQuery({ client_id: CLIENT }).kind, "missing");
  assert.equal(parseScanQuery({ reference: "TB-2026-0042", voyageur_id: "zoe" }).kind, "invalid");
  assert.equal(parseScanQuery({ reference: "TB-2026-0042", voyageur_id: HOLDER_TRAVELER }).kind, "dossier");
});

test("without the passport scope the scan is refused before any signature", async () => {
  const script: Script = {
    bookings: [{ id: BOOKING, reference: "TB-2026-0042", title: "Rome", customer_id: CLIENT }],
    documents: [passportRow({ storage_path: SCAN_PATH, file_name: "passeport.jpg", mime_type: "image/jpeg" })],
    inserts: [],
    seen: [],
  };
  let signed = 0;
  await assert.rejects(
    () =>
      readScanPasseport({ reference: "TB-2026-0042", voyageur_id: HOLDER_TRAVELER }, fakeAdmin(script), async () => {
        signed += 1;
        return SIGNED;
      }),
    (err: unknown) => err instanceof McpReadError && /pas autorisé/.test(err.message)
  );
  assert.equal(signed, 0);
  assert.deepEqual(script.seen, ["crm_mcp_passport_reads"]);
  assert.equal(script.inserts[0].outcome, "refuse");
  assert.equal(script.inserts[0].kind, "scan");
  assert.equal(script.inserts[0].actor, "mcp");
});

test("an authorized assistant receives the scan url, the birth place, and a pdf warning", async () => {
  const jpeg: Script = {
    customers: customerRow(),
    bookings: [{ id: BOOKING, reference: "TB-2026-0042", title: "Rome", customer_id: CLIENT }],
    travelers: [
      {
        id: HOLDER_TRAVELER,
        booking_id: BOOKING,
        companion_id: null,
        is_account_holder: true,
        first_name: "Maëlle",
        last_name: "Martin",
        created_at: "2024-01-01",
      },
    ],
    documents: [
      passportRow({
        place_of_birth: "PARIS",
        storage_path: SCAN_PATH,
        file_name: "passeport.jpg",
        mime_type: "image/jpeg",
        booking_id: null,
      }),
      passportRow({
        id: "trip",
        number: NUMBER,
        booking_id: BOOKING,
        traveler_id: HOLDER_TRAVELER,
        expires_on: "2032-01-01",
        place_of_birth: null,
        storage_path: null,
        file_name: null,
        mime_type: null,
      }),
    ],
    inserts: [],
    seen: [],
  };
  const signed: string[] = [];
  const result = await runWithMcpAccess({ actor: "amadeus", passport: true }, () =>
    readScanPasseport({ reference: "TB-2026-0042" }, fakeAdmin(jpeg), async (path) => {
      signed.push(path);
      return SIGNED;
    })
  );
  const body = result as {
    voyageur_id: string;
    scans: { fichier: string; type_mime: string; pdf: boolean; url_signee: string; expire_dans: number; lieu_naissance: string | null; note?: string }[];
  };
  assert.equal(body.voyageur_id, HOLDER_TRAVELER);
  assert.deepEqual(signed, [SCAN_PATH]);
  assert.equal(body.scans.length, 1);
  assert.equal(body.scans[0].fichier, "passeport.jpg");
  assert.equal(body.scans[0].type_mime, "image/jpeg");
  assert.equal(body.scans[0].pdf, false);
  assert.equal(body.scans[0].note, undefined);
  assert.equal(body.scans[0].url_signee, SIGNED);
  assert.equal(body.scans[0].expire_dans, 600);
  assert.equal(body.scans[0].lieu_naissance, "PARIS");
  assert.equal(JSON.stringify(body).includes(NUMBER), false);
  assert.equal(JSON.stringify(body).includes(SCAN_PATH), false);
  assert.equal(JSON.stringify(body).includes("999888777"), false);
  assert.equal(jpeg.inserts.at(-1)?.kind, "scan");
  assert.equal(jpeg.inserts.at(-1)?.outcome, "ok");
  assert.equal(jpeg.inserts.at(-1)?.reference, "TB-2026-0042");
  assert.equal(JSON.stringify(jpeg.inserts).includes(SCAN_PATH), false);
  assert.equal(JSON.stringify(jpeg.inserts).includes(SIGNED), false);
  assert.equal(JSON.stringify(jpeg.inserts).includes(NUMBER), false);
  assert.equal(JSON.stringify(jpeg.inserts).includes("PARIS"), false);

  const pdf: Script = {
    customers: customerRow(),
    bookings: [{ id: BOOKING, reference: "TB-2026-0042", title: "Rome", customer_id: CLIENT }],
    travelers: [
      {
        id: COMPANION_TRAVELER,
        booking_id: BOOKING,
        companion_id: COMPANION,
        is_account_holder: false,
        first_name: "Léa",
        last_name: "Martin",
        created_at: "2024-01-01",
      },
    ],
    companions: [{ id: COMPANION, first_name: "Léa", last_name: "Martin" }],
    documents: [
      passportRow({
        id: "lea",
        companion_id: COMPANION,
        number: OTHER_NUMBER,
        first_name: "Léa",
        last_name: "Martin",
        storage_path: `customers/${CLIENT}/documents/livret.pdf`,
        file_name: "livret.pdf",
        mime_type: "application/pdf",
      }),
    ],
    inserts: [],
    seen: [],
  };
  const pdfResult = await runWithMcpAccess({ actor: "amadeus", passport: true }, () =>
    readScanPasseport({ dossier_id: BOOKING, voyageur_id: COMPANION }, fakeAdmin(pdf), async () => SIGNED)
  );
  const pdfBody = pdfResult as { voyageur_id: string; scans: { pdf: boolean; note?: string; type_mime: string }[] };
  assert.equal(pdfBody.voyageur_id, COMPANION_TRAVELER);
  assert.equal(pdfBody.scans[0].pdf, true);
  assert.equal(pdfBody.scans[0].type_mime, "application/pdf");
  assert.match(pdfBody.scans[0].note || "", /PDF/);
  assert.match(pdfBody.scans[0].note || "", /png, jpg ou jpeg/);
});

test("a foreign file path and an unknown traveler do not produce a url", async () => {
  const foreign: Script = {
    customers: customerRow(),
    bookings: [{ id: BOOKING, reference: "TB-2026-0042", title: "Rome", customer_id: CLIENT }],
    travelers: [
      {
        id: HOLDER_TRAVELER,
        booking_id: BOOKING,
        companion_id: null,
        is_account_holder: true,
        first_name: "Maëlle",
        last_name: "Martin",
        created_at: "2024-01-01",
      },
    ],
    documents: [
      passportRow({
        storage_path: `customers/${OTHER}/documents/passeport.jpg`,
        file_name: "passeport.jpg",
        mime_type: "image/jpeg",
        place_of_birth: "LYON",
      }),
    ],
    inserts: [],
    seen: [],
  };
  let signed = 0;
  const result = await runWithMcpAccess({ actor: "amadeus", passport: true }, () =>
    readScanPasseport({ reference: "TB-2026-0042", voyageur_id: HOLDER_TRAVELER }, fakeAdmin(foreign), async () => {
      signed += 1;
      return SIGNED;
    })
  );
  const body = result as { scans: unknown[]; message: string; lieu_naissance: string };
  assert.equal(signed, 0);
  assert.deepEqual(body.scans, []);
  assert.match(body.message, /Aucun scan/);
  assert.equal(body.lieu_naissance, "LYON");
  assert.equal(JSON.stringify(result).includes(OTHER), false);

  const missing: Script = {
    customers: customerRow(),
    bookings: [{ id: BOOKING, reference: "TB-2026-0042", title: "Rome", customer_id: CLIENT }],
    travelers: [
      {
        id: HOLDER_TRAVELER,
        booking_id: BOOKING,
        companion_id: null,
        is_account_holder: true,
        first_name: "Maëlle",
        last_name: "Martin",
        created_at: "2024-01-01",
      },
      {
        id: COMPANION_TRAVELER,
        booking_id: BOOKING,
        companion_id: COMPANION,
        is_account_holder: false,
        first_name: "Léa",
        last_name: "Martin",
        created_at: "2024-01-02",
      },
    ],
    documents: [passportRow({ storage_path: SCAN_PATH, file_name: "passeport.jpg", mime_type: "image/jpeg" })],
    inserts: [],
    seen: [],
  };
  const choice = await runWithMcpAccess({ actor: "amadeus", passport: true }, () =>
    readScanPasseport({ reference: "TB-2026-0042" }, fakeAdmin(missing), async () => {
      signed += 1;
      return SIGNED;
    })
  );
  const listed = choice as { voyageurs: { voyageur_id: string; a_un_scan: boolean }[] };
  assert.equal(signed, 0);
  assert.equal(listed.voyageurs.length, 2);
  assert.equal(listed.voyageurs[0].a_un_scan, true);
  assert.equal(JSON.stringify(choice).includes(SIGNED), false);
  assert.equal(missing.inserts.at(-1)?.outcome, "choix");

  const unknown = await runWithMcpAccess({ actor: "amadeus", passport: true }, () =>
    readScanPasseport({ reference: "TB-2026-0042", voyageur_id: OTHER }, fakeAdmin(missing), async () => SIGNED)
  );
  assert.equal((unknown as { message: string }).message.includes("pas sur ce dossier"), true);
  assert.equal(missing.inserts.at(-1)?.outcome, "introuvable");
});
