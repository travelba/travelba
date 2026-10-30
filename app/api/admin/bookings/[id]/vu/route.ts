import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/crm/auth";
import { markEstaNoticesSeen } from "@/lib/crm/esta-run";
import { markUkEtaNoticesSeen } from "@/lib/crm/uk-eta-run";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** L’ouverture du dossier marque les avis ESTA et ETA vus, sans ralentir le GET. */
export async function POST(_request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const admin = createServiceClient();
  await Promise.all([markEstaNoticesSeen(admin, id), markUkEtaNoticesSeen(admin, id)]);
  return NextResponse.json({ ok: true });
}
