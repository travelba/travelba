import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { mb3mRealm } from "./mb3m";
import { recordMb3mInvoicePayments } from "./mb3m-payments";

const root = new URL("./fixtures/tb-2026-0044/", import.meta.url);
const findXml = readFileSync(new URL("find-all-pieces.response.xml", root), "utf8");
const matchXml = readFileSync(new URL("write-matching.response.xml", root), "utf8");
const crm = JSON.parse(readFileSync(new URL("crm.json", root), "utf8")) as {
  bookings: Record<string, unknown>[];
  customers: Record<string, unknown>[];
  transactions: Record<string, unknown>[];
  pieces: Record<string, unknown>[];
  payments: Record<string, unknown>[];
  matches: Record<string, unknown>[];
};

const BOOKING = "3d9eb840-dae8-4632-b755-f9e61e050b50";
const CREDIT = "c47f41ef-f8fe-4072-b610-1640aacf0dd2";

type Row = Record<string, unknown>;

function memory(seed: typeof crm) {
  const tables: Record<string, Row[]> = {
    crm_bookings: seed.bookings.map((row) => ({ ...row })),
    crm_customers: seed.customers.map((row) => ({ ...row })),
    crm_transactions: seed.transactions.map((row) => ({ ...row })),
    crm_mb3m_pieces: seed.pieces.map((row) => ({ ...row })),
    crm_mb3m_payments: seed.payments.map((row) => ({ ...row })),
    crm_mb3m_payment_matches: seed.matches.map((row) => ({ ...row })),
  };
  return {
    tables,
    from(table: string) {
      const rows = tables[table] || (tables[table] = []);
      const filters: ((row: Row) => boolean)[] = [];
      let op = "select";
      let payload: Row | null = null;
      const api = {
        select() {
          return api;
        },
        eq(column: string, value: unknown) {
          filters.push((row) => row[column] === value);
          return api;
        },
        in(column: string, values: unknown[]) {
          const set = new Set(values);
          filters.push((row) => set.has(row[column]));
          return api;
        },
        is(column: string, value: unknown) {
          filters.push((row) => (row[column] ?? null) === value);
          return api;
        },
        neq(column: string, value: unknown) {
          filters.push((row) => row[column] !== value);
          return api;
        },
        not(column: string, operator: string, value: unknown) {
          if (operator === "is" && value === null) filters.push((row) => row[column] != null);
          return api;
        },
        or(expr: string) {
          const preds = expr.split(",").map((part) => {
            const [column, operator, value] = part.split(".");
            return (row: Row) => operator === "eq" && row[column] === value;
          });
          filters.push((row) => preds.some((pred) => pred(row)));
          return api;
        },
        upsert(row: Row) {
          op = "upsert";
          payload = row;
          return api;
        },
        update(row: Row) {
          op = "update";
          payload = row;
          return api;
        },
        maybeSingle() {
          return Promise.resolve({ data: match()[0] || null, error: null });
        },
        then(resolve: (value: { data: unknown; error: null }) => void) {
          resolve(finish());
        },
      };
      function match() {
        return rows.filter((row) => filters.every((filter) => filter(row)));
      }
      function finish() {
        if (op === "upsert" && payload) {
          const index = rows.findIndex(
            (row) => row.transaction_id === payload?.transaction_id && row.realm === payload?.realm
          );
          if (index >= 0) rows[index] = { ...rows[index], ...payload };
          else rows.push({ id: `pay-${rows.length + 1}`, ...payload });
          return { data: null, error: null };
        }
        if (op === "update" && payload) {
          for (const row of match()) Object.assign(row, payload);
          return { data: null, error: null };
        }
        return { data: match(), error: null };
      }
      return api;
    },
  };
}

