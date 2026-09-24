import Link from "next/link";
import { requireStaffPage } from "@/lib/crm/auth";
import {
  BOOKING_STATUS_LABELS,
  customerFullName,
  type CrmBalance,
  type CrmBooking,
  type CrmCustomer,
  type CrmTravelDocument,
} from "@/lib/crm/types";
import {
  formatDateFr,
  formatMoney,
  isoDateInDays,
  jMinusLabel,
  todayIsoDate,
} from "@/lib/crm/money";
import { revolutConfigured, revolutConnected } from "@/lib/crm/revolut";
import { stripeConfigured, stripeWebhookConfigured } from "@/lib/crm/stripe";
import { buildLaunchItems } from "@/lib/crm/launch-status";
import { AdminLaunchStatus } from "@/components/admin/AdminLaunchStatus";
import { BookingHero } from "@/components/crm/BookingHero";
import {
  EmptyState,
  PageEyebrow,
  PageTitle,
  BookingStatusBadge,
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
    { data: balances },
    { count: departSoonCount },
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
    supabase.from("crm_customer_balances").select("balance, currency"),
    supabase
      .from("crm_bookings")
      .select("id", { count: "exact", head: true })
      .gte("start_date", today)
      .lte("start_date", isoDateInDays(7))
      .neq("status", "cancelled"),
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
  const remainingDue = ((balances || []) as Pick<CrmBalance, "balance" | "currency">[]).reduce(
    (sum, row) => sum + Math.max(0, -Number(row.balance) || 0),
    0
  );
  const pipelineVolume = ((bookings || []) as CrmBooking[]).reduce(
    (sum, row) => sum + (Number(row.total_amount) || 0),
    0
  );
  const staffFirst = (staff.full_name || "l’agence").split(" ")[0];
  const upcoming = (bookings || []) as CrmBooking[];
  const featured = upcoming[0];
  const rest = upcoming.slice(1);
  const kpis = [
    {
      label: "Portefeuille",
      value: String(bookingCount ?? 0),
      hint: `${formatMoney(pipelineVolume)} à venir`,
      href: "/admin/reservations",
      tone: "ivory" as const,
    },
    {
      label: "Pièces à échéance",
      value: String((docs || []).length),
      hint: "Passeports et pièces < 90 jours",
      href: "/admin/clients",
      tone: "warn" as const,
    },
    {
      label: "Soldes à encaisser",
      value: formatMoney(remainingDue),
      hint: "Encours négatifs",
      href: "/admin/transactions",
      tone: "gold" as const,
    },
    {
      label: "Départs < 7 jours",
      value: String(departSoonCount ?? 0),
      hint: "Séjours non annulés",
      href: "/admin/reservations",
      tone: "navy" as const,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <PageEyebrow>Espace agence</PageEyebrow>
        <PageTitle
          title={`Bonjour ${staffFirst}`}
          subtitle={`${staff.full_name || "Agent"} · ${staff.role} · ${formatDateFr(today)}`}
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

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <Link
            key={kpi.label}
            href={kpi.href}
            className={`rounded-2xl px-5 py-4 transition ${
              kpi.tone === "navy"
                ? "bg-[var(--admin-navy)] text-white shadow-sm"
                : kpi.tone === "gold"
                  ? "border border-[var(--admin-gold)]/40 bg-[#f8f4ed] text-[var(--admin-navy)]"
                  : kpi.tone === "warn"
                    ? "border border-[var(--admin-gold)]/50 bg-white text-[var(--admin-navy)]"
                    : "admin-af-card text-[var(--admin-navy)]"
            }`}
          >
            <p
              className={`text-[10px] font-bold uppercase tracking-[0.14em] ${
                kpi.tone === "navy" ? "text-[var(--admin-gold)]" : "text-[#9e7e51]"
              }`}
            >
              {kpi.label}
            </p>
            <p className="mt-2 font-display text-3xl font-bold">{kpi.value}</p>
            <p className={`mt-1 text-xs ${kpi.tone === "navy" ? "text-white/70" : "text-muted"}`}>
              {kpi.hint}
            </p>
          </Link>
        ))}
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-12">
      <div className="space-y-6 xl:col-span-8">
      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="font-display text-lg font-bold text-[var(--admin-navy)]">
            Prochaines réservations
          </h2>
          <Link href="/admin/reservations" className="text-sm font-semibold text-[var(--admin-navy)]">
            Tout voir →
          </Link>
        </div>

        {featured ? (
          <Link
            href={`/admin/reservations/${featured.id}`}
            className="admin-af-card relative block overflow-hidden rounded-2xl"
          >
            <BookingHero booking={featured} priority>
              <div className="absolute inset-0 flex flex-col justify-between p-5 text-white">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--admin-gold)]">
                    {featured.reference}
                    {jMinusLabel(featured.start_date)
                      ? ` · ${jMinusLabel(featured.start_date)}`
                      : ""}
                  </p>
                  <BookingStatusBadge label={BOOKING_STATUS_LABELS[featured.status]} />
                </div>
                <div>
                  <h3 className="font-display text-2xl font-bold leading-tight">
                    {featured.title}
                  </h3>
                  <p className="mt-1 text-sm text-white/80">
                    {byId.get(featured.customer_id) || "Client"} ·{" "}
                    {formatDateFr(featured.start_date)}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-[var(--admin-gold)]">
                    {formatMoney(Number(featured.total_amount), featured.currency)}
                  </p>
                </div>
              </div>
            </BookingHero>
          </Link>
        ) : (
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
        )}

        {rest.length ? (
          <ul className="admin-af-card divide-y divide-border overflow-hidden rounded-2xl">
            {rest.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/admin/reservations/${b.id}`}
                  className="flex flex-col gap-2 px-5 py-3.5 transition hover:bg-[var(--admin-sky)]/40 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#9e7e51]">
                      {b.reference}
                      {jMinusLabel(b.start_date) ? ` · ${jMinusLabel(b.start_date)}` : ""}
                    </p>
                    <p className="font-semibold text-[var(--admin-navy)]">{b.title}</p>
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
          </ul>
        ) : null}
      </section>
      </div>

      <aside className="space-y-4 xl:col-span-4">
      <AdminLaunchStatus items={launchItems} />
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
      </aside>
      </div>
    </div>
  );
}
