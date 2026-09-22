import { NextResponse } from "next/server";
import { dbError, jsonError, requireStaff } from "@/lib/crm/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  exchangeRevolutAuthCode,
  fetchRevolutTransactions,
  upsertRevolutInbox,
} from "@/lib/crm/revolut";
import { autoMatchUnmatchedRevolut } from "@/lib/crm/revolut-match";
import type { CrmRevolutTransaction } from "@/lib/crm/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const KNOWN_REVOLUT_ERRORS = [
  "Revolut n’est pas configuré",
  "Revolut n’est pas connecté",
  "Refresh token Revolut manquant",
];

function revolutErrorMessage(err: unknown, fallback: string) {
  const message = err instanceof Error ? err.message : "";
  return KNOWN_REVOLUT_ERRORS.includes(message) ? message : fallback;
}

export async function GET() {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("crm_revolut_transactions")
    .select("*")
    .order("booked_at", { ascending: false, nullsFirst: false })
    .limit(200);
  if (error) return dbError(error, 500);
  return NextResponse.json({ transactions: data as CrmRevolutTransaction[] });
}

export async function POST(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const body = await request.json().catch(() => ({}));
  if (body?.action === "exchange" && body.code) {
    try {
      await exchangeRevolutAuthCode(String(body.code));
    } catch (err) {
      console.error("[revolut] exchange:", err);
      return jsonError(revolutErrorMessage(err, "Connexion Revolut impossible. Réessayez."), 502);
    }
    return NextResponse.json({ ok: true });
  }
  if (body?.action === "sync") {
    try {
      const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const txs = await fetchRevolutTransactions(from);
      const inserted = await upsertRevolutInbox(txs);
      const auto = await autoMatchUnmatchedRevolut();
      return NextResponse.json({
        fetched: txs.length,
        inserted,
        auto_matched: auto.matched,
      });
    } catch (err) {
      console.error("[revolut] sync:", err);
      return jsonError(
        revolutErrorMessage(err, "Synchronisation Revolut impossible. Réessayez."),
        502
      );
    }
  }
  return jsonError("Action inconnue");
}
