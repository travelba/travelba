import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { openEtaIlPortal } from "@/lib/crm/eta-il-browser";
import { buildEtaIlDraft, publicEtaIlDraft } from "@/lib/crm/eta-il-draft";
import { runEtaIlSession } from "@/lib/crm/eta-il-session";
import { openaiApiKey } from "@/lib/crm/ingest-types";
import type {
  CrmBooking,
  CrmBookingItem,
  CrmBookingTraveler,
  CrmCustomer,
  CrmTravelDocument,
} from "@/lib/crm/types";

export const runtime = "nodejs";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { action?: string };
  const action = body.action === "fill" ? "fill" : "prepare";

  const { data: booking } = await auth.supabase.from("crm_bookings").select("*").eq("id", id).maybeSingle();
  if (!booking) return jsonError("Réservation introuvable", 404);
  const b = booking as CrmBooking;
  const [{ data: items }, { data: travelers }, { data: documents }, { data: customer }] = await Promise.all([
    auth.supabase.from("crm_booking_items").select("*").eq("booking_id", b.id),
    auth.supabase.from("crm_booking_travelers").select("*").eq("booking_id", b.id),
    auth.supabase.from("crm_travel_documents").select("*").eq("customer_id", b.customer_id),
    auth.supabase.from("crm_customers").select("first_name, last_name, usage_name").eq("id", b.customer_id).maybeSingle(),
  ]);
  const holder = customer as Pick<CrmCustomer, "first_name" | "last_name" | "usage_name"> | null;
  const draft = buildEtaIlDraft({
    items: (items || []) as CrmBookingItem[],
    travelers: (travelers || []) as CrmBookingTraveler[],
    documents: (documents || []) as CrmTravelDocument[],
    holder,
    startDate: b.start_date,
    endDate: b.end_date,
  });
  if (action === "prepare" || draft.phase !== "prêt") {
    return NextResponse.json(publicEtaIlDraft(draft));
  }

  const apiKey = openaiApiKey();
  if (!apiKey) {
    return NextResponse.json({
      ...publicEtaIlDraft(draft),
      phase: "bloqué",
      reason: "GPT-6 Astra n’est pas disponible sur ce compte API.",
    });
  }

  const portal = await openEtaIlPortal();
  if (!portal) {
    return NextResponse.json({
      ...publicEtaIlDraft(draft),
      phase: "bloqué",
      reason: "Navigateur indisponible. Le remplissage n’a pas été lancé.",
    });
  }
  try {
    const session = await runEtaIlSession({ apiKey, draft, page: portal });
    return NextResponse.json({
      ...publicEtaIlDraft(draft),
      phase: session.phase,
      reason: session.message,
      summary: session.summary,
    });
  } finally {
    await portal.close();
  }
}
