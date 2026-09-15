import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { ensureStaff } from "@/lib/crm/auth";
import {
  BOOKING_STATUS_LABELS,
  customerFullName,
  type CrmBooking,
  type CrmCustomer,
  type CrmTravelDocument,
} from "@/lib/crm/types";
import { formatDateFr, formatMoney } from "@/lib/crm/money";
import { redirect } from "next/navigation";
import { PageEyebrow, PageTitle, StatusChip, bookingStatusTone } from "@/components/crm/ui";

export default async function AdminHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const staff = await ensureStaff(user);
  if (!staff) redirect("/admin/login");

  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);

  const [
    { data: bookings },
    { data: docs },
    { count: customersCount },
    { count: upcomingCount },
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
    supabase.from("crm_customers").select("id", { count: "exact", head: true }),
    supabase
      .from("crm_bookings")
      .select("id", { count: "exact", head: true })
      .gte("start_date", today)
      .neq("status", "cancelled"),
  ]);

  let unmatched = 0;
  let encoursTotal = 0;
  try {
    const admin = createServiceClient();
    const { count } = await admin
      .from("crm_revolut_transactions")
      .select("id", { count: "exact", head: true })
      .eq("status", "unmatched");
    unmatched = count ?? 0;
    const { data: bals } = await admin.from("crm_customer_balances").select("balance");
    encoursTotal = (bals || []).reduce(
      (s, row) => s + Number((row as { balance: number }).balance),
      0
    );
  } catch {
    unmatched = 0;
  }

  const { data: customers } = await supabase
    .from("crm_customers")
    .select("id, first_name, last_name");
  const byId = new Map(
    ((customers || []) as Pick<CrmCustomer, "id" | "first_name" | "last_name">[]).map(
      (c) => [c.id, customerFullName(c)]
    )
  );

  return (
    <div className="space-y-6">
      <div>
        <PageEyebrow>Back-office agence</PageEyebrow>
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Link href="/admin/clients" className="admin-af-card rounded-2xl p-5 transition hover:shadow-md">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            Clients
          </p>
          <p className="mt-2 font-display text-3xl font-extrabold text-[var(--admin-navy)]">
            {customersCount ?? 0}
          </p>
        </Link>
        <Link
          href="/admin/reservations"
          className="admin-af-card rounded-2xl p-5 transition hover:shadow-md"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            Réservations à venir
          </p>
          <p className="mt-2 font-display text-3xl font-extrabold text-[var(--admin-navy)]">
            {upcomingCount ?? 0}
          </p>
        </Link>
        <div className="admin-af-card rounded-2xl p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            Encours net
          </p>
          <p className="mt-2 font-display text-3xl font-extrabold text-[var(--admin-navy)]">
            {formatMoney(encoursTotal)}
          </p>
        </div>
        <Link href="/admin/revolut" className="admin-af-card rounded-2xl p-5 transition hover:shadow-md">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            Virements à rapprocher
          </p>
          <p className="mt-2 font-display text-3xl font-extrabold text-[var(--admin-navy)]">
            {unmatched}
          </p>
        </Link>
      </div>

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
            <li className="px-5 py-8 text-center text-sm text-muted">
              Aucune réservation à venir.
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
                href={`/admin/clients/${d.customer_id}`}
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
