import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

export async function GET(request: Request, { params }: Ctx) {
  const { code } = await params;
  if (!/^[a-z0-9]{16}$/i.test(code)) {
    return NextResponse.json({ error: "Lien invalide" }, { status: 404 });
  }
  const { data } = await createServiceClient()
    .from("agency_mtrip_guides")
    .select("quote_token")
    .eq("short_code", code)
    .eq("status", "published")
    .maybeSingle();
  if (!data?.quote_token) {
    return NextResponse.json(
      { error: "Devis non publié ou lien indisponible" },
      { status: 404 }
    );
  }
  return NextResponse.redirect(
    new URL(`/devis/${data.quote_token}`, request.url),
    307
  );
}
