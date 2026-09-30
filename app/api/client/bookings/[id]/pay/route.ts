import { NextResponse } from "next/server";
import { dbError, jsonError, requireCustomer } from "@/lib/crm/auth";
import { isLedgerExpenseKind, type CrmBooking, type CrmBookingItem } from "@/lib/crm/types";
import { amountToCents, collectableStayAmount } from "@/lib/crm/payer";
import { ensureStripeCustomer, getStripe, stripeConfigured } from "@/lib/crm/stripe";
import {
  bankTransferInstructions,
  excludedStripeTypes,
  stayPayMethodOf,
  stayPayMethods,
} from "@/lib/crm/stripe-pay";
import { createServiceClient } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  if (!stripeConfigured()) return jsonError("Stripe n’est pas configuré", 503);

  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const method = stayPayMethodOf(body?.method);
  if (!method) return jsonError("Choisissez un moyen de règlement.");

  const { data, error } = await auth.supabase
    .from("crm_bookings")
    .select("*")
    .eq("id", id)
    .eq("customer_id", auth.customer.id)
    .maybeSingle();
  if (error) return dbError(error, 500);
  if (!data) return jsonError("Réservation introuvable", 404);
  const booking = data as CrmBooking;
  if (!booking.visible_to_client) return jsonError("Ce séjour n’est pas ouvert.", 404);
  if (booking.payer_kind !== "company" && booking.payer_kind !== "personal") {
    return jsonError("L’agence n’a pas encore indiqué qui règle ce voyage.");
  }
  if (booking.payer_kind === "company" && auth.customer.company_role === "member") {
    return jsonError("Votre société règle ce voyage.", 403);
  }
  if (!stayPayMethods(booking.payer_kind, booking.currency).includes(method)) {
    return jsonError("Ce moyen n’est pas ouvert pour ce voyage.");
  }

  const { data: items, error: itemError } = await auth.supabase
    .from("crm_booking_items")
    .select("kind, amount")
    .eq("booking_id", booking.id);
  if (itemError) return dbError(itemError, 500);
  const expenses = ((items || []) as Pick<CrmBookingItem, "kind" | "amount">[]).filter((item) =>
    isLedgerExpenseKind(item.kind)
  );
  const amount = collectableStayAmount({
    stayTotal: Number(booking.total_amount),
    agencyCommission: booking.agency_commission === true,
    clientSettlesStay: booking.client_settles_stay === true,
    pricesVisible: booking.prices_visible !== false,
    expenses,
  });
  if (amount == null) return jsonError("Il n’y a pas de montant à régler.");
  const cents = amountToCents(amount);
  if (cents < 50) return jsonError("Le montant est trop faible pour un règlement en ligne.");

  const stripe = getStripe()!;
  const admin = createServiceClient();
  let stripeCustomerId: string;
  try {
    stripeCustomerId = await ensureStripeCustomer(stripe, admin, auth.customer);
  } catch {
    return jsonError("Le compte de règlement n’a pas pu être ouvert.", 502);
  }

  try {
    let intent = await stripe.paymentIntents.create(
      {
        amount: cents,
        currency: booking.currency.toLowerCase(),
        customer: stripeCustomerId,
        automatic_payment_methods: { enabled: true },
        excluded_payment_method_types: excludedStripeTypes(method),
        description: `Séjour ${booking.reference}`,
        metadata: {
          crm_booking_id: booking.id,
          crm_customer_id: booking.billing_customer_id || booking.customer_id,
          billing_company_id: booking.payer_kind === "company" ? booking.billing_company_id || "" : "",
          pay_method: method,
          reference: booking.reference,
        },
        ...(method === "customer_balance"
          ? {
              payment_method_options: {
                customer_balance: {
                  funding_type: "bank_transfer",
                  bank_transfer: {
                    type: "eu_bank_transfer",
                    eu_bank_transfer: { country: "FR" },
                  },
                },
              },
            }
          : {}),
      },
      { idempotencyKey: `stay-${booking.id}-${method}-${cents}` }
    );

    if (method === "customer_balance" && intent.status === "requires_payment_method") {
      intent = await stripe.paymentIntents.confirm(intent.id, {
        payment_method_data: { type: "customer_balance" },
      });
    }

    if (intent.status === "succeeded") {
      return NextResponse.json({ alreadyPaid: true });
    }

    if (method === "customer_balance") {
      const transfer = bankTransferInstructions(intent);
      if (!transfer) return jsonError("Le virement n’est pas disponible pour ce séjour.", 502);
      return NextResponse.json({ transfer });
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
