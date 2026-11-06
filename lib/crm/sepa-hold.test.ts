import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SepaInFlight } from "../../components/account/SepaInFlight";
import { ClientTransactionsPanel } from "../../components/account/ClientTransactionsPanel";
import { LedgerMovements } from "../../components/account/LedgerMovements";
import { StayPayment } from "../../components/account/StayPayment";
import { shapeClientLedger } from "./client-ledger";
import {
  coverOwed,
  displayedEncours,
  orphanSepaIdsToCancel,
  paidSepaLabel,
  pendingSepaLabel,
  planSepaLedger,
  readSepaIntent,
  sameIbanBlocked,
  sepaBankFailure,
  sepaBannerLine,
  sepaFailureLabel,
  sepaHoldsFromRows,
  sepaIntentBlocksPart,
  type SepaIntentView,
} from "./sepa-hold";
import type { CrmTransaction } from "./types";

const COMPANY = "company-1";
const CUSTOMER = "customer-1";
const LIVE = "pi_live_processing";
const ORPHAN = "pi_orphan_open";
const IBAN = "FR7630006000011234567890189";

function intent(partial: Partial<SepaIntentView> & Pick<SepaIntentView, "id" | "status">): SepaIntentView {
  return {
    amount: 719800,
    currency: "eur",
    created: Date.parse("2026-11-06T09:04:23.000Z") / 1000,
    metadata: {
      pay_method: "sepa_debit",
      crm_customer_id: CUSTOMER,
      payer_kind: "company",
      billing_company_id: COMPANY,
      pay_mention: "Société · Atelier Nord",
      iban_last4: "8Z97",
    },
    paymentMethodTypes: ["sepa_debit"],
    paymentMethodId: "pm_sepa",
    ...partial,
  };
}

function tx(partial: Partial<CrmTransaction> & Pick<CrmTransaction, "id" | "direction" | "kind" | "amount" | "status">): CrmTransaction {
  return {
    customer_id: CUSTOMER,
    booking_id: null,
    currency: "EUR",
    occurred_on: "2026-11-06",
    label: "Mouvement",
    source: "manual",
    external_id: null,
    created_at: "2026-11-06T09:04:23.000Z",
    updated_at: "2026-11-06T09:04:23.000Z",
    ...partial,
  };
}

test("un prélèvement processing réserve l’encours, un formulaire ouvert non", () => {
  const live = readSepaIntent(intent({ id: LIVE, status: "processing", chargeStatus: "pending", chargeType: "sepa_debit" }));
  assert.equal(live.kind, "flight");
  const open = readSepaIntent(
    intent({ id: ORPHAN, status: "requires_payment_method", paymentMethodId: null, chargeStatus: null })
  );
  assert.equal(open.kind, "orphan");
  assert.equal(planSepaLedger(null, open, false).action, "keep");
  assert.equal(planSepaLedger(null, live, false).action, "pending");
  const holds = sepaHoldsFromRows(
    [
      tx({
        id: "hold",
        direction: "credit",
        kind: "transfer",
        amount: 7198,
        status: "pending",
        source: "stripe",
        external_id: LIVE,
        payer_kind: "company",
        billing_company_id: COMPANY,
        label: pendingSepaLabel("8Z97"),
      }),
    ],
    new Map([[COMPANY, "Atelier Nord"]])
  );
  assert.equal(holds.length, 1);
  assert.equal(displayedEncours(-7198, holds[0].amount), 0);
  const owed = coverOwed({ total: 7223, company: 7198, personal: 25 }, holds);
  assert.equal(owed.company, 0);
  assert.equal(owed.personal, 25);
  assert.equal(owed.total, 25);
  assert.equal(sepaIntentBlocksPart(intent({ id: LIVE, status: "processing", amount: 20000 }), {
    customerId: CUSTOMER,
    payer: "company",
    companyId: COMPANY,
  }), true);
  assert.equal(sepaIntentBlocksPart(intent({ id: ORPHAN, status: "requires_payment_method", paymentMethodId: null }), {
    customerId: CUSTOMER,
    payer: "company",
    companyId: COMPANY,
  }), false);
  assert.equal(sepaIntentBlocksPart(intent({ id: "pi_personal", status: "processing", metadata: { pay_method: "sepa_debit", crm_customer_id: CUSTOMER, payer_kind: "personal", billing_company_id: "" } }), {
    customerId: CUSTOMER,
    payer: "company",
    companyId: COMPANY,
  }), false);
});

test("le succès poste le crédit, l’échec rend l’encours et dit la suite", () => {
  const flight = readSepaIntent(intent({ id: LIVE, status: "processing" }));
  assert.equal(flight.kind, "flight");
  const pending = planSepaLedger(null, flight, false);
  assert.equal(pending.action, "pending");
  const succeeded = readSepaIntent(intent({ id: LIVE, status: "succeeded", chargeStatus: "succeeded" }));
  const posted = planSepaLedger({ status: "pending" }, succeeded, false);
  assert.equal(posted.action, "post");
  if (posted.action === "post") assert.match(posted.label, /^Payé le .+ par prélèvement SEPA$/);
  assert.match(paidSepaLabel("2026-11-12"), /2026/);
  const failed = readSepaIntent(intent({ id: LIVE, status: "payment_failed", failureCode: "insufficient_funds" }));
  assert.equal(failed.kind, "failed");
  if (failed.kind === "failed") {
    assert.equal(failed.needsNewIban, false);
    assert.match(failed.message, /fonds sont insuffisants/);
    assert.match(failed.message, /relancer/);
  }
  const closed = sepaBankFailure("account_closed");
  assert.equal(closed.needsNewIban, true);
  assert.match(closed.message, /nouveau RIB/);
  const revoked = sepaBankFailure("debit_not_authorized");
  assert.equal(revoked.needsNewIban, true);
  assert.match(revoked.message, /mandat/);
  const removed = planSepaLedger({ status: "pending" }, failed, false);
  assert.equal(removed.action, "void");
  assert.equal(displayedEncours(-7198, 0), -7198);
  const label = sepaFailureLabel({ needsNewIban: true, last4: "8Z97", message: closed.message });
  assert.equal(label.includes(IBAN), false);
  assert.equal(sameIbanBlocked({
    paymentIntentId: LIVE,
    payer: "company",
    companyId: COMPANY,
    last4: "8Z97",
    needsNewIban: true,
    message: closed.message,
    at: "2026-11-06T00:00:00.000Z",
  }, "8Z97"), true);
  assert.equal(sameIbanBlocked({
    paymentIntentId: LIVE,
    payer: "company",
    companyId: COMPANY,
    last4: "8Z97",
    needsNewIban: true,
    message: closed.message,
    at: "2026-11-06T00:00:00.000Z",
  }, "1234"), false);
});

