import { NextResponse } from "next/server";
import { dbError, jsonError, requireCustomer } from "@/lib/crm/auth";
import { isCompanyMember } from "@/lib/crm/company-role";
import { loadClientLedger } from "@/lib/crm/client-ledger";
import { customerFullName, type CrmTransaction } from "@/lib/crm/types";
import { amountToCents, anchorBillingCompanyId, encoursPartLabel, payerKindOf } from "@/lib/crm/payer";
import { RevolutHttpError, loadAgencyEurWire } from "@/lib/crm/revolut";
import { ensureStripeCustomer, getStripe, stripeConfigured } from "@/lib/crm/stripe";
import { excludedStripeTypes, stayPayMethodOf, stayPayMethods } from "@/lib/crm/stripe-pay";
import { createServiceClient } from "@/lib/supabase/admin";

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
  const amount = payer === "company" ? view.owed.company : view.owed.personal;
  if (amount < 0.5) return jsonError("Il n’y a pas de montant à régler.");
  if (!stayPayMethods(payer, view.currency).includes(method)) {
    return jsonError("Ce moyen n’est pas ouvert pour cette part.");
  }

  const { data: txs, error: txError } = await auth.supabase
    .from("crm_transactions")
    .select("direction, amount, status, currency, billing_company_id")
    .eq("customer_id", auth.customer.id)
    .eq("status", "posted");
  if (txError) return dbError(txError, 500);
  const companyId =
    payer === "company" ? anchorBillingCompanyId((txs || []) as CrmTransaction[], view.currency) : null;
  const mention = encoursPartLabel(payer, payer === "company" ? view.soleCompanyName : null);
  const reference = customerFullName(auth.customer) || "Encours";
  const cents = amountToCents(amount);

  if (method === "revolut") {
    try {
      const wire = await loadAgencyEurWire();
      if (!wire) return jsonError("Le virement n’est pas encore ouvert.", 503);
      return NextResponse.json({
        transfer: {
          iban: wire.iban,
          bic: wire.bic,
          accountHolder: wire.accountHolder,
          reference,
          currency: view.currency.toUpperCase(),
          partLabel: mention,
        },
      });
    } catch (err) {
      const code = err instanceof RevolutHttpError ? String(err.status) : "auth";
      console.error("[revolut-wire]", code);
      return jsonError("Le virement n’est pas encore ouvert.", 503);
    }
  }

  if (!stripeConfigured()) return jsonError("Stripe n’est pas configuré", 503);
  const stripe = getStripe()!;
  const admin = createServiceClient();
  let stripeCustomerId: string;
  try {
    stripeCustomerId = await ensureStripeCustomer(stripe, admin, auth.customer);
  } catch {
    return jsonError("Le compte de règlement n’a pas pu être ouvert.", 502);
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
          crm_customer_id: auth.customer.id,
          payer_kind: payer,
          billing_company_id: companyId || "",
          pay_method: method,
          pay_mention: mention,
          reference,
        },
      },
      { idempotencyKey: `ledger-${auth.customer.id}-${payer}-${method}-${cents}${nonce ? `-${nonce}` : ""}` }
    );

    if (intent.status === "succeeded") {
      return NextResponse.json({ alreadyPaid: true });
    }
    if (!intent.client_secret) return jsonError("Le règlement n’a pas pu démarrer.", 502);
    return NextResponse.json({ clientSecret: intent.client_secret });
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: unknown }).code || "stripe")
        : "stripe";
    console.error("[stripe-pay]", code);
    return jsonError("Le règlement n’a pas pu démarrer.", 502);
  }
}
