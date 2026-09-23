import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { createClientAssertion, exchangeRevolutAuthCode } from "@/lib/crm/revolut";

export async function GET(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (code) {
    try {
      await exchangeRevolutAuthCode(code);
      return NextResponse.redirect(new URL("/admin/revolut?connected=1", url.origin));
    } catch (err) {
      console.error("[revolut/oauth]", err);
      return NextResponse.redirect(new URL("/admin/revolut?error=oauth", url.origin));
    }
  }

  const clientId = process.env.REVOLUT_CLIENT_ID;
  if (!clientId) return jsonError("REVOLUT_CLIENT_ID manquant", 503);
  const sandbox = process.env.REVOLUT_SANDBOX === "1";
  const authorize = sandbox
    ? "https://sandbox-business.revolut.com/app-confirm"
    : "https://business.revolut.com/app-confirm";
  const redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL || url.origin}/api/admin/revolut/oauth`;
  const dest = new URL(authorize);
  dest.searchParams.set("client_id", clientId);
  dest.searchParams.set("redirect_uri", redirectUri);
  dest.searchParams.set("response_type", "code");
  // READ only — READ_SENSITIVE_CARD_DATA force une whitelist IP incompatible avec Vercel.
  dest.searchParams.set("scope", "READ");
  // client_assertion is used later at token exchange
  void createClientAssertion;
  return NextResponse.redirect(dest);
}
