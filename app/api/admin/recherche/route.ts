import { NextResponse } from "next/server";
import { dbError, requireStaff } from "@/lib/crm/auth";
import type { DbErrorLike } from "@/lib/crm/db-error";
import { loadOmnibar } from "@/lib/crm/omnibar";

export const runtime = "nodejs";

/** Suggestions de la barre : staff seulement, fonction SQL indexée. */
export async function GET(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const q = new URL(request.url).searchParams.get("q") || "";
  try {
    return NextResponse.json(await loadOmnibar(auth.supabase, q));
  } catch (error) {
    return dbError(error as DbErrorLike, 500);
  }
}
