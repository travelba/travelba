import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import type { CrmCustomer } from "@/lib/crm/types";

export async function GET() {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { data, error } = await auth.supabase
    .from("crm_customers")
    .select("*")
    .order("last_name", { ascending: true });
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ customers: data as CrmCustomer[] });
}

export async function POST(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const body = await request.json().catch(() => null);
  const email = String(body?.email || "")
    .trim()
    .toLowerCase();
  if (!email) return jsonError("Email requis");
  const { data, error } = await auth.supabase
    .from("crm_customers")
    .insert({
      email,
      first_name: String(body?.first_name || "").trim(),
      last_name: String(body?.last_name || "").trim(),
      phone: body?.phone || null,
      whatsapp: body?.whatsapp || null,
      language: "fr",
    })
    .select("*")
    .single();
  if (error) return jsonError(error.message, 400);
  return NextResponse.json({ customer: data });
}
