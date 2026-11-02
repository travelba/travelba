import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { saveRestaurant } from "@/lib/crm/restaurants-db";

export async function POST(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError("Requête illisible.");
  const saved = await saveRestaurant(auth.supabase, body);
  if ("error" in saved) return jsonError(saved.error || "Enregistrement impossible.");
  return NextResponse.json(saved);
}
