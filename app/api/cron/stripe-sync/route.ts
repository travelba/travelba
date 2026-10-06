import { NextResponse } from "next/server";
import { cronAuthorized, cronSecret } from "@/lib/crm/cron-auth";
import { getStripe } from "@/lib/crm/stripe";
import { syncStripeInbox } from "@/lib/crm/stripe-sync";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!cronAuthorized(request.headers.get("authorization"), cronSecret())) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  if (!getStripe()) {
    return NextResponse.json({ skipped: true, reason: "not_configured" });
  }
  try {
    const result = await syncStripeInbox(createServiceClient());
    return NextResponse.json(result);
  } catch (err) {
    console.error("[cron/stripe-sync]", err instanceof Error ? err.message : "sync");
    return NextResponse.json({ error: "Synchronisation Stripe échouée" }, { status: 502 });
  }
}
