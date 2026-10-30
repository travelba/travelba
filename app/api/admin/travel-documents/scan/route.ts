import { NextResponse } from "next/server";
import { assertStaffPermission } from "@/lib/crm/agency-guard";
import { recordAgencyJournal } from "@/lib/crm/agency-log";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { scanTravelDocument } from "@/lib/crm/ocr-document";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const denied = await assertStaffPermission(auth.staff, "passport_reveal");
  if (denied) return denied;
  await recordAgencyJournal({
    staffId: auth.staff.id,
    action: "reveal",
    entityType: "document",
    summary: "Lecture d’une pièce. Le contenu n’est pas journalisé.",
    sensitive: "passport_reveal",
    kind: "passeport_ouvert",
    path: "/api/admin/travel-documents/scan",
  });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return jsonError("Fichier requis");
  }
  try {
    const result = await scanTravelDocument(file);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[travel-documents/scan]", err);
    const message = err instanceof Error ? err.message : "Lecture impossible";
    return jsonError(message, 400);
  }
}
