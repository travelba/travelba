import { cache } from "react";
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import type { CrmCustomer, CrmStaff } from "@/lib/crm/types";

export function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

/** One auth round-trip per request (layout + page + API helpers). */
const getRequestAuth = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
});

const getStaffCached = cache(async (userId: string) => {
  const { supabase } = await getRequestAuth();
  const { data } = await supabase
    .from("crm_staff")
    .select("*")
    .eq("auth_user_id", userId)
    .eq("active", true)
    .maybeSingle();
  return (data as CrmStaff | null) ?? null;
});

const getCustomerCached = cache(async (userId: string, email: string) => {
  try {
    const admin = createServiceClient();
    const { data: byAuth } = await admin
      .from("crm_customers")
      .select("*")
      .eq("auth_user_id", userId)
      .maybeSingle();
    if (byAuth) return byAuth as CrmCustomer;

    const { data: byEmail } = await admin
      .from("crm_customers")
      .select("*")
      .eq("email", email)
      .maybeSingle();

    if (byEmail) {
      if (!byEmail.auth_user_id) {
        const { data: linked } = await admin
          .from("crm_customers")
          .update({ auth_user_id: userId })
          .eq("id", byEmail.id)
          .select("*")
          .single();
        return (linked as CrmCustomer) || (byEmail as CrmCustomer);
      }
      if (byEmail.auth_user_id === userId) return byEmail as CrmCustomer;
      return null;
    }

    // Customer records are provisioned by the agency. Public authentication
    // must never create arbitrary CRM customers.
    return null;
  } catch (err) {
    console.error("[crm/auth] ensureCustomerForUser:", err);
    return null;
  }
});

export async function requireStaff(): Promise<
  | {
      user: User;
      supabase: Awaited<ReturnType<typeof createClient>>;
      staff: CrmStaff;
    }
  | NextResponse
> {
  const { supabase, user } = await getRequestAuth();
  if (!user) return jsonError("Non authentifié", 401);

  const staff = await ensureStaff(user);
  if (!staff) return jsonError("Accès réservé à l’agence", 403);
  return { user, supabase, staff };
}

export async function requireCustomer(): Promise<
  | {
      user: User;
      supabase: Awaited<ReturnType<typeof createClient>>;
      customer: CrmCustomer;
    }
  | NextResponse
> {
  const { supabase, user } = await getRequestAuth();
  if (!user) return jsonError("Non authentifié", 401);

  const customer = await ensureCustomerForUser(user);
  if (!customer) return jsonError("Compte client introuvable", 403);
  return { user, supabase, customer };
}

export async function getStaffForUser(userId: string) {
  return getStaffCached(userId);
}

export async function ensureStaff(user: User): Promise<CrmStaff | null> {
  return getStaffCached(user.id);
}

export async function ensureCustomerForUser(user: User): Promise<CrmCustomer | null> {
  const email = (user.email || "").trim().toLowerCase();
  if (!email) return null;
  return getCustomerCached(user.id, email);
}

export function isRedirect(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}

/** Guard for App Router client pages — redirects to /connexion if needed. */
export async function requireCustomerPage(): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: User;
  customer: CrmCustomer;
}> {
  const { redirect } = await import("next/navigation");
  const { supabase, user } = await getRequestAuth();
  if (!user) redirect("/connexion");
  const authedUser = user as User;
  const customer = await ensureCustomerForUser(authedUser);
  if (!customer) redirect("/connexion?error=account");
  return { supabase, user: authedUser, customer: customer as CrmCustomer };
}

/** Guard for App Router admin pages — redirects to /admin/login if needed. */
export async function requireStaffPage(
  capability?: keyof CrmStaff["permissions"] | "admin"
): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: User;
  staff: CrmStaff;
}> {
  const { redirect } = await import("next/navigation");
  const { supabase, user } = await getRequestAuth();
  if (!user) {
    redirect("/admin/login");
  }
  const authedUser = user as User;
  const staff = await ensureStaff(authedUser);
  if (!staff) {
    redirect("/admin/login");
  }
  const authedStaff = staff as CrmStaff;
  if (
    capability &&
    authedStaff.role !== "admin" &&
    (capability === "admin" || authedStaff.permissions?.[capability] !== true)
  ) {
    redirect("/admin");
  }
  return { supabase, user: authedUser, staff: authedStaff };
}
