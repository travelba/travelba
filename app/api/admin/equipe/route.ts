import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/crm/auth";
import { appOrigin } from "@/lib/crm/invite";
import { addColleague, StaffTeamError } from "@/lib/crm/staff-directory";
import { colleagueEmailError, colleagueNameError, normalizeColleagueEmail, parseStaffRole, STAFF_COPY } from "@/lib/crm/staff-team";

export const runtime = "nodejs";

function teamError(err: unknown) {
  if (err instanceof StaffTeamError) return jsonError(err.message, err.status);
  console.error("[equipe] échec");
  return jsonError("Opération impossible. Réessayez.", 500);
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return jsonError("Indiquez le nom et l’e-mail du collègue.");
  }
  const fullName = String(body.full_name || "");
  const email = normalizeColleagueEmail(String(body.email || ""));
  const role = parseStaffRole(body.role ?? "agent");
  const nameError = colleagueNameError(fullName);
  if (nameError) return jsonError(nameError);
  const emailError = colleagueEmailError(email);
  if (emailError) return jsonError(emailError);
  if (!role) return jsonError(STAFF_COPY.role);
  try {
    const result = await addColleague({ fullName, email, role }, appOrigin(request));
    return NextResponse.json({
      ok: true,
      delivered: result.delivered,
      link: result.link,
      colleague: result.colleague,
    });
  } catch (err) {
    return teamError(err);
  }
}
