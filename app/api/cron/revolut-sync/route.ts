import { NextResponse } from "next/server";
import { fetchRevolutTransactions, upsertRevolutInbox } from "@/lib/crm/revolut";

export const runtime = "nodejs";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const header = request.headers.get("authorization") || "";
  if (secret) return header === `Bearer ${secret}`;
  // Vercel Cron sets this on scheduled invocations when CRON_SECRET is unset.
  return Boolean(request.headers.get("x-vercel-cron-schedule"));
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const from = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const txs = await fetchRevolutTransactions(from);
  const inserted = await upsertRevolutInbox(txs);
  return NextResponse.json({ fetched: txs.length, inserted });
}
