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
  expanded = false,
}: {
  messages: WhatsappThreadMessage[];
  requests: WhatsappThreadRequest[];
  bookings: { id: string; reference: string }[];
  /** Dossier : toute la conversation. La fiche client garde le repli aux trois derniers messages. */
  expanded?: boolean;
}) {
  const reference = new Map(bookings.map((booking) => [booking.id, booking.reference]));
  const earlier = !expanded && messages.length > VISIBLE_MESSAGES ? messages.slice(0, -VISIBLE_MESSAGES) : [];
  const recent = earlier.length ? messages.slice(-VISIBLE_MESSAGES) : messages;
  const last = messages[messages.length - 1];
  const pending = requests[0];
  const pendingStay = pending?.booking_id ? reference.get(pending.booking_id) : null;
  const summary = pending
    ? `${requests.length > 1 ? `${requests.length} demandes · ` : ""}Demande à traiter · ${kindLabel(pending.kind)}${pendingStay ? ` · ${pendingStay}` : ""}`
    : last
      ? `${last.direction === "outbound" ? "Le Concierge" : "Client"} · ${last.body.replace(/\s+/g, " ").trim()}`
      : "Aucun échange WhatsApp.";
  const thread = (
    <div className="max-w-md space-y-3">
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
            <details className="group/earlier">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl border border-[var(--border)] px-4 py-3 text-sm font-semibold text-[var(--admin-navy)] [&::-webkit-details-marker]:hidden [&::marker]:content-none">
                <span>{earlierLabel(earlier.length)}</span>
                <Icon name="expand_more" className="h-4 w-4 shrink-0 transition-transform group-open/earlier:rotate-180" />
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
        <p className="text-sm text-muted">Aucun échange WhatsApp.</p>
      )}
    </div>
  );
  if (expanded) {
    return (
      <section className="admin-af-card rounded-3xl p-5">
        <h2 className="font-display text-lg font-bold text-[var(--admin-navy)]">WhatsApp</h2>
        <div className="mt-4">{thread}</div>
      </section>
    );
  }
  return (
    <details className="admin-af-card group h-full rounded-3xl">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden [&::marker]:content-none">
        <span className="min-w-0">
          <span className="block font-display text-lg font-bold text-[var(--admin-navy)]">WhatsApp</span>
          <span className="mt-0.5 block truncate text-sm text-muted">{summary}</span>
        </span>
        <Icon name="expand_more" className="h-4 w-4 shrink-0 text-[var(--admin-navy)] transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-[var(--border)] px-5 py-4">{thread}</div>
    </details>
  );
}
