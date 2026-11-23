import { redirect } from "next/navigation";
import { AccountPage } from "@/components/account/AccountPage";
import { MessageComposer } from "@/components/account/MessageComposer";
import { AppMessagesUnavailable, openCustomerThread, type MessageRow } from "@/lib/crm/app-messages";
import { appMessageDb } from "@/lib/crm/app-messages-db";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import { formatDateTimeFr } from "@/lib/crm/dates";
import { readVerifiedUser } from "@/lib/crm/verified-user";
import { createClient } from "@/lib/supabase/server";
import { siteConfig } from "@/lib/site";

export const metadata = { title: `Messages — ${siteConfig.shortName}` };

function Bubble({ message }: { message: MessageRow }) {
  const mine = message.authorKind === "customer";
  const photo = message.attachmentPath
    ? `/api/files?path=${encodeURIComponent(message.attachmentPath)}&inline=1`
    : null;
  return (
    <li className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${mine ? "ml-auto bg-[var(--admin-navy)] text-white" : "bg-white text-[var(--admin-navy)]"}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{mine ? "Vous" : "L’agence"}</p>
      {message.body ? <p className="whitespace-pre-wrap leading-snug">{message.body}</p> : null}
      {photo ? (
        <a href={photo} className={`mt-1 inline-block underline ${mine ? "text-white" : "text-[var(--admin-navy)]"}`}>
          Photo
        </a>
      ) : null}
      <p className={`mt-1 text-[10px] ${mine ? "text-white/70" : "text-muted"}`}>
        {formatDateTimeFr(message.createdAt)}
        {mine && message.readAt ? " · Lu" : ""}
      </p>
    </li>
  );
}

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ sejour?: string }> }) {
  const { sejour } = await searchParams;
  const supabase = await createClient();
  const user = await readVerifiedUser(supabase);
  if (!user) redirect("/connexion");
  const customer = await ensureCustomerForUser(user);
  if (!customer) redirect("/connexion");

  let messages: MessageRow[] = [];
  let closed = false;
  try {
    const opened = await openCustomerThread(appMessageDb(), customer.id);
    messages = opened.messages;
  } catch (error) {
    if (error instanceof AppMessagesUnavailable) closed = true;
    else closed = true;
  }

  return (
    <AccountPage>
      <h1 className="font-display text-xl font-bold text-[var(--admin-navy)]">Messages</h1>
      <p className="mt-1 text-sm text-muted">Écrivez à l’agence. La réponse arrive ici.</p>
      {closed ? (
        <p className="mt-4 rounded-2xl bg-white px-4 py-3 text-sm text-[var(--admin-navy)]">La messagerie n’est pas encore ouverte.</p>
      ) : (
        <>
          <ul className="mt-4 space-y-2">
            {messages.length ? messages.map((message) => <Bubble key={message.id} message={message} />) : (
              <li className="rounded-2xl bg-white px-4 py-3 text-sm text-muted">Aucun message pour le moment.</li>
            )}
          </ul>
          <div className="mt-4">
            <MessageComposer sejour={typeof sejour === "string" ? sejour : null} />
          </div>
        </>
      )}
    </AccountPage>
  );
}
