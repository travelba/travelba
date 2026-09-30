import { NextResponse } from "next/server";
import { dbError, jsonError, requireCustomer } from "@/lib/crm/auth";
import { isLedgerExpenseKind, type CrmBooking, type CrmBookingItem } from "@/lib/crm/types";
import { amountToCents, paymentSlips, slipMention, type PaySliceId } from "@/lib/crm/payer";
import { RevolutHttpError, loadAgencyEurWire } from "@/lib/crm/revolut";
import { ensureStripeCustomer, getStripe, stripeConfigured } from "@/lib/crm/stripe";
import { excludedStripeTypes, stayPayMethodOf, stayPayMethods } from "@/lib/crm/stripe-pay";
import { collectableTicketingFee } from "@/lib/crm/ticketing-fee";
import { createServiceClient } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;

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

  const { data: items, error: itemError } = await auth.supabase
    .from("crm_booking_items")
    .select("kind, amount")
    .eq("booking_id", booking.id);
  if (itemError) return dbError(itemError, 500);
  const expenses = ((items || []) as Pick<CrmBookingItem, "kind" | "amount">[]).filter((item) =>
    isLedgerExpenseKind(item.kind)
  );
  const admin = createServiceClient();
  const walletId = booking.billing_customer_id || booking.customer_id;
  const { data: companyRows, error: companyError } = await admin
    .from("crm_billing_companies")
    .select("id, company_name, sort_order")
    .eq("customer_id", walletId)
    .order("sort_order");
  if (companyError) return dbError(companyError, 500);
  const companies = (companyRows || []) as { id: string; company_name: string | null; sort_order: number }[];
  const otherCompany = [...companies].sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))[0];
  const slips = paymentSlips({
    stayTotal: Number(booking.total_amount),
    agencyCommission: booking.agency_commission === true,
    clientSettlesStay: booking.client_settles_stay === true,
    pricesVisible: booking.prices_visible !== false,
    expenses,
    ticketingFee: collectableTicketingFee({
      status: booking.status,
      hasFlight: ((items || []) as Pick<CrmBookingItem, "kind">[]).some((item) => item.kind === "flight"),
    }),
    stayKind: booking.payer_kind,
    stayCompanyId: booking.billing_company_id || null,
    feesFollowStay: booking.fees_follow_stay !== false,
    otherCompanyId: otherCompany?.id || null,
  });
  const requested: PaySliceId | null = body?.slice === "stay" || body?.slice === "fees" ? body.slice : null;
  const payable = slips.filter((slip) => slip.payable && slip.amount != null && slip.amount > 0);
  const slip = requested ? payable.find((row) => row.slice === requested) : payable.length === 1 ? payable[0] : null;
  if (!slip || slip.amount == null) return jsonError("Il n’y a pas de montant à régler.");
  if (slip.kind === "company" && auth.customer.company_role === "member") {
    return jsonError("Votre société règle cette part.", 403);
  }
  if (!stayPayMethods(slip.kind, booking.currency).includes(method)) {
    return jsonError("Ce moyen n’est pas ouvert pour cette part.");
  }
  const companyName =
    slip.kind === "company"
      ? companies.find((company) => company.id === slip.companyId)?.company_name || otherCompany?.company_name || null
      : null;
  const mention = slipMention(slip.kind, companyName);
  const cents = amountToCents(slip.amount);
  if (cents < 50) return jsonError("Le montant est trop faible pour un règlement en ligne.");

  if (method === "revolut") {
    try {
      const wire = await loadAgencyEurWire();
      if (!wire) return jsonError("Le virement n’est pas encore ouvert.", 503);
      return NextResponse.json({
        transfer: {
          iban: wire.iban,
          bic: wire.bic,
          accountHolder: wire.accountHolder,
          reference: booking.reference,
          currency: booking.currency.toUpperCase(),
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
        currency: booking.currency.toLowerCase(),
        customer: stripeCustomerId,
        automatic_payment_methods: { enabled: true },
        excluded_payment_method_types: excludedStripeTypes(method),
        description: `Séjour ${booking.reference}`,
        metadata: {
          crm_booking_id: booking.id,
          crm_customer_id: booking.billing_customer_id || booking.customer_id,
          billing_company_id: slip.companyId || "",
          pay_method: method,
          pay_slice: slip.slice,
          pay_mention: mention,
          reference: booking.reference,
        },
      },
      { idempotencyKey: `stay-${booking.id}-${slip.slice}-${method}-${cents}` }
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
