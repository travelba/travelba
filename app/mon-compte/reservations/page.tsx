import { bookingPayerLabel, type FundingCompany } from "@/lib/crm/funding-wallet";
import { toPublicBooking } from "@/lib/crm/public-booking";
import Link from "next/link";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { ensureCustomerForUser, getSessionUser } from "@/lib/crm/auth";
import { stayTransitionName } from "@/lib/crm/account-motion";
import { AccountPage } from "@/components/account/AccountPage";
import { RememberEspace } from "@/components/account/RememberEspace";
import { HIDDEN_PRICE_LABEL, stayHeroPlace } from "@/lib/crm/carnet";
import { applyClientStayFace } from "@/lib/crm/client-stay-face";
import { loadDisplayedStayAmounts } from "@/lib/crm/displayed-stay";
import { isClientPastStay, isClientUpcomingStay } from "@/lib/crm/client-stays";
import {
  formatDateRangeShort,
  formatMoney,
  jMinusLabel,
  tripDurationDays,
} from "@/lib/crm/money";
import { createServiceClient } from "@/lib/supabase/admin";
import { EmptyState } from "@/components/crm/ui";
import { resolveListCovers } from "@/lib/crm/cover-resolve";
import { loadClientCarnets, sortBookingsByStart } from "@/lib/crm/carnet-query";
import { clientTripOwnerIds, clientTwinIds } from "@/lib/crm/company-peers";
import { BookingHero } from "@/components/crm/BookingHero";
import { BoardingReadyNote } from "@/components/account/BoardingPassStack";
import { boardingPassBookingIds } from "@/lib/crm/client-boarding-pass-load";
import { Icon } from "@/components/crm/icons";
import { siteConfig } from "@/lib/site";
import { clientHidesPrices, foreignPriceOwnerIds, stayHidesPrices, stripClientMoneyItem } from "@/lib/crm/client-price-privacy";
import { hiddenPriceCustomerIds } from "@/lib/crm/client-price-privacy-load";

export const metadata = { title: `Réservations — ${siteConfig.shortName}` };

