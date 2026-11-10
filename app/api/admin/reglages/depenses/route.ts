import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/crm/auth";
import { parseExpensePresetDrafts } from "@/lib/crm/expense-presets";
import { ExpensePresetError, saveExpensePresets } from "@/lib/crm/expense-presets-db";
import { createServiceClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const parsed = parseExpensePresetDrafts(await request.json().catch(() => null));
  if ("error" in parsed) return jsonError(parsed.error, 400);
  try {
    const presets = await saveExpensePresets(createServiceClient(), parsed.presets, auth.staff.id);
    return NextResponse.json({ ok: true, presets });
  } catch (error) {
    if (error instanceof ExpensePresetError) return jsonError(error.message, 400);
    return jsonError("Le réglage n’a pas été enregistré.", 400);
  }
}
