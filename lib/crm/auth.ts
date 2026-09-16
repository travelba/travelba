import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import type { CrmCustomer, CrmStaff } from "@/lib/crm/types";

export function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

export async function requireStaff(): Promise<
  | {
      user: User;
      supabase: Awaited<ReturnType<typeof createClient>>;
      staff: CrmStaff;
    }
  | NextResponse
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("Non authentifié", 401);

  const customer = await ensureCustomerForUser(user);
  if (!customer) return jsonError("Compte client introuvable", 403);
  return { user, supabase, customer };
}

export async function getStaffForUser(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("crm_staff")
    .select("*")
    .eq("auth_user_id", userId)
    .maybeSingle();
  return (data as CrmStaff | null) ?? null;
}

export async function ensureStaff(user: User): Promise<CrmStaff | null> {
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("crm_staff")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (existing) return existing as CrmStaff;

  try {
    const admin = createServiceClient();
    const { count } = await admin
      .from("crm_staff")
      .select("id", { count: "exact", head: true });
    if ((count ?? 0) > 0) return null;

    const { data: created, error } = await admin
      .from("crm_staff")
      .insert({
        auth_user_id: user.id,
        role: "admin",
        full_name: user.email?.split("@")[0] || "Agent",
      })
      .select("*")
      .single();
    if (error) return null;
    return created as CrmStaff;
  } catch {
    return null;
  }
}

export async function ensureCustomerForUser(user: User): Promise<CrmCustomer | null> {
  const email = (user.email || "").trim().toLowerCase();
  if (!email) return null;

  try {
    const admin = createServiceClient();
    const { data: byAuth } = await admin
      .from("crm_customers")
      .select("*")
      .eq("auth_user_id", user.id)
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
          .update({ auth_user_id: user.id })
          .eq("id", byEmail.id)
          .select("*")
          .single();
        return (linked as CrmCustomer) || (byEmail as CrmCustomer);
      }
      if (byEmail.auth_user_id === user.id) return byEmail as CrmCustomer;
      return null;
    }

    return null;
  } catch {
    return null;
  }
}

export function isRedirect(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}

/** Guard for App Router admin pages — redirects to /admin/login if needed. */
export async function requireStaffPage(): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: User;
  staff: CrmStaff;
}> {
  const { redirect } = await import("next/navigation");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/admin/login");
  }
  const authedUser = user as User;
  const staff = await ensureStaff(authedUser);
  if (!staff) {
    redirect("/admin/login");
  }
  return { supabase, user: authedUser, staff: staff as CrmStaff };
}
