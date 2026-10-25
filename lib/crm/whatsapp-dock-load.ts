import { loadThreadDossier, loadThreadMessages, loadWhatsappIndex } from "@/lib/crm/whatsapp-desk";
import { approvedManualTemplates, sessionWindowOpenNow, type InboxDossier, type InboxMessage, type InboxThread } from "@/lib/crm/whatsapp-inbox";
import { isVercelPreview } from "@/lib/crm/preview-secrets";

export type DockSnapshot = {
  threads: InboxThread[];
  templates: { key: string; label: string }[];
  previewBlocked: boolean;
};

export function emptyDockSnapshot(): DockSnapshot {
  return { threads: [], templates: approvedManualTemplates(), previewBlocked: isVercelPreview() };
}

export async function loadDockSnapshot(): Promise<DockSnapshot> {
  try {
    const index = await loadWhatsappIndex();
    return { threads: index.threads, templates: approvedManualTemplates(), previewBlocked: isVercelPreview() };
  } catch (err) {
    console.error("[whatsapp-dock]", err instanceof Error ? err.message : "lecture");
    return emptyDockSnapshot();
  }
}

export async function loadDockThread(fil: string): Promise<{ messages: InboxMessage[]; windowOpen: boolean; dossier: InboxDossier | null }> {
  const messages = await loadThreadMessages(fil);
  const lastInbound = messages.find((row) => row.direction === "inbound");
  const anchor = messages.find((row) => row.bookingId) || messages[0];
  const phone = fil.startsWith("+") ? fil : anchor?.phone || null;
  const dossier = anchor ? await loadThreadDossier(anchor.bookingId, anchor.customerId, phone) : null;
  return { messages, windowOpen: sessionWindowOpenNow(lastInbound?.createdAt || null), dossier };
}
