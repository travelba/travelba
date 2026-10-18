import Link from "next/link";
import { requireStaffPage } from "@/lib/crm/auth";
import { HANDOFF_LABELS, type HandoffKind } from "@/lib/crm/whatsapp-concierge";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { formatDateTimeFr } from "@/lib/crm/money";
import { WhatsappResolve } from "@/components/admin/WhatsappResolve";

export const metadata = { title: "WhatsApp" };

type Row = {
  id: string;
  kind: string;
  body: string;
  booking_id: string | null;
  customer_id: string | null;
  phone: string | null;
  created_at: string;
};

type ThreadRow = {
  id: string;
  customer_id: string | null;
  direction: string;
  body: string;
  created_at: string;
  template_key: string | null;
};

function label(kind: string) {
  if (kind in HANDOFF_LABELS) return HANDOFF_LABELS[kind as HandoffKind];
  return "Demande";
}

export default async function WhatsappQueuePage() {
  const { supabase } = await requireStaffPage();
  const rich = await supabase
    .from("crm_whatsapp_requests")
    .select("id, kind, body, booking_id, customer_id, phone, created_at")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(40);
  const pendingMigration = Boolean(rich.error);
  const rows = (pendingMigration ? [] : rich.data || []) as Row[];
  const thread = await supabase
    .from("crm_whatsapp_messages")
    .select("id, customer_id, direction, body, created_at, template_key")
    .order("created_at", { ascending: false })
    .limit(24);
  const messages = (thread.error ? [] : thread.data || []) as ThreadRow[];

  return (
    <div className="space-y-6">
      <div>
        <PageEyebrow>Espace agence</PageEyebrow>
        <PageTitle title="WhatsApp" subtitle="Demandes du Concierge. Une proposition n’est pas un envoi. Rien n’est modifié sur le séjour." />
      </div>
      <p className="flex flex-wrap gap-4 text-sm">
        <Link href="/admin/whatsapp/propositions" className="font-semibold underline-offset-2 hover:underline">
          À approuver
        </Link>
        <Link href="/admin/whatsapp/revue" className="font-semibold underline-offset-2 hover:underline">
          Revue de la semaine
        </Link>
        <Link href="/admin/concierge" className="font-semibold underline-offset-2 hover:underline">
          Savoir
        </Link>
      </p>
      {pendingMigration ? (
        <p className="text-sm text-muted">La file s’affiche après la migration WhatsApp.</p>
      ) : null}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--admin-navy)]">Fil en direct</h2>
        {thread.error ? (
          <p className="text-sm text-muted">Le fil s’affiche après la migration WhatsApp.</p>
        ) : messages.length ? (
          <ul className="space-y-2">
            {messages.map((message) => (
              <li key={message.id} className="admin-af-card rounded-3xl px-5 py-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">
                  {message.direction === "inbound" ? "Client" : message.template_key === "staff" ? "Agence" : "Concierge"}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--admin-navy)]">
                  {message.body.length > 220 ? `${message.body.slice(0, 220)}…` : message.body}
                </p>
                <p className="mt-1 text-xs text-muted">{formatDateTimeFr(message.created_at)}</p>
                {message.customer_id ? (
                  <Link href={`/admin/clients/${message.customer_id}`} className="mt-2 inline-block text-sm font-semibold underline-offset-2 hover:underline">
                    Ouvrir la fiche
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Aucun message journalisé.</p>
        )}
      </section>
      {rows.length ? (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="admin-af-card rounded-3xl px-5 py-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">
                {label(row.kind)}
                {row.phone && !row.customer_id ? ` · ${row.phone}` : ""}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--admin-navy)]">{row.body}</p>
              <p className="mt-1 text-xs text-muted">{formatDateTimeFr(row.created_at)}</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {row.customer_id ? (
                  <Link href={`/admin/clients/${row.customer_id}`} className="text-sm font-semibold underline-offset-2 hover:underline">
                    Ouvrir la fiche
                  </Link>
                ) : null}
                {row.booking_id ? (
                  <Link href={`/admin/reservations/${row.booking_id}`} className="text-sm font-semibold underline-offset-2 hover:underline">
                    Ouvrir le séjour
                  </Link>
                ) : null}
                <WhatsappResolve requestId={row.id} />
              </div>
            </li>
          ))}
        </ul>
      ) : pendingMigration ? null : (
        <p className="text-sm text-muted">Aucune demande en attente.</p>
      )}
    </div>
  );
}
