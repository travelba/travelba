import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  exchangeRevolutAuthCode,
  fetchRevolutTransactions,
  upsertRevolutInbox,
} from "@/lib/crm/revolut";
import type { CrmRevolutTransaction } from "@/lib/crm/types";

export async function GET() {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("crm_revolut_transactions")
    .select("*")
    .order("booked_at", { ascending: false, nullsFirst: false })
    .limit(200);
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ transactions: data as CrmRevolutTransaction[] });
}

export async function POST(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const body = await request.json().catch(() => ({}));
  if (body?.action === "exchange" && body.code) {
    await exchangeRevolutAuthCode(String(body.code));
    return NextResponse.json({ ok: true });
  }
  if (body?.action === "sync") {
    const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const txs = await fetchRevolutTransactions(from);
    const inserted = await upsertRevolutInbox(txs);
    return NextResponse.json({ fetched: txs.length, inserted });
  }
  return jsonError("Action inconnue");
}
