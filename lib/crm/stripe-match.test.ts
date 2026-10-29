import assert from "node:assert/strict";
import test from "node:test";
import type { CrmStripeTransaction } from "./types";
import {
  applyStripeToCustomer,
  bookingReferenceNumber,
  invoicePieceNumber,
  refuseStripeInbox,
  scoreStripeMatches,
  stripeDescriptionNumber,
  stripePendingHints,
  type StripeIndexedDossier,
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

const CAM: StripeMatchCustomer = {
  id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  first_name: "Camille",
  last_name: "Negoce",
  company_name: null,
  email: "cam@exemple.fr",
  stripe_customer_id: null,
};

const DOSSIER: StripeIndexedDossier = {
  booking_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  customer_id: CAM.id,
  reference: "TB-2026-2108",
  label: "TB-2026-2108 — Maroc",
  reason: "dossier",
  number: "2108",
};

test("la raison sociale et le numéro de dossier restent des propositions", () => {
  assert.equal(stripeDescriptionNumber("2108"), "2108");
  assert.equal(stripeDescriptionNumber("02108"), "2108");
  assert.equal(stripeDescriptionNumber("sejour Maroc"), null);
  assert.equal(stripeDescriptionNumber("tHOMAS"), null);
  assert.equal(bookingReferenceNumber("TB-2026-2108"), "2108");
  assert.equal(bookingReferenceNumber("TB-2026-0001"), "1");
  assert.equal(bookingReferenceNumber("TB-2026-0001") === "2026", false);
  assert.equal(invoicePieceNumber("2108"), "2108");
  assert.equal(invoicePieceNumber("F-2108"), "2108");
  assert.equal(invoicePieceNumber("2026-2108"), null);

  const company = scoreStripeMatches(row({ payer_name: "CAM NEGOCE", reference: "2108", payer_email: null }), [CAM, ADA], {
    companies: [{ customer_id: CAM.id, company_name: "CAM NEGOCE" }],
  });
  assert.equal(company.autoCustomerId, null);
  assert.equal(company.candidates.find((candidate) => candidate.customer_id === CAM.id)?.reason, "company_name");
  assert.ok((company.candidates.find((candidate) => candidate.customer_id === CAM.id)?.score || 0) < 90);

  const dossier = scoreStripeMatches(row({ payer_name: null, reference: "2108", payer_email: null }), [CAM, ADA], {
    dossiers: [DOSSIER],
  });
  assert.equal(dossier.autoCustomerId, null);
  assert.equal(dossier.dossier?.booking_id, DOSSIER.booking_id);
  assert.equal(dossier.dossier?.reference, "TB-2026-2108");
  assert.equal(dossier.candidates.find((candidate) => candidate.customer_id === CAM.id)?.reason, "dossier");
  const hints = stripePendingHints({ payer_name: null, reference: "2108" }, dossier);
  assert.equal(hints.payeur, "Payeur inconnu");
  assert.equal(hints.libelle, "2108");
  assert.equal(hints.dossier?.id, DOSSIER.booking_id);

  const invoice = scoreStripeMatches(row({ payer_name: "CAM NEGOCE", reference: "2105" }), [CAM], {
    companies: [{ customer_id: CAM.id, company_name: "CAM NEGOCE" }],
    dossiers: [
      {
        booking_id: DOSSIER.booking_id,
        customer_id: CAM.id,
        reference: "TB-2026-2105",
        label: "Facture 2105 · TB-2026-2105",
        reason: "facture",
        number: "2105",
      },
    ],
  });
  assert.equal(invoice.autoCustomerId, null);
  assert.equal(invoice.dossier?.reason, "facture");
  assert.equal(invoice.candidates[0]?.reason, "facture");
  assert.match(invoice.candidates[0]?.label || "", /CAM NEGOCE/);

  const prose = scoreStripeMatches(row({ payer_name: null, reference: "sejour Maroc" }), [CAM, ADA], {
    dossiers: [DOSSIER],
  });
  assert.equal(prose.dossier, null);
  assert.equal(prose.autoCustomerId, null);

  const year = scoreStripeMatches(row({ payer_name: null, reference: "2026" }), [ADA], {
    dossiers: [
      {
        booking_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        customer_id: ADA.id,
        reference: "TB-2026-0001",
        label: "TB-2026-0001",
        reason: "dossier",
        number: "1",
      },
    ],
  });
  assert.equal(year.dossier, null);

  const twins = scoreStripeMatches(row({ payer_name: null, reference: "2108" }), [CAM, ADA], {
    dossiers: [
      DOSSIER,
      { ...DOSSIER, booking_id: "11111111-1111-4111-8111-111111111111", customer_id: ADA.id, reference: "TB-2025-2108" },
    ],
  });
  assert.equal(twins.dossier, null);
  assert.equal(twins.autoCustomerId, null);
  assert.equal(twins.candidates.length, 2);
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

test("valider un dossier proposé le rattache, un autre client non", async () => {
  const bookingId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const owned = fakeAdmin({ existing: { id: bookingId, customer_id: ADA.id, billing_customer_id: null } });
  const credited = await applyStripeToCustomer(owned.admin, row({ payer_name: "CAM NEGOCE", reference: "2108" }), ADA.id, bookingId);
  assert.equal(credited.ok, true);
  assert.equal(owned.writes[0].payload.booking_id, bookingId);
  assert.equal(owned.writes[1].payload.status, "matched");

  const other = fakeAdmin({ existing: { id: bookingId, customer_id: LEO.id, billing_customer_id: null } });
  const skipped = await applyStripeToCustomer(other.admin, row(), ADA.id, bookingId);
  assert.equal(skipped.ok, true);
  assert.equal(other.writes[0].payload.booking_id, null);
});
