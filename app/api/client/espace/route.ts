import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { loadEspaceHome } from "@/lib/crm/espace-load";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  try {
    const home = await loadEspaceHome(auth.supabase, auth.customer);
    return NextResponse.json(home, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    console.error("[client/espace]", err instanceof Error ? err.message : "load");
    return jsonError("Espace indisponible", 500);
  }
}
