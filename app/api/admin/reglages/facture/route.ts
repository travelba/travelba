import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/crm/auth";
import { parseInvoiceSettings } from "@/lib/crm/invoice-settings";
import { createServiceClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const parsed = parseInvoiceSettings(await request.json().catch(() => null));
  if ("error" in parsed) return jsonError(parsed.error, 400);
  const admin = createServiceClient();
  const { error } = await admin.from("crm_invoice_settings").upsert({
    id: 1,
    iban: parsed.iban,
    bic: parsed.bic,
    account_holder: parsed.holder,
    due_days: parsed.dueDays,
    updated_by: auth.staff.id,
    updated_at: new Date().toISOString(),
  });
  if (error) return jsonError("Le réglage n’a pas été enregistré.", 400);
  return NextResponse.json({ ok: true });
}
