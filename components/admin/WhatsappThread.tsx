import Link from "next/link";
import { WhatsappInbox, type InboxProposal, type InboxTemplate } from "@/components/admin/WhatsappInbox";
import { foldThreads, sessionWindowOpen, type InboxMessage } from "@/lib/crm/whatsapp-inbox";

export type WhatsappThreadMessage = {
  id: string;
  direction: string;
  body: string;
  status: string | null;
  created_at: string;
  booking_id?: string | null;
  template_key?: string | null;
  author_name?: string | null;
  media_path?: string | null;
  tools?: string[] | null;
  phone?: string | null;
};

export type WhatsappThreadRequest = {
  id: string;
  kind: string;
  body: string;
  booking_id: string | null;
  message_id?: string | null;
  created_at: string;
};

export function WhatsappThread({
  messages,
  requests,
  bookings = [],
  phone = null,
  customerId = null,
  customerName = null,
  bookingId = null,
  paused = false,
  templates = [],
  proposals = [],
  previewBlocked = false,
  desk = null,
}: {
  messages: WhatsappThreadMessage[];
  requests: WhatsappThreadRequest[];
  bookings?: { id: string; reference: string }[];
  phone?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  bookingId?: string | null;
  paused?: boolean;
  templates?: InboxTemplate[];
  proposals?: InboxProposal[];
  previewBlocked?: boolean;
  desk?: React.ReactNode;
}) {
  const stay = new Map(bookings.map((row) => [row.id, row.reference]));
  const requestByMessage = new Map(requests.filter((row) => row.message_id).map((row) => [row.message_id as string, row.id]));
  const inboxMessages: InboxMessage[] = messages.map((message) => ({
    id: message.id,
    phone: message.phone || phone,
    customerId,
    customerName,
    bookingId: message.booking_id || null,
    bookingReference: message.booking_id ? stay.get(message.booking_id) || null : null,
    direction: message.direction === "inbound" ? "inbound" : "outbound",
    body: message.body,
    createdAt: message.created_at,
    status: message.status,
    templateKey: message.template_key || null,
    authorName: message.author_name || null,
    mediaPath: message.media_path || null,
    tools: message.tools || [],
    requestId: requestByMessage.get(message.id) || null,
  }));
  const key = phone || customerId || "fil";
  const threads = foldThreads(inboxMessages, {
    paused: paused && phone ? [phone] : [],
    escalated: requests.length ? [key] : [],
  });
  const lastInbound = [...inboxMessages].filter((row) => row.direction === "inbound").sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

  if (!messages.length && !phone) {
    return <p className="text-sm text-[var(--color-ink-soft)]">Aucun message WhatsApp.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--color-ink-soft)]">Même fil que la boîte WhatsApp.</p>
        {phone ? (
          <Link href={`/admin/whatsapp?fil=${encodeURIComponent(phone)}`} className="text-sm underline">
            Ouvrir dans la boîte
          </Link>
        ) : null}
      </div>
      {desk}
      <WhatsappInbox
        embedded
        threads={threads.length ? threads : [{
          key,
          phone,
          customerId,
          customerName,
          prospect: !customerId,
          bookingId,
          bookingReference: null,
          lastBody: "",
          lastAt: "",
          unread: 0,
          status: paused ? "agency" : "robot",
        }]}
        messages={inboxMessages}
        activeKey={threads[0]?.key || key}
        proposals={proposals}
        templates={templates}
        windowOpen={sessionWindowOpen(lastInbound?.createdAt || null, new Date())}
        previewBlocked={previewBlocked}
      />
    </div>
  );
}
