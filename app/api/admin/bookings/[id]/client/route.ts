import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { recordAgencyJournal } from "@/lib/crm/agency-log";
import { ReassignClientError, changeBookingClient } from "@/lib/crm/reassign-booking-client";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Aperçu ou rattachement du dossier à un autre client. Aucune invitation, aucun message. */
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const creer = body?.creer && typeof body.creer === "object" ? (body.creer as Record<string, unknown>) : null;
  try {
    const result = await changeBookingClient(createServiceClient(), {
      bookingId: id,
      customerId: typeof body?.customer_id === "string" ? body.customer_id : "",
      create: creer
        ? {
            firstName: String(creer.first_name || creer.prenom || ""),
            lastName: String(creer.last_name || creer.nom || ""),
            email: creer.email == null ? null : String(creer.email),
            phone: creer.phone == null && creer.telephone == null ? null : String(creer.phone || creer.telephone || ""),
            companyName:
              creer.company_name == null && creer.societe == null ? null : String(creer.company_name || creer.societe || ""),
          }
        : null,
      confirmer: body?.confirmer === true,
    });
    if (result.applique) {
      await recordAgencyJournal({
        staffId: auth.staff.id,
        action: "update",
        entityType: "dossier",
        entityId: result.dossier_id,
        summary: result.journal.summary,
        diff: result.journal.diff,
        path: `/admin/reservations/${id}`,
      });
    }
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ReassignClientError) return jsonError(err.message);
    console.error("[crm] changer client", err instanceof Error ? err.message : "error");
    return jsonError("Le client du dossier n’a pas pu être changé.");
  }
}
