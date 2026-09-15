import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";
import { ensureStaff } from "@/lib/crm/auth";

export async function requireAdminUser(): Promise<
  { user: User; supabase: Awaited<ReturnType<typeof createClient>> } | NextResponse
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  const staff = await ensureStaff(user);
  if (
    !staff ||
    !staff.active ||
    (staff.role !== "admin" && staff.permissions?.mtrip !== true)
  ) {
    return NextResponse.json({ error: "Accès réservé à l’agence" }, { status: 403 });
  }

  return { user, supabase };
}

export function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}
