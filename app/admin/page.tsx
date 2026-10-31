import Link from "next/link";
import { requireStaffPage } from "@/lib/crm/auth";
import { customerFullName, type CrmBalance, type CrmBooking } from "@/lib/crm/types";
import { formatDateFr, formatMoney } from "@/lib/crm/money";
import { addIsoDays } from "@/lib/crm/dates";
import { stayToday } from "@/lib/crm/stay-moment";
import { loadAgencyAccounts } from "@/lib/crm/agency-accounts";
import { AgencyAccountBalances } from "@/components/admin/AccountBalance";
import { ClientActivity } from "@/components/admin/ClientActivity";
import { loadClientActivityFeed } from "@/lib/crm/client-activity-feed";
import { DashboardWeek } from "@/components/admin/DashboardWeek";
import { dashboardWeek } from "@/lib/crm/dashboard-week";
import { resolveListCovers } from "@/lib/crm/cover-resolve";
import { loadStayMaps } from "@/lib/crm/carnet-query";
import { loadDisplayedStayAmounts } from "@/lib/crm/displayed-stay";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { adminBadges } from "@/lib/crm/admin-badges";
import { adminTodoLines } from "@/lib/crm/admin-todo";
import { ADMIN_ROUTES } from "@/lib/crm/admin-nav";
import { loadAgencyServiceDesk } from "@/lib/crm/service-desk-load";
import { CUSTOMER_NAME_SELECT, type CustomerNameRow } from "@/lib/crm/customer-search";
import { siteConfig } from "@/lib/site";

/** Même segment que le layout : le modèle de titre ne s’applique pas ici. */
export const metadata = { title: { absolute: `Accueil — ${siteConfig.shortName}` } };

