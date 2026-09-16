import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import {
  collectIngestFiles,
  extractBookingFromFiles,
  matchCustomerId,
} from "@/lib/crm/ingest-booking";
import type { CrmCustomer } from "@/lib/crm/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  try {
    const form = await request.formData();
    const files = collectIngestFiles(form);
    const extract = await extractBookingFromFiles(files);
    const { data: customers } = await auth.supabase
      .from("crm_customers")
      .select("*");
    const suggested_customer_id = matchCustomerId(
      (customers || []) as CrmCustomer[],
      extract
    );
    return NextResponse.json({ extract, suggested_customer_id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lecture impossible";
    return jsonError(message, 400);
  }
}
