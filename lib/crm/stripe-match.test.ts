import assert from "node:assert/strict";
import test from "node:test";
import type { CrmStripeTransaction } from "./types";
import {
  applyStripeToCustomer,
  refuseStripeInbox,
  scoreStripeMatches,
  type StripeMatchCustomer,
} from "./stripe-match";

const ADA: StripeMatchCustomer = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  first_name: "Ada",
  last_name: "Martin",
  company_name: null,
  email: "ada@exemple.fr",
  stripe_customer_id: "cus_ada",
};
const LEO: StripeMatchCustomer = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  first_name: "Léo",
  last_name: "Martin",
  company_name: "Martin SA",
  email: "leo@exemple.fr",
  stripe_customer_id: "cus_leo",
};

function row(patch: Partial<CrmStripeTransaction> = {}): CrmStripeTransaction {
  return {
    id: "row-1",
    stripe_payment_intent_id: "pi_1",
    amount: 80,
    currency: "EUR",
    direction: "credit",
    payer_name: "Inconnu",
    payer_email: null,
    reference: null,
    method: "card",
    last4: "4242",
    booked_at: "2026-10-01T10:00:00.000Z",
    raw: {},
    matched_customer_id: null,
    matched_transaction_id: null,
    status: "unmatched",
    created_at: "2026-10-01T10:00:00.000Z",
    updated_at: "2026-10-01T10:00:00.000Z",
    ...patch,
  };
}

test("metadata, customer Stripe ou e-mail unique créditent seuls", () => {
  const meta = scoreStripeMatches(
    row({ raw: { metadata: { crm_customer_id: ADA.id }, stripe_customer_id: null } }),
    [ADA, LEO]
  );
  assert.equal(meta.autoCustomerId, ADA.id);
  assert.equal(meta.candidates[0].reason, "metadata");

  const stripe = scoreStripeMatches(row({ raw: { stripe_customer_id: "cus_leo" } }), [ADA, LEO]);
  assert.equal(stripe.autoCustomerId, LEO.id);
  assert.equal(stripe.candidates.find((c) => c.customer_id === LEO.id)?.reason, "stripe_customer");

  const email = scoreStripeMatches(row({ payer_email: "Ada@Exemple.fr" }), [ADA, LEO]);
  assert.equal(email.autoCustomerId, ADA.id);
});

test("deux e-mails ou deux comptes Stripe n’auto-créditent pas", () => {
  const twin = { ...LEO, id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", email: ADA.email, stripe_customer_id: ADA.stripe_customer_id };
  const email = scoreStripeMatches(row({ payer_email: ADA.email }), [ADA, twin]);
  assert.equal(email.autoCustomerId, null);
  assert.equal(email.candidates.filter((c) => c.score >= 90).length, 0);

  const stripe = scoreStripeMatches(row({ raw: { stripe_customer_id: "cus_ada" } }), [ADA, twin]);
  assert.equal(stripe.autoCustomerId, null);
});

test("le nom et la société restent des propositions", () => {
  const named = scoreStripeMatches(row({ payer_name: "Ada Martin" }), [ADA, LEO]);
  assert.equal(named.autoCustomerId, null);
  assert.equal(named.candidates.find((c) => c.customer_id === ADA.id)?.reason, "full_name");
  assert.ok((named.candidates.find((c) => c.customer_id === ADA.id)?.score || 0) < 90);

  const company = scoreStripeMatches(row({ payer_name: "Martin SA" }), [ADA, LEO]);
  assert.equal(company.autoCustomerId, null);
  assert.equal(company.candidates.find((c) => c.customer_id === LEO.id)?.reason, "company_name");
});

test("deux hits certains ne choisissent pas à la place de l’agence", () => {
  const scored = scoreStripeMatches(
    row({
      payer_email: LEO.email,
      raw: { metadata: { crm_customer_id: ADA.id } },
    }),
    [ADA, LEO]
  );
  assert.equal(scored.autoCustomerId, null);
  assert.equal(scored.candidates.filter((c) => c.score >= 90).length, 2);
});

type Write = { table: string; op: string; payload: Record<string, unknown> };

function fakeAdmin(opts: {
  row?: CrmStripeTransaction;
  insertError?: string | null;
  existing?: Record<string, unknown> | null;
}) {
  const writes: Write[] = [];
  const admin = {
    from(table: string) {
      let op = "select";
      let payload: Record<string, unknown> = {};
      const api = {
        insert(value: Record<string, unknown>) {
          op = "insert";
          payload = value;
          writes.push({ table, op, payload: value });
          return api;
        },
        update(value: Record<string, unknown>) {
          op = "update";
          payload = value;
          writes.push({ table, op, payload: value });
          return api;
        },
        select() {
          return api;
        },
        eq() {
          return api;
        },
        maybeSingle() {
          return Promise.resolve({ data: opts.existing ?? null, error: null });
        },
        single() {
          if (op === "insert" && opts.insertError) {
            return Promise.resolve({ data: null, error: { message: opts.insertError } });
          }
          if (op === "insert") {
            return Promise.resolve({ data: { id: "tx-1", ...payload }, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
      };
      return api;
    },
  };
  return { admin, writes };
}

test("le crédit carte est idempotent et le refus n’écrit pas au grand livre", async () => {
  const fresh = fakeAdmin({});
  const created = await applyStripeToCustomer(fresh.admin, row(), ADA.id);
  assert.equal(created.ok, true);
  assert.equal(fresh.writes[0].table, "crm_transactions");
  assert.equal(fresh.writes[0].payload.kind, "card_payment");
  assert.equal(fresh.writes[0].payload.source, "stripe");
  assert.equal(fresh.writes[0].payload.external_id, "pi_1");
  assert.equal(fresh.writes[0].payload.customer_id, ADA.id);
  assert.equal(fresh.writes[1].payload.status, "matched");

  const sepa = fakeAdmin({});
  await applyStripeToCustomer(sepa.admin, row({ method: "sepa" }), ADA.id);
  assert.equal(sepa.writes[0].payload.kind, "transfer");

  const again = fakeAdmin({
    insertError: "duplicate key value violates unique constraint",
    existing: { id: "tx-1", customer_id: ADA.id },
  });
  const linked = await applyStripeToCustomer(again.admin, row(), ADA.id);
  assert.equal(linked.ok, true);
  assert.equal(again.writes.filter((write) => write.table === "crm_transactions" && write.op === "insert").length, 1);
  assert.equal(again.writes.at(-1)?.payload.status, "matched");
  assert.equal(again.writes.at(-1)?.payload.matched_transaction_id, "tx-1");

  const other = fakeAdmin({
    insertError: "duplicate key value violates unique constraint",
    existing: { id: "tx-1", customer_id: LEO.id },
  });
  const blocked = await applyStripeToCustomer(other.admin, row(), ADA.id);
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.equal(blocked.error, "already_credited");

  const refused = fakeAdmin({});
  const refusal = await refuseStripeInbox(refused.admin, row());
  assert.equal(refusal.ok, true);
  assert.deepEqual(
    refused.writes.map((write) => write.table),
    ["crm_stripe_transactions"]
  );
  assert.equal(refused.writes[0].payload.status, "ignored");

  const matched = fakeAdmin({});
  const denied = await applyStripeToCustomer(matched.admin, row({ status: "matched" }), ADA.id);
  assert.equal(denied.ok, false);
  assert.equal(matched.writes.length, 0);
});
