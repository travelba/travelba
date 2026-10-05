import { NextResponse } from "next/server";
import { parseBody, patchCustomerSchema } from "@/lib/crm/admin-schemas";
import { dbError, jsonError, requireAdmin, requireStaff } from "@/lib/crm/auth";
import { saveCustomerBillingCompanies } from "@/lib/crm/billing-companies";
import { CUSTOMER_EMAIL_COPY, otherCustomerEmailBlock } from "@/lib/crm/customer-email";
import { customerPatchFromBody } from "@/lib/crm/customer-patch";
import { customerDeleteConfirmed, DELETE_CUSTOMER_CONFIRM_ERROR } from "@/lib/crm/delete-confirm";
import { CustomerDeleteError, deleteCustomerById } from "@/lib/crm/delete-customer";
import { customerFullName } from "@/lib/crm/types";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const { data, error } = await auth.supabase
    .from("crm_customers")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return dbError(error, 500);
  if (!data) return jsonError("Client introuvable", 404);
  return NextResponse.json({ customer: data });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const flags = parseBody(patchCustomerSchema, body);
  if (flags.error !== null) return jsonError(flags.error, 400);
  const { patch, error: patchError } = customerPatchFromBody(body, { allowEmail: true });
  if (patchError) return jsonError(patchError);
  if (flags.data.on_hold !== undefined) patch.on_hold = flags.data.on_hold;

  const { data: current } = await auth.supabase
    .from("crm_customers")
    .select("company_role, billing_parent_id, email, auth_user_id")
    .eq("id", id)
    .maybeSingle();
  if (!current) return jsonError("Client introuvable", 404);

  if ("email" in patch) {
    const email = String(patch.email || "");
    const admin = createServiceClient();
    const { data: matches } = await admin.from("crm_customers").select("id").eq("email", email);
    const taken = otherCustomerEmailBlock({
      customerId: id,
      matches: (matches || []) as { id: string }[],
    });
    if (taken) return jsonError(taken);
    if (current.auth_user_id && current.email !== email) {
      const { error: authError } = await admin.auth.admin.updateUserById(current.auth_user_id, {
        email,
        email_confirm: true,
      });
      if (authError) {
        const message = /already|exists|registered|duplicate/i.test(authError.message || "")
          ? CUSTOMER_EMAIL_COPY.taken
          : CUSTOMER_EMAIL_COPY.auth;
        return jsonError(message);
      }
    }
  }

  const nextRole =
    "company_role" in patch ? (patch.company_role as string | null) : current.company_role;
  const nextParent =
    "billing_parent_id" in patch
      ? (patch.billing_parent_id as string | null)
      : current.billing_parent_id;
  if (nextRole === "member") {
    if (!nextParent) {
      return jsonError("Choisissez l’admin société qui paie pour ce collaborateur.");
    }
    if (nextParent === id) {
      return jsonError("Le payeur ne peut pas être le collaborateur lui-même.");
    }
    const { data: parent } = await auth.supabase
      .from("crm_customers")
      .select("id, company_role")
      .eq("id", nextParent)
      .maybeSingle();
    if (!parent) return jsonError("Admin société introuvable.");
    if (parent.company_role !== "admin") {
      return jsonError("Le payeur doit être un client en rôle « Admin société ».");
    }
  }

  // email, iban, company_role, billing_parent_id, on_hold : hors des grants par colonne
  // du rôle authenticated (B-15). Le staff est déjà vérifié : écriture avec le service role.
  const { data, error } = await createServiceClient()
    .from("crm_customers")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return dbError(error, 400);
  if (flags.data.billing_companies) {
    const saved = await saveCustomerBillingCompanies(auth.supabase, id, flags.data.billing_companies);
    if ("error" in saved) return jsonError(saved.error);
    return NextResponse.json({ customer: data, billing_companies: saved.companies });
  }
  return NextResponse.json({ customer: data });
}

/** Suppression définitive : administrateurs seulement, nom complet du client saisi en confirmation. */
export async function DELETE(request: Request, ctx: Ctx) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => null)) as { confirm?: unknown } | null;
  const { data: customer } = await auth.supabase
    .from("crm_customers")
    .select("first_name, last_name")
    .eq("id", id)
    .maybeSingle();
  if (!customer) return jsonError("Client introuvable", 404);
  if (!customerDeleteConfirmed(body?.confirm, customerFullName(customer))) {
    return jsonError(DELETE_CUSTOMER_CONFIRM_ERROR, 400);
  }
  try {
    const result = await deleteCustomerById(id);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Suppression impossible";
    const status = err instanceof CustomerDeleteError ? err.status : 400;
    return jsonError(message, status);
  }
}