export default async function ReservationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const { supabase, user } = await getSessionUser();
  if (!user) redirect("/connexion");
  const customer = await ensureCustomerForUser(user);
  if (!customer) redirect("/connexion");

  console.time("[espace] reservations");
  const [ownerIds, twinIds] = await Promise.all([clientTripOwnerIds(customer), clientTwinIds(customer.id)]);
  const { bookings: loaded, faces } = await loadClientCarnets(supabase, customer.id, ownerIds, customer.city);
  const all = loaded.map((booking) => applyClientStayFace(booking, faces[booking.id]));
  const viewerHides = clientHidesPrices(customer);
  const hiddenOwners = viewerHides
    ? new Set<string>()
    : await hiddenPriceCustomerIds(foreignPriceOwnerIds(customer.id, all.map((row) => row.customer_id), twinIds));
  const hidesStay = (ownerId: string) => stayHidesPrices(customer, ownerId, hiddenOwners);
  const priced = viewerHides ? [] : all.filter((row) => !hidesStay(row.customer_id));
  const walletIds = [...new Set(all.map((row) => row.billing_customer_id || row.customer_id))];
  const [displayedAmounts, payerResult, boardingReady] = await Promise.all([
    priced.length
      ? loadDisplayedStayAmounts(createServiceClient(), priced).catch(() => new Map<string, number>())
      : Promise.resolve(new Map<string, number>()),
    walletIds.length
      ? supabase
          .from("crm_billing_companies")
          .select("id, customer_id, company_name, funding, sort_order")
          .in("customer_id", walletIds)
      : Promise.resolve({ data: [] as (FundingCompany & { customer_id: string })[] }),
    boardingPassBookingIds(all.map((row) => row.id)),
  ]);
  const payerCompanies = payerResult.data;
  const companiesByWallet = new Map<string, FundingCompany[]>();
  for (const company of (payerCompanies || []) as (FundingCompany & { customer_id: string })[]) {
    const list = companiesByWallet.get(company.customer_id) || [];
    list.push(company);
    companiesByWallet.set(company.customer_id, list);
  }
  const upcoming = sortBookingsByStart(all.filter((b) => isClientUpcomingStay(b)), "asc");
  const past = sortBookingsByStart(all.filter((b) => isClientPastStay(b)), "desc");
  const showPast = tab === "passes";
  const list = showPast ? past : upcoming;
  const coverRows = list.map((row) => ({
    id: row.id,
    booking: row,
    places: faces[row.id]?.places,
    items: faces[row.id]?.items,
  }));
  const covers = await resolveListCovers(coverRows, { geocode: false });
  console.timeEnd("[espace] reservations");
  after(() => {
    void resolveListCovers(coverRows).catch(() => undefined);
  });
  const shellStays = all.map((booking) => {
    const face = faces[booking.id];
    const title = face?.title || booking.title || "Séjour";
    return {
      reference: booking.reference,
      title,
      when: formatDateRangeShort(booking.start_date, booking.end_date),
      place: stayHeroPlace(title, face?.destination || booking.destination, face?.items) || "",
      upcoming: isClientUpcomingStay(booking),
    };
  });

  return (
    <AccountPage>
    <RememberEspace userId={customer.id} stays={shellStays} />
    <div className="space-y-4">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#b89768]">
          Mon espace voyage
        </p>
        <h1 className="mt-1 font-display text-[1.625rem] font-bold tracking-tight text-[var(--admin-navy)]">
          Réservations
        </h1>
        <p className="mt-1 text-[13px] text-muted">
          Itinéraires publiés par l’agence, billets et vouchers du dossier.
        </p>
      </div>

      <div className="flex rounded-full border border-[#c5c6cd]/40 bg-[#efeeeb] p-1" role="tablist">
        <Link
          href="/mon-compte/reservations"
          prefetch
          aria-selected={!showPast}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.06em] transition ${
            !showPast
              ? "bg-[var(--admin-navy)] text-white shadow-sm"
              : "text-[#44474c] hover:text-[var(--admin-navy)]"
          }`}
        >
          <Icon
            name="flight_takeoff"
            className={`h-4 w-4 ${!showPast ? "text-[var(--admin-gold)]" : ""}`}
          />
          À venir
          <span
            className={`rounded-full px-1.5 text-[10px] font-bold ${
              !showPast
                ? "bg-[var(--admin-gold)] text-[var(--admin-navy)]"
                : "bg-[#e3e2e0] text-[#44474c]"
            }`}
          >
            {upcoming.length}
          </span>
        </Link>
        <Link
          href="/mon-compte/reservations?tab=passes"
          prefetch
          aria-selected={showPast}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.06em] transition ${
            showPast
              ? "bg-[var(--admin-navy)] text-white shadow-sm"
              : "text-[#44474c] hover:text-[var(--admin-navy)]"
          }`}
        >
          <Icon name="history_edu" className="h-4 w-4" />
          Passés
          <span
            className={`rounded-full px-1.5 text-[10px] font-bold ${
              showPast
                ? "bg-[var(--admin-gold)] text-[var(--admin-navy)]"
                : "bg-[#e3e2e0] text-[#44474c]"
            }`}
          >
            {past.length}
          </span>
        </Link>
      </div>

      <ul className="space-y-6">
        {list.map((b) => {
          const countdown = !showPast ? jMinusLabel(b.start_date) : null;
          const nights = tripDurationDays(b.start_date, b.end_date);
          // Même montant que le détail (cartes + commission + billetterie + dépenses) ; sinon « — », jamais le total nu.
          const hideMoney = hidesStay(b.customer_id);
          const displayed = hideMoney ? null : displayedAmounts.get(b.id);
          const amountLabel = hideMoney
            ? null
            : b.prices_visible === false
              ? HIDDEN_PRICE_LABEL
              : displayed == null
                ? "—"
                : formatMoney(displayed, b.currency);
          const payerLabel = hideMoney
            ? null
            : bookingPayerLabel(
            b,
            companiesByWallet.get(b.billing_customer_id || b.customer_id) || []
          );
          return (
            <li key={b.id}>
              <article className="account-press relative overflow-hidden rounded-xl border border-[#c5c6cd]/35 bg-white shadow-sm">
                <BookingHero
                  booking={toPublicBooking(b)}
                  places={faces[b.id]?.places}
                  items={hideMoney ? faces[b.id]?.items?.map((item) => stripClientMoneyItem(item)) : faces[b.id]?.items}
                  width={800}
                  list
                  resolvedSrc={covers[b.id] ?? null}
                  transitionName={stayTransitionName(b.reference)}
                >
                  <div className="absolute left-3 right-3 top-3 flex items-center justify-between gap-2">
                    {countdown ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--admin-gold)]/30 bg-[#faf9f6]/95 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--admin-navy)] shadow-sm">
                        <Icon name="timer" className="h-[14px] w-[14px] text-[#b89768]" />
                        {countdown}
                      </span>
                    ) : (
                      <span />
                    )}
                  </div>
                  <div className="absolute bottom-3 left-3 right-3 text-white">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--admin-gold)]">
                      {formatDateRangeShort(b.start_date, b.end_date)}
                      {nights ? ` (${nights} jour${nights > 1 ? "s" : ""})` : ""}
                    </p>
                    <h2 className="font-display text-2xl font-bold leading-tight">
                      {faces[b.id]?.title || b.title || "Séjour"}
                    </h2>
                  </div>
                </BookingHero>
                <div className="flex flex-col gap-3 bg-white p-4">
                  <div className="grid grid-cols-1 gap-2 rounded-lg border border-[#c5c6cd]/25 bg-[#f4f3f0] p-2.5 min-[400px]:grid-cols-2">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-[#44474c]">
                        Référence
                      </span>
                      <span className="whitespace-nowrap text-[16px] font-bold tabular-nums text-[var(--admin-navy)]">
                        {b.reference}
                      </span>
                    </div>
                    {amountLabel ? (
                    <div className="flex flex-col min-[400px]:items-end min-[400px]:text-right">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-[#44474c]">
                        Montant
                      </span>
                      <span className="text-[16px] font-bold tabular-nums text-[var(--admin-navy)]">{amountLabel}</span>
                    </div>
                    ) : null}
                  </div>
                  {payerLabel ? (
                    <p className="text-[13px] font-semibold text-[var(--admin-navy)]">Réglé par {payerLabel}</p>
                  ) : null}
                  {boardingReady.has(b.id) ? <BoardingReadyNote /> : null}
                  <Link
                    href={`/mon-compte/reservations/${b.reference}`}
                    prefetch
                    transitionTypes={["nav-forward"]}
                    className="account-press inline-flex h-11 w-full items-center justify-center rounded-full bg-[var(--admin-navy)] px-3 text-sm font-semibold text-white"
                  >
                    Accéder à ma réservation
                  </Link>
                </div>
              </article>
            </li>
          );
        })}
        {!list.length ? (
          <li>
            <EmptyState
              title={showPast ? "Aucun voyage passé" : "Aucun voyage à venir"}
              description={
                showPast
                  ? "Vos voyages terminés apparaîtront ici."
                  : "L’agence publiera le carnet dès que le dossier sera prêt."
              }
            />
          </li>
        ) : null}
      </ul>
    </div>
    </AccountPage>
  );
}

