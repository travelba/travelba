import "server-only";

import { currentMcpAccess } from "@/lib/crm/mcp-auth";
import { McpWriteError } from "@/lib/crm/mcp-write";
import { recordAgencyJournal } from "@/lib/crm/agency-log";
import { sendCustomerPush } from "@/lib/crm/push-notices";
import {
  AppMessagesUnavailable,
  agencyReplyPush,
  peekThread,
  postAgencyReply,
} from "@/lib/crm/app-messages";
import { appMessageDb } from "@/lib/crm/app-messages-db";
import { createServiceClient } from "@/lib/supabase/admin";

type Args = { client_id?: string; fil?: string; texte?: string; confirmer?: boolean };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function line(row: { authorKind: string; body: string; createdAt: string; readAt: string | null; attachmentPath: string | null }) {
  return {
    auteur: row.authorKind === "agency" ? "agence" : "client",
    texte: row.body,
    quand: row.createdAt,
    lu: Boolean(row.readAt),
    photo: Boolean(row.attachmentPath),
  };
}

/** File de l’application, ou réponse. Sans confirmer, rien n’est envoyé. */
export async function messagesApp(args: Args) {
  const db = appMessageDb();
  try {
    const fil = (args.fil || "").trim();
    const clientId = (args.client_id || "").trim();
    if (!fil && !clientId) {
      const rows = await db.listThreads();
      const ids = rows.map((row) => row.customerId);
      const names = new Map<string, string>();
      if (ids.length) {
        const { data } = await createServiceClient().from("crm_customers").select("id, first_name, last_name").in("id", ids);
        for (const row of data || []) {
          const name = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
          if (name) names.set(String(row.id), name);
        }
      }
      return {
        fils: rows.slice(0, 40).map((row) => ({
          fil: row.id,
          client_id: row.customerId,
          client: names.get(row.customerId) || "Client",
          apercu: row.lastPreview || "",
          non_lus: row.agencyUnread,
          quand: row.lastMessageAt,
        })),
      };
    }
    const thread = fil && UUID.test(fil) ? await db.threadById(fil) : clientId && UUID.test(clientId) ? await db.threadByCustomer(clientId) : null;
    if (!thread) throw new McpWriteError("Fil introuvable.");
    if (args.confirmer === true) {
      const staff = currentMcpAccess().staff;
      const staffId = staff && UUID.test(staff.id) ? staff.id : null;
      const sent = await postAgencyReply(db, { threadId: thread.id, staffId, body: args.texte || "" });
      if (!sent.ok) throw new McpWriteError(sent.error);
      const copy = agencyReplyPush(sent.preview);
      await sendCustomerPush({
        customerId: sent.thread.customerId,
        kind: "messages",
        title: copy.title,
        body: copy.body,
        url: "/mon-compte/messages",
        idempotencyKey: `app-msg:${sent.message.id}`,
        bookingId: sent.thread.bookingId,
      });
      if (staff && staffId) {
        await recordAgencyJournal({
          staffId,
          action: "send",
          entityType: "client",
          entityId: sent.thread.customerId,
          summary: `Message application envoyé par ${staff.name}.`,
          path: "/api/mcp",
        });
      }
      return { envoye: true, fil: sent.thread.id };
    }
    const opened = await peekThread(db, thread.id);
    return {
      fil: thread.id,
      client_id: thread.customerId,
      messages: (opened?.messages || []).map(line),
      apercu: (args.texte || "").trim() || null,
    };
  } catch (error) {
    if (error instanceof AppMessagesUnavailable) {
      throw new McpWriteError("La messagerie de l’application n’est pas encore ouverte.");
    }
    throw error;
  }
}
