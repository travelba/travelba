import { NextResponse } from "next/server";
import { recordAgencyJournal } from "@/lib/crm/agency-log";
import { jsonError, requireAdmin } from "@/lib/crm/auth";
import { isUuid } from "@/lib/crm/ids";
import { staffKeyName } from "@/lib/crm/mcp-api-key";
import { McpKeyError, revokeMcpApiKey } from "@/lib/crm/mcp-api-key-store";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, ctx: Ctx) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError("Clé introuvable.", 404);
  try {
    const result = await revokeMcpApiKey(id);
    if (!result.already) {
      const who = staffKeyName(auth.staff.full_name);
      await recordAgencyJournal({
        staffId: auth.staff.id,
        action: "update",
        entityType: "user",
        entityId: result.key.staffId,
        summary: `Clé API « ${result.key.label} » (${result.key.prefix}) révoquée par ${who}.`,
        diff: { prefixe: result.key.prefix, revoquee: true },
        path: `/api/admin/cles/${id}/revoquer`,
      });
    }
    return NextResponse.json({ ok: true, deja: result.already, prefixe: result.key.prefix });
  } catch (err) {
    if (err instanceof McpKeyError) return jsonError(err.message, err.status);
    console.error("[cles] révocation");
    return jsonError("Impossible de révoquer cette clé.", 500);
  }
}
