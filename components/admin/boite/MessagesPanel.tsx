import Link from "next/link";
import { MessageReply } from "@/components/admin/boite/MessageReply";
import { AppMessagesUnavailable, inboxOrder, openStaffThread, type ThreadRow } from "@/lib/crm/app-messages";
import { appMessageDb } from "@/lib/crm/app-messages-db";
import { firstParam, type SearchParamValue } from "@/lib/crm/admin-list";
import { boiteHref } from "@/lib/crm/boite-tabs";
import { formatDateTimeFr } from "@/lib/crm/dates";
import { createServiceClient } from "@/lib/supabase/admin";

function personName(row: { first_name?: string | null; last_name?: string | null }) {
  return [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || "Client";
}

/** File de l’application : la liste, puis le fil ouvert (`?fil=`). */
export async function MessagesPanel({ params }: { params: Record<string, SearchParamValue> }) {
  const fil = firstParam(params.fil);
  let threads: ThreadRow[] = [];
  let closed = false;
  try {
    threads = inboxOrder(await appMessageDb().listThreads());
  } catch (error) {
    if (error instanceof AppMessagesUnavailable) closed = true;
    else closed = true;
  }
  if (closed) {
    return <p className="text-sm text-[var(--admin-navy)]">La messagerie n’est pas encore ouverte. La migration est à jouer.</p>;
  }

  const admin = createServiceClient();
  const ids = threads.map((row) => row.customerId);
  const bookingIds = threads.map((row) => row.bookingId).filter((id): id is string => Boolean(id));
  const [{ data: people }, { data: stays }] = await Promise.all([
    ids.length ? admin.from("crm_customers").select("id, first_name, last_name").in("id", ids) : Promise.resolve({ data: [] }),
    bookingIds.length ? admin.from("crm_bookings").select("id, reference").in("id", bookingIds) : Promise.resolve({ data: [] }),
  ]);
  const names = new Map((people || []).map((row) => [String(row.id), personName(row)]));
  const refs = new Map((stays || []).map((row) => [String(row.id), String(row.reference || "")]));

  let opened: Awaited<ReturnType<typeof openStaffThread>> = null;
  if (fil) {
    try {
      opened = await openStaffThread(appMessageDb(), fil);
    } catch (error) {
      if (!(error instanceof AppMessagesUnavailable)) opened = null;
    }
  }

  return (
    <div className="space-y-4">
      {opened ? (
        <section className="rounded-2xl border border-[#e5e3dc] bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-[var(--admin-navy)]">{names.get(opened.thread.customerId) || "Client"}</h2>
            <Link href={boiteHref("messages")} className="text-sm font-semibold text-[var(--admin-navy)] underline-offset-2 hover:underline">
              Tous les fils
            </Link>
          </div>
          <p className="mt-1 text-xs text-muted">
            <Link href={`/admin/clients/${opened.thread.customerId}`} className="underline-offset-2 hover:underline">
              Ouvrir la fiche
            </Link>
            {opened.thread.bookingId && refs.get(opened.thread.bookingId) ? (
              <>
                {" · "}
                <Link href={`/admin/reservations/${opened.thread.bookingId}`} className="underline-offset-2 hover:underline">
                  {refs.get(opened.thread.bookingId)}
                </Link>
              </>
            ) : null}
          </p>
          <ul className="mt-4 space-y-2">
            {opened.messages.map((message) => {
              const photo = message.attachmentPath ? `/api/files?path=${encodeURIComponent(message.attachmentPath)}&inline=1` : null;
              return (
                <li key={message.id} className="rounded-xl bg-[#f7f6f3] px-3 py-2 text-sm text-[var(--admin-navy)]">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                    {message.authorKind === "agency" ? "Agence" : "Client"}
                    {message.authorKind === "agency" && message.readAt ? " · Lu" : ""}
                  </p>
                  {message.body ? <p className="whitespace-pre-wrap">{message.body}</p> : null}
                  {photo ? (
                    <a href={photo} className="mt-1 inline-block underline">
                      Photo
                    </a>
                  ) : null}
                  <p className="mt-1 text-[10px] text-muted">{formatDateTimeFr(message.createdAt)}</p>
                </li>
              );
            })}
          </ul>
          <MessageReply threadId={opened.thread.id} />
        </section>
      ) : null}
      <ul className="space-y-2">
        {threads.length ? (
          threads.map((thread) => (
            <li key={thread.id}>
              <Link
                href={boiteHref("messages", { fil: thread.id })}
                className="flex items-start justify-between gap-3 rounded-2xl border border-[#e5e3dc] bg-white px-4 py-3"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-[var(--admin-navy)]">{names.get(thread.customerId) || "Client"}</span>
                  <span className="mt-0.5 block truncate text-sm text-muted">{thread.lastPreview || "Photo"}</span>
                </span>
                <span className="shrink-0 text-right text-xs text-muted">
                  {thread.lastMessageAt ? formatDateTimeFr(thread.lastMessageAt) : ""}
                  {thread.agencyUnread > 0 ? (
                    <span className="mt-1 block font-semibold text-[var(--admin-navy)]">{thread.agencyUnread} non lu{thread.agencyUnread > 1 ? "s" : ""}</span>
                  ) : null}
                </span>
              </Link>
            </li>
          ))
        ) : (
          <li className="text-sm text-muted">Aucun message.</li>
        )}
      </ul>
    </div>
  );
}
