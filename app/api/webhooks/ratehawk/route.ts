import { NextResponse } from "next/server";
import { safeConfig } from "@/lib/crm/ratehawk/config";
import { decideWebhook, mergeWebhook } from "@/lib/crm/ratehawk/machine";
import { redact } from "@/lib/crm/ratehawk/redact";
import { ratehawkDb } from "@/lib/crm/ratehawk/store";
import { secretEquals } from "@/lib/crm/secret-equals";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  const config = safeConfig();
  if (!config?.webhookToken) {
    return NextResponse.json({ error: "Webhook fermé." }, { status: 503 });
  }
  const header = request.headers.get("authorization") || "";
  if (!secretEquals(header, `Bearer ${config.webhookToken}`)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as { data?: { partner_order_id?: string; status?: string }; partner_order_id?: string; status?: string } | null;
  const data = body?.data || body;
  const partnerOrderId = data?.partner_order_id;
  if (!partnerOrderId) return NextResponse.json({ error: "partner_order_id" }, { status: 400 });
  const signal = decideWebhook(data?.status);
  try {
    const supabase = ratehawkDb();
    const { data: row } = await supabase.from("crm_ratehawk_bookings").select("status").eq("partner_order_id", partnerOrderId).maybeSingle();
    const current = row?.status;
    if (current === "in_progress" || current === "success" || current === "failed" || current === "cancelled") {
      const merged = mergeWebhook(current, signal);
      await supabase
        .from("crm_ratehawk_bookings")
        .update({ status: merged.status, webhook_status: merged.webhook_status, webhook_payload: redact(body, [config.webhookToken]) })
        .eq("partner_order_id", partnerOrderId);
    } else {
      await supabase
        .from("crm_ratehawk_bookings")
        .update({ webhook_status: signal, webhook_payload: redact(body, [config.webhookToken]) })
        .eq("partner_order_id", partnerOrderId);
    }
  } catch {
    return NextResponse.json({ ok: true, stored: false });
  }
  return NextResponse.json({ ok: true });
}
