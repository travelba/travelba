import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { setReferralCountMode, setSignupAutoValidate, SignupError } from "@/lib/crm/signup-run";
import { referralCountMode } from "@/lib/crm/signup";

export async function POST(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  if (auth.staff.role !== "admin") return jsonError("Réservé aux administrateurs.", 403);
  const body = (await request.json().catch(() => null)) as { enabled?: boolean; referralCountMode?: string } | null;
  try {
    if (body && "referralCountMode" in body) {
      await setReferralCountMode(referralCountMode(body.referralCountMode));
    }
    if (body && "enabled" in body) await setSignupAutoValidate(body.enabled === true);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof SignupError) return jsonError(error.message, error.status);
    return jsonError("Le réglage n’a pas été enregistré.", 500);
  }
}
