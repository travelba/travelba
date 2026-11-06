import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SepaLaunch } from "../../components/account/StayPayment";
import { ClientPayFollowUp } from "../../components/admin/ClientPayFollowUp";
import {
  PAY_COPY,
  agencyPayFollowUp,
  clientPayAlertSummary,
  ledgerPayBlock,
  savedSepaIban,
  scrubPaymentText,
  sepaFailureMessage,
  sepaIntentMatches,
  sepaStartedMessage,
  wireClientMessage,
} from "./client-pay";

const SAMPLE = "FR7630006000011234567890189";

test("le prélèvement société exige un IBAN français et n’en renvoie que la fin", () => {
  const missing = savedSepaIban("company", null);
  assert.equal("error" in missing, true);
  if ("error" in missing) assert.match(missing.error, /Facturation/);
  const personal = savedSepaIban("personal", SAMPLE);
  assert.equal("error" in personal, true);
  if ("error" in personal) assert.match(personal.error, /particulier/);
  const saved = savedSepaIban("company", ` ${SAMPLE.toLowerCase()} `);
  assert.equal("iban" in saved, true);
  if ("iban" in saved) {
    assert.equal(saved.last4, "0189");
    assert.equal(saved.last4.length, 4);
  }
});

test("une part qui ne correspond pas au solde est refusée avec le montant dû", () => {
  const wrong = ledgerPayBlock({
    payer: "personal",
    method: "revolut",
    owed: { company: 7198, personal: 0 },
    currency: "EUR",
  });
  assert.equal("error" in wrong, true);
  if ("error" in wrong) {
    assert.match(wrong.error, /société/);
    assert.match(wrong.error, /7[\s\u00a0\u202f]198,00/);
    assert.equal(wrong.error.includes("7188"), false);
  }
  const sepaOnPersonal = ledgerPayBlock({
    payer: "personal",
    method: "sepa_debit",
    owed: { company: 0, personal: 25 },
    currency: "EUR",
  });
  assert.equal("error" in sepaOnPersonal && sepaOnPersonal.error, PAY_COPY.sepaPersonal);
  const ok = ledgerPayBlock({
    payer: "company",
    method: "sepa_debit",
    owed: { company: 7198, personal: 0 },
    currency: "EUR",
  });
  assert.equal("amount" in ok && ok.amount, 7198);
});

test("l’alerte agence ne contient pas d’IBAN et dit la suite", () => {
  const summary = clientPayAlertSummary({
    action: "wire",
    partLabel: `Société · ${SAMPLE}`,
    amountLabel: "7 198,00 €",
    last4: SAMPLE,
  });
  assert.equal(summary.includes(SAMPLE), false);
  assert.match(summary, /À encaisser/);
  assert.match(summary, /Pas un prélèvement/);
  assert.equal(summary.includes("····"), false);
  const sepa = clientPayAlertSummary({
    action: "sepa_failed",
    partLabel: "Société",
    amountLabel: "7 198,00 €",
    last4: "0189",
    reason: PAY_COPY.sepaBadIban,
  });
  assert.match(sepa, /····0189/);
  assert.match(sepa, /Facturation/);
  assert.equal(scrubPaymentText(`compte ${SAMPLE}`).includes(SAMPLE), false);
});

test("un prélèvement déjà lancé pour le même montant n’est pas un second", () => {
  const expected = { cents: 719800, customerId: "c1", payer: "company", companyId: "co" };
  assert.equal(
    sepaIntentMatches(
      { amount: 719800, status: "processing", metadata: { pay_method: "sepa_debit", crm_customer_id: "c1", payer_kind: "company", billing_company_id: "co" } },
      expected
    ),
    true
  );
  assert.equal(
    sepaIntentMatches(
      { amount: 718800, status: "processing", metadata: { pay_method: "sepa_debit", crm_customer_id: "c1", payer_kind: "company", billing_company_id: "co" } },
      expected
    ),
    false
  );
  assert.match(sepaStartedMessage("7 198,00 €"), /7 198,00 €/);
  assert.match(wireClientMessage("7 198,00 €", false), /n’a pas été prévenue/);
  assert.match(sepaFailureMessage("payment_method_invalid_parameter"), /refuse cet IBAN/);
});

test("l’agence voit le solde actuel, pas l’ancien encours particulier", () => {
  const follow = agencyPayFollowUp({
    summary: "A demandé un virement pour l’encours particulier",
    detail: "7 188,00 €",
    owed: { company: 7198, personal: 0 },
    currency: "EUR",
    createdAt: "2026-11-06T06:08:09.000Z",
    now: Date.parse("2026-11-06T08:00:00.000Z"),
  });
  assert.ok(follow);
  assert.match(follow?.next || "", /particulier/);
  assert.match(follow?.next || "", /société/);
  assert.match(follow?.next || "", /7[\s\u00a0\u202f]198,00/);
  assert.equal((follow?.next || "").includes("7188"), false);
  assert.equal(follow?.href, "/admin/argent?onglet=a-encaisser");
  assert.equal(
    agencyPayFollowUp({
      summary: "A demandé un virement pour l’encours particulier",
      owed: { company: 10, personal: 0 },
      createdAt: "2026-10-01T00:00:00.000Z",
      now: Date.parse("2026-11-06T00:00:00.000Z"),
    }),
    null
  );
  assert.equal(
    agencyPayFollowUp({
      summary: "A demandé un virement pour l’encours société",
      owed: { company: 0, personal: 0 },
    }),
    null
  );
  const html = renderToStaticMarkup(
    createElement(ClientPayFollowUp, {
      title: follow?.title || "",
      next: follow?.next || "",
      links: [{ href: follow?.href || "/admin/argent", label: "Ouvrir À encaisser" }],
    })
  );
  assert.match(html, /Ouvrir À encaisser/);
  assert.match(html, /pas prélevé automatiquement/);
});

test("sans IBAN, Lancer le prélèvement explique la suite au lieu de rester muet", () => {
  const html = renderToStaticMarkup(
    createElement(SepaLaunch, {
      last4: null,
      amountLabel: "7 198,00 €",
      billingHref: "/mon-compte/profil/facturation",
      busy: false,
      onLaunch: () => undefined,
    })
  );
  assert.match(html, /Facturation/);
  assert.match(html, /Ouvrir la facturation/);
  assert.equal(html.includes("<button"), false);
  const leaked = renderToStaticMarkup(
    createElement(SepaLaunch, {
      last4: SAMPLE,
      amountLabel: "7 198,00 €",
      billingHref: "/mon-compte/profil/facturation",
      busy: false,
      onLaunch: () => undefined,
    })
  );
  assert.equal(leaked.includes(SAMPLE), false);
  assert.match(leaked, /Lancer le prélèvement/);
  const ready = renderToStaticMarkup(
    createElement(SepaLaunch, {
      last4: "0189",
      amountLabel: "7 198,00 €",
      billingHref: "/mon-compte/profil/facturation",
      busy: false,
      onLaunch: () => undefined,
    })
  );
  assert.match(ready, /Lancer le prélèvement/);
  assert.match(ready, /····0189/);
  assert.match(ready, /solde au moment du clic/);
});
