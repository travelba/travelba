import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { pliantConfigured } from "@/lib/crm/pliant";
import { syncPliantAccount } from "@/lib/crm/pliant-sync";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const body = (await request.json().catch(() => null)) as { action?: string } | null;
  if (body?.action !== "sync") return jsonError("Action inconnue", 400);
  if (!pliantConfigured()) return jsonError("Pliant n’est pas branché.", 400);
  try {
    const result = await syncPliantAccount();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[pliant] sync", err instanceof Error ? err.message : "échec");
    const message = err instanceof Error ? err.message : "Synchronisation Pliant impossible. Réessayez.";
    const known = message === "Pliant n’est pas branché." || message === "Pliant n’a pas renvoyé les transactions." || message === "Les transactions Pliant n’ont pas pu être enregistrées.";
    return jsonError(known ? message : "Synchronisation Pliant impossible. Réessayez.", 502);
  }
}
