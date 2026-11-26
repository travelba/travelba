import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { recordQualityBatch, type QualityWriter } from "@/lib/crm/concierge-quality-record";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Enregistre un passage du routeur sur les dossiers fictifs. Aucun message ne part. */
export async function POST() {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  try {
    const result = await recordQualityBatch(auth.supabase as unknown as QualityWriter);
    if (result.pending) {
      return jsonError("Les scénarios s’enregistrent après la migration. Rien n’a été écrit.", 409);
    }
    if (result.error) return jsonError(result.error, 500);
    return NextResponse.json({ lot: result.batchId, total: result.total, reussis: result.passed });
  } catch {
    return jsonError("Le passage n’a pas pu être enregistré.", 500);
  }
}
