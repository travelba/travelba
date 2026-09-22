import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import { BOOKING_STATUS_LABELS } from "@/lib/crm/types";
import {
  formatDateRangeShort,
  formatMoney,
  isUpcomingBooking,
  jMinusLabel,
  tripDurationDays,
} from "@/lib/crm/money";
import { ConciergeBanner, EmptyState } from "@/components/crm/ui";
import { bookingCoverUrl } from "@/lib/crm/covers";
import { loadVisibleCarnets } from "@/lib/crm/carnet-query";
import { CoverPhoto } from "@/components/crm/CoverPhoto";
import { Icon } from "@/components/crm/icons";
import { PayerChip } from "@/components/crm/PayerChip";
import {
  bookingPayerKind,
  companyDisplayName,
  hasBillingParent,
  isCompanyPaidBooking,
} from "@/lib/crm/company-role";
import type { CrmCustomer } from "@/lib/crm/types";

export default async function ReservationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  const customer = await ensureCustomerForUser(user);
  if (!customer) redirect("/connexion");

  const all = await loadVisibleCarnets(supabase, customer.id);
  let companyName: string | null = null;
  if (hasBillingParent(customer) && customer.billing_parent_id) {
    const { data: parent } = await supabase
      .from("crm_customers")
      .select("first_name, last_name, company_name")
      .eq("id", customer.billing_parent_id)
      .maybeSingle();
    companyName = companyDisplayName(parent as CrmCustomer | null);
  }
  const upcoming = all.filter(
    (b) => isUpcomingBooking(b.end_date) && b.status !== "cancelled"
  );
  const past = all.filter(
    (b) =>
      !isUpcomingBooking(b.end_date) ||
      b.status === "completed" ||
      b.status === "cancelled"
  );
  const showPast = tab === "passes";
  const list = showPast ? past : upcoming;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#b89768]">
          Mon espace voyage
        </p>
        <h1 className="mt-1 font-display text-[1.625rem] font-bold tracking-tight text-[var(--admin-navy)]">
          Mes réservations
        </h1>
        <p className="mt-1 text-[13px] text-muted">
          Itinéraires publiés par l’agence, billets et vouchers du dossier.
        </p>
      </div>

      <div className="flex rounded-full border border-[#c5c6cd]/40 bg-[#efeeeb] p-1" role="tablist">
        <Link
          href="/mon-compte/reservations"
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
          const img = bookingCoverUrl(b, 800);
          const nights = tripDurationDays(b.start_date, b.end_date);
          return (
            <li key={b.id}>
              <article className="relative overflow-hidden rounded-xl border border-[#c5c6cd]/35 bg-white shadow-sm">
                <div className="relative h-44 overflow-hidden">
                  <CoverPhoto src={img} alt={b.destination || b.title} />
                  <div className="absolute inset-0 bg-gradient-to-t from-[var(--admin-navy)]/90 via-[var(--admin-navy)]/30 to-transparent" />
                  <div className="absolute left-3 right-3 top-3 flex items-center justify-between gap-2">
                    {countdown ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--admin-gold)]/30 bg-[#faf9f6]/95 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--admin-navy)] shadow-sm">
                        <Icon name="timer" className="h-[14px] w-[14px] text-[#b89768]" />
                        {countdown}
                      </span>
                    ) : (
                      <span />
                    )}
                    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--admin-gold)]/50 bg-[var(--admin-navy)]/80 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[var(--admin-gold)] shadow-sm backdrop-blur-md">
                      <span className="h-2 w-2 rounded-full bg-[var(--admin-gold)]" />
                      {BOOKING_STATUS_LABELS[b.status]}
                    </span>
                  </div>
                  <div className="absolute bottom-3 left-3 right-3 text-white">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--admin-gold)]">
                      {formatDateRangeShort(b.start_date, b.end_date)}
                      {nights ? ` (${nights} jour${nights > 1 ? "s" : ""})` : ""}
                    </p>
                    <h2 className="font-display text-2xl font-bold leading-tight">
                      {b.title || b.destination || "Séjour"}
                    </h2>
                  </div>
                </div>
                <div className="flex flex-col gap-3 bg-white p-4">
                  <div className="grid grid-cols-2 gap-2 rounded-lg border border-[#c5c6cd]/25 bg-[#f4f3f0] p-2.5">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-[#44474c]">
                        Référence
                      </span>
                      <span className="text-[16px] font-bold text-[var(--admin-navy)]">
                        {b.reference}
                      </span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-[#44474c]">
                        Montant
                      </span>
                      <span className="text-[16px] font-bold text-[var(--admin-navy)]">
                        {formatMoney(Number(b.total_amount), b.currency)}
                      </span>
                    </div>
                  </div>
                  {hasBillingParent(customer) || isCompanyPaidBooking(b, customer.id) ? (
                    <PayerChip
                      kind={bookingPayerKind(b, customer.id)}
                      companyName={companyName}
                    />
                  ) : null}
                  {b.destination && b.title ? (
                    <p className="text-sm text-[var(--admin-navy)]">{b.destination}</p>
                  ) : null}
                  <Link
                    href={`/mon-compte/reservations/${b.reference}`}
                    className="inline-flex h-11 w-full items-center justify-center rounded-full bg-[var(--admin-navy)] px-3 text-sm font-semibold text-white"
                  >
                    {showPast ? "Revoir le carnet" : "Ouvrir le carnet"}
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
              description="L’agence publiera le carnet dès que le dossier sera prêt."
            />
          </li>
        ) : null}
      </ul>

      <ConciergeBanner />
    </div>
  );
}
