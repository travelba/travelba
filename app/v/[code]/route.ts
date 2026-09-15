import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  const { code } = await params;
  if (!/^[a-z0-9]{8}$/i.test(code)) {
    return NextResponse.json({ error: "Lien invalide" }, { status: 404 });
  }
  const { data } = await createServiceClient()
    .from("agency_mtrip_guides")
    .select("app_links")
    .eq("short_code", code)
    .eq("status", "published")
    .maybeSingle();
  const appLinks =
    data?.app_links && typeof data.app_links === "object"
      ? (data.app_links as Record<string, unknown>)
      : {};
  const destination = Object.values(appLinks).find(
    (value): value is string =>
      typeof value === "string" && /^https:\/\//i.test(value)
  );
  if (!destination) {
    return NextResponse.json(
      { error: "Voyage non publié ou lien indisponible" },
      { status: 404 }
    );
  }
  return NextResponse.redirect(destination, 307);
}
