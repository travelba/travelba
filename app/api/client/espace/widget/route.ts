import { NextResponse } from "next/server";
import { requireCustomer } from "@/lib/crm/auth";
import { loadEspaceHome } from "@/lib/crm/espace-load";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const home = await loadEspaceHome(auth.supabase, auth.customer);
  return NextResponse.json(
    { widget: home.widget, liveActivity: home.liveActivity },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
