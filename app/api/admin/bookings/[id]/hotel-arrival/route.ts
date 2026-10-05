import { NextResponse } from "next/server";
import { jsonError, requireAdmin, requireStaff } from "@/lib/crm/auth";
import { parseEurosToCents } from "@/lib/crm/hotel-arrival";
import { issueHotelCheckinCard } from "@/lib/crm/hotel-desk-run";
import { openAgencyCard } from "@/lib/crm/staff-card-open";
import { advanceHotelItem, issueManualStayCard } from "@/lib/crm/hotel-arrival-run";
import { createServiceClient } from "@/lib/supabase/admin";
import type { CrmHotelArrival } from "@/lib/crm/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => null)) as
    | {
        itemId?: string;
        action?: string;
        net?: string;
        code?: string;
        source?: string;
        define?: boolean;
        amount?: string;
        firstName?: string;
        lastName?: string;
      }
    | null;
  const itemId = (body?.itemId || "").trim();
  const action = body?.action;
  if (!itemId || !action) return jsonError("Action incomplète", 400);

  const admin = createServiceClient();
  const { data } = await admin
    .from("crm_hotel_arrivals")
    .select("*")
    .eq("booking_id", id)
    .eq("booking_item_id", itemId)
    .maybeSingle();
  const row = data as CrmHotelArrival | null;

  if (action === "issue-manual") {
    try {
      await issueManualStayCard(admin, {
        bookingId: id,
        itemId,
        amount: typeof body?.amount === "string" ? body.amount : "",
        firstName: typeof body?.firstName === "string" ? body.firstName : "",
        lastName: typeof body?.lastName === "string" ? body.lastName : "",
      });
      return NextResponse.json({ ok: true });
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : "La carte n’a pas pu être créée.", 400);
    }
  }

  if (action === "issue") {
    const { data: item } = await admin
      .from("crm_booking_items")
      .select("id, kind")
      .eq("booking_id", id)
      .eq("id", itemId)
      .maybeSingle();
    if (!item || item.kind !== "hotel") return jsonError("Hôtel introuvable.", 404);
    try {
      const card = await issueHotelCheckinCard(admin, id, itemId);
      return NextResponse.json({ ok: true, last4: card.last4 });
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : "La carte n’a pas pu être créée.", 400);
    }
  }

  if (!row) return jsonError("Suivi introuvable", 404);

  if (action === "net") {
    const cents = parseEurosToCents(body?.net || "");
    if (cents == null) return jsonError("Montant net invalide", 400);
    await admin.from("crm_hotel_arrivals").update({ net_cents: cents }).eq("id", row.id);
    return NextResponse.json({ ok: true });
  }

  if (action === "task_done") {
    await admin.from("crm_hotel_arrivals").update({ task_open: false }).eq("id", row.id);
    return NextResponse.json({ ok: true });
  }

  if (action === "paid") {
    await admin
      .from("crm_hotel_arrivals")
      .update({ status: "paid", paid_at: new Date().toISOString(), blocked_reason: null })
      .eq("id", row.id);
    await advanceHotelItem(admin, id, itemId);
    return NextResponse.json({ ok: true });
  }

  if (action === "card") {
    // Lecture d’un PAN / CVC : rôle admin seulement, jamais mis en cache, toujours journalisée (B-05).
    const adminAuth = await requireAdmin();
    if (adminAuth instanceof NextResponse) return adminAuth;
    const opened = await openAgencyCard({
      admin,
      staffId: adminAuth.staff.id,
      staffName: adminAuth.staff.full_name,
      code: typeof body?.code === "string" ? body.code : "",
      bookingId: id,
      itemId,
      source: body?.source === "client" ? "client" : "pliant",
      define: body?.define === true,
    });
    if ("error" in opened) return jsonError(opened.error, opened.status);
    const noStore = { "Cache-Control": "private, no-store" };
    if (opened.file) {
      return NextResponse.json(
        {
          mime: opened.file.mime,
          name: opened.file.name,
          image: opened.file.bytes,
          viewer: opened.viewer,
          viewedAt: opened.viewedAt,
        },
        { headers: noStore }
      );
    }
    if (opened.widget) {
      return NextResponse.json(
        {
          widgetUrl: opened.widget.src,
          frameId: opened.widget.frameId,
          viewer: opened.viewer,
          viewedAt: opened.viewedAt,
        },
        { headers: noStore }
      );
    }
    return jsonError("La carte n’a pas pu être lue.", 502);
  }

  return jsonError("Action inconnue", 400);
}
