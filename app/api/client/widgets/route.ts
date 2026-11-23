import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { loadClientWidgetSnapshot } from "@/lib/crm/widget-snapshot-load";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Résumé compact du prochain séjour visible, pour les widgets de l’application. */
export async function GET() {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  try {
    const snapshot = await loadClientWidgetSnapshot({ supabase: auth.supabase, customer: auth.customer });
    return NextResponse.json(snapshot, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return jsonError("Le résumé n’a pas pu être lu.", 500);
  }
}