export default async function AdminHomePage() {
  const { supabase, staff } = await requireStaffPage();

  const today = stayToday();
  const tomorrow = addIsoDays(today, 1);
  const horizon = addIsoDays(today, 7);

  const [
    { data: travellingRows },
    { data: upcomingRows },
    { data: balances },
    { count: departTomorrowCount },
    { count: openFormalities },
    badges,
    serviceLines,
    agencyAccounts,
    clientActivity,
  ] = await Promise.all([
    supabase
      .from("crm_bookings")
      .select("*")
      .lt("start_date", today)
      .neq("status", "cancelled")
      .is("archived_at", null)
      .or(`end_date.gte.${today},end_date.is.null`)
      .order("end_date", { ascending: true, nullsFirst: false })
      .limit(40),
    supabase
      .from("crm_bookings")
      .select("*")
      .gte("start_date", today)
      .lte("start_date", horizon)
      .neq("status", "cancelled")
      .is("archived_at", null)
      .order("start_date")
      .limit(40),
    supabase.from("crm_customer_balances").select("balance, currency"),
    supabase
      .from("crm_bookings")
      .select("id", { count: "exact", head: true })
      .eq("start_date", tomorrow)
      .neq("status", "cancelled")
      .is("archived_at", null),
    supabase.from("crm_visa_tasks").select("id", { count: "exact", head: true }).is("done_at", null),
    adminBadges(),
    loadAgencyServiceDesk(supabase),
    loadAgencyAccounts(),
    loadClientActivityFeed(supabase, today),
  ]);
  const remainingDue = ((balances || []) as Pick<CrmBalance, "balance" | "currency">[]).reduce(
    (sum, row) => sum + Math.max(0, -Number(row.balance) || 0),
    0
  );
  const weekBookings = [...((travellingRows || []) as CrmBooking[]), ...((upcomingRows || []) as CrmBooking[])];
  const week = dashboardWeek(weekBookings, today);
  const shown = [...week.travelling, ...week.soon, ...week.week].map((entry) => entry.booking);
  const nameIds = [...new Set(shown.map((row) => row.customer_id).filter(Boolean))];
  const [{ data: customers }, displayedStayAmounts, places] = await Promise.all([
    nameIds.length
      ? supabase.from("crm_customers").select(CUSTOMER_NAME_SELECT).in("id", nameIds)
      : Promise.resolve({ data: [] as CustomerNameRow[] }),
    loadDisplayedStayAmounts(supabase, shown),
    loadStayMaps(
      supabase,
      shown.map((row) => row.id)
    ),
  ]);
  const byId = new Map(((customers || []) as CustomerNameRow[]).map((row) => [row.id, customerFullName(row)]));
  const covers = await resolveListCovers(
    shown.map((row) => ({
      id: row.id,
      booking: row,
      places: places.arrival[row.id],
      countries: places.countries[row.id],
    }))
  );
  const whatsappOpen = await supabase
    .from("crm_whatsapp_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "open");
  const todo = adminTodoLines({
    emails: badges.emails,
    le: badges.le,
    formalities: openFormalities ?? 0,
    services: serviceLines.length,
    departTomorrow: departTomorrowCount ?? 0,
    expiring: badges.pieces,
    whatsapp: whatsappOpen.error ? 0 : whatsappOpen.count ?? 0,
    unread: badges.whatsapp,
    hotels: badges.hotels,
    credits: badges.revolut + badges.stripe,
    costs: badges.costs,
  });
  const staffFirst = (staff.full_name || "l’agence").split(" ")[0];

  return (
    <div className="space-y-6">
      <div>
        <PageEyebrow>Espace agence</PageEyebrow>
        <PageTitle title="Accueil" subtitle={`Bonjour ${staffFirst}, ${formatDateFr(today)}.`} />
      </div>

      <section aria-labelledby="a-faire-titre">
        <h2 id="a-faire-titre" className="font-display text-lg font-bold text-[var(--admin-navy)]">
          À faire aujourd’hui
        </h2>
        {todo.length ? (
          <ul className="mt-3 flex flex-col gap-2 lg:flex-row lg:flex-wrap">
            {todo.map((row) => (
              <li key={row.id} className="min-w-0 lg:shrink-0">
                <Link
                  href={row.href}
                  className="flex min-h-11 items-center gap-3 rounded-2xl border border-[var(--admin-gold)]/30 bg-[#f8f4ed] px-4 py-3 text-[var(--admin-navy)] transition hover:border-[var(--admin-gold)] lg:min-w-[12.5rem]"
                >
                  <span className="font-display text-2xl font-bold tabular-nums text-[var(--admin-gold)]">{row.count}</span>
                  <span className="max-w-[11rem] text-sm font-semibold leading-snug">{todoCaption(row.label)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">Rien en attente. Bonne journée.</p>
        )}
      </section>

      <DashboardWeek groups={week} names={byId} places={places} amounts={displayedStayAmounts} covers={covers} />

      <section aria-labelledby="argent-titre" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="argent-titre" className="font-display text-lg font-bold text-[var(--admin-navy)]">
            Argent
          </h2>
          <Link href={ADMIN_ROUTES.argent} className="text-sm font-semibold text-[var(--admin-navy)] underline">
            Tout voir
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-[repeat(auto-fit,minmax(13.5rem,1fr))]">
          <Link
            href={`${ADMIN_ROUTES.argent}?onglet=grand-livre`}
            className="rounded-2xl border border-[var(--admin-gold)]/40 bg-[#f8f4ed] px-5 py-4 text-[var(--admin-navy)] transition hover:border-[var(--admin-gold)]"
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">Reste à encaisser</p>
            <p className="mt-2 font-display text-3xl font-bold tabular-nums">{formatMoney(remainingDue)}</p>
            <p className="mt-1 text-xs text-muted">Somme des comptes débiteurs</p>
          </Link>
          <AgencyAccountBalances accounts={agencyAccounts} bare />
        </div>
      </section>

      <ClientActivity groups={clientActivity} today={today} collapsed />
    </div>
  );
}

function todoCaption(label: string) {
  return label.replace(/^\d+\s+/, "");
}
