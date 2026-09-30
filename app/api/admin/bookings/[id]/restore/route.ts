import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { BookingActionError, restoreBookingById } from "@/lib/crm/archive-booking";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  try {
    const result = await restoreBookingById(id);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Réactivation impossible";
    const status = err instanceof BookingActionError ? err.status : 400;
    return jsonError(message, status);
  }
}
