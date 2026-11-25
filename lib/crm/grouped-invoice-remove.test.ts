import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { groupedInvoiceDuplicateMessage } from "./grouped-invoice";
import {
  detachGroupedMb3mPayments,
  groupedMb3mLetteredRefusal,
  groupedMb3mPrintedRemovalMessage,
  releaseGroupedMb3mPiece,
  type GroupedMb3mReleaseDeps,
} from "./grouped-invoice-mb3m";
import { activeGroupedInvoiceNumbers, removeGroupedInvoice } from "./grouped-invoice-run";
import { MB3M_CANCEL_KEEPS_LETTERING } from "./mb3m-unletter";
import { formatMoney } from "./money";
import {
  groupedMb3mPaymentWarning,
  mb3mLetteredElsewhereWarning,
  planMb3mPayments,
  type Mb3mCredit,
} from "./mb3m-payments";

const CLIENT = "55555555-5555-4555-8555-555555555555";
const INVOICE = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const DOSSIER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DOSSIER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CREDIT_A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CREDIT_B = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

type Write = { table: string; op: string; payload: unknown };

function memoryAdmin(tables: Record<string, Record<string, unknown>[]>) {
  const writes: Write[] = [];
  function from(table: string) {
    const filters: { method: string; args: unknown[] }[] = [];
    let op: "select" | "update" | "delete" | "insert" = "select";
    let payload: unknown = null;
    const api = {
      select() {
        op = "select";
        return api;
      },
      update(value: unknown) {
        op = "update";
        payload = value;
        return api;
      },
      delete() {
        op = "delete";
        return api;
      },
      insert(value: unknown) {
        op = "insert";
        payload = value;
        return api;
      },
      eq(column: string, value: unknown) {
        filters.push({ method: "eq", args: [column, value] });
        return api;
      },
      in(column: string, value: unknown[]) {
        filters.push({ method: "in", args: [column, value] });
        return api;
      },
      is() {
        return api;
      },
      maybeSingle() {
        return Promise.resolve(finish(true));
      },
      then(onOk: (value: unknown) => unknown, onErr?: (reason: unknown) => unknown) {
        return Promise.resolve(finish(false)).then(onOk, onErr);
      },
    };
    function finish(single: boolean) {
      if (op !== "select") {
        writes.push({ table, op, payload });
        return { data: null, error: null };
      }
      let rows = [...(tables[table] || [])];
      for (const filter of filters) {
        if (filter.method === "eq") {
          const [column, value] = filter.args as [string, unknown];
          rows = rows.filter((row) => row[column] === value);
        }
        if (filter.method === "in") {
          const [column, values] = filter.args as [string, unknown[]];
          rows = rows.filter((row) => values.includes(row[column]));
        }
      }
      return { data: single ? (rows[0] ?? null) : rows, error: null };
    }
    return api;
  }
  return { admin: { from } as unknown as SupabaseClient, writes };
}

function invoiceRow(patch: Record<string, unknown> = {}) {
  return {
    id: INVOICE,
    number: "FG-2026-0011",
    customer_id: CLIENT,
    removed_at: null,
    mb3m_piece_number: "2258",
    mb3m_piece_uid: "uid-2258",
    mb3m_folder_id: "22-0002258",
    mb3m_customer_uid: "client-uid",
    mb3m_error: null,
    ...patch,
  };
}

function deps(partial: Partial<GroupedMb3mReleaseDeps> = {}): GroupedMb3mReleaseDeps & { cancelled: string[] } {
  const cancelled: string[] = [];
  return {
    cancelled,
    configured: () => true,
    findPiece: async () => "open",
    readLettrage: async () => ({ lettered: false, amount: 6900, balance: 6900, seen: true }),
    cancelInvoice: async (folderId, number) => {
      cancelled.push(`${folderId}:${number}`);
    },
    ...partial,
  };
}

test("le retrait refuse une pièce imprimée, sans annuler", async () => {
  const gate = deps({ findPiece: async () => "printed" });
  const released = await releaseGroupedMb3mPiece(
    { pieceNumber: "2258", folderId: "22-0002258", customerUid: "client-uid" },
    gate
  );
  assert.equal(released.ok, false);
  if (released.ok) return;
  assert.equal(released.error, groupedMb3mPrintedRemovalMessage("2258"));
  assert.deepEqual(gate.cancelled, []);
});

