import Link from "next/link";
import { Icon } from "@/components/crm/icons";
import { formatDateTimeFr } from "@/lib/crm/money";
import { HANDOFF_LABELS, type HandoffKind } from "@/lib/crm/whatsapp-concierge";

const VISIBLE_MESSAGES = 3;

export type WhatsappThreadMessage = {
  id: string;
  direction: string;
  body: string;
  created_at: string;
  booking_id?: string | null;
  status?: string | null;
};

export type WhatsappThreadRequest = {
  id: string;
  kind: string;
  body: string;
  booking_id: string | null;
  created_at: string;
};

function kindLabel(kind: string) {
  if (kind in HANDOFF_LABELS) return HANDOFF_LABELS[kind as HandoffKind];
  return "Demande";
}

function earlierLabel(count: number) {
  return count === 1 ? "1 message précédent" : `${count} messages précédents`;
}

function MessageBubble({ message, stay }: { message: WhatsappThreadMessage; stay?: string | null }) {
  const outbound = message.direction === "outbound";
  return (
    <li
      className={
        outbound
          ? "ml-8 rounded-2xl bg-[var(--admin-navy)] px-4 py-3 text-white"
          : "mr-8 rounded-2xl border border-[var(--border)] px-4 py-3"
      }
    >
      <p className={outbound ? "text-[10px] font-bold uppercase tracking-[0.14em] text-[#e6d3b3]" : "text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]"}>
        {outbound ? "Le Concierge" : "Client"}
        {stay ? ` · ${stay}` : ""}
      </p>
      <p className="mt-1 whitespace-pre-wrap text-sm">{message.body}</p>
      <p className={outbound ? "mt-1 text-xs text-[#e6d3b3]" : "mt-1 text-xs text-muted"}>
        {formatDateTimeFr(message.created_at)}
      </p>
    </li>
  );
}

export function WhatsappThread({
  messages,
  requests,
  bookings,
}: {
  messages: WhatsappThreadMessage[];
  requests: WhatsappThreadRequest[];
  bookings: { id: string; reference: string }[];
}) {
  const reference = new Map(bookings.map((booking) => [booking.id, booking.reference]));
  const earlier = messages.length > VISIBLE_MESSAGES ? messages.slice(0, -VISIBLE_MESSAGES) : [];
  const recent = earlier.length ? messages.slice(-VISIBLE_MESSAGES) : messages;
  return (
    <section className="admin-af-card rounded-3xl p-5">
      <h2 className="font-display text-lg font-bold text-[var(--admin-navy)]">WhatsApp</h2>
      {requests.length ? (
        <ul className="mt-4 space-y-3">
          {requests.map((request) => {
            const stay = request.booking_id ? reference.get(request.booking_id) : null;
            return (
              <li key={request.id} className="rounded-2xl border border-[var(--admin-gold)] bg-[#fbf7f1] px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">
                  Demande à traiter · {kindLabel(request.kind)}
                  {stay ? ` · ${stay}` : ""}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--admin-navy)]">{request.body}</p>
                <p className="mt-1 text-xs text-muted">{formatDateTimeFr(request.created_at)}</p>
                {request.booking_id ? (
                  <Link
                    href={`/admin/reservations/${request.booking_id}`}
                    className="mt-2 inline-block text-xs font-semibold text-[var(--admin-navy)] underline-offset-2 hover:underline"
                  >
                    Ouvrir le séjour
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {messages.length ? (
        <div className="mt-4 space-y-3">
          {earlier.length ? (
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl border border-[var(--border)] px-4 py-3 text-sm font-semibold text-[var(--admin-navy)] [&::-webkit-details-marker]:hidden [&::marker]:content-none">
                <span>{earlierLabel(earlier.length)}</span>
                <Icon name="expand_more" className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
              </summary>
              <ol className="mt-3 space-y-3">
                {earlier.map((message) => (
                  <MessageBubble key={message.id} message={message} stay={message.booking_id ? reference.get(message.booking_id) : null} />
                ))}
              </ol>
            </details>
          ) : null}
          <ol className="space-y-3">
            {recent.map((message) => (
              <MessageBubble key={message.id} message={message} stay={message.booking_id ? reference.get(message.booking_id) : null} />
            ))}
          </ol>
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted">Aucun échange WhatsApp.</p>
      )}
    </section>
  );
}
