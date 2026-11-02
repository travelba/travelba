import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  clientCreditLines,
  creditInvoiceLock,
  externalIdReleasesPayment,
  isReleasableCredit,
  originalPaymentId,
  paymentCreditReleased,
  prepareUnmatchCredit,
  releasedExternalId,
  releaseMatchedCredit,
  unmatchClientCredit,
  type UnmatchJournalEntry,
} from "./unmatch-credit";

const nodeRequire = createRequire(import.meta.url);
const Module = nodeRequire("module") as { _load: (...args: unknown[]) => unknown };
const load = Module._load;
Module._load = function (request: unknown, parent: unknown, isMain: unknown) {
  if (request === "next/navigation") return { useRouter: () => ({ refresh() {}, push() {} }) };
  return load.call(this, request, parent, isMain);
};

const CLIENT = "11111111-1111-4111-8111-111111111111";
const CREDIT = "22222222-2222-4222-8222-222222222222";
const WIRE = "33333333-3333-4333-8333-333333333333";
const STRIPE_ROW = "44444444-4444-4444-8444-444444444444";

type MemoryRow = Record<string, unknown> & { id?: string };

function memory(tables: Record<string, MemoryRow[]>) {
  const journals: UnmatchJournalEntry[] = [];
  function from(table: string) {
    const filters: { kind: string; column: string; value: unknown }[] = [];
    let payload: Record<string, unknown> | null = null;
    const api = {
      select(_columns?: string) {
        return api;
      },
      update(value: Record<string, unknown>) {
        payload = value;
        return api;
      },
      eq(column: string, value: unknown) {
        filters.push({ kind: "eq", column, value });
        return api;
      },
      overlaps(column: string, value: readonly string[]) {
        filters.push({ kind: "overlaps", column, value });
        return api;
      },
      in(column: string, value: readonly unknown[]) {
        filters.push({ kind: "in", column, value });
        return api;
      },
      gte(column: string, value: string) {
        filters.push({ kind: "gte", column, value });
        return api;
      },
      lt(column: string, value: string) {
        filters.push({ kind: "lt", column, value });
        return api;
      },
      order() {
        return api;
      },
      limit() {
        return api;
      },
      maybeSingle() {
        return Promise.resolve(run(true));
      },
      then(resolve: (value: { data: unknown; error: null }) => void, reject?: (reason: unknown) => void) {
        return Promise.resolve(run(false)).then(resolve, reject);
      },
    };
    function matches(row: MemoryRow) {
      return filters.every((filter) => {
        const current = row[filter.column];
        if (filter.kind === "eq") return current === filter.value;
        if (filter.kind === "in") return Array.isArray(filter.value) && filter.value.includes(current);
        if (filter.kind === "overlaps") {
          const ids = Array.isArray(current) ? current : [];
          return Array.isArray(filter.value) && filter.value.some((id) => ids.includes(id));
        }
        if (filter.kind === "gte") return String(current ?? "") >= String(filter.value);
        if (filter.kind === "lt") return String(current ?? "") < String(filter.value);
        return false;
      });
    }
    function run(single: boolean) {
      const rows = (tables[table] || []).filter(matches);
      if (payload) {
        for (const row of rows) Object.assign(row, payload);
      }
      return { data: single ? rows[0] || null : rows, error: null };
    }
    return api;
  }
  return {
    from,
    journals,
    journal: async (entry: UnmatchJournalEntry) => {
      journals.push(entry);
    },
  };
}

function credit(partial: MemoryRow = {}): MemoryRow {
  return {
    id: CREDIT,
    customer_id: CLIENT,
    direction: "credit",
    kind: "transfer",
    source: "revolut",
    status: "posted",
    amount: 7916.92,
    currency: "EUR",
    external_id: "rev-7916",
    label: "Virement Revolut",
    ...partial,
  };
}

test("le verrou MB3M ne lâche pas une facture imprimée ni une préparation fraîche", () => {
  const now = Date.parse("2026-11-02T12:00:00.000Z");
  const printed = creditInvoiceLock({
    pieces: [{ piece_number: "FA-19", printed_at: "2026-11-01", credited_at: null, transaction_ids: [CREDIT] }],
    accountInvoices: [],
    transactionId: CREDIT,
  });
  assert.match(printed || "", /FA-19/);
  assert.match(printed || "", /imprimée/);

  const avoir = creditInvoiceLock({
    pieces: [{ piece_number: "FA-19", printed_at: "2026-11-01", credited_at: "2026-11-02", transaction_ids: [CREDIT] }],
    accountInvoices: [],
    transactionId: CREDIT,
  });
  assert.equal(avoir, null);

  const preparing = creditInvoiceLock(
    {
      pieces: [
        {
          attempt_status: "preparing",
          attempt_started_at: "2026-11-02T11:58:00.000Z",
          transaction_ids: [CREDIT],
        },
      ],
      accountInvoices: [],
      transactionId: CREDIT,
    },
    now
  );
  assert.match(preparing || "", /préparation/);

  const stale = creditInvoiceLock(
    {
      pieces: [
        {
          attempt_status: "preparing",
          attempt_started_at: "2026-11-02T11:00:00.000Z",
          transaction_ids: [CREDIT],
        },
      ],
      accountInvoices: [],
      transactionId: CREDIT,
    },
    now
  );
  assert.equal(stale, null);

  const account = creditInvoiceLock({
    pieces: [],
    accountInvoices: [{ id: "inv", piece_number: "FA-2", printed_at: "2026-11-01" }],
    transactionId: CREDIT,
  });
  assert.match(account || "", /FA-2/);
});