test("le retrait refuse une pièce lettrée et dit que le délettrage se fait dans MB3M", async () => {
  const gate = deps({
    readLettrage: async () => ({ lettered: true, amount: 6900, balance: 0, seen: true }),
  });
  const released = await releaseGroupedMb3mPiece(
    { pieceNumber: "2258", folderId: "22-0002258", customerUid: "client-uid" },
    gate
  );
  assert.equal(released.ok, false);
  if (released.ok) return;
  assert.equal(released.error, groupedMb3mLetteredRefusal("2258", 6900));
  assert.match(released.error, /La pièce MB3M n° 2258 porte/);
  assert.match(released.error, new RegExp(formatMoney(6900).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(released.error, /délettrez-les d'abord dans MB3M/);
  assert.match(released.error, /Attention : l'annulation de la pro forma dans MB3M ne délettre pas les règlements/);
  assert.match(released.error, /Délettrez-les d'abord depuis MB3M/);
  assert.deepEqual(gate.cancelled, []);
});

test("une erreur MB3M ou une pièce injoignable bloque le retrait", async () => {
  const down = deps({
    findPiece: async () => {
      throw new Error("MB3M ne répond pas.");
    },
  });
  const released = await releaseGroupedMb3mPiece(
    { pieceNumber: "2258", folderId: "22-0002258", customerUid: "client-uid" },
    down
  );
  assert.equal(released.ok, false);
  if (released.ok) return;
  assert.match(released.error, /MB3M ne répond pas/);
  assert.deepEqual(down.cancelled, []);
  const unread = deps({
    readLettrage: async () => {
      throw new Error("Le lettrage de la pro forma n’a pas pu être lu.");
    },
  });
  const held = await releaseGroupedMb3mPiece(
    { pieceNumber: "2258", folderId: "22-0002258", customerUid: "client-uid" },
    unread
  );
  assert.equal(held.ok, false);
  if (!held.ok) assert.match(held.error, /lettrage/);
  assert.deepEqual(unread.cancelled, []);
});

test("sans lettrage, CancelInvoice part, puis les traces de la pièce se détachent", async () => {
  const gate = deps();
  const released = await releaseGroupedMb3mPiece(
    { pieceNumber: "2258", folderId: "22-0002258", customerUid: "client-uid" },
    gate
  );
  assert.deepEqual(released, { ok: true, clear: true });
  assert.deepEqual(gate.cancelled, ["22-0002258:2258"]);
  const { admin, writes } = memoryAdmin({});
  await detachGroupedMb3mPayments(admin, "2258");
  assert.deepEqual(
    writes.map((row) => row.op),
    ["delete", "update"]
  );
  assert.equal(writes[0]?.table, "crm_mb3m_payment_matches");
  assert.equal(writes[1]?.table, "crm_mb3m_payments");
  assert.deepEqual(writes[1]?.payload, {
    mb3m_invoice_number: null,
    mb3m_matching_id: null,
    matched_amount: 0,
  });
});

test("le retrait CRM n’écrit rien si la pièce est lettrée", async () => {
  const { admin, writes } = memoryAdmin({
    crm_grouped_invoices: [invoiceRow()],
  });
  const result = await removeGroupedInvoice(admin, CLIENT, INVOICE, { staffId: null, name: "Agence" }, deps({
    readLettrage: async () => ({ lettered: true, amount: 6900, balance: 0, seen: true }),
  }));
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /2258/);
  assert.equal(result.error.includes(MB3M_CANCEL_KEEPS_LETTERING), true);
  assert.equal(writes.length, 0);
});

test("une facture groupée active du même client bloque la création et nomme le numéro FG", async () => {
  const { admin } = memoryAdmin({
    crm_grouped_invoice_bookings: [
      { grouped_invoice_id: INVOICE, booking_id: DOSSIER_A },
      { grouped_invoice_id: OTHER, booking_id: DOSSIER_B },
    ],
    crm_grouped_invoices: [
      { id: INVOICE, number: "FG-2026-0011", customer_id: CLIENT, removed_at: null },
      { id: OTHER, number: "FG-2026-0004", customer_id: CLIENT, removed_at: "2026-11-01T00:00:00.000Z" },
    ],
  });
  const clash = await activeGroupedInvoiceNumbers(admin, CLIENT, [DOSSIER_A, DOSSIER_B], null);
  assert.equal(clash.ok, true);
  if (!clash.ok) return;
  assert.deepEqual(clash.data, ["FG-2026-0011"]);
  assert.match(groupedInvoiceDuplicateMessage(clash.data), /FG-2026-0011/);
  assert.match(groupedInvoiceDuplicateMessage(clash.data), /facture_id/);
  const updating = await activeGroupedInvoiceNumbers(admin, CLIENT, [DOSSIER_A], INVOICE);
  assert.equal(updating.ok, true);
  if (updating.ok) assert.deepEqual(updating.data, []);
  const otherClient = memoryAdmin({
    crm_grouped_invoice_bookings: [{ grouped_invoice_id: INVOICE, booking_id: DOSSIER_A }],
    crm_grouped_invoices: [{ id: INVOICE, number: "FG-2026-0011", customer_id: "66666666-6666-4666-8666-666666666666", removed_at: null }],
  });
  const foreign = await activeGroupedInvoiceNumbers(otherClient.admin, CLIENT, [DOSSIER_A], null);
  assert.equal(foreign.ok, true);
  if (foreign.ok) assert.deepEqual(foreign.data, []);
});

test("1 700 € et 5 200 € lettrés sur 2258 sont nommés, sans être renvoyés", () => {
  const credit = (id: string, amount: number, date: string): Mb3mCredit => ({
    id,
    bookingId: DOSSIER_A,
    customerId: CLIENT,
    billingCompanyId: null,
    amount,
    date,
    source: "revolut",
    label: "Virement",
  });
  const letteredElsewhere: { amount: number; invoice: string }[] = [];
  const plans = planMb3mPayments({
    bookingId: DOSSIER_A,
    bookingIds: [DOSSIER_A, DOSSIER_B],
    includeWallet: true,
    invoiceNumber: "2260",
    invoiceAmount: 20000,
    credits: [credit(CREDIT_A, 1700, "2026-11-02"), credit(CREDIT_B, 5200, "2026-11-03")],
    otherOpenBookings: 0,
    links: [
      { transactionId: CREDIT_A, paymentNumber: "1", invoiceNumber: "2258", matchedAmount: 1700 },
      { transactionId: CREDIT_B, paymentNumber: "2", invoiceNumber: "2258", matchedAmount: 5200 },
    ],
    remote: [
      { number: "1", reference: "CRM", amount: 1700, date: "2026-11-02", invoiceNumber: "2258", unmatched: 0 },
      { number: "2", reference: "CRM", amount: 5200, date: "2026-11-03", invoiceNumber: "2258", unmatched: 0 },
    ],
    remoteReady: true,
    letteredElsewhere,
  });
  assert.equal(plans.length, 0);
  const warning = mb3mLetteredElsewhereWarning(letteredElsewhere);
  assert.equal(warning, `${formatMoney(1700)} et ${formatMoney(5200)} sont lettrés sur la pièce 2258.`);
  const shown = groupedMb3mPaymentWarning([
    { date: "", montant: 0, numero_mb3m: null, statut: "deja_dans_mb3m", avertissement: warning },
  ]);
  assert.match(shown || "", /2258/);
  assert.match(shown || "", /sont lettrés/);
});

test("les boutons et les dialogues de pro forma montrent l’avertissement de délettrage", () => {
  const files = [
    new URL("../../components/admin/GroupedInvoicePanel.tsx", import.meta.url),
    new URL("../../components/admin/InvoiceBlock.tsx", import.meta.url),
  ];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /MB3M_CANCEL_KEEPS_LETTERING/);
    assert.match(source, /ConfirmDialog/);
    assert.match(source, /role="note"/);
  }
  assert.match(MB3M_CANCEL_KEEPS_LETTERING, /ne délettre pas les règlements/);
  assert.match(groupedMb3mPrintedRemovalMessage("2258"), /imprimée/);
});
