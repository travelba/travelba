import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";

type Ctx = { params: Promise<{ bookingId: string }> };

export async function POST(_request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { bookingId } = await ctx.params;
  const { error } = await auth.supabase
    .from("crm_visa_tasks")
    .update({ done_at: new Date().toISOString() })
    .eq("booking_id", bookingId)
    .is("done_at", null);
  if (error) return jsonError(error.message, 400);
  return NextResponse.redirect(new URL("/admin", _request.url), 303);
}
