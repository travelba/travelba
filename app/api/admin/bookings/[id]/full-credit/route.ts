import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { hotelDisplayName } from "@/lib/crm/carnet";
import { fullCreditCardSpec } from "@/lib/crm/full-credit-card";
import { postFullCreditCapture } from "@/lib/crm/full-credit-ledger";
import { buildFullCreditHotelMail, deliverFullCreditMail } from "@/lib/crm/full-credit-mail";
import {
  eurosToCents,
  isFullCreditStatus,
  parisToday,
  redactFullCreditText,
  statusAfterCard,
  statusAfterSend,
  usableHotelEmail,
  usablePaymentUrl,
  type FullCreditRecord,
  type FullCreditStatus,
} from "@/lib/crm/full-credit";
import { issuePliantCard, pliantConfigured, raisePliantLimit } from "@/lib/crm/pliant";
import type { CrmBooking, CrmBookingItem, CrmCustomer } from "@/lib/crm/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    creditId?: string;
    hotelEmail?: string;
    subject?: string;
    body?: string;
    paymentUrl?: string;
    amount?: unknown;
  };
  const creditId = (body.creditId || "").trim();
  if (!creditId) return jsonError("Demande manquante.");

  const { data: booking } = await auth.supabase.from("crm_bookings").select("*").eq("id", id).maybeSingle();
  if (!booking) return jsonError("Séjour introuvable", 404);
  const stay = booking as CrmBooking;
  const { data: creditRow } = await auth.supabase
    .from("crm_full_credits")
    .select("*")
    .eq("id", creditId)
    .eq("booking_id", stay.id)
    .maybeSingle();
  const credit = creditRow as FullCreditRecord | null;
  if (!credit || !isFullCreditStatus(credit.status)) return jsonError("Demande introuvable", 404);

  if (body.action === "send") return sendHotel(auth.supabase, credit, body);
  if (body.action === "card") return issueCard(auth.supabase, stay, credit);
  if (body.action === "link") return saveLink(auth.supabase, credit, body.paymentUrl);
  if (body.action === "capture") return capture(auth.supabase, stay, credit, body.amount);
  return jsonError("Action inconnue.");
}

async function sendHotel(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
  credit: FullCreditRecord,
  body: { hotelEmail?: string; subject?: string; body?: string }
) {
  const next = statusAfterSend(credit.status as FullCreditStatus);
  if (!next) return jsonError("Cette demande est close.");
  const email = usableHotelEmail(body.hotelEmail ?? credit.hotel_email);
  if (!email) return jsonError("Indiquez l’adresse de l’hôtel.");
  const subject = redactFullCreditText((body.subject ?? credit.draft_subject).trim());
  const text = redactFullCreditText((body.body ?? credit.draft_body).trim());
  if (!subject || !text) return jsonError("Le courrier est vide.");
  const sent = await deliverFullCreditMail(buildFullCreditHotelMail({ to: email, subject, body: text }));
  if (!sent) return jsonError("Le courrier n’a pas été envoyé.");
  const { error } = await supabase
    .from("crm_full_credits")
    .update({
      hotel_email: email,
      draft_subject: subject,
      draft_body: text,
      status: next,
      sent_at: new Date().toISOString(),
    })
    .eq("id", credit.id);
  if (error) return jsonError("Le courrier est parti, le dossier n’a pas été mis à jour.");
  return NextResponse.json({ status: next });
}

async function issueCard(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
  stay: CrmBooking,
  credit: FullCreditRecord
) {
  const next = statusAfterCard(credit.status as FullCreditStatus);
  if (!next) return jsonError("Cette demande est close.");
  if (!pliantConfigured()) return jsonError("Pliant n’est pas branchée. Demandez un lien de paiement.");
  const [{ data: itemRow }, { data: customerRow }] = await Promise.all([
    supabase.from("crm_booking_items").select("*").eq("id", credit.booking_item_id).maybeSingle(),
    supabase.from("crm_customers").select("first_name, last_name").eq("id", stay.customer_id).maybeSingle(),
  ]);
  const item = itemRow as CrmBookingItem | null;
  const customer = customerRow as Pick<CrmCustomer, "first_name" | "last_name"> | null;
  if (!item) return jsonError("Hôtel introuvable", 404);
  const spec = fullCreditCardSpec({
    firstName: customer?.first_name || "Client",
    lastName: customer?.last_name || "Travelba",
    hotelName: hotelDisplayName(item),
    nights: credit.nights,
    ceilingCents: credit.ceiling_cents,
    endAt: item.end_at,
    today: parisToday(new Date()),
    organizationId: process.env.PLIANT_ORGANIZATION_ID || "",
  });
  let cardId = credit.pliant_card_id;
  try {
    if (cardId) {
      await raisePliantLimit(cardId, spec.body.limit, spec.body.maxTransactionCount);
    } else {
      const issued = await issuePliantCard(process.env.PLIANT_CARDHOLDER_ID || "", spec.body);
      cardId = issued.cardId;
    }
  } catch (err) {
    const message = err instanceof Error && err.message.startsWith("Pliant") ? err.message : "Pliant n’a pas créé la carte.";
    return jsonError(message);
  }
  if (!cardId) return jsonError("Pliant n’a pas créé la carte.");
  const { error } = await supabase
    .from("crm_full_credits")
    .update({ pliant_card_id: cardId, status: next })
    .eq("id", credit.id);
  if (error) return jsonError("La carte est émise, le dossier n’a pas été mis à jour.");
  return NextResponse.json({ status: next, cardId });
}

async function saveLink(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
  credit: FullCreditRecord,
  paymentUrl: string | undefined
) {
  if (credit.status === "cloturee") return jsonError("Cette demande est close.");
  const url = usablePaymentUrl(paymentUrl);
  if (!url) return jsonError("Le lien de paiement doit commencer par https.");
  const { error } = await supabase.from("crm_full_credits").update({ payment_url: url }).eq("id", credit.id);
  if (error) return jsonError("Le lien n’a pas été enregistré.");
  return NextResponse.json({ status: credit.status, paymentUrl: url });
}

async function capture(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
  stay: CrmBooking,
  credit: FullCreditRecord,
  amount: unknown
) {
  const cents = eurosToCents(amount);
  if (!cents) return jsonError("Indiquez le montant réellement débité.");
  const { data: itemRow } = await supabase
    .from("crm_booking_items")
    .select("title, details, kind")
    .eq("id", credit.booking_item_id)
    .maybeSingle();
  const hotelName = itemRow ? hotelDisplayName(itemRow as CrmBookingItem) : "Hôtel";
  try {
    await postFullCreditCapture(supabase, stay, credit.id, hotelName, cents);
  } catch {
    return jsonError("Le montant n’a pas été écrit au grand livre.");
  }
  const { error } = await supabase.from("crm_full_credits").update({ captured_cents: cents }).eq("id", credit.id);
  if (error) return jsonError("Le montant est au livre, le dossier n’a pas été mis à jour.");
  return NextResponse.json({ status: credit.status, capturedCents: cents });
}
