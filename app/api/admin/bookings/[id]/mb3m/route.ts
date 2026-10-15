import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { dbError, jsonError, requireStaff } from "@/lib/crm/auth";
import { Mb3mError } from "@/lib/crm/mb3m";
import { emitMb3mInvoice, reissueMb3mInvoice } from "@/lib/crm/mb3m-invoice";
import { loadMb3mProforma } from "@/lib/crm/mb3m-proforma";
import { createServiceClient } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const { data: booking, error } = await auth.supabase.from("crm_bookings").select("id").eq("id", id).maybeSingle();
  if (error) return dbError(error, 500);
  if (!booking) return jsonError("Réservation introuvable", 404);
  try {
    const proforma = await loadMb3mProforma(id);
    if (!proforma) return jsonError("Aucune facture pro forma pour ce séjour.", 404);
    if (proforma.kind === "official") return NextResponse.redirect(new URL(proforma.href, request.url));
    const filename = `Facture-pro-forma-${proforma.number}.pdf`;
    return new NextResponse(Buffer.from(proforma.pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "La facture pro forma n’est pas lisible.";
    return jsonError(message, 400);
  }
}

/** Sans corps : prépare la pro forma. `{ action: "reissue" }` : avoir sur la facture imprimée, puis nouvelle facture. */
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const { data: booking, error } = await auth.supabase
    .from("crm_bookings")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (error) return dbError(error, 500);
  if (!booking) return jsonError("Réservation introuvable", 404);
  const body = (await request.json().catch(() => null)) as { action?: string } | null;
  try {
    const invoice =
      body?.action === "reissue"
        ? await reissueMb3mInvoice(createServiceClient(), id)
        : await emitMb3mInvoice(createServiceClient(), id);
    console.info(`[mb3m] ${body?.action || "emit"} ${id}`, JSON.stringify(invoice));
    revalidatePath(`/admin/reservations/${id}`);
    return NextResponse.json(invoice);
  } catch (err) {
    const message = err instanceof Mb3mError || err instanceof Error ? err.message : "La facture MB3M n’a pas abouti.";
    console.error(`[mb3m] ${body?.action || "emit"} ${id}`, message);
    return jsonError(message, 400);
  }
}
