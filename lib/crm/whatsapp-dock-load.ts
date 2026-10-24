import { loadThreadMessages, loadWhatsappIndex } from "@/lib/crm/whatsapp-desk";
import { approvedManualTemplates, sessionWindowOpenNow, type InboxMessage, type InboxThread } from "@/lib/crm/whatsapp-inbox";
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

export async function loadDockThread(fil: string): Promise<{ messages: InboxMessage[]; windowOpen: boolean }> {
  const messages = await loadThreadMessages(fil);
  const lastInbound = messages.find((row) => row.direction === "inbound");
  return { messages, windowOpen: sessionWindowOpenNow(lastInbound?.createdAt || null) };
}
