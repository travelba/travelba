import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { BookingActionError } from "@/lib/crm/archive-booking";
import { duplicateBookingById } from "@/lib/crm/duplicate-booking";
import { stampBookingCreator } from "@/lib/crm/dossier-responsables";
import { createServiceClient } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  try {
    const result = await duplicateBookingById(id);
    await stampBookingCreator(createServiceClient(), {
      bookingId: result.booking.id,
      staffId: auth.staff.id,
      path: `/api/admin/bookings/${id}/duplicate`,
      summary: "Dossier créé par copie d’un autre dossier.",
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Copie impossible";
    const status = err instanceof BookingActionError ? err.status : 400;
    return jsonError(message, status);
  }
}
