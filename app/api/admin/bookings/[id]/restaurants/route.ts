import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import {
  cancelBookingTable,
  choiceFromBody,
  loadBookingRestaurants,
  saveBookingChoice,
  saveBookingTable,
  saveBookingTimezone,
} from "@/lib/crm/restaurants-db";

type Ctx = { params: Promise<{ id: string }> };

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
  if (action === "table") {
    const saved = await saveBookingTable(auth.supabase, id, body);
    if ("error" in saved) return jsonError(saved.error || "Enregistrement impossible.");
    return NextResponse.json(saved);
  }
  return jsonError("Action inconnue.");
}
