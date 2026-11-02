import { currentMcpAccess } from "./mcp-auth";
import { McpWriteError } from "./mcp-write";
import { sendClientAccessWhatsapp } from "./access-resend-send";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Renvoi des accès WhatsApp du connecteur. `confirmer` est obligatoire.
 * La réponse ne contient ni le jeton, ni le lien, ni le mot de passe.
 */
export async function renvoyerAccesWhatsapp(input: Record<string, unknown>) {
  if (input.confirmer !== true) {
    throw new McpWriteError(
      "Rien n’a été envoyé. Relancez avec confirmer: true pour renvoyer les accès par WhatsApp. Aucun mot de passe n’est dans le message."
    );
  }
  const customerId = typeof input.customer_id === "string" ? input.customer_id.trim() : "";
  if (!UUID.test(customerId)) throw new McpWriteError("Client invalide.");
  const access = currentMcpAccess();
  const auteur = access.staff?.name || access.actor || "mcp";
  const result = await sendClientAccessWhatsapp({
    customerId,
    staffId: access.staff?.id ?? null,
    actor: auteur,
    path: "/api/mcp",
    confirmer: true,
  });
  if (result.code === "not_found") throw new McpWriteError("Client introuvable.");
  if (result.code === "invalid") throw new McpWriteError(result.message);
  return {
    ok: result.ok,
    statut: result.statut,
    twilio_sid: result.sid,
    message: result.message,
    auteur,
  };
}
