import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { clearAuthSessionCookieWrites, requestIsSecure } from "@/lib/crm/client-session-cookie";
import { createClient } from "@/lib/supabase/server";
import { readVerifiedUser } from "@/lib/crm/verified-user";

export const runtime = "nodejs";

/** Cet appareil (`local`) ou tous (`global`). Rien d’autre ne déconnecte le client. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const scope = body?.scope === "global" ? "global" : "local";
  const jar = await cookies();
  const before = jar.getAll();
  const supabase = await createClient();
  const user = await readVerifiedUser(supabase);
  if (user) {
    const { error } = await supabase.auth.signOut({ scope });
    if (error) {
      return NextResponse.json({ error: "La déconnexion n’a pas abouti. Réessayez." }, { status: 400 });
    }
  }

  const secure = requestIsSecure({
    forwardedProto: request.headers.get("x-forwarded-proto"),
    protocol: new URL(request.url).protocol,
  });
  const response = NextResponse.json({ ok: true });
  response.headers.set("Cache-Control", "private, no-store");
  for (const cookie of clearAuthSessionCookieWrites(before, secure)) {
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  }
  return response;
}
