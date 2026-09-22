import { NextResponse } from "next/server";
import { dbError, jsonError, requireStaff } from "@/lib/crm/auth";
import { billingParentError, parseCompanyRole } from "@/lib/crm/company-role";
import { emptyToNull } from "@/lib/crm/identity";
import { appOrigin, inviteCustomer } from "@/lib/crm/invite";
import type { CompanyRole, CrmCustomer } from "@/lib/crm/types";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { data, error } = await auth.supabase
    .from("crm_customers")
    .select("*")
    .order("last_name", { ascending: true });
  if (error) return dbError(error, 500);
  return NextResponse.json({ customers: data as CrmCustomer[] });
}

export async function POST(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const body = await request.json().catch(() => null);
  const email = String(body?.email || "")
    .trim()
    .toLowerCase();
  const firstName = String(body?.first_name || "").trim();
  const lastName = String(body?.last_name || "").trim();
  if (!email) return jsonError("Email requis");
  if (!firstName || !lastName) return jsonError("Prénom et nom requis");
  const companyRole = parseCompanyRole(body?.company_role);
  const billingParentId = body?.billing_parent_id ? String(body.billing_parent_id) : null;
  let parentRole: CompanyRole | null | undefined;
  let parentFound: boolean | undefined;
  if (billingParentId) {
    const { data: parent } = await auth.supabase
      .from("crm_customers")
      .select("id, company_role")
      .eq("id", billingParentId)
      .maybeSingle();
    parentFound = Boolean(parent);
    parentRole = (parent?.company_role as CompanyRole | null) || null;
  }
  const parentError = billingParentError({
    selfId: "",
    role: companyRole,
    parentId: billingParentId,
    parentFound,
    parentRole,
  });
  if (parentError) return jsonError(parentError);
  const { data, error } = await auth.supabase
    .from("crm_customers")
    .insert({
      email,
      first_name: firstName,
      last_name: lastName,
      phone: body?.phone || null,
      language: "fr",
      company_role: companyRole,
      billing_parent_id: billingParentId,
      company_name: emptyToNull(body?.company_name),
    })
    .select("*")
    .single();
  if (error) return dbError(error, 400);
  const customer = data as CrmCustomer;
  if (!body?.invite) {
    return NextResponse.json({ customer, invited: false });
  }
  try {
    const result = await inviteCustomer(customer, appOrigin(request));
    return NextResponse.json({
      customer: result.customer,
      invited: result.delivered,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invitation impossible";
    return NextResponse.json({
      customer,
      invited: false,
      inviteError: message,
    });
  }
}
