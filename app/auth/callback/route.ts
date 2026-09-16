import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser, ensureStaff } from "@/lib/crm/auth";
import { safeInternalRedirect } from "@/lib/safe-redirect";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeInternalRedirect(
    url.searchParams.get("next"),
    ["/mon-compte", "/admin"],
    "/mon-compte"
  );
  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(new URL("/connexion?error=auth", url.origin));
    }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/connexion?error=auth", url.origin));
  }

  if (next === "/admin" || next.startsWith("/admin/")) {
    const staff = await ensureStaff(user);
    return NextResponse.redirect(
      new URL(staff ? next : "/admin/login?error=staff", url.origin)
    );
  }

  const customer = await ensureCustomerForUser(user);
  return NextResponse.redirect(
    new URL(customer ? next : "/connexion?error=account", url.origin)
  );
}
