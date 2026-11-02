import { NextResponse } from "next/server";
import { maskEmail } from "@/lib/crm/agency-access";
import { recordAgencyJournal } from "@/lib/crm/agency-log";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** Toujours 204. Le corps ne dit pas si l’adresse est celle d’un collègue. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (email && email.includes("@") && email.length <= 254) {
    try {
      const admin = createServiceClient({ allowPreview: true });
      const { data } = await admin.from("crm_staff").select("id").ilike("email", email).maybeSingle();
      const staffId = (data as { id?: string } | null)?.id ?? null;
      const forwarded = request.headers.get("x-forwarded-for");
      await recordAgencyJournal({
        staffId,
        action: "login_failed",
        entityType: "session",
        summary: `Connexion refusée pour ${maskEmail(email)}.`,
        sensitive: staffId ? "failed_login" : null,
        ip: forwarded?.split(",")[0]?.trim() || null,
        userAgent: request.headers.get("user-agent"),
        path: "/api/auth/staff-failure",
      });
    } catch {
      /* La réponse reste vide. */
    }
  }
  return new NextResponse(null, { status: 204 });
}
