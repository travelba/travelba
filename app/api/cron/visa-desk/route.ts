import { NextResponse } from "next/server";
import { cronAuthorized, cronSecret } from "@/lib/crm/cron-auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { retryStillDue, shouldCloseCard } from "@/lib/crm/visa-desk";
import { raisePliantLimit } from "@/lib/crm/pliant";

export const runtime = "nodejs";

function authorized(request: Request) {
  return cronAuthorized(request.headers.get("authorization"), cronSecret());
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const supabase = createServiceClient();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const { data: cards } = await supabase
    .from("crm_visa_cards")
    .select("booking_id, pliant_card_id, ceiling_cents, closed_at")
    .is("closed_at", null);
  let closed = 0;
  for (const card of cards || []) {
    const { data: booking } = await supabase
      .from("crm_bookings")
      .select("end_date")
      .eq("id", card.booking_id)
      .maybeSingle();
    const end = (booking as { end_date?: string | null } | null)?.end_date;
    if (!end || !shouldCloseCard(end, now)) continue;
    try {
      await raisePliantLimit(card.pliant_card_id, { value: card.ceiling_cents, currency: "EUR" }, 0);
      await supabase.from("crm_visa_cards").update({ closed_at: now.toISOString() }).eq("booking_id", card.booking_id);
      closed += 1;
    } catch {
      closed += 0;
    }
  }

  const { data: notices } = await supabase
    .from("crm_visa_notices")
    .select("id, booking_id, first_failure_on, attempts, holder_name, country")
    .is("sent_at", null);
  let tasks = 0;
  for (const notice of notices || []) {
    const first = notice.first_failure_on || today;
    if (retryStillDue(first, today)) continue;
    const { data: booking } = await supabase
      .from("crm_bookings")
      .select("reference, customer_id")
      .eq("id", notice.booking_id)
      .maybeSingle();
    if (!booking) continue;
    await supabase.from("crm_visa_tasks").upsert({
      booking_id: notice.booking_id,
      holder_name: notice.holder_name,
      reference: (booking as { reference: string }).reference,
      reasons: ["message"],
    });
    tasks += 1;
  }
  return NextResponse.json({ closed, tasks });
}
