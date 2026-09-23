import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { seedSimulatedEmailIngest } from "@/lib/crm/email-ingest";

export const runtime = "nodejs";

/**
 * Insère un e-mail ingéré simulé (déjà parsé) pour tester l'UI de rattachement
 * sans dépendre de Gmail. Agence seulement.
 */
export async function POST(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  let body: {
    subject?: string;
    from_email?: string;
    label?: string;
    extract?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("Requête invalide");
  }
  if (!body.extract) return jsonError("extract requis");
  try {
    const id = await seedSimulatedEmailIngest({
      subject: body.subject || "Simulation",
      from_email: body.from_email || "reservations@little-emperors.com",
      label: body.label,
      extract: body.extract,
    });
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Simulation impossible";
    return jsonError(message, 400);
  }
}
