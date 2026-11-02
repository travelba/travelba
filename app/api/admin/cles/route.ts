import { NextResponse } from "next/server";
import { recordAgencyJournal } from "@/lib/crm/agency-log";
import { jsonError, requireAdmin } from "@/lib/crm/auth";
import { createMcpApiKey, McpKeyError } from "@/lib/crm/mcp-api-key-store";
import { staffKeyName } from "@/lib/crm/mcp-api-key";
import { isUuid } from "@/lib/crm/ids";

export const runtime = "nodejs";

function keyError(err: unknown) {
  if (err instanceof McpKeyError) return jsonError(err.message, err.status);
  console.error("[cles] création");
  return jsonError("Impossible de créer la clé.", 500);
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const body = await request.json().catch(() => null);
  const staffId = typeof body?.staff_id === "string" ? body.staff_id.trim() : "";
  const label = typeof body?.libelle === "string" ? body.libelle : "";
  const expiresOn = typeof body?.expire_le === "string" ? body.expire_le : "";
  if (!isUuid(staffId)) return jsonError("Choisissez un membre.");
  try {
    const created = await createMcpApiKey({
      staffId,
      label,
      expiresOn,
      createdBy: auth.staff.id,
    });
    const who = staffKeyName(auth.staff.full_name);
    await recordAgencyJournal({
      staffId: auth.staff.id,
      action: "create",
      entityType: "user",
      entityId: created.key.staffId,
      summary: `Clé API « ${created.key.label} » (${created.key.prefix}) créée pour ${created.key.staffName} par ${who}.`,
      diff: { prefixe: created.key.prefix, libelle: created.key.label },
      path: "/api/admin/cles",
    });
    return NextResponse.json({
      ok: true,
      cle: created.token,
      id: created.key.id,
      prefixe: created.key.prefix,
      message: "Copiez cette clé maintenant. Elle ne sera plus affichée.",
    });
  } catch (err) {
    return keyError(err);
  }
}
