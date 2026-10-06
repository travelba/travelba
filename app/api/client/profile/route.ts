import { NextResponse } from "next/server";
import { dbError, jsonError, requireCustomer } from "@/lib/crm/auth";
import { saveCustomerBillingCompanies } from "@/lib/crm/billing-companies";
import { isCompanyMember } from "@/lib/crm/company-role";
import { customerPatchFromBody } from "@/lib/crm/customer-patch";
import { profileActivityDetail, profileActivitySummary, recordCustomerActivity } from "@/lib/crm/customer-activity";
import { createServiceClient } from "@/lib/supabase/admin";

export async function PATCH(request: Request) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const body = await request.json().catch(() => ({}));
  const { patch, error: patchError } = customerPatchFromBody(body, {
    strictPhones: true,
    requirePhone: true,
  });
  if (patchError) return jsonError(patchError);
  const ibanTouched = "iban" in patch;
  // Rôle société / payeur : réservé à l’agence.
  delete patch.company_role;
  delete patch.billing_parent_id;
  // L’IBAN n’est pas dans les grants par colonne du rôle authenticated (B-15) :
  // le titulaire est déjà vérifié, on l’écrit avec le service role, sur sa seule fiche.
  if ("iban" in patch) {
    const { error: ibanError } = await createServiceClient()
      .from("crm_customers")
      .update({ iban: patch.iban })
      .eq("id", auth.customer.id);
    if (ibanError) return dbError(ibanError, 400);
    delete patch.iban;
  }
  const { data, error } = Object.keys(patch).length
    ? await auth.supabase
        .from("crm_customers")
        .update(patch)
        .eq("id", auth.customer.id)
        .select("*")
        .single()
    : await auth.supabase.from("crm_customers").select("*").eq("id", auth.customer.id).single();
  if (error) return dbError(error, 400);
  await recordCustomerActivity({
    customerId: auth.customer.id,
    authUserId: auth.user.id,
    action: "profile",
    summary: profileActivitySummary(
      [...Object.keys(patch), ...(ibanTouched ? ["iban"] : [])],
      "billing_companies" in body
    ),
    detail: profileActivityDetail(patch, ibanTouched),
  });
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
    return NextResponse.json({ customer: data, billing_companies: saved.companies });
  }
  return NextResponse.json({ customer: data });
}
