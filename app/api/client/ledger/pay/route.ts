import { NextResponse } from "next/server";
import { dbError, jsonError, requireCustomer } from "@/lib/crm/auth";
import { isCompanyMember } from "@/lib/crm/company-role";
import { loadClientLedger } from "@/lib/crm/client-ledger";
import { customerFullName, type CrmTransaction } from "@/lib/crm/types";
import { ibanLast4 } from "@/lib/crm/billing";
import { amountToCents, anchorBillingCompanyId, encoursPartLabel, payerKindOf } from "@/lib/crm/payer";
import { RevolutHttpError, loadAgencyEurWire } from "@/lib/crm/revolut";
import { ensureStripeCustomer, getStripe, stripeConfigured } from "@/lib/crm/stripe";
import { fundingKindOf } from "@/lib/crm/funding-wallet";
import { excludedStripeTypes, pocketPayMethods, stayPayMethodOf } from "@/lib/crm/stripe-pay";
import { createServiceClient } from "@/lib/supabase/admin";
import { payActivityDetail, payActivitySummary, payFailureSummary, recordCustomerActivity } from "@/lib/crm/customer-activity";
import { recordClientPayAlert } from "@/lib/crm/agency-log";
import {
  PAY_COPY,
  clientAcceptIp,
  clientPayAlertSummary,
  ledgerPayBlock,
  savedSepaIban,
  sepaActionMessage,
  sepaAlreadyMessage,
  sepaFailureMessage,
  sepaIntentMatches,
  sepaStartedMessage,
  stripeFailureCode,
  wireClientMessage,
} from "@/lib/crm/client-pay";
import type { PayerKind } from "@/lib/crm/payer";
import type { StayPayMethod } from "@/lib/crm/stripe-pay";
import type Stripe from "stripe";

function acceptIp(request: Request) {
  return clientAcceptIp(request.headers.get("x-forwarded-for")) || clientAcceptIp(request.headers.get("x-real-ip"));
}

function returnUrl(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && /^https?:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(origin)) {
    return `${origin}/mon-compte/transactions`;
  }
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://travelba.fr").replace(/\/$/, "");
  return `${site}/mon-compte/transactions`;
}

async function notePay(input: {
  customerId: string;
  authUserId: string;
  method: StayPayMethod;
  payer: PayerKind;
  amount: number;
  currency: string;
  ok: boolean;
  next: string;
}) {
  await recordCustomerActivity({
    customerId: input.customerId,
    authUserId: input.authUserId,
    action: "pay",
    summary: input.ok ? payActivitySummary(input.method, input.payer) : payFailureSummary(input.method, input.payer),
    detail: payActivityDetail(input.amount, input.currency, input.next),
  });
}

async function alertPay(customerId: string, summary: string) {
  return recordClientPayAlert({ customerId, summary });
}

