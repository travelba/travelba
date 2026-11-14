import type { SupabaseClient } from "@supabase/supabase-js";
import { envoyerMessageLibre } from "./mcp-free-message";
import { McpWriteError } from "./mcp-write";

/**
 * Réponse libre hors fenêtre de 24 h.
 * Réutilise `envoyerMessageLibre` : aperçu sans `confirmer`, envoi avec le modèle message_libre_texte.
 */
export async function sendClosedWindowReply(
  input: {
    customerId?: string | null;
    bookingId?: string | null;
    text: string;
    confirmer: boolean;
    staffId: string;
  },
  admin?: SupabaseClient,
  deps?: Parameters<typeof envoyerMessageLibre>[2]
) {
  if (!input.customerId && !input.bookingId) {
    return { ok: false as const, error: "Le message libre a besoin de la fiche du client." };
  }
  try {
    const result = await envoyerMessageLibre(
      {
        client_id: input.customerId || undefined,
        dossier_id: input.bookingId || undefined,
        texte: input.text,
        confirmer: input.confirmer,
      },
      admin,
      { ...deps, author: deps?.author ?? { id: input.staffId, actor: "agence" } }
    );
    return { ...result, ok: true as const };
  } catch (error) {
    if (error instanceof McpWriteError) return { ok: false as const, error: error.message };
    throw error;
  }
}
