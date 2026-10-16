import { NextResponse } from "next/server";
import { BookingIssuesError } from "@/lib/crm/booking-issues";
import { dbError, jsonError, jsonIssues, requireLittleEmperorsActor } from "@/lib/crm/auth";
import {
  listLittleEmperorsFilters,
  listLittleEmperorsGroups,
  LittleEmperorsError,
  littleEmperorsActionAllowed,
  littleEmperorsAvailability,
  littleEmperorsCalendar,
  littleEmperorsPartnerMessage,
  littleEmperorsWidgetUrl,
  searchLittleEmperors,
} from "@/lib/crm/little-emperors";
import {
  attachLittleEmperorsBooking,
  bookLittleEmperorsStay,
  cancelLittleEmperorsFromCrm,
  quoteLittleEmperorsStay,
  syncLittleEmperorsBookings,
} from "@/lib/crm/little-emperors-sync";

export const runtime = "nodejs";
export const maxDuration = 300;

function dayOf(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function positiveInt(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function adultsOf(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 8 ? number : 0;
}

function agesOf(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((age) => Number(age))
    .filter((age) => Number.isInteger(age) && age >= 0 && age <= 17)
    .slice(0, 6);
}

function idList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map(positiveInt).filter((id): id is number => id != null).slice(0, 8);
}

function linesOf(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((line) => String(line || "").trim()).filter(Boolean).slice(0, 40);
}

function textOrNull(value: unknown) {
  const text = String(value || "").trim();
  return text ? text.slice(0, 500) : null;
}

function currencyOf(value: unknown) {
  const code = String(value || "EUR").trim().toUpperCase();
  return code === "GBP" || code === "USD" || code === "EUR" ? code : "EUR";
}

function hourOf(value: unknown) {
  const text = String(value || "").trim();
  if (!/^\d{1,2}$/.test(text)) return null;
  const hour = Number(text);
  return hour >= 0 && hour <= 23 ? String(hour) : null;
}

function failure(err: unknown, partner: boolean) {
  if (err instanceof BookingIssuesError) return jsonIssues(err.issues, 400, err.message);
  if (err instanceof LittleEmperorsError) {
    return jsonError(partner ? littleEmperorsPartnerMessage(err.code) : err.message, err.status);
  }
  console.error("[little-emperors]", err instanceof Error ? err.message : "error");
  return jsonError(partner ? "The staging API could not be read." : "Opération Little Emperors impossible.", 502);
}

export async function POST(request: Request) {
  const auth = await requireLittleEmperorsActor();
  if (auth instanceof NextResponse) return auth;
  const body = await request.json().catch(() => ({}));
  const action = String(body?.action || "");
  const partner = auth.staff.role === "partner";
  if (!littleEmperorsActionAllowed(auth.staff.role, action)) {
    return jsonError(partner ? "This action is not available." : "Accès réservé à l’agence", 403);
  }
  try {
    if (action === "sync") {
      const result = await syncLittleEmperorsBookings();
      const probeMessage = result.ok
        ? null
        : partner
          ? littleEmperorsPartnerMessage(result.code || "")
          : result.message || "Lecture impossible.";
      const { error: probeError } = await auth.supabase.rpc("crm_record_le_probe", {
        p_status: result.ok ? 200 : result.status || 502,
        p_error: probeMessage,
        p_ok_at: result.ok ? new Date().toISOString() : null,
      });
      if (probeError) console.error("[little-emperors] probe", probeError.code || "error");
      if (!result.ok) return jsonError(probeMessage || "Lecture impossible.", result.status || 502);
      return NextResponse.json(result);
    }
    if (action === "attach") {
      const result = await attachLittleEmperorsBooking({
        id: String(body.id || ""),
        customerId: String(body.customer_id || ""),
      });
      return NextResponse.json(result);
    }
    if (action === "cancel") {
      return NextResponse.json(await cancelLittleEmperorsFromCrm(String(body.id || "")));
    }
    if (action === "search") {
      const query = String(body.query || "").trim();
      if (query.length < 2) return jsonError("Indiquez au moins deux lettres.");
      return NextResponse.json({ hits: await searchLittleEmperors(query.slice(0, 80)) });
    }
    if (action === "filters") {
      return NextResponse.json({ filters: await listLittleEmperorsFilters() });
    }
    if (action === "groups") {
      const name = String(body.query || "").trim();
      if (name.length < 2) return jsonError("Indiquez au moins deux lettres.");
      return NextResponse.json({ groups: await listLittleEmperorsGroups(name.slice(0, 80)) });
    }
    if (action === "calendar") {
      const hotelId = positiveInt(body.hotel_id);
      if (!hotelId) return jsonError("Choisissez un hôtel.");
      const currency = currencyOf(body.currency);
      return NextResponse.json({ days: await littleEmperorsCalendar(hotelId, currency) });
    }
    if (action === "availability") {
      const start = dayOf(body.start);
      const end = dayOf(body.end);
      const adults = adultsOf(body.adults);
      if (!start || !end || !adults) return jsonError("Indiquez les dates et le nombre d’adultes.");
      const hotelId = positiveInt(body.hotel_id);
      const locationId = positiveInt(body.location_id);
      const inspirationId = positiveInt(body.inspiration_id);
      if (!hotelId && !locationId && !inspirationId) return jsonError("Choisissez un hôtel, une ville ou une inspiration.");
      const stays = await littleEmperorsAvailability({
        start_date: start,
        end_date: end,
        currency: currencyOf(body.currency),
        hotel_id: hotelId,
        location_id: locationId,
        inspiration_id: inspirationId,
        hotel_group_ids: idList(body.hotel_group_ids),
        activities_ids: idList(body.activities_ids),
        family_facilities_ids: idList(body.family_facilities_ids),
        hotel_facilities_ids: idList(body.hotel_facilities_ids),
        property_types_ids: idList(body.property_types_ids),
        location_types_ids: idList(body.location_types_ids),
        trip_types_ids: idList(body.trip_types_ids),
        wellness_ids: idList(body.wellness_ids),
        adults,
        children_ages: agesOf(body.children_ages),
      });
      return NextResponse.json({
        stays: stays.map((stay) => ({
          ...stay,
          widget_url: stay.session_id ? littleEmperorsWidgetUrl(stay.session_id) : null,
        })),
      });
    }
    if (action === "quote") {
      const customerId = String(body.customer_id || "");
      if (!customerId) return jsonError("Choisissez un client.");
      const result = await quoteLittleEmperorsStay({
        customerId,
        hotelName: String(body.hotel_name || ""),
        city: textOrNull(body.city),
        hotelId: positiveInt(body.hotel_id),
        start: dayOf(body.start),
        end: dayOf(body.end),
        roomName: textOrNull(body.room_name),
        benefits: linesOf(body.benefits),
        footnotes: linesOf(body.footnotes),
        cancellation: textOrNull(body.cancellation),
        payment: textOrNull(body.payment),
        supplierCost: textOrNull(body.supplier_cost),
        currency: textOrNull(body.currency),
        adults: adultsOf(body.adults) || null,
      });
      return NextResponse.json(result);
    }
    if (action === "book") {
      const customerId = String(body.customer_id || "");
      const sessionId = String(body.session_id || "");
      const rateIndex = String(body.rate_index || "");
      const hotelId = positiveInt(body.hotel_id);
      const adults = adultsOf(body.adults);
      if (!customerId || !hotelId || !adults) return jsonError("Il manque le client, l’hôtel ou les adultes.");
      if (!/^[A-Za-z0-9_-]{4,80}$/.test(sessionId) || !/^[A-Za-z0-9_.:-]{1,80}$/.test(rateIndex)) {
        return jsonError("La disponibilité a expiré. Relancez la recherche.");
      }
      const loyalty = body.loyalty_program === "bonvoy" || body.loyalty_program === "all_accor" ? body.loyalty_program : null;
      const result = await bookLittleEmperorsStay({
        customerId,
        crmBookingId: textOrNull(body.booking_id),
        start: dayOf(body.start),
        end: dayOf(body.end),
        sessionId,
        rateIndex,
        hotelId,
        adults,
        childrenAges: agesOf(body.children_ages),
        eta: hourOf(body.eta),
        loyaltyProgram: loyalty,
      });
      return NextResponse.json(result);
    }
  } catch (err) {
    if (err instanceof LittleEmperorsError || err instanceof BookingIssuesError) return failure(err, partner);
    if (!partner && err && typeof err === "object" && "code" in err) {
      return dbError(err as { code?: string; message?: string });
    }
    return failure(err, partner);
  }
  return jsonError(partner ? "Unknown action." : "Action inconnue");
}
