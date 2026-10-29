import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { sendRestaurantEvening } from "@/lib/crm/restaurants-run";
import { isFormError, parseLocalTime, RESTAURANT_DEFAULT_TIME } from "@/lib/crm/restaurants";
import {
  cancelBookingTable,
  choiceFromBody,
  loadBookingRestaurants,
  saveBookingChoice,
  saveBookingTable,
  saveBookingTimezone,
} from "@/lib/crm/restaurants-db";
import { createServiceClient } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

function chosenTime(raw: unknown) {
  if (raw == null || raw === "") return RESTAURANT_DEFAULT_TIME;
  const parsed = parseLocalTime(raw);
  if (isFormError(parsed)) return parsed;
  if (!parsed) return { error: "Heure invalide." };
  return parsed;
}

export async function GET(_request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const desk = await loadBookingRestaurants(auth.supabase, id);
  return NextResponse.json(desk);
}

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError("Requête illisible.");
  const action = typeof body.action === "string" ? body.action : "";
  if (action === "fuseau") {
    const saved = await saveBookingTimezone(auth.supabase, id, body.timezone);
    if ("error" in saved) return jsonError(saved.error || "Enregistrement impossible.");
    return NextResponse.json(saved);
  }
  if (action === "choix") {
    const choice = choiceFromBody(body.choice);
    const date = typeof body.date === "string" ? body.date : "";
    if (!choice) return jsonError("Choix A, B ou Aucune.");
    const saved = await saveBookingChoice(auth.supabase, id, { date, choice, source: "manuel" });
    if ("error" in saved) return jsonError(saved.error || "Enregistrement impossible.");
    return NextResponse.json(saved);
  }
  if (action === "annuler") {
    const saved = await cancelBookingTable(auth.supabase, id, body);
    if ("error" in saved) return jsonError(saved.error || "Enregistrement impossible.");
    return NextResponse.json(saved);
  }
  if (action === "envoyer") {
    const date = typeof body.date === "string" ? body.date : "";
    const saved = await sendRestaurantEvening(auth.supabase, id, date);
    if ("error" in saved) return jsonError(saved.error || "Envoi impossible.");
    return NextResponse.json(saved);
  }
  if (action === "choisir") {
    const date = typeof body.date === "string" ? body.date : "";
    const left = typeof body.restaurantA === "string" ? body.restaurantA : "";
    const right = typeof body.restaurantB === "string" ? body.restaurantB : "";
    if (!left || !right || left === right) return jsonError("Choisissez deux restaurants différents.");
    const timeA = chosenTime(body.heureA);
    const timeB = chosenTime(body.heureB);
    if (isFormError(timeA)) return jsonError(timeA.error);
    if (isFormError(timeB)) return jsonError(timeB.error);
    const first = await saveBookingTable(auth.supabase, id, { date, seat: "A", restaurantId: left, time: timeA, status: "reservee", covers: 2 });
    if ("error" in first) return jsonError(first.error || "Enregistrement impossible.");
    const second = await saveBookingTable(auth.supabase, id, { date, seat: "B", restaurantId: right, time: timeB, status: "reservee", covers: 2 });
    if ("error" in second) return jsonError(second.error || "Enregistrement impossible.");
    const booking = await auth.supabase.from("crm_bookings").select("is_test").eq("id", id).maybeSingle();
    if ((booking.data as { is_test?: boolean } | null)?.is_test) {
      const admin = createServiceClient();
      await admin.from("crm_restaurant_tables").update({ is_test: true }).eq("booking_id", id).eq("evening_date", date);
      await admin.from("crm_restaurant_evenings").upsert(
        { booking_id: id, evening_date: date, is_test: true },
        { onConflict: "booking_id,evening_date" }
      );
    }
    return NextResponse.json({ ok: true });
  }
  if (action === "table") {
    const saved = await saveBookingTable(auth.supabase, id, body);
    if ("error" in saved) return jsonError(saved.error || "Enregistrement impossible.");
    return NextResponse.json(saved);
  }
  return jsonError("Action inconnue.");
}
