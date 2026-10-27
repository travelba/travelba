import type { SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { currentMcpAccess } from "./mcp-auth";
import { McpWriteError } from "./mcp-write";
import {
  sendAccountStatement,
  STATEMENT_REPEAT_WINDOW_MS,
  statementBotId,
  type StatementSendDeps,
} from "./statement-dispatch";
import { createServiceClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function client(admin?: SupabaseClient) {
  if (admin) return admin;
  if (typeof globalThis.WebSocket !== "function") {
    globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
  }
  return createServiceClient();
}

/**
 * Relevés WhatsApp du connecteur travelba. Même envoi que le bouton admin.
 * L’auteur journalisé est le jeton (`mcp`, ou le nom du jeton nommé).
 */
export async function envoyerReleve(
  input: Record<string, unknown>,
  admin?: SupabaseClient,
  deps?: StatementSendDeps
) {
  const customerId = typeof input.customer_id === "string" ? input.customer_id.trim() : "";
  if (!UUID.test(customerId)) throw new McpWriteError("Client invalide.");
  if (input.channel != null && input.channel !== "" && typeof input.channel !== "string") {
    throw new McpWriteError("Canal : whatsapp ou email.");
  }
  if (input.force != null && typeof input.force !== "boolean") throw new McpWriteError("force est vrai ou faux.");
  const auteur = statementBotId(currentMcpAccess().actor);
  const result = await sendAccountStatement(
    {
      supabase: client(admin),
      customerId,
      channel: typeof input.channel === "string" ? input.channel : undefined,
      audience: "staff",
      actor: { kind: "bot", id: auteur },
      force: input.force === true,
      repeatWindowMs: STATEMENT_REPEAT_WINDOW_MS,
    },
    deps
  );
  if (result.code === "not_found") throw new McpWriteError("Client introuvable.");
  if (result.code === "read") throw new McpWriteError(result.message);
  return {
    ok: result.ok,
    statut: result.statut,
    twilio_sid: result.twilio_sid,
    message: result.message,
    canal: result.canal === "invalid" ? null : result.canal,
    auteur,
  };
}
