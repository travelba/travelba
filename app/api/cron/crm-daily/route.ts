import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const { data, error } = await createServiceClient().rpc(
    "crm_run_daily_operations"
  );
  if (error) {
    console.error("CRM daily operations failed", error.message);
    return NextResponse.json(
      { error: "Actualisation CRM impossible" },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, tasks_refreshed: data });
}
