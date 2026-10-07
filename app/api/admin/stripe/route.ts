import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { getStripe } from "@/lib/crm/stripe";
import { syncStripeInbox } from "@/lib/crm/stripe-sync";
import { createServiceClient } from "@/lib/supabase/admin";
import type { CrmStripeTransaction } from "@/lib/crm/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET() {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("crm_stripe_transactions")
    .select("*")
    .eq("direction", "credit")
    .order("booked_at", { ascending: false, nullsFirst: false })
    .limit(200);
  if (error) return jsonError("Lecture impossible", 500);
  return NextResponse.json({ transactions: data as CrmStripeTransaction[] });
}

export async function POST(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const body = await request.json().catch(() => ({}));
  if (body?.action !== "sync") return jsonError("Action inconnue");
  if (!getStripe()) return jsonError("Stripe n’est pas ouvert", 503);
  try {
    const result = await syncStripeInbox(createServiceClient());
    return NextResponse.json(result);
  } catch (err) {
    console.error("[stripe] sync", err instanceof Error ? err.message : "sync");
    return jsonError("Synchronisation Stripe impossible. Réessayez.", 502);
  }
}
