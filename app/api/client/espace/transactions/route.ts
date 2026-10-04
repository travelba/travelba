import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { loadEspaceTransactions } from "@/lib/crm/espace-load";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  try {
    const view = await loadEspaceTransactions(auth.supabase, auth.customer);
    return NextResponse.json(view, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    console.error("[client/espace/transactions]", err instanceof Error ? err.message : "load");
    return jsonError("Transactions indisponibles", 500);
  }
}
