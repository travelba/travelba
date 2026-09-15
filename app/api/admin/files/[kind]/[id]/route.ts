import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/crm/auth";
import { signedCrmUrl } from "@/lib/crm/files";

type Ctx = { params: Promise<{ kind: string; id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { kind, id } = await ctx.params;
  const table = kind === "identity" ? "crm_travel_documents" : kind === "booking" ? "crm_booking_documents" : null;
  if (!table) return NextResponse.json({ error: "Type inconnu" }, { status: 404 });
  const { data } = await auth.supabase.from(table).select("storage_path").eq("id", id).maybeSingle();
  if (!data?.storage_path) return NextResponse.json({ error: "Fichier introuvable" }, { status: 404 });
  try {
    return NextResponse.redirect(await signedCrmUrl(data.storage_path, 90));
  } catch {
    return NextResponse.json({ error: "Prévisualisation indisponible" }, { status: 502 });
  }
}
