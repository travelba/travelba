import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { isRefreshToken, mobileSessionSnapshot } from "@/lib/crm/mobile-auth";
import { mobileSessionFromPassword, mobileSessionFromRefresh } from "@/lib/crm/mobile-session";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({
    ok: true,
    ...mobileSessionSnapshot({
      user: {
        id: auth.user.id,
        email: auth.user.email || null,
        app_metadata: auth.user.app_metadata,
      },
      customer: {
        id: auth.customer.id,
        first_name: auth.customer.first_name,
        last_name: auth.customer.last_name,
        phone: auth.customer.phone,
        email: auth.customer.email,
      },
    }),
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (typeof body.refresh_token === "string") {
    if (!isRefreshToken(body.refresh_token)) return jsonError("Session expirée.", 401);
    const result = await mobileSessionFromRefresh(body.refresh_token);
    if (!result.ok) return jsonError(result.error, result.status);
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  }
  const email = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) return jsonError("Identifiants incorrects.", 401);
  const result = await mobileSessionFromPassword(email, password);
  if (!result.ok) return jsonError(result.error, result.status);
  return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
}
