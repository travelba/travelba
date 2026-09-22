import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import type { CrmBookingTraveler, CrmTravelDocument } from "@/lib/crm/types";
import { formatDateRangeShort, formatMoney, isUpcomingBooking, jMinusLabel, postedLedgerTotals } from "@/lib/crm/money";
import { loadClientMoneySnapshot } from "@/lib/crm/client-money";
import { bookingCoverUrl } from "@/lib/crm/covers";
import { loadVisibleCarnets } from "@/lib/crm/carnet-query";
import { tripDocCoverage } from "@/lib/crm/trip-documents";
import { CoverPhoto } from "@/components/crm/CoverPhoto";
import { Icon } from "@/components/crm/icons";
import { personalHomeLabel } from "@/components/account/PersonalLedgerCard";

export default async function AccountHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  const customer = await ensureCustomerForUser(user);
  if (!customer) redirect("/connexion");

  const [money, bookings] = await Promise.all([
    loadClientMoneySnapshot(supabase, customer),
    loadVisibleCarnets(supabase, customer.id),
  ]);

  const nextTrip = bookings.find((b) => isUpcomingBooking(b.end_date) && b.status !== "cancelled");

  let missingPassports = 0;
  if (nextTrip) {
    const [{ data: travelers }, { data: identityDocs }] = await Promise.all([
      supabase.from("crm_booking_travelers").select("*").eq("booking_id", nextTrip.id),
      supabase.from("crm_travel_documents").select("*").eq("customer_id", customer.id),
    ]);
    const coverage = tripDocCoverage(
      (travelers || []) as CrmBookingTraveler[],
      (identityDocs || []) as CrmTravelDocument[]
    );
    if (coverage.total > coverage.ready) missingPassports = coverage.total - coverage.ready;
  }

  const firstName = customer.first_name || customer.email.split("@")[0];
  const cover = nextTrip ? bookingCoverUrl(nextTrip, 960) : null;
  const countdown = nextTrip ? jMinusLabel(nextTrip.start_date) : null;
  const tripHref = nextTrip ? `/mon-compte/reservations/${nextTrip.reference}` : "/mon-compte/reservations";
  const companyDebits = postedLedgerTotals(money.companyRows).debits;
  const companyCurrency = money.companyRows[0]?.currency || money.personalCurrency;

  return (
    <div className="space-y-4">
      <h1 className="font-display text-[1.5rem] font-bold tracking-tight text-[var(--admin-navy)]">
        Bonjour {firstName}
      </h1>

      {nextTrip && cover ? (
        <article className="relative min-h-[220px] overflow-hidden rounded-2xl bg-[var(--admin-navy)] text-white shadow-xl">
          <CoverPhoto
            src={cover}
            alt={nextTrip.destination || nextTrip.title}
            className="absolute inset-0 h-full w-full object-cover"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--admin-navy)] via-[var(--admin-navy)]/55 to-black/20" />
          <div className="relative flex min-h-[220px] flex-col justify-end gap-3 p-4">
            {countdown ? (
              <p className="w-fit rounded-full bg-white/95 px-3 py-1 text-[12px] font-bold text-[var(--admin-navy)]">
                {countdown}
                {countdown.startsWith("J") ? " avant l’envol" : ""}
              </p>
            ) : null}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--admin-gold)]">
                {formatDateRangeShort(nextTrip.start_date, nextTrip.end_date)}
              </p>
              <h2 className="mt-1 font-display text-2xl font-bold leading-tight">
                {nextTrip.destination || nextTrip.title || "Prochain séjour"}
              </h2>
            </div>
            {missingPassports ? (
              <Link
                href={`${tripHref}#passeport`}
                className="rounded-xl bg-[var(--admin-peach)] px-3 py-2 text-sm font-semibold text-[var(--admin-navy)]"
              >
                Pièce manquante pour {missingPassports} voyageur{missingPassports > 1 ? "s" : ""}.
              </Link>
            ) : null}
            <Link
              href={tripHref}
              className="flex h-11 items-center justify-between rounded-full bg-white px-4 text-sm font-semibold text-[var(--admin-navy)]"
            >
              Ouvrir le carnet
              <Icon name="arrow_forward" className="h-5 w-5 text-[var(--admin-gold)]" />
            </Link>
          </div>
        </article>
      ) : (
        <article className="rounded-2xl border border-[#e5e3dc] bg-white p-5">
          <h2 className="font-display text-xl font-bold text-[var(--admin-navy)]">Aucun voyage planifié</h2>
          <p className="mt-1 text-sm text-muted">L’agence publiera le carnet ici dès que le dossier sera prêt.</p>
        </article>
      )}

      {money.member ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Link
            href="/mon-compte/transactions"
            className="rounded-2xl border border-[#e5e3dc] bg-white p-4 shadow-sm"
          >
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#9c7c4e]">
              Voyages {money.companyName || "société"}
            </p>
            <p className="mt-1 font-display text-xl font-bold text-[var(--admin-navy)]">
              {formatMoney(companyDebits, companyCurrency)}
            </p>
            <p className="mt-1 text-xs text-muted">
              Frais de vos dossiers. Pas le solde {money.companyName || "société"}.
            </p>
          </Link>
          <Link
            href="/mon-compte/transactions"
            className="rounded-2xl border border-[#e5e3dc] bg-white p-4 shadow-sm"
          >
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#9c7c4e]">Vos voyages</p>
            <p className="mt-1 font-display text-xl font-bold text-[var(--admin-navy)]">
              {personalHomeLabel(money.personalBalance, money.personalCurrency)}
            </p>
            <p className="mt-1 text-xs text-muted">
              {money.personalBalance > 0
                ? "Frais d’agence 10 % déduits"
                : "Encours personnel, pour un séjour à votre charge."}
            </p>
          </Link>
        </div>
      ) : (
        <Link href="/mon-compte/transactions" className="inline-flex flex-col text-sm font-semibold text-[var(--admin-navy)]">
          {money.personalBalance > 0 ? (
            <>
              <span>{personalHomeLabel(money.personalBalance, money.personalCurrency)}</span>
              <span className="text-xs font-medium text-[#9c7c4e]">Frais d’agence 10 % déduits</span>
            </>
          ) : (
            <span>{personalHomeLabel(money.personalBalance, money.personalCurrency)}</span>
          )}
        </Link>
      )}
    </div>
  );
}
