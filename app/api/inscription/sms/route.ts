import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { appOrigin } from "@/lib/crm/invite";
import { SIGNUP_COOKIE } from "@/lib/crm/signup-cookie";
import { confirmSignupSms, sendSignupSms, SignupError } from "@/lib/crm/signup-run";

export async function POST(request: Request) {
  const jar = await cookies();
  const token = jar.get(SIGNUP_COOKIE)?.value || "";
  if (!token) return NextResponse.json({ error: "La demande n’est plus ouverte sur cet appareil." }, { status: 400 });
  const body = (await request.json().catch(() => null)) as { code?: string } | null;
  try {
    if (body?.code) {
      await confirmSignupSms(token, body.code, appOrigin(request));
      return NextResponse.json({ ok: true });
    }
    await sendSignupSms(token);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof SignupError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "La vérification n’a pas abouti." }, { status: 500 });
  }
}
