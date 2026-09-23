import { NextResponse } from "next/server";
import { dbError, jsonError, requireStaff } from "@/lib/crm/auth";
import { parseMoney } from "@/lib/crm/money";

export async function GET() {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { data, error } = await auth.supabase
    .from("crm_transactions")
    .select("*")
    .eq("kind", "transfer")
    .eq("direction", "credit")
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
  const amount = parseMoney(body?.amount) ?? 0;
  if (!customerId || !(amount > 0)) return jsonError("Client et montant requis");
  const wantsOtherKind = Boolean(body?.kind) && body.kind !== "transfer";
  const wantsDebit = body?.direction === "debit";
  if (wantsOtherKind || wantsDebit) {
    return jsonError("L’espace agence n’enregistre que les virements crédit.");
  }
  const { data, error } = await auth.supabase
    .from("crm_transactions")
    .insert({
      customer_id: customerId,
      booking_id: body?.booking_id || null,
      direction: "credit",
      kind: "transfer",
      amount,
      currency: body?.currency || "EUR",
      occurred_on: body?.occurred_on || undefined,
      label: String(body?.label || "").trim() || "Virement manuel",
      source: "manual",
      status: "posted",
    })
    .select("*")
    .single();
  if (error) return dbError(error, 400);
  return NextResponse.json({ transaction: data });
}
