import Link from "next/link";
import { requireStaffPage } from "@/lib/crm/auth";
import { customerFullName, type CrmBalance, type CrmBooking } from "@/lib/crm/types";
import { formatDateFr, formatMoney } from "@/lib/crm/money";
import { addIsoDays } from "@/lib/crm/dates";
import { stayToday } from "@/lib/crm/stay-moment";
import { loadAgencyAccounts } from "@/lib/crm/agency-accounts";
import { loadDashboardMails } from "@/lib/crm/dashboard-mails";
import { AgencyAccountBalances } from "@/components/admin/AccountBalance";
import { RecentMails } from "@/components/admin/RecentMails";
import { revolutConfigured, revolutConnected } from "@/lib/crm/revolut";
import { stripeConfigured, stripeWebhookConfigured } from "@/lib/crm/stripe";
import { buildLaunchItems } from "@/lib/crm/launch-status";
import { AdminLaunchStatus } from "@/components/admin/AdminLaunchStatus";
import { DashboardWeek } from "@/components/admin/DashboardWeek";
import { dashboardWeek } from "@/lib/crm/dashboard-week";
import { loadStayMaps } from "@/lib/crm/carnet-query";
import { loadDisplayedStayAmounts } from "@/lib/crm/displayed-stay";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { adminBadges } from "@/lib/crm/admin-badges";
import { adminTodoLines } from "@/lib/crm/admin-todo";
import { loadAgencyServiceDesk } from "@/lib/crm/service-desk-load";
import { CUSTOMER_NAME_SELECT, type CustomerNameRow } from "@/lib/crm/customer-search";

export default async function AdminHomePage() {
  const { supabase, staff } = await requireStaffPage();

  const today = stayToday();
  const tomorrow = addIsoDays(today, 1);
  const horizon = addIsoDays(today, 7);

  const [
    { data: travellingRows },
    { data: upcomingRows },
    { count: bookingCount },
    { count: publishedCount },
    { count: customerCount },
    { count: withPhoneCount },
    { data: balances },
    { count: departTomorrowCount },
    { count: openFormalities },
    revolutIsConnected,
    badges,
    serviceLines,
    agencyAccounts,
    recentMails,
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
      .eq("start_date", tomorrow)
      .neq("status", "cancelled")
      .is("archived_at", null),
    supabase.from("crm_visa_tasks").select("id", { count: "exact", head: true }).is("done_at", null),
    revolutConnected(),
    adminBadges(),
    loadAgencyServiceDesk(supabase),
    loadAgencyAccounts(),
    loadDashboardMails(supabase),
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
  const todo = adminTodoLines({
    emails: badges.emails,
    le: badges.le,
    formalities: openFormalities ?? 0,
    services: serviceLines.length,
    departTomorrow: departTomorrowCount ?? 0,
    expiring: badges.pieces,
  });
  const staffFirst = (staff.full_name || "l’agence").split(" ")[0];

  return (
    <div className="space-y-6">
      <div>
        <PageEyebrow>Espace agence</PageEyebrow>
        <PageTitle title={`Bonjour ${staffFirst}`} subtitle={formatDateFr(today)} />
      </div>

      <AgencyAccountBalances accounts={agencyAccounts} />

      <section aria-labelledby="a-faire-titre">
        <h2 id="a-faire-titre" className="font-display text-lg font-bold text-[var(--admin-navy)]">
          À faire aujourd’hui
        </h2>
        {todo.length ? (
          <ul className="mt-3 flex gap-3 overflow-x-auto py-1 lg:flex-wrap lg:overflow-visible">
            {todo.map((row) => (
              <li key={row.id} className="shrink-0">
                <Link
                  href={row.href}
                  className="flex min-w-[12.5rem] items-center gap-3 rounded-2xl border border-[var(--admin-gold)]/30 bg-[#f8f4ed] px-4 py-3 text-[var(--admin-navy)] transition hover:border-[var(--admin-gold)]"
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

      <RecentMails mails={recentMails} />

      <section aria-labelledby="argent-titre" className="space-y-3">
        <h2 id="argent-titre" className="font-display text-lg font-bold text-[var(--admin-navy)]">
          Argent
        </h2>
        <Link
          href="/admin/transactions"
          className="block max-w-sm rounded-2xl border border-[var(--admin-gold)]/40 bg-[#f8f4ed] px-5 py-4 text-[var(--admin-navy)] transition hover:border-[var(--admin-gold)]"
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">Encours à encaisser</p>
          <p className="mt-2 font-display text-3xl font-bold tabular-nums">{formatMoney(remainingDue)}</p>
          <p className="mt-1 text-xs text-muted">Encours négatifs · voir les transactions</p>
        </Link>
      </section>

      <DashboardWeek groups={week} names={byId} places={places} amounts={displayedStayAmounts} />

      <AdminLaunchStatus items={launchItems} />
    </div>
  );
}

function todoCaption(label: string) {
  return label.replace(/^\d+\s+/, "");
}
