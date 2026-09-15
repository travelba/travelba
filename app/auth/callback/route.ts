import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser, ensureStaff } from "@/lib/crm/auth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/mon-compte";
  const supabase = await createClient();

  if (code) {
    await supabase.auth.exchangeCodeForSession(code);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/connexion?error=auth", url.origin));
  }

  await ensureCustomerForUser(user);
  const staff = await ensureStaff(user);
  const dest =
    next.startsWith("/admin") && staff
      ? next
      : next.startsWith("/") && !next.startsWith("//")
        ? next
        : "/mon-compte";
  return NextResponse.redirect(new URL(dest, url.origin));
}