export async function POST(request: Request) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  if (isCompanyMember(auth.customer)) {
    return jsonError("Le règlement se fait depuis le compte qui porte l’encours.", 403);
  }

  const body = await request.json().catch(() => null);
  const method = stayPayMethodOf(body?.method);
  const payer = payerKindOf(body?.payerKind);
  /** Nonce du formulaire : deux règlements du même montant dans la journée ne se confondent plus. */
  const nonce =
    typeof body?.nonce === "string" && /^[A-Za-z0-9-]{8,64}$/.test(body.nonce) ? body.nonce : null;
  if (!method) return jsonError("Choisissez un moyen de règlement.");
  if (!payer) return jsonError("Choisissez la part société ou la part particulier.");

  const view = await loadClientLedger(auth.supabase, auth.customer, "client");
  const funding = fundingKindOf(body?.funding);
  const requestedCompany = typeof body?.companyId === "string" ? body.companyId : "";
  let amount = payer === "company" ? view.owed.company : view.owed.personal;
  let companyId: string | null = null;
  let mention = encoursPartLabel(payer, payer === "company" ? view.soleCompanyName : null);

  if (view.pockets?.length && (funding || payer === "company")) {
    if (!funding) return jsonError("Choisissez le compte à régler.");
    const pocket = view.pockets.find(
      (item) => item.funding === funding && (!requestedCompany || item.companyId === requestedCompany)
    );
    if (!pocket) return jsonError("Ce compte n’est pas ouvert.");
    if (!pocketPayMethods(funding, view.currency).includes(method)) {
      return jsonError(funding === "pro" ? PAY_COPY.pocketPro : PAY_COPY.pocketAdvance);
    }
    amount = pocket.due;
    companyId = pocket.companyId;
    mention = pocket.label;
    if (amount < 0.5) return jsonError(PAY_COPY.pocketEmpty);
  } else {
    const blocked = ledgerPayBlock({
      payer,
      method,
      owed: view.owed,
      currency: view.currency,
    });
    if ("error" in blocked) return jsonError(blocked.error);
    amount = blocked.amount;
  }

  const ledgerCustomerId = auth.customer.id;
  const { data: txs, error: txError } = await auth.supabase
    .from("crm_transactions")
    .select("direction, amount, status, currency, billing_company_id")
    .eq("customer_id", ledgerCustomerId)
    .eq("status", "posted");
  if (txError) return dbError(txError, 500);
  if (!companyId && payer === "company") {
    companyId = anchorBillingCompanyId((txs || []) as CrmTransaction[], view.currency);
  }
  const reference = customerFullName(auth.customer) || "Encours";
  const cents = amountToCents(amount);
  const amountLabel = payActivityDetail(amount, view.currency) || "";
  const savedLast4 = ibanLast4(auth.customer.iban);

  if (method === "revolut") {
    try {
      const wire = await loadAgencyEurWire();
      if (!wire) {
        const summary = clientPayAlertSummary({
          action: "wire_closed",
          partLabel: mention,
          amountLabel,
          last4: savedLast4,
        });
        await notePay({
          customerId: auth.customer.id,
          authUserId: auth.user.id,
          method,
          payer,
          amount,
          currency: view.currency,
          ok: false,
          next: "Le compte de l’agence ne répond pas.",
        });
        await alertPay(auth.customer.id, summary);
        return jsonError(PAY_COPY.wireClosed, 503);
      }
      const notified = await alertPay(
        auth.customer.id,
        clientPayAlertSummary({
          action: "wire",
          partLabel: mention,
          amountLabel,
          last4: savedLast4,
        })
      );
      const message = wireClientMessage(amountLabel, notified, savedLast4);
      await notePay({
        customerId: auth.customer.id,
        authUserId: auth.user.id,
        method,
        payer,
        amount,
        currency: view.currency,
        ok: true,
        next: notified
          ? "Le client doit virer ce montant. L’agence le rapproche dans À encaisser."
          : "Coordonnées prêtes, agence non prévenue.",
      });
      return NextResponse.json({
        transfer: {
          iban: wire.iban,
          bic: wire.bic,
          accountHolder: wire.accountHolder,
          reference,
          currency: view.currency.toUpperCase(),
          partLabel: mention,
          amountLabel,
        },
        notified,
        message,
        amountLabel,
      });
    } catch (err) {
      const code = err instanceof RevolutHttpError ? String(err.status) : "auth";
      console.error("[revolut-wire]", code);
      await notePay({
        customerId: auth.customer.id,
        authUserId: auth.user.id,
        method,
        payer,
        amount,
        currency: view.currency,
        ok: false,
        next: "Le compte de l’agence ne répond pas.",
      });
      return jsonError(PAY_COPY.wireClosed, 503);
    }
  }

  if (method === "sepa_debit") {
    const saved = savedSepaIban(payer, auth.customer.iban);
    if ("error" in saved) {
      await notePay({
        customerId: auth.customer.id,
        authUserId: auth.user.id,
        method,
        payer,
        amount,
        currency: view.currency,
        ok: false,
        next: saved.error,
      });
      await alertPay(
        auth.customer.id,
        clientPayAlertSummary({
          action: "sepa_failed",
          partLabel: mention,
          amountLabel,
          last4: null,
          reason: saved.error,
        })
      );
      return jsonError(saved.error);
    }
    if (!stripeConfigured()) {
      await notePay({
        customerId: auth.customer.id,
        authUserId: auth.user.id,
        method,
        payer,
        amount,
        currency: view.currency,
        ok: false,
        next: PAY_COPY.sepaNotOpen,
      });
      return jsonError(PAY_COPY.sepaNotOpen, 503);
    }
    const email = (auth.customer.email || "").trim();
    if (!email) return jsonError(PAY_COPY.sepaNoEmail);
    const ip = acceptIp(request);
    if (!ip) return jsonError(PAY_COPY.sepaNoConnection);
    const stripe = getStripe()!;
    const admin = createServiceClient();
    let stripeCustomerId: string;
    try {
      stripeCustomerId = await ensureStripeCustomer(stripe, admin, auth.customer);
    } catch {
      return jsonError(PAY_COPY.stripeCustomer, 502);
    }
    const holder =
      (payer === "company" ? view.soleCompanyName : null) || customerFullName(auth.customer) || "Client";
    try {
      const outcome = await confirmSepaDebit({
        stripe,
        stripeCustomerId,
        iban: saved.iban,
        last4: saved.last4,
        holder: holder.slice(0, 200),
        email,
        cents,
        customerId: ledgerCustomerId,
        payer,
        companyId: companyId || "",
        mention,
        reference,
        nonce,
        ip,
        userAgent: (request.headers.get("user-agent") || "Travelba").slice(0, 200),
        returnUrl: returnUrl(request),
      });
      const started = outcome.status === "processing" || outcome.status === "succeeded";
      const already = outcome.status === "already";
      const action = outcome.status === "requires_action" && Boolean(outcome.clientSecret);
      if (!started && !already && !action) {
        throw Object.assign(new Error("sepa"), { code: outcome.status || "sepa" });
      }
      if (outcome.paymentMethodId) {
        await admin.from("crm_payment_methods").upsert(
          {
            customer_id: ledgerCustomerId,
            stripe_payment_method_id: outcome.paymentMethodId,
            brand: "sepa",
            last4: saved.last4,
            exp_month: null,
            exp_year: null,
            is_default: false,
          },
          { onConflict: "stripe_payment_method_id" }
        );
      }
      const message = already
        ? sepaAlreadyMessage(amountLabel)
        : action
          ? sepaActionMessage(amountLabel)
          : sepaStartedMessage(amountLabel);
      if (!already) {
        await notePay({
          customerId: auth.customer.id,
          authUserId: auth.user.id,
          method,
          payer,
          amount,
          currency: view.currency,
          ok: true,
          next: action ? "La banque demande encore une confirmation." : "Prélèvement envoyé à la banque.",
        });
        await alertPay(
          auth.customer.id,
          clientPayAlertSummary({
            action: "sepa",
            partLabel: mention,
            amountLabel,
            last4: saved.last4,
          })
        );
      }
      return NextResponse.json({
        sepa: { status: outcome.status, message, amountLabel },
        clientSecret: action ? outcome.clientSecret : null,
        amountLabel,
      });
    } catch (err) {
      const code = stripeFailureCode(err);
      console.error("[stripe-pay]", code);
      const message = sepaFailureMessage(code);
      await notePay({
        customerId: auth.customer.id,
        authUserId: auth.user.id,
        method,
        payer,
        amount,
        currency: view.currency,
        ok: false,
        next: message,
      });
      await alertPay(
        auth.customer.id,
        clientPayAlertSummary({
          action: "sepa_failed",
          partLabel: mention,
          amountLabel,
          last4: saved.last4,
          reason: message,
        })
      );
      return jsonError(message, 502);
    }
  }

  if (!stripeConfigured()) return jsonError(PAY_COPY.methodClosed, 503);
  const stripe = getStripe()!;
  const admin = createServiceClient();
  let stripeCustomerId: string;
  try {
    stripeCustomerId = await ensureStripeCustomer(stripe, admin, auth.customer);
  } catch {
    return jsonError(PAY_COPY.stripeCustomer, 502);
  }

  try {
    const intent = await stripe.paymentIntents.create(
      {
        amount: cents,
        currency: view.currency.toLowerCase(),
        customer: stripeCustomerId,
        automatic_payment_methods: { enabled: true },
        excluded_payment_method_types: excludedStripeTypes(method),
        description: `Encours ${mention}`,
        metadata: {
          crm_customer_id: ledgerCustomerId,
          payer_kind: payer,
          billing_company_id: companyId || "",
          pay_method: method,
          pay_mention: mention,
          reference,
        },
      },
      { idempotencyKey: `ledger-${auth.customer.id}-${companyId || payer}-${method}-${cents}${nonce ? `-${nonce}` : ""}` }
    );

    if (intent.status === "succeeded") {
      return NextResponse.json({ alreadyPaid: true, amountLabel });
    }
    if (!intent.client_secret) return jsonError(PAY_COPY.cardStartFailed, 502);
    await notePay({
      customerId: auth.customer.id,
      authUserId: auth.user.id,
      method,
      payer,
      amount,
      currency: view.currency,
      ok: true,
      next: "Paiement à confirmer dans le formulaire.",
    });
    return NextResponse.json({ clientSecret: intent.client_secret, amountLabel });
  } catch (err) {
    const code = stripeFailureCode(err);
    console.error("[stripe-pay]", code);
    return jsonError(PAY_COPY.cardStartFailed, 502);
  }
}

