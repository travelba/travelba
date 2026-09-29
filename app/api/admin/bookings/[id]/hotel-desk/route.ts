import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { restoreHotelRequest, saveHotelRequest, sendHotelRequest, skipHotelRequest } from "@/lib/crm/hotel-desk-run";
import { HOTEL_DESK_KINDS } from "@/lib/crm/types";
import type { HotelDeskKind } from "@/lib/crm/types";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

function kindOf(value: unknown): HotelDeskKind | null {
  return HOTEL_DESK_KINDS.includes(value as HotelDeskKind) ? (value as HotelDeskKind) : null;
}

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => null)) as
    | {
        action?: string;
        itemId?: string;
        kind?: string;
        subject?: string;
        body?: string;
        recipients?: string[];
        cardChoice?: string;
      }
    | null;
  const itemId = (body?.itemId || "").trim();
  const kind = kindOf(body?.kind);
  const action = body?.action;
  if (!itemId || !kind || !action) return jsonError("Action incomplète", 400);
  const admin = createServiceClient();
  const rawChoice = body?.cardChoice;
  const cardChoice: "pliant" | "client" | null = rawChoice === "client" || rawChoice === "pliant" ? rawChoice : null;
  try {
    if (action === "skip") {
      await skipHotelRequest(admin, id, itemId, kind);
      return NextResponse.json({ ok: true });
    }
    if (action === "restore") {
      await restoreHotelRequest(admin, id, itemId, kind);
      return NextResponse.json({ ok: true });
    }
    const letter = {
      bookingId: id,
      itemId,
      kind,
      subject: body?.subject || "",
      body: body?.body || "",
      recipients: Array.isArray(body?.recipients) ? body.recipients : [],
      cardChoice,
    };
    if (action === "save") {
      await saveHotelRequest(admin, letter);
      return NextResponse.json({ ok: true });
    }
    if (action === "send") {
      await sendHotelRequest(admin, letter);
      return NextResponse.json({ ok: true });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Action impossible";
    return jsonError(message, 400);
  }
  return jsonError("Action inconnue", 400);
}
