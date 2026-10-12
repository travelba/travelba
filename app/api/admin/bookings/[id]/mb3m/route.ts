import { NextResponse } from "next/server";
import { dbError, jsonError, requireStaff } from "@/lib/crm/auth";
import { Mb3mError } from "@/lib/crm/mb3m";
import { emitMb3mInvoice } from "@/lib/crm/mb3m-invoice";
import { createServiceClient } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, ctx: Ctx) {
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
  try {
    const invoice = await emitMb3mInvoice(createServiceClient(), id);
    return NextResponse.json(invoice);
  } catch (err) {
    const message = err instanceof Mb3mError || err instanceof Error ? err.message : "La facture MB3M n’a pas abouti.";
    return jsonError(message, 400);
  }
}
