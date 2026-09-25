import { NextResponse } from "next/server";
import { dbError, jsonError, requireCustomer } from "@/lib/crm/auth";
import { saveCustomerBillingCompanies } from "@/lib/crm/billing-companies";
import { isCompanyMember } from "@/lib/crm/company-role";
import { customerPatchFromBody } from "@/lib/crm/customer-patch";

export async function PATCH(request: Request) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const body = await request.json().catch(() => ({}));
  const { patch, error: patchError } = customerPatchFromBody(body, {
    strictPhones: true,
    requirePhone: true,
  });
  if (patchError) return jsonError(patchError);
  // Rôle société / payeur : réservé à l’agence.
  delete patch.company_role;
  delete patch.billing_parent_id;
  const { data, error } = await auth.supabase
    .from("crm_customers")
    .update(patch)
    .eq("id", auth.customer.id)
    .select("*")
    .single();
  if (error) return dbError(error, 400);
  if ("billing_companies" in body) {
    if (isCompanyMember(auth.customer)) {
      return jsonError("Pour modifier la facturation société, contactez l’agence.");
    }
    const saved = await saveCustomerBillingCompanies(
      auth.supabase,
      auth.customer.id,
      body.billing_companies
    );
    if ("error" in saved) return jsonError(saved.error);
  }
  return NextResponse.json({ customer: data });
}
