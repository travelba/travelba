import Link from "next/link";
import { requireStaffPage } from "@/lib/crm/auth";
import {
  BOOKING_STATUS_LABELS,
  customerFullName,
  type CrmBalance,
  type CrmBooking,
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
import { stayHeadline } from "@/lib/crm/carnet";
import { AdminLaunchStatus } from "@/components/admin/AdminLaunchStatus";
import { ServiceDesk } from "@/components/admin/ServiceDesk";
import { EstaNoticeList } from "@/components/admin/EstaNoticeList";
import { VisaDesk } from "@/components/admin/VisaDesk";
import { loadOpenEstaNotices } from "@/lib/crm/esta-run";
import { deskView, type DeskTask } from "@/lib/crm/visa-desk";
import { BookingHero } from "@/components/crm/BookingHero";
import { loadStayMaps } from "@/lib/crm/carnet-query";
import { loadDisplayedStayAmounts } from "@/lib/crm/displayed-stay";
import { reviewIdentityPieces } from "@/lib/crm/trip-documents";
import {
  EmptyState,
  PageEyebrow,
  PageTitle,
  BookingStatusBadge,
  StatusChip,
  bookingStatusTone,
} from "@/components/crm/ui";
import { staffRoleLabel } from "@/lib/crm/staff-team";
import { serviceDeskLines, type ServiceDeskItem } from "@/lib/crm/service-desk";
import { adminBadges } from "@/lib/crm/admin-badges";
import { adminTodoLines } from "@/lib/crm/admin-todo";
import { CUSTOMER_NAME_SELECT, type CustomerNameRow } from "@/lib/crm/customer-search";

const SERVICE_KINDS = ["chauffeur", "greeter", "checkin"] as const;

export default async function AdminHomePage() {
  const { supabase, staff } = await requireStaffPage();

  const today = todayIsoDate();
  const soon = isoDateInDays(90);
  const weekAgo = isoDateInDays(-7);

  const [
    { data: bookings },
    { data: docs },
    { count: bookingCount },
    { count: publishedCount },
    { count: customerCount },
    { count: withPhoneCount },
    { data: balances },
    { count: departSoonCount },
    { count: departTomorrowCount },
    { data: taskRows },
    { data: activeBookings },
    revolutIsConnected,
    badges,
    estaNotices,
  ] = await Promise.all([
    supabase
      .from("crm_bookings")
      .select("*")
      .gte("start_date", today)
      .neq("status", "cancelled")
      .is("archived_at", null)
      .order("start_date")
      .limit(10),
    supabase
      .from("crm_travel_documents")
      .select("*")
      .not("expires_on", "is", null)
      .lte("expires_on", soon)
      .order("expires_on")
      .limit(40),
    supabase.from("crm_bookings").select("id", { count: "exact", head: true }).is("archived_at", null),
    supabase
      .from("crm_bookings")
      .select("id", { count: "exact", head: true })
      .eq("visible_to_client", true)
      .is("archived_at", null),
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
      .neq("status", "cancelled")
      .is("archived_at", null),
    supabase
      .from("crm_bookings")
      .select("id", { count: "exact", head: true })
      .eq("start_date", isoDateInDays(1))
      .neq("status", "cancelled")
      .is("archived_at", null),
    // Formalités ouvertes, ou faites depuis moins de 7 jours : le reste n’intéresse plus le bureau (A-24).
    supabase
      .from("crm_visa_tasks")
      .select("booking_id, holder_name, reference, reasons, done_at, created_at")
      .or(`done_at.is.null,done_at.gte.${weekAgo}`)
      .order("created_at", { ascending: false })
      .limit(100),
    // Dossiers vivants (ni annulés, ni archivés, pas terminés) : périmètre des services à confirmer.
    supabase
      .from("crm_bookings")
      .select("id, reference, status, customer_id")
      .neq("status", "cancelled")
      .is("archived_at", null)
      .or(`end_date.is.null,end_date.gte.${isoDateInDays(-1)}`)
      .order("start_date", { ascending: true, nullsFirst: false })
      .limit(300),
    revolutConnected(),
    adminBadges(),
    loadOpenEstaNotices(supabase).catch(() => []),
  ]);
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
  const upcoming = (bookings || []) as CrmBooking[];
  const desk = deskView(
    ((taskRows || []) as {
      booking_id: string;
      holder_name: string;
      reference: string;
      reasons: DeskTask["reasons"];
      done_at: string | null;
      created_at: string;
    }[]).map((row) => ({
      bookingId: row.booking_id,
      holderName: row.holder_name,
      reference: row.reference,
      reasons: row.reasons || [],
      doneAt: row.done_at,
      createdAt: row.created_at,
    })),
    today
  );
  const serviceBookings = (activeBookings || []) as {
    id: string;
    reference: string;
    status: string;
    customer_id: string;
  }[];
  const serviceBookingIds = serviceBookings.map((row) => row.id);
  const { data: serviceRows } = serviceBookingIds.length
    ? await supabase
        .from("crm_booking_items")
        .select("id, booking_id, kind, title, start_at, end_at, details")
        .in("booking_id", serviceBookingIds)
        .in("kind", [...SERVICE_KINDS])
    : { data: [] as ServiceDeskItem[] };
  const serviceItems = (serviceRows || []) as ServiceDeskItem[];
  const withServices = [...new Set(serviceItems.map((row) => row.booking_id))];
  const { data: serviceFlights } = withServices.length
    ? await supabase
        .from("crm_booking_items")
        .select("id, booking_id, kind, title, start_at, end_at, details")
        .in("booking_id", withServices)
        .eq("kind", "flight")
    : { data: [] as ServiceDeskItem[] };
  const expiringPieces = reviewIdentityPieces((docs || []) as CrmTravelDocument[]).slice(0, 8);

  // Noms des seuls clients affichés (prochains dossiers, services, pièces) : pas toute la table (A-24).
  const nameIds = [
    ...new Set(
      [
        ...upcoming.map((row) => row.customer_id),
        ...serviceBookings.filter((row) => withServices.includes(row.id)).map((row) => row.customer_id),
        ...expiringPieces.map((doc) => doc.customer_id),
      ].filter(Boolean)
    ),
  ];
  const [{ data: customers }, displayedStayAmounts, places] = await Promise.all([
    nameIds.length
      ? supabase.from("crm_customers").select(CUSTOMER_NAME_SELECT).in("id", nameIds)
      : Promise.resolve({ data: [] as CustomerNameRow[] }),
    loadDisplayedStayAmounts(supabase, upcoming),
    loadStayMaps(
      supabase,
      upcoming.map((row) => row.id)
    ),
  ]);
  const byId = new Map(((customers || []) as CustomerNameRow[]).map((c) => [c.id, customerFullName(c)]));
  const services = serviceDeskLines({
    now: new Date(),
    names: Object.fromEntries(byId),
    bookings: serviceBookings.filter((row) => withServices.includes(row.id)),
    items: [...serviceItems, ...((serviceFlights || []) as ServiceDeskItem[])],
  });
  const todo = adminTodoLines({
    revolut: badges.revolut,
    emails: badges.emails,
    le: badges.le,
    formalities: desk.open.length,
    services: services.length,
    departTomorrow: departTomorrowCount ?? 0,
    expiring: badges.pieces,
  });
  const staffFirst = (staff.full_name || "l’agence").split(" ")[0];
  const featured = upcoming[0];
  const rest = upcoming.slice(1);
  const kpis = [
    {
      label: "Encours à encaisser",
      value: formatMoney(remainingDue),
      hint: "Encours négatifs · voir les transactions",
      href: "/admin/transactions",
      tone: "gold" as const,
    },
    {
      label: "Départs sous 7 jours",
      value: String(departSoonCount ?? 0),
      hint: `${bookingCount ?? 0} dossier${(bookingCount ?? 0) > 1 ? "s" : ""} au portefeuille`,
      href: "/admin/reservations?etat=a-venir&tri=depart-asc",
      tone: "navy" as const,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <PageEyebrow>Espace agence</PageEyebrow>
        <PageTitle
          title={`Bonjour ${staffFirst}`}
          subtitle={`${staff.full_name || "Agent"} · ${staffRoleLabel(staff.role)} · ${formatDateFr(today)}`}
        />
      </div>

      <section id="a-faire" className="admin-af-card rounded-2xl p-5" aria-labelledby="a-faire-titre">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="a-faire-titre" className="font-display text-lg font-bold text-[var(--admin-navy)]">
            À faire aujourd’hui
          </h2>
          {todo.length ? (
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9e7e51]">
              {todo.length} point{todo.length > 1 ? "s" : ""}
            </p>
          ) : null}
        </div>
        {todo.length ? (
          <ol className="mt-3 divide-y divide-border text-sm">
            {todo.map((row) => (
              <li key={row.id}>
                <Link href={row.href} className="flex items-center justify-between gap-3 py-2.5 font-semibold text-[var(--admin-navy)]">
                  <span>{row.label}</span>
                  <span aria-hidden>→</span>
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-sm text-muted">Rien en attente. Bonne journée.</p>
        )}
        <div className="mt-4 space-y-4">
          <div id="formalites">
            <VisaDesk open={desk.open} grey={desk.grey} />
            <EstaNoticeList notices={estaNotices} />
          </div>
          <ServiceDesk lines={services} />
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        {kpis.map((kpi) => (
          <Link
            key={kpi.label}
            href={kpi.href}
            className={`rounded-2xl px-5 py-4 transition ${
              kpi.tone === "navy"
                ? "bg-[var(--admin-navy)] text-white shadow-sm"
                : "border border-[var(--admin-gold)]/40 bg-[#f8f4ed] text-[var(--admin-navy)]"
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

      <div className="grid items-start gap-6 lg:grid-cols-12">
      <div className="space-y-6 lg:col-span-8">
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
            <BookingHero booking={featured} places={places.arrival[featured.id]} priority>
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
                    {stayHeadline(featured.title, featured.destination, places.route[featured.id])}
                  </h3>
                  <p className="mt-1 text-sm text-white/80">
                    {byId.get(featured.customer_id) || "Client"} ·{" "}
                    {formatDateFr(featured.start_date)}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-[var(--admin-gold)]">
                    {formatMoney(displayedStayAmounts.get(featured.id) ?? Number(featured.total_amount), featured.currency)}
                  </p>
                </div>
              </div>
            </BookingHero>
          </Link>
        ) : (
          <EmptyState
            title="Aucune réservation à venir"
            description="Importez les PDF d’un vrai dossier, Enregistrer, puis Montrer au client. Le carnet n’apparaît côté client qu’après ce geste."
            action={
              <Link
                href="/admin/reservations/nouveau"
                className="admin-af-btn inline-flex rounded-xl px-4 py-2.5 text-sm"
              >
                Nouveau dossier
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
                  <div className="flex min-w-0 items-center gap-3">
                    <BookingHero booking={b} places={places.arrival[b.id]} plain className="h-14 w-24 shrink-0 rounded-xl" />
                    <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#9e7e51]">
                      {b.reference}
                      {jMinusLabel(b.start_date) ? ` · ${jMinusLabel(b.start_date)}` : ""}
                    </p>
                    <p className="font-semibold text-[var(--admin-navy)]">
                      {stayHeadline(b.title, b.destination, places.route[b.id])}
                    </p>
                    <p className="text-xs text-muted">
                      {byId.get(b.customer_id) || "Client"} · {formatDateFr(b.start_date)}
                    </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusChip tone={bookingStatusTone(b.status)}>
                      {BOOKING_STATUS_LABELS[b.status]}
                    </StatusChip>
                    <span className="text-sm font-semibold">
                      {formatMoney(displayedStayAmounts.get(b.id) ?? Number(b.total_amount), b.currency)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
      </div>

      <aside className="space-y-4 lg:col-span-4">
      <AdminLaunchStatus items={launchItems} />
      <section className="admin-af-card overflow-hidden rounded-2xl">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <h2 className="font-display text-lg font-bold text-[var(--admin-navy)]">
            Documents bientôt expirés
          </h2>
        </div>
        <ul className="divide-y divide-border text-sm">
          {expiringPieces.map((d) => (
            <li key={d.id} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
              <Link
                href={d.booking_id ? `/admin/reservations/${d.booking_id}` : `/admin/clients/${d.customer_id}`}
                className="min-w-0 break-words font-medium text-[var(--admin-navy)] hover:underline"
              >
                {d.doc_type} {d.number || ""} · {byId.get(d.customer_id) || "Client"}
              </Link>
              <span className="shrink-0 font-semibold text-[var(--admin-red)]">
                {formatDateFr(d.expires_on)}
              </span>
            </li>
          ))}
          {!expiringPieces.length ? (
            <li className="px-5 py-8 text-center text-muted">Aucun document bientôt expiré.</li>
          ) : null}
        </ul>
      </section>
      </aside>
      </div>
    </div>
  );
}
