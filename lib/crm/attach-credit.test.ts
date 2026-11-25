import assert from "node:assert/strict";
import test from "node:test";
import { attachPostedCredit, isLooseCredit, suggestCreditLink } from "./attach-credit";

const IMF = "11111111-1111-4111-8111-111111111111";
const CLIENT = "22222222-2222-4222-8222-222222222222";
const DOSSIER = "33333333-3333-4333-8333-333333333333";
const CREDIT = "44444444-4444-4444-8444-444444444444";

test("un crédit sans dossier ni payeur est libre", () => {
  assert.equal(
    isLooseCredit({ direction: "credit", status: "posted", booking_id: null, payer_kind: null, billing_company_id: null }),
    true
  );
  assert.equal(
    isLooseCredit({ direction: "credit", status: "posted", booking_id: DOSSIER, payer_kind: null, billing_company_id: null }),
    false
  );
  assert.equal(
    isLooseCredit({ direction: "credit", status: "posted", booking_id: null, payer_kind: "personal", billing_company_id: null }),
    false
  );
  assert.equal(
    isLooseCredit({ direction: "debit", status: "posted", booking_id: null, payer_kind: null, billing_company_id: null }),
    false
  );
});

test("le libellé propose le dossier ou la société, sans écrire", () => {
  const bookings = [
    {
      id: DOSSIER,
      reference: "TB-2026-0142",
      payer_kind: "personal" as const,
      billing_company_id: null,
      status: "confirmed",
      archived_at: null,
    },
    {
      id: "55555555-5555-4555-8555-555555555555",
      reference: "TB-2026-0200",
      payer_kind: "company" as const,
      billing_company_id: IMF,
      status: "confirmed",
      archived_at: null,
    },
  ];
  const companies = [
    { id: IMF, company_name: "Société IMF" },
    { id: "66666666-6666-4666-8666-666666666666", company_name: "Atelier Horizon" },
  ];
  const byRef = suggestCreditLink({
    label: "Virement Revolut Meryl — TB-2026-0142",
    bookings,
    companies,
  });
  assert.equal(byRef.bookingId, DOSSIER);
  assert.equal(byRef.payerKind, "personal");
  assert.equal(byRef.companyId, null);
  assert.equal(byRef.reason, "Référence du dossier");

  const byCompany = suggestCreditLink({
    label: "Virement IMF acompte",
    bookings,
    companies,
  });
  assert.equal(byCompany.payerKind, "company");
  assert.equal(byCompany.companyId, IMF);
  assert.equal(byCompany.bookingId, bookings[1].id);
  assert.equal(byCompany.reason, "Nom de la société");

  const ambiguous = suggestCreditLink({
    label: "Virement reçu",
    bookings,
    companies,
  });
  assert.equal(ambiguous.bookingId, null);
  assert.equal(ambiguous.payerKind, null);
});

function memory(seed: Record<string, Record<string, unknown>[]>) {
  const tables = structuredClone(seed);
  const updates: Record<string, unknown>[] = [];
  return {
    updates,
    from(table: string) {
      const filters: [string, string][] = [];
      let patch: Record<string, unknown> | null = null;
      const api = {
        select() {
          return api;
        },
        update(next: Record<string, unknown>) {
          patch = next;
          return api;
        },
        eq(column: string, value: string) {
          filters.push([column, value]);
          return api;
        },
        maybeSingle() {
          const row = (tables[table] || []).find((item) => filters.every(([column, value]) => item[column] === value)) || null;
          return Promise.resolve({ data: row, error: null });
        },
        single() {
          const row = (tables[table] || []).find((item) => filters.every(([column, value]) => item[column] === value));
          if (row && patch) {
            if ("amount" in patch) throw new Error("le montant ne doit pas être écrit");
            Object.assign(row, patch);
            updates.push({ ...patch });
          }
          return Promise.resolve({ data: row || null, error: row ? null : { message: "missing" } });
        },
      };
      return api;
    },
  };
}

test("rattacher un crédit déjà encaissé ne crée pas de paiement et garde le montant", async () => {
  const db = memory({
    crm_transactions: [
      {
        id: CREDIT,
        customer_id: CLIENT,
        booking_id: null,
        payer_kind: null,
        billing_company_id: null,
        amount: 1800,
        currency: "EUR",
        status: "posted",
        direction: "credit",
      },
    ],
    crm_bookings: [
      {
        id: DOSSIER,
        reference: "TB-2026-0142",
        customer_id: CLIENT,
        billing_customer_id: CLIENT,
        archived_at: null,
      },
    ],
    crm_billing_companies: [{ id: IMF, customer_id: CLIENT, company_name: "Société IMF" }],
  });
  const attached = await attachPostedCredit(db, {
    id: CREDIT,
    bookingId: DOSSIER,
    payerKind: "company",
    companyId: IMF,
  });
  assert.equal(attached.ok, true);
  if (!attached.ok) return;
  assert.equal(attached.deja, false);
  assert.equal(attached.montant, 1800);
  assert.equal(attached.dossier_id, DOSSIER);
  assert.equal(attached.payeur, "company");
  assert.equal(attached.societe_id, IMF);
  assert.equal(db.updates.length, 1);
  assert.equal("amount" in db.updates[0], false);
  assert.equal(db.updates[0].booking_id, DOSSIER);
  const again = await attachPostedCredit(db, {
    id: CREDIT,
    bookingId: DOSSIER,
    payerKind: "company",
    companyId: IMF,
  });
  assert.equal(again.ok && again.deja, true);
  assert.equal(db.updates.length, 1);
});

test("un débit et un autre client sont refusés", async () => {
  const db = memory({
    crm_transactions: [
      {
        id: CREDIT,
        customer_id: CLIENT,
        booking_id: null,
        payer_kind: null,
        billing_company_id: null,
        amount: 10,
        currency: "EUR",
        status: "posted",
        direction: "debit",
      },
    ],
    crm_bookings: [],
    crm_billing_companies: [],
  });
  const refused = await attachPostedCredit(db, {
    id: CREDIT,
    bookingId: DOSSIER,
    payerKind: "personal",
    companyId: null,
  });
  assert.equal(refused.ok, false);
  if (refused.ok) return;
  assert.match(refused.error, /crédits déjà encaissés/);
});