test("le suffixe libère l’identifiant du paiement et le désigne encore", () => {
  const stored = releasedExternalId("pi_123", CREDIT);
  assert.equal(originalPaymentId(stored), "pi_123");
  assert.equal(externalIdReleasesPayment(stored, "pi_123"), true);
  assert.equal(externalIdReleasesPayment(stored, "pi_1234"), false);
  assert.equal(externalIdReleasesPayment("pi_123", "pi_123"), false);
  assert.equal(isReleasableCredit({ direction: "credit", kind: "card_payment", source: "stripe", status: "posted" }), true);
  assert.equal(isReleasableCredit({ direction: "debit", kind: "booking", source: "manual", status: "posted" }), false);
});

test("les crédits rattachés se lisent par montant", () => {
  const lines = clientCreditLines([
    credit(),
    credit({ id: "debit", direction: "debit", kind: "booking", source: "manual", amount: 10 }),
    credit({ id: "voided", status: "void" }),
  ] as unknown as Parameters<typeof clientCreditLines>[0]);
  assert.equal(lines.length, 1);
  assert.equal(lines[0]?.id, CREDIT);
  assert.equal(lines[0]?.montant_valeur, 7916.92);
  assert.match(lines[0]?.montant || "", /7[\s\u202f]916,92/);
  assert.equal(lines[0]?.paiement_id, "rev-7916");
});

test("un virement Revolut rattaché redevient non rattaché et le crédit est annulé", async () => {
  const db = memory({
    crm_transactions: [credit()],
    crm_revolut_transactions: [
      {
        id: WIRE,
        status: "matched",
        direction: "credit",
        matched_transaction_id: CREDIT,
        matched_customer_id: CLIENT,
        revolut_transaction_id: "rev-7916",
      },
    ],
    crm_customers: [{ id: CLIENT, first_name: "Camille", last_name: "Martin" }],
    crm_mb3m_pieces: [],
    crm_mb3m_account_lines: [],
  });
  const result = await unmatchClientCredit(db, { id: CREDIT, motif: "Mauvais client" }, { actor: { staffId: "staff-1", label: "agence" }, journal: db.journal });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.file, "revolut_en_attente");
  assert.equal(result.montant, 7916.92);
  assert.equal(result.client, "Camille Martin");
  assert.equal(result.paiement_id, "rev-7916");
  const row = (await db.from("crm_transactions").select("*").eq("id", CREDIT).maybeSingle()).data as MemoryRow;
  assert.equal(row.status, "void");
  assert.equal(originalPaymentId(String(row.external_id)), "rev-7916");
  assert.notEqual(row.external_id, "rev-7916");
  const wire = (await db.from("crm_revolut_transactions").select("*").eq("id", WIRE).maybeSingle()).data as MemoryRow;
  assert.equal(wire.status, "unmatched");
  assert.equal(wire.matched_customer_id, null);
  assert.equal(wire.matched_transaction_id, null);
  assert.equal(db.journals.length, 1);
  assert.equal(db.journals[0]?.staffId, "staff-1");
  assert.match(db.journals[0]?.summary || "", /Camille Martin/);
  assert.match(db.journals[0]?.summary || "", /7[\s\u202f]916,92/);
  assert.equal(db.journals[0]?.diff.montant, 7916.92);
  assert.equal(db.journals[0]?.diff.client_id, CLIENT);
  assert.equal(db.journals[0]?.diff.motif, "Mauvais client");
  const again = await unmatchClientCredit(db, { id: CREDIT }, { journal: db.journal });
  assert.equal(again.ok, false);
  if (!again.ok) assert.equal(again.error, "Ce crédit est déjà annulé.");
  assert.equal(db.journals.length, 1);
});

