import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { parseEurosToCents } from "@/lib/crm/hotel-arrival";
import { syncStayCards } from "@/lib/crm/hotel-arrival-run";
import {
  changePliantCardLimit,
  rememberPliantCard,
  setPliantCardLocked,
} from "@/lib/crm/pliant-card-run";
import { pliantConfigured } from "@/lib/crm/pliant";
import { createServiceClient } from "@/lib/supabase/admin";
import type { CrmBookingItem, CrmBookingTraveler } from "@/lib/crm/types";

export const runtime = "nodejs";

const MAX_CENTS = 50_000_000;

export async function POST(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  if (!pliantConfigured()) return jsonError("Pliant n’est pas branché.", 400);
  const body = (await request.json().catch(() => null)) as {
    action?: string;
    customerId?: string;
    bookingId?: string;
    cardId?: string;
    limit?: unknown;
    designation?: unknown;
    transactionAmount?: unknown;
    transactionCount?: unknown;
  } | null;
  const action = body?.action;
  if (action !== "issue" && action !== "limit" && action !== "lock" && action !== "unlock") {
    return jsonError("Action inconnue", 400);
  }
  const admin = createServiceClient();
  try {
    if (action === "lock" || action === "unlock") {
      const cardId = cleanId(body?.cardId);
      if (!cardId) return jsonError("Carte introuvable.", 400);
      await setPliantCardLocked(admin, cardId, action === "lock");
      return NextResponse.json({ ok: true, cardId, status: action === "lock" ? "locked" : "active" });
    }
    if (action === "limit") {
      const cardId = cleanId(body?.cardId);
      const cents = eurosToCents(body?.limit);
      if (!cardId) return jsonError("Carte introuvable.", 400);
      if (cents == null) return jsonError("Indiquez un plafond en euros.", 400);
      const card = await cardCurrency(admin, cardId);
      await changePliantCardLimit(admin, cardId, cents, card);
      return NextResponse.json({ ok: true, cardId, limitCents: cents });
    }
    if (body?.customerId) {
      return jsonError("Les cartes se créent sur la réservation.", 400);
    }
    const bookingId = cleanId(body?.bookingId);
    if (!bookingId) return jsonError("Dossier introuvable.", 400);
    const issued = await issueBookingCard(admin, bookingId);
    if ("error" in issued) return jsonError(issued.error, issued.status);
    return NextResponse.json({ ok: true, ...issued });
  } catch (err) {
    console.error("[pliant] carte", err instanceof Error ? err.message : "échec");
    const message = err instanceof Error ? err.message : "";
    const known =
      message.startsWith("Pliant") ||
      message === "Pliant n’est pas branché." ||
      message.startsWith("Indiquez ") ||
      message.startsWith("Le montant ");
    return jsonError(known ? message : "La carte n’a pas pu être mise à jour.", 502);
  }
}

type IssuedCard = { cardId: string; created: boolean } | { error: string; status: number };

async function issueBookingCard(admin: ReturnType<typeof createServiceClient>, bookingId: string): Promise<IssuedCard> {
  const { data: known } = await admin
    .from("crm_pliant_cards")
    .select("pliant_card_id")
    .eq("booking_id", bookingId)
    .limit(1);
  const registered = ((known || []) as { pliant_card_id?: string }[])[0]?.pliant_card_id;
  if (registered) return { cardId: registered, created: false as const };

  const { data: booking } = await admin
    .from("crm_bookings")
    .select("id, status, currency, customer_id, billing_customer_id, end_date")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) return { error: "Dossier introuvable.", status: 404 as const };
  const stay = booking as {
    status: string;
    currency: string | null;
    customer_id: string;
    billing_customer_id: string | null;
    end_date: string | null;
  };
  const [{ data: items }, { data: travelers }, { data: holder }] = await Promise.all([
    admin.from("crm_booking_items").select("*").eq("booking_id", bookingId),
    admin.from("crm_booking_travelers").select("*").eq("booking_id", bookingId),
    admin.from("crm_customers").select("first_name, last_name").eq("id", stay.customer_id).maybeSingle(),
  ]);
  const rows = await syncStayCards(admin, {
    bookingId,
    bookingStatus: stay.status,
    bookingEndDate: stay.end_date,
    currency: stay.currency,
    items: (items || []) as CrmBookingItem[],
    travelers: (travelers || []) as CrmBookingTraveler[],
    holder: (holder as { first_name: string | null; last_name: string | null } | null) || null,
  });
  const issued = rows.find((row) => row.pliant_card_id && !row.card_closed_at);
  if (!issued?.pliant_card_id) {
    return {
      error: "Indiquez le prix de l’hôtel et confirmez le séjour pour générer la carte.",
      status: 400 as const,
    };
  }
  await rememberPliantCard(admin, {
    pliant_card_id: issued.pliant_card_id,
    booking_id: bookingId,
    customer_id: stay.billing_customer_id || stay.customer_id,
    limit_cents: issued.card_limit_cents,
    currency: issued.currency || "EUR",
    last4: issued.card_last4,
  });
  return { cardId: issued.pliant_card_id, created: true as const };
}

async function cardCurrency(admin: ReturnType<typeof createServiceClient>, cardId: string) {
  const { data } = await admin.from("crm_pliant_cards").select("currency").eq("pliant_card_id", cardId).maybeSingle();
  const currency = (data as { currency?: string } | null)?.currency || "EUR";
  return /^[A-Z]{3}$/.test(currency) ? currency : "EUR";
}

function eurosToCents(value: unknown) {
  const cents =
    typeof value === "number" && Number.isFinite(value)
      ? Math.round(value * 100)
      : typeof value === "string"
        ? parseEurosToCents(value)
        : null;
  if (cents == null || cents <= 0 || cents > MAX_CENTS) return null;
  return cents;
}

function cleanId(value: unknown) {
  return typeof value === "string" && /^[0-9a-zA-Z-]{8,80}$/.test(value) ? value : "";
}
