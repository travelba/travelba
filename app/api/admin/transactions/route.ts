import { NextResponse } from "next/server";
import { dbError, jsonError, requireStaff } from "@/lib/crm/auth";

export async function GET() {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { data, error } = await auth.supabase
    .from("crm_transactions")
    .select("*")
    .order("occurred_on", { ascending: false })
    .limit(500);
  if (error) return dbError(error, 500);
  return NextResponse.json({ transactions: data });
}

export async function POST(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const body = await request.json().catch(() => null);
  const customerId = String(body?.customer_id || "");
  const amount = Number(body?.amount || 0);
  if (!customerId || !(amount > 0)) return jsonError("Client et montant requis");
  const { data, error } = await auth.supabase
    .from("crm_transactions")
    .insert({
      customer_id: customerId,
      booking_id: body?.booking_id || null,
      direction: body?.direction === "credit" ? "credit" : "debit",
      kind: body?.kind || "adjustment",
      amount,
      currency: body?.currency || "EUR",
      occurred_on: body?.occurred_on || undefined,
      label: String(body?.label || "").trim() || "Écriture manuelle",
      source: "manual",
      status: "posted",
    })
    .select("*")
    .single();
  if (error) return dbError(error, 400);
  return NextResponse.json({ transaction: data });
}
