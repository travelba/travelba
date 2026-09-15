import { NextResponse } from "next/server";
import { requireAdminUser, jsonError } from "@/lib/agency/auth";
import { publishGuideRecord } from "@/lib/agency/send-voyage";
import { MtripError } from "@/lib/mtrip/client";
import type { AgencyMtripGuide } from "@/lib/mtrip/guide-types";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const auth = await requireAdminUser();
  if (auth instanceof NextResponse) return auth;
  const { user, supabase } = auth;
  const { id } = await params;

  const { data: guide, error } = await supabase
    .from("agency_mtrip_guides")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return jsonError(error.message, 500);
  if (!guide) return jsonError("Guide introuvable", 404);

  try {
    const updated = await publishGuideRecord(
      supabase,
      user.id,
      guide as AgencyMtripGuide
    );
    const payload =
      updated.payload && typeof updated.payload === "object"
        ? (updated.payload as {
            traveler_passwords?: unknown;
          })
        : {};
    return NextResponse.json({
      guide: updated,
      app_links: updated.app_links,
      traveler_passwords: payload.traveler_passwords || [],
    });
  } catch (err) {
    const message =
      err instanceof MtripError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Publication impossible";
    const details = err instanceof MtripError ? err.body : undefined;
    const status =
      err instanceof MtripError
        ? err.status >= 400 && err.status < 600
          ? err.status
          : 502
        : 500;
    return jsonError(message, status, details);
  }
}
