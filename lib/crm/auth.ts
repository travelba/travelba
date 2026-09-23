import { cache } from "react";
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import type { CrmCustomer, CrmStaff } from "@/lib/crm/types";
import { isStaffRole } from "@/lib/crm/session";
import { dbErrorMessage, type DbErrorLike } from "@/lib/crm/db-error";
import { issuesSummary, type BookingIssue } from "@/lib/crm/booking-issues";

/** Mémo request-scoped (pas Cache Components) : layout + requireStaffPage partagent getUser. */
export const getSessionUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
});

export function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

export function jsonIssues(issues: BookingIssue[], status = 400, message?: string) {
  return NextResponse.json(
    { error: message || issuesSummary(issues) || "Opération impossible", issues },
    { status }
  );
}

export function dbError(error: DbErrorLike, status = 400, fallback?: string) {
  console.error("[crm] db:", error?.code ?? "?", error?.message ?? "");
  return jsonError(dbErrorMessage(error, fallback), status);
}

export async function requireStaff(): Promise<
  | {
      user: User;
      supabase: Awaited<ReturnType<typeof createClient>>;
      staff: CrmStaff;
    }
  | NextResponse
> {
  const { supabase, user } = await getSessionUser();
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
  const { supabase, user } = await getSessionUser();
  if (!user) return jsonError("Non authentifié", 401);

  const customer = await ensureCustomerForUser(user);
  if (!customer) return jsonError("Compte client introuvable", 403);
  return { user, supabase, customer };
}

export const getStaffForUser = cache(async (userId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("crm_staff")
    .select("*")
    .eq("auth_user_id", userId)
    .maybeSingle();
  return (data as CrmStaff | null) ?? null;
});

export async function ensureStaff(user: User): Promise<CrmStaff | null> {
  const existing = await getStaffForUser(user.id);
  if (existing) {
    await stampStaffRole(user, existing.role);
    return existing;
  }

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
    const staff = created as CrmStaff;
    await stampStaffRole(user, staff.role);
    return staff;
  } catch {
    return null;
  }
}

async function stampStaffRole(user: User, role: CrmStaff["role"]) {
  if (isStaffRole(user)) return;
  const crmRole = role === "agent" ? "agent" : "admin";
  try {
    const admin = createServiceClient();
    await admin.auth.admin.updateUserById(user.id, {
      app_metadata: {
        ...(user.app_metadata || {}),
        crm_role: crmRole,
      },
    });
  } catch {
    /* JWT is refreshed on the next sign-in; crm_staff remains the source of truth. */
  }
}

export const ensureCustomerForUser = cache(async (user: User): Promise<CrmCustomer | null> => {
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
});

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
  const { supabase, user } = await getSessionUser();
  if (!user) {
    redirect("/admin/login");
  }
  const authedUser = user as User;
  const staff = await ensureStaff(authedUser);
  if (!staff) {
    const customer = await ensureCustomerForUser(authedUser);
    redirect(customer ? "/mon-compte" : "/connexion?error=no-account");
  }
  return { supabase, user: authedUser, staff: staff as CrmStaff };
}