test("un formulaire ouvert du même montant est annulé, jamais le prélèvement processing", () => {
  const ids = orphanSepaIdsToCancel([
    intent({ id: LIVE, status: "processing" }),
    intent({ id: ORPHAN, status: "requires_payment_method", paymentMethodId: null }),
    intent({ id: "pi_other_amount", status: "requires_payment_method", amount: 20000, paymentMethodId: null }),
    intent({ id: "pi_card", status: "requires_payment_method", amount: 719800, paymentMethodId: null, metadata: { pay_method: "card", crm_customer_id: CUSTOMER }, paymentMethodTypes: ["card"] }),
  ]);
  assert.deepEqual(ids.sort(), [ORPHAN, "pi_card"].sort());
  assert.equal(ids.includes(LIVE), false);
});

test("le relevé affiche 0 €, la réserve et une ligne qui n’est pas payée", () => {
  const view = shapeClientLedger({
    companyRole: null,
    travelerBookingIds: [],
    walletBalance: -7398,
    currency: "EUR",
    audience: "client",
    bookings: [],
    billingCompanyCount: 1,
    companyNames: new Map([[COMPANY, "Atelier Nord"]]),
    rows: [
      tx({
        id: "debit",
        direction: "debit",
        kind: "booking",
        amount: 7398,
        status: "posted",
        billing_company_id: COMPANY,
        payer_kind: "company",
        label: "Séjour",
      }),
      tx({
        id: "hold",
        direction: "credit",
        kind: "transfer",
        amount: 7198,
        status: "pending",
        source: "stripe",
        external_id: LIVE,
        payer_kind: "company",
        billing_company_id: COMPANY,
        label: pendingSepaLabel("8Z97"),
      }),
      tx({
        id: "lock",
        direction: "credit",
        kind: "transfer",
        amount: 7198,
        status: "pending",
        source: "stripe",
        external_id: `sepa-lock:${CUSTOMER}:company:${COMPANY}`,
        label: "Verrou prélèvement",
      }),
    ],
  });
  assert.equal(view.balanceValue, -200);
  assert.equal(view.owed.company, 200);
  assert.equal(view.owed.personal, 0);
  assert.equal(view.sepaHolds.length, 1);
  assert.equal(view.wallets[0].held, 7198);
  assert.equal(view.wallets[0].postedBalance, -7398);
  const line = view.movements.find((row) => row.id === "hold");
  assert.equal(line?.title, "Prélèvement SEPA · en cours");
  assert.equal(line?.badge, "En cours");
  assert.equal(view.movements.some((row) => row.id === "lock"), false);
  const html = renderToStaticMarkup(createElement(ClientTransactionsPanel, { view }));
  assert.match(html, /Prélèvement SEPA en cours/);
  assert.match(html, /7[\s\u00a0\u202f]?198,00/);
  assert.match(html, /en cours de prélèvement SEPA/);
  assert.match(html, /Atelier Nord/);
  assert.match(html, /8Z97/);
  assert.match(html, /6 jours ouvrés/);
  assert.match(html, /En cours/);
  assert.equal(html.includes(IBAN), false);
  assert.equal(html.includes("Encaissé"), false);
  const movements = renderToStaticMarkup(
    createElement(LedgerMovements, {
      rows: [{ id: "paid", credit: true, title: "Payé le 12 nov. 2026 par prélèvement SEPA", amountLabel: "+7 198,00 €", occurredLabel: "12 nov. 2026", kindLabel: "Virement", whenWhere: null, reference: null, carnetHref: null }],
    })
  );
  assert.match(movements, /Encaissé/);
  assert.match(movements, /Payé le 12 nov\. 2026 par prélèvement SEPA/);
  const admin = renderToStaticMarkup(
    createElement(SepaInFlight, { holds: view.sepaHolds, tone: "admin" })
  );
  assert.match(admin, /pas une somme déjà encaissée/);
  assert.match(admin, /pas un impayé/);
  assert.match(admin, new RegExp(LIVE));
  assert.equal(admin.includes("Relancer"), false);
  assert.match(sepaBannerLine(view.sepaHolds[0]), /RIB ••8Z97/);
  const locked = renderToStaticMarkup(
    createElement(StayPayment, {
      stripeKey: null,
      parts: [
        {
          kind: "company",
          mention: "Société",
          amountLabel: "200,00 €",
          payable: true,
          canPay: true,
          methods: ["card", "sepa_debit", "revolut"],
          companyName: "Atelier Nord",
          sepaLock: "Un prélèvement de 7 198,00 € est déjà en cours sur cette part.",
        },
      ],
    })
  );
  assert.match(locked, /Prélèvement SEPA/);
  assert.equal(locked.includes("disabled"), false);
});