test("l’identifiant du paiement Stripe suffit, et une facture imprimée refuse", async () => {
  const db = memory({
    crm_transactions: [credit({ source: "stripe", kind: "card_payment", external_id: "pi_123" })],
    crm_stripe_transactions: [
      {
        id: STRIPE_ROW,
        status: "matched",
        direction: "credit",
        matched_transaction_id: CREDIT,
        matched_customer_id: CLIENT,
        stripe_payment_intent_id: "pi_123",
      },
    ],
    crm_customers: [{ id: CLIENT, first_name: "Camille", last_name: "Martin" }],
    crm_mb3m_pieces: [],
    crm_mb3m_account_lines: [],
  });
  const released = await unmatchClientCredit(db, { id: "pi_123" }, { actor: { staffId: null, label: "mcp" }, journal: db.journal });
  assert.equal(released.ok, true);
  if (released.ok) assert.equal(released.file, "stripe_en_attente");
  assert.match(db.journals[0]?.summary || "", /mcp/);
  assert.equal(await paymentCreditReleased(db, "stripe", "pi_123"), true);
  assert.equal(await paymentCreditReleased(db, "stripe", "pi_999"), false);

  const LOCKED = "55555555-5555-4555-8555-555555555555";
  const locked = memory({
    crm_transactions: [credit({ id: LOCKED, source: "manual", external_id: null })],
    crm_customers: [{ id: CLIENT, first_name: "Camille", last_name: "Martin" }],
    crm_mb3m_pieces: [
      { id: "piece", piece_number: "FA-8", printed_at: "2026-11-01", credited_at: null, transaction_ids: [LOCKED] },
    ],
    crm_mb3m_account_lines: [],
  });
  const refused = await unmatchClientCredit(locked, { id: LOCKED }, { journal: locked.journal });
  assert.equal(refused.ok, false);
  if (!refused.ok) assert.match(refused.error, /FA-8/);
  assert.equal((locked as { journals: unknown[] }).journals.length, 0);
  const still = (await locked.from("crm_transactions").select("*").eq("id", LOCKED).maybeSingle()).data as MemoryRow;
  assert.equal(still.status, "posted");
});

test("un virement saisi s’annule sans file, un débit est refusé", async () => {
  const db = memory({
    crm_transactions: [
      credit({ source: "manual", external_id: null, kind: "transfer" }),
      credit({ id: "66666666-6666-4666-8666-666666666666", direction: "debit", kind: "booking", source: "manual", external_id: null }),
    ],
    crm_customers: [{ id: CLIENT, first_name: "Camille", last_name: "Martin" }],
    crm_mb3m_pieces: [],
    crm_mb3m_account_lines: [],
  });
  const manual = await unmatchClientCredit(db, { id: CREDIT }, { actor: { staffId: "staff-1", label: "agence" }, journal: db.journal });
  assert.equal(manual.ok, true);
  if (manual.ok) assert.equal(manual.file, null);
  const debit = await unmatchClientCredit(db, { id: "66666666-6666-4666-8666-666666666666" }, { journal: db.journal });
  assert.equal(debit.ok, false);
  if (!debit.ok) assert.match(debit.error, /crédits Revolut, Stripe/);
  const missing = prepareUnmatchCredit({});
  assert.equal("error" in missing && missing.error, "Indiquez le crédit ou le paiement.");
  const named = prepareUnmatchCredit({ virement_id: WIRE, motif: "  doublon  " });
  assert.equal("motif" in named && named.motif, "doublon");
  const tool = await releaseMatchedCredit({ paiement_id: "inconnu" }, db as never, { journal: db.journal });
  assert.equal(tool.ok, false);
  if (!tool.ok) assert.equal(tool.error, "Crédit introuvable.");
});

test("la ligne du grand livre agence propose Remettre en non rattaché", async () => {
  const { LedgerMovements } = await import("../../components/account/LedgerMovements");
  const html = renderToStaticMarkup(
    createElement(LedgerMovements, {
      rows: [
        {
          id: CREDIT,
          credit: true,
          title: "Virement",
          amountLabel: "+7 916,92 €",
          occurredLabel: "2 novembre 2026",
          kindLabel: "Virement",
          whenWhere: null,
          reference: null,
          carnetHref: null,
          unmatchable: true,
          source: "revolut",
        },
      ],
    })
  );
  assert.match(html, /Remettre en non rattaché/);
  const hidden = renderToStaticMarkup(
    createElement(LedgerMovements, {
      rows: [
        {
          id: "stay",
          credit: false,
          title: "Hôtel",
          amountLabel: "−100,00 €",
          occurredLabel: "2 novembre 2026",
          kindLabel: "Séjour",
          whenWhere: null,
          reference: null,
          carnetHref: null,
        },
      ],
    })
  );
  assert.doesNotMatch(hidden, /Remettre en non rattaché/);
});
