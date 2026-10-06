import { NextResponse } from "next/server";
import { requireCustomer } from "@/lib/crm/auth";
import {
  cleanClientPath,
  clientPathSummary,
  openedStaySummary,
  recordCustomerActivity,
  stayActivityDetail,
  stayDisplayName,
  stayReferenceFromPath,
} from "@/lib/crm/customer-activity";

/** Pages ouvertes et déconnexion. Le libellé est calculé ici, jamais repris du navigateur. */
export async function POST(request: Request) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const body = await request.json().catch(() => null);
  if (body?.action === "sign-out") {
    await recordCustomerActivity({
      customerId: auth.customer.id,
      authUserId: auth.user.id,
      action: "sign-out",
      summary: "S’est déconnecté",
    });
    return NextResponse.json({ ok: true });
  }
  const path = cleanClientPath(body?.path);
  let summary = path ? clientPathSummary(path) : null;
  if (path && summary) {
    const reference = stayReferenceFromPath(path);
    let detail: string | null = null;
    let bookingId: string | null = null;
    if (reference) {
      const { data } = await auth.supabase
        .from("crm_bookings")
        .select("id, title, destination, start_date, end_date")
        .eq("customer_id", auth.customer.id)
        .eq("reference", reference)
        .maybeSingle();
      if (data) {
        bookingId = data.id;
        summary = openedStaySummary(reference, data.title, data.destination);
        detail = stayActivityDetail({
          destination: data.destination,
          title: data.title,
          start: data.start_date,
          end: data.end_date,
          shown: stayDisplayName(data.title, data.destination),
        });
      }
    }
    await recordCustomerActivity({
      customerId: auth.customer.id,
      authUserId: auth.user.id,
      action: "view",
      summary,
      detail,
      path,
      bookingId,
    });
  }
  return NextResponse.json({ ok: true });
}