describe("fixture TB-2026-0044", () => {
  it("adopte 2149 et lettre 561,19 sur 2157, sans second envoi", async () => {
    const previous = {
      vercel: process.env.VERCEL_ENV,
      user: process.env.MB3M_PROD_API_USER,
      password: process.env.MB3M_PROD_API_PASSWORD,
      fetch: globalThis.fetch,
    };
    process.env.VERCEL_ENV = "production";
    process.env.MB3M_PROD_API_USER = "agence";
    process.env.MB3M_PROD_API_PASSWORD = "secret";
    const calls: { action: string; body: string }[] = [];
    globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      const action = String(new Headers(init?.headers).get("SOAPAction") || "");
      const body = String(init?.body || "");
      calls.push({ action, body });
      if (action.includes("SavePayment")) {
        return new Response(`<SavePaymentResponse><ResultCode>-1</ResultCode><Message>SavePayment ne doit pas être appelé</Message></SavePaymentResponse>`);
      }
      if (action.includes("WriteMatching")) return new Response(matchXml);
      if (action.includes("FindAllPieces")) return new Response(findXml);
      return new Response(`<ResultCode>1</ResultCode>`);
    }) as typeof fetch;
    const db = memory(crm);
    const input = {
      bookingId: BOOKING,
      folderId: "01-0002007",
      customerUid: "92c5a491-b764-4c07-9a08-ebf0e56a21a4",
      invoiceNumber: "2157",
      invoiceAmount: 561.19,
      gdsInvoices: [{ number: "2005", amount: 1197.44 }],
    };
    try {
      assert.equal(mb3mRealm(), "production");
      const first = await recordMb3mInvoicePayments(db as never, input);
      const writes = calls.filter((call) => call.action.includes("WriteMatching"));
      const saves = calls.filter((call) => call.action.includes("SavePayment"));
      console.log(
        JSON.stringify({
          reglements: first.map((row) => ({
            numero_mb3m: row.numero_mb3m,
            montant: row.montant,
            statut: row.statut,
          })),
          savePayment: saves.length,
          writeMatching: writes.map((call) => call.body.replace(/^[\s\S]*<Matching>/, "<Matching>").replace(/<\/FolderWriteMatchingRequest>[\s\S]*$/, "")),
        })
      );
      assert.equal(saves.length, 0);
      assert.equal(writes.length, 1);
      assert.match(writes[0]?.body || "", /<PaymentNumber>2149<\/PaymentNumber>/);
      assert.match(writes[0]?.body || "", /<PieceNumber>2157<\/PieceNumber>/);
      assert.match(writes[0]?.body || "", /<Amount>561\.19<\/Amount>/);
      assert.equal(first.filter((row) => row.montant > 0.01).length, 1);
      assert.equal(first.find((row) => row.montant > 0.01)?.numero_mb3m, "2149");
      assert.equal(first.find((row) => row.montant > 0.01)?.montant, 561.19);
      const adopted = db.tables.crm_mb3m_payments.find((row) => row.transaction_id === CREDIT);
      assert.equal(adopted?.mb3m_payment_number, "2149");
      assert.equal(Number(adopted?.matched_amount), 561.19);
      const before = calls.length;
      const second = await recordMb3mInvoicePayments(db as never, input);
      const again = calls.slice(before).filter((call) => call.action.includes("WriteMatching") || call.action.includes("SavePayment"));
      assert.equal(again.length, 0);
      assert.equal(second.filter((row) => row.montant > 0.01).length, 0);
      assert.equal(db.tables.crm_mb3m_payments.filter((row) => row.mb3m_payment_number === "2149").length, 1);
    } finally {
      globalThis.fetch = previous.fetch;
      if (previous.vercel === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = previous.vercel;
      if (previous.user === undefined) delete process.env.MB3M_PROD_API_USER;
      else process.env.MB3M_PROD_API_USER = previous.user;
      if (previous.password === undefined) delete process.env.MB3M_PROD_API_PASSWORD;
      else process.env.MB3M_PROD_API_PASSWORD = previous.password;
    }
  });
});
