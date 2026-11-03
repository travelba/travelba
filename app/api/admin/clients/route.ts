import { NextResponse } from "next/server";
import { dbError, jsonError, requireStaff } from "@/lib/crm/auth";
import {
  companiesByCustomer,
  CUSTOMER_PICK_LIMIT,
  CUSTOMER_PICK_SELECT,
  type PickableCustomer,
} from "@/lib/crm/customer-search";
import { CUSTOMER_EMAIL_COPY, customerEmailError, normalizeCustomerEmail } from "@/lib/crm/customer-email";
import { appOrigin, inviteCustomer } from "@/lib/crm/invite";
import type { CrmCustomer } from "@/lib/crm/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const url = new URL(request.url);
  const pickOnly = url.searchParams.get("pick") === "1";
  if (pickOnly) {
    const { data, error } = await auth.supabase
      .from("crm_customers")
      .select(CUSTOMER_PICK_SELECT)
      .order("last_name", { ascending: true })
      .limit(CUSTOMER_PICK_LIMIT);
    if (error) return dbError(error, 500);
    const customers = (data || []) as PickableCustomer[];
    const ids = customers.map((row) => row.id);
    const companyRows = ids.length
      ? await auth.supabase.from("crm_billing_companies").select("customer_id, company_name").in("customer_id", ids)
      : { data: [] };
    const byCustomer = companiesByCustomer((companyRows.data || []) as { customer_id: string; company_name: string | null }[]);
    return NextResponse.json({
      customers: customers.map((row) => ({ ...row, companies: byCustomer.get(row.id) || [] })),
    });
  }
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
  const rawEmail = String(body?.email || "").trim();
  const email = rawEmail ? normalizeCustomerEmail(rawEmail) : null;
  const firstName = String(body?.first_name || "").trim();
  const lastName = String(body?.last_name || "").trim();
  if (!firstName || !lastName) return jsonError("Prénom et nom requis");
  if (email) {
    const invalid = customerEmailError(email);
    if (invalid) return jsonError(invalid);
    const { data: taken, error: takenError } = await auth.supabase
      .from("crm_customers")
      .select("id")
      .eq("email", email)
      .limit(1);
    if (takenError) return dbError(takenError, 400);
    if (taken?.length) return jsonError(CUSTOMER_EMAIL_COPY.taken);
  }
  const { data, error } = await auth.supabase
    .from("crm_customers")
    .insert({
      email,
      first_name: firstName,
      last_name: lastName,
      phone: body?.phone || null,
      language: "fr",
    })
    .select("*")
    .single();
  if (error) return dbError(error, 400);
  const customer = data as CrmCustomer;
  if (!body?.invite || !customer.email) {
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