async function confirmSepaDebit(input: {
  stripe: Stripe;
  stripeCustomerId: string;
  iban: string;
  last4: string;
  holder: string;
  email: string;
  cents: number;
  customerId: string;
  payer: PayerKind;
  companyId: string;
  mention: string;
  reference: string;
  nonce: string | null;
  ip: string;
  userAgent: string;
  returnUrl: string;
}): Promise<{ status: string; clientSecret: string | null; paymentMethodId: string | null }> {
  const expected = {
    cents: input.cents,
    customerId: input.customerId,
    payer: input.payer,
    companyId: input.companyId,
  };
  try {
    const existing = await input.stripe.paymentIntents.list({ customer: input.stripeCustomerId, limit: 20 });
    const open = existing.data.find((intent) => sepaIntentMatches(intent, expected));
    if (open && (open.status === "processing" || open.status === "succeeded")) {
      return { status: "already", clientSecret: null, paymentMethodId: null };
    }
    if (open?.status === "requires_action" && open.client_secret) {
      return { status: "requires_action", clientSecret: open.client_secret, paymentMethodId: null };
    }
  } catch (err) {
    console.error("[stripe-pay]", stripeFailureCode(err));
  }

  const paymentMethod = await input.stripe.paymentMethods.create({
    type: "sepa_debit",
    sepa_debit: { iban: input.iban },
    billing_details: { name: input.holder, email: input.email },
  });
  const intent = await input.stripe.paymentIntents.create(
    {
      amount: input.cents,
      currency: "eur",
      customer: input.stripeCustomerId,
      payment_method: paymentMethod.id,
      payment_method_types: ["sepa_debit"],
      confirm: true,
      return_url: input.returnUrl,
      description: `Encours ${input.mention}`,
      mandate_data: {
        customer_acceptance: {
          type: "online",
          online: { ip_address: input.ip, user_agent: input.userAgent },
        },
      },
      metadata: {
        crm_customer_id: input.customerId,
        payer_kind: input.payer,
        billing_company_id: input.companyId,
        pay_method: "sepa_debit",
        pay_mention: input.mention,
        reference: input.reference,
        iban_last4: input.last4,
      },
    },
    {
      idempotencyKey: `ledger-sepa-${input.customerId}-${input.companyId || input.payer}-${input.cents}-${input.last4}${input.nonce ? `-${input.nonce}` : ""}`,
    }
  );
  return {
    status: intent.status,
    clientSecret: intent.client_secret,
    paymentMethodId: paymentMethod.id,
  };
}
