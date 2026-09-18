import Link from "next/link";
import { requireStaffPage } from "@/lib/crm/auth";
import {
  BOOKING_STATUS_LABELS,
  customerFullName,
  type CrmBooking,
  type CrmCustomer,
  type CrmTravelDocument,
} from "@/lib/crm/types";
import { formatDateFr, formatMoney, isoDateInDays, todayIsoDate } from "@/lib/crm/money";
import { revolutConfigured, revolutConnected } from "@/lib/crm/revolut";
import { stripeConfigured, stripeWebhookConfigured } from "@/lib/crm/stripe";
import { buildLaunchItems } from "@/lib/crm/launch-status";
import { AdminLaunchStatus } from "@/components/admin/AdminLaunchStatus";
import {
  EmptyState,
  PageEyebrow,
  PageTitle,
  StatusChip,
  bookingStatusTone,
} from "@/components/crm/ui";

export default async function AdminHomePage() {
  const { supabase, staff } = await requireStaffPage();

  const today = todayIsoDate();
  const soon = isoDateInDays(90);

  const [
    { data: bookings },
    { data: docs },
    { data: customers },
    { count: bookingCount },
    { count: publishedCount },
    { count: customerCount },
    { count: withPhoneCount },
    revolutIsConnected,
  ] = await Promise.all([
    supabase
      .from("crm_bookings")
      .select("*")
      .gte("start_date", today)
      .neq("status", "cancelled")
      .order("start_date")
      .limit(10),
    supabase
      .from("crm_travel_documents")
      .select("*")
      .not("expires_on", "is", null)
      .lte("expires_on", soon)
      .order("expires_on")
      .limit(8),
    supabase.from("crm_customers").select("id, first_name, last_name"),
    supabase.from("crm_bookings").select("id", { count: "exact", head: true }),
    supabase
      .from("crm_bookings")
      .select("id", { count: "exact", head: true })
      .eq("visible_to_client", true),
    supabase.from("crm_customers").select("id", { count: "exact", head: true }),
    supabase
      .from("crm_customers")
      .select("id", { count: "exact", head: true })
      .not("phone", "is", null)
      .neq("phone", ""),
    revolutConnected(),
  ]);
  const byId = new Map(
    ((customers || []) as Pick<CrmCustomer, "id" | "first_name" | "last_name">[]).map(
      (c) => [c.id, customerFullName(c)]
    )
  );
  const customersTotal = customerCount ?? 0;
  const launchItems = buildLaunchItems({
    customerCount: customersTotal,
    customersWithoutPhone: Math.max(0, customersTotal - (withPhoneCount ?? 0)),
    bookingCount: bookingCount ?? 0,
    publishedCount: publishedCount ?? 0,
    revolutConfigured: revolutConfigured(),
    revolutConnected: revolutIsConnected,
    stripeConfigured: stripeConfigured(),
    stripeWebhookConfigured: stripeWebhookConfigured(),
  });

  return (
    <div className="space-y-6">
      <div>
        <PageEyebrow>Espace agence</PageEyebrow>
        <PageTitle
          title="Vue d’ensemble"
          subtitle={`Connecté en tant que ${staff.full_name || "agent"} · ${staff.role}`}
          actions={
            <Link
              href="/admin/reservations"
              className="admin-af-btn inline-flex rounded-xl px-4 py-2.5 text-sm"
            >
              + Nouvelle réservation
            </Link>
          }
        />
      </div>

      <AdminLaunchStatus items={launchItems} />

      <section className="admin-af-card overflow-hidden rounded-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <h2 className="font-display text-lg font-bold text-[var(--admin-navy)]">
            Prochaines réservations
          </h2>
          <Link href="/admin/reservations" className="text-sm font-semibold text-[var(--admin-navy)]">
            Tout voir →
          </Link>
        </div>
        <ul className="divide-y divide-border">
          {((bookings || []) as CrmBooking[]).map((b) => (
            <li key={b.id}>
              <Link
                href={`/admin/reservations/${b.id}`}
                className="flex flex-col gap-2 px-5 py-3.5 transition hover:bg-[var(--admin-sky)]/40 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-semibold text-[var(--admin-navy)]">
                    {b.reference} · {b.title}
                  </p>
                  <p className="text-xs text-muted">
                    {byId.get(b.customer_id) || "Client"} · {formatDateFr(b.start_date)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusChip tone={bookingStatusTone(b.status)}>
                    {BOOKING_STATUS_LABELS[b.status]}
                  </StatusChip>
                  <span className="text-sm font-semibold">
                    {formatMoney(Number(b.total_amount), b.currency)}
                  </span>
                </div>
              </Link>
            </li>
          ))}
          {!bookings?.length ? (
            <li className="px-5 py-6">
              <EmptyState
                title="Aucune réservation à venir"
                description="Importez les PDF d’un vrai dossier, Enregistrer, puis Publier. Le carnet n’apparaît côté client qu’après Publier."
                action={
                  <Link
                    href="/admin/reservations"
                    className="admin-af-btn inline-flex rounded-xl px-4 py-2.5 text-sm"
                  >
                    Importer un dossier
                  </Link>
                }
              />
            </li>
          ) : null}
        </ul>
      </section>

      <section className="admin-af-card overflow-hidden rounded-2xl">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <h2 className="font-display text-lg font-bold text-[var(--admin-navy)]">
            Documents bientôt expirés
          </h2>
        </div>
        <ul className="divide-y divide-border text-sm">
          {((docs || []) as CrmTravelDocument[]).map((d) => (
            <li key={d.id} className="flex justify-between gap-3 px-5 py-3">
              <Link
                href={d.booking_id ? `/admin/reservations/${d.booking_id}` : `/admin/clients/${d.customer_id}`}
                className="font-medium text-[var(--admin-navy)] hover:underline"
              >
                {d.doc_type} {d.number || ""} · {byId.get(d.customer_id) || d.customer_id}
              </Link>
              <span className="shrink-0 font-semibold text-[var(--admin-red)]">
                {formatDateFr(d.expires_on)}
              </span>
            </li>
          ))}
          {!docs?.length ? (
            <li className="px-5 py-8 text-center text-muted">Aucun document bientôt expiré.</li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
