import { currentMcpAccess } from "./mcp-auth";
import { McpWriteError } from "./mcp-write";
import { sendHotelOptionWhatsapp } from "./access-resend-send";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Annonce l’option hôtel. `confirmer` est obligatoire. Le lien n’est pas renvoyé. */
export async function annoncerOptionHotel(input: Record<string, unknown>) {
  if (input.confirmer !== true) {
    throw new McpWriteError(
      "Rien n’a été envoyé. Relancez avec confirmer: true pour annoncer l’accès Hôtels par WhatsApp. Aucun mot de passe n’est dans le message."
    );
  }
  const customerId = typeof input.client_id === "string" ? input.client_id.trim() : "";
  if (!UUID.test(customerId)) throw new McpWriteError("Client invalide.");
  const access = currentMcpAccess();
  const auteur = access.staff?.name || access.actor || "mcp";
  const result = await sendHotelOptionWhatsapp({
    customerId,
    staffId: access.staff?.id ?? null,
    actor: auteur,
    path: "/api/mcp",
    confirmer: true,
  });
  if (result.code === "not_found") throw new McpWriteError("Client introuvable.");
  if (result.code === "invalid" || result.code === "disabled") throw new McpWriteError(result.message);
  return {
    ok: result.ok,
    statut: result.statut,
    twilio_sid: result.sid,
    message: result.message,
    auteur,
  };
}
