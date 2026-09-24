import Link from "next/link";
import { redirect } from "next/navigation";
import { ensureCustomerForUser, getSessionUser } from "@/lib/crm/auth";
import type { CrmBalance, CrmBookingItem, CrmBookingTraveler, CrmTravelDocument } from "@/lib/crm/types";
import { encoursCaption, formatDateRangeShort, formatMoney, isUpcomingBooking, jMinusLabel } from "@/lib/crm/money";
import { isCompanyMember } from "@/lib/crm/company-role";
import { loadVisibleCarnets, sortBookingsByStart } from "@/lib/crm/carnet-query";
import { tripDocCoverage } from "@/lib/crm/trip-documents";
import { sortItemsByOrder, tripHeadline, tripPlaceLine } from "@/lib/crm/carnet";
import { BookingHero } from "@/components/crm/BookingHero";
import { Icon } from "@/components/crm/icons";
import { ConciergeBanner } from "@/components/crm/ui";
import { greetingGivenName } from "@/lib/crm/identity";
import { siteConfig } from "@/lib/site";

const chip =
  "flex flex-col items-center rounded-xl border border-[#e5e3dc] bg-white p-2.5 text-center shadow-sm";

export default async function AccountHomePage() {
  const { supabase, user } = await getSessionUser();
  if (!user) redirect("/connexion");
  const customer = await ensureCustomerForUser(user);
  if (!customer) redirect("/connexion");

  const member = isCompanyMember(customer);
  const [{ data: balances }, bookings] = await Promise.all([
    member
      ? Promise.resolve({ data: [] as CrmBalance[] })
      : supabase.from("crm_customer_balances").select("*").eq("customer_id", customer.id),
    loadVisibleCarnets(supabase, customer.id),
  ]);

  const nextTrip =
    sortBookingsByStart(
      bookings.filter((b) => isUpcomingBooking(b.end_date) && b.status !== "cancelled"),
      "asc"
    )[0] || null;

  let coverage = { ready: 0, total: 0 };
  let updates: CrmBookingItem[] = [];
  let flightCount = 0;
  if (nextTrip) {
    const [{ data: travelers }, { data: identityDocs }, { data: itemRows }] = await Promise.all([
      supabase.from("crm_booking_travelers").select("*").eq("booking_id", nextTrip.id),
      supabase.from("crm_travel_documents").select("*").eq("customer_id", customer.id),
      supabase
        .from("crm_booking_items")
        .select("*")
        .eq("booking_id", nextTrip.id)
        .eq("visible_to_client", true),
    ]);
    coverage = tripDocCoverage(
      (travelers || []) as CrmBookingTraveler[],
      (identityDocs || []) as CrmTravelDocument[]
    );
    const visible = (itemRows || []) as CrmBookingItem[];
    flightCount = visible.filter((item) => item.kind === "flight").length;
    updates = sortItemsByOrder(
      visible.filter((item) => item.kind === "flight" || item.kind === "hotel")
    ).slice(0, 2);
  }

  const balanceRows = ((balances || []) as CrmBalance[]).map((row) => ({
    currency: row.currency || "EUR",
    value: Number(row.balance),
  }));
  const shownBalances = balanceRows.length ? balanceRows : [{ currency: "EUR", value: 0 }];
  const owes = shownBalances.some((row) => row.value < 0);
  const firstName = greetingGivenName(customer.first_name) || customer.email.split("@")[0];
  const countdown = nextTrip ? jMinusLabel(nextTrip.start_date) : null;
  const tripName = nextTrip
    ? tripHeadline(nextTrip.title, nextTrip.destination, "Prochain séjour")
    : "";
  const tripPlace = nextTrip ? tripPlaceLine(nextTrip.title, nextTrip.destination) : null;
  const tripHref = nextTrip ? `/mon-compte/reservations/${nextTrip.reference}` : "/mon-compte/reservations";
  const depositDone = member || !owes;
  const flightsDone = flightCount > 0;
  const passportsDone = coverage.total > 0 && coverage.ready === coverage.total;
  const prepPct = Math.round(
    ([depositDone, flightsDone, passportsDone].filter(Boolean).length / 3) * 100
  );
  const wa = `https://wa.me/${siteConfig.whatsappNumber}`;

  return (
    <div className="space-y-3">
      <section className="flex flex-col gap-1 pt-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#9e7e51]">
          Travel Business Agency · Espace membre
        </p>
        <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--admin-navy)]">
          Bonjour {firstName}
        </h1>
      </section>

      {nextTrip ? (
        <article className="overflow-hidden rounded-2xl border border-[#e5e3dc] shadow-xl">
          <BookingHero booking={nextTrip} priority frameClassName="relative h-[22rem] w-full">
            <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 p-5">
              {countdown ? (
                <p className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[var(--admin-gold)]/30 bg-white/95 px-3 py-1 text-[12px] font-semibold text-[var(--admin-navy)] shadow-sm">
                  <Icon name="timer" className="h-[15px] w-[15px] text-[var(--admin-gold)]" />
                  <span className="font-bold">{countdown}</span>
                  {countdown.startsWith("J") ? <span className="font-normal text-[#5a5c60]">avant l’envol</span> : null}
                </p>
              ) : null}
              <div className="pt-6">
                <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--admin-gold)]">
                  <Icon name="flight_takeoff" className="h-3.5 w-3.5" />
                  {formatDateRangeShort(nextTrip.start_date, nextTrip.end_date)}
                </p>
                <h2 className="mt-1 font-display text-2xl font-bold leading-tight text-white">{tripName}</h2>
                {tripPlace ? <p className="line-clamp-2 text-[13px] text-white/80">{tripPlace}</p> : null}
              </div>
              <Link
                href={tripHref}
                className="flex h-12 items-center justify-between rounded-full bg-white px-5 text-sm font-semibold text-[var(--admin-navy)] shadow-md"
              >
                <span className="flex items-center gap-2">
                  <Icon name="menu_book" className="h-5 w-5 text-[var(--admin-gold)]" />
                  Voir mon carnet de voyage
                </span>
                <Icon name="arrow_forward" className="h-5 w-5 text-[var(--admin-gold)]" />
              </Link>
            </div>
          </BookingHero>
        </article>
      ) : (
        <article className="rounded-2xl border border-[#e5e3dc] bg-white p-5 shadow-sm">
          <h2 className="font-display text-xl font-bold text-[var(--admin-navy)]">Aucun voyage planifié</h2>
          <p className="mt-1 text-sm text-muted">L’agence publiera le carnet ici dès que le dossier sera prêt.</p>
        </article>
      )}

      {nextTrip ? (
        <section className="flex flex-col gap-3 rounded-2xl border border-[#e5e3dc] bg-[#f4f3f0] p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-base font-semibold text-[var(--admin-navy)]">
              <Icon name="task_alt" className="h-5 w-5 text-[var(--admin-gold)]" />
              Préparatifs du séjour
            </p>
            <span className="rounded-full bg-[var(--admin-navy)] px-2.5 py-0.5 text-[12px] font-semibold text-[var(--admin-gold)]">
              {prepPct}% complet
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[#e3e2e0]">
            <div
              className="h-2 rounded-full bg-gradient-to-r from-[var(--admin-navy)] to-[var(--admin-gold)]"
              style={{ width: `${prepPct}%` }}
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className={chip}>
              <Icon name="verified" className="h-[18px] w-[18px] text-[var(--admin-gold)]" />
              <span className="mt-1 text-[10px] font-semibold text-[var(--admin-navy)]">
                {member ? "Facturation" : "Acompte"}
              </span>
              <span className="text-[10px] text-[#5a5c60]">
                {member ? "Société" : owes ? "À régler" : "À jour"}
              </span>
            </div>
            <div className={chip}>
              <Icon name="flight" className="h-[18px] w-[18px] text-[var(--admin-navy)]" />
              <span className="mt-1 text-[10px] font-semibold text-[var(--admin-navy)]">Vols</span>
              <span className="text-[10px] text-[#5a5c60]">{flightsDone ? "Publiés" : "À confirmer"}</span>
            </div>
            <Link href={`${tripHref}#passeport`} className={chip}>
              <Icon name="description" className="h-[18px] w-[18px] text-[var(--admin-gold)]" />
              <span className="mt-1 text-[10px] font-semibold text-[var(--admin-navy)]">Passeports</span>
              <span className="text-[10px] text-[#9e7e51]">
                {coverage.total ? `${coverage.ready}/${coverage.total}` : "À renseigner"}
              </span>
            </Link>
          </div>
        </section>
      ) : null}

      <ConciergeBanner />

      {updates.length ? (
        <section className="flex flex-col gap-2.5">
          <h2 className="px-1 font-display text-xl font-semibold text-[var(--admin-navy)]">
            Mises à jour
          </h2>
          {updates.map((item) => (
            <Link
              key={item.id}
              href={tripHref}
              className="flex items-start gap-3 rounded-2xl border border-[#e5e3dc] bg-white p-3.5 shadow-sm"
            >
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--admin-gold)]/30 bg-[#f8f3eb] text-[var(--admin-navy)]">
                <Icon name={item.kind === "hotel" ? "hotel" : "airlines"} className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-semibold text-[var(--admin-navy)]">
                  {item.title}
                </span>
                <span className="mt-0.5 block text-[13px] text-[#5a5c60]">
                  {item.supplier || item.confirmation_ref || "Publié dans le carnet"}
                </span>
              </span>
            </Link>
          ))}
        </section>
      ) : null}

      <section className="flex flex-col gap-3 pb-2">
        <h2 className="px-1 font-display text-xl font-semibold text-[var(--admin-navy)]">
          Services et documents
        </h2>
        <div className="grid grid-cols-3 gap-2.5">
          <Link
            href={tripHref}
            className="flex h-28 flex-col justify-between rounded-2xl border border-[#e5e3dc] bg-white p-3 text-left shadow-sm"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--admin-gold)]/30 bg-[#f8f3eb]">
              <Icon name="airplane_ticket" className="h-[18px] w-[18px] text-[var(--admin-navy)]" />
            </span>
            <span>
              <span className="block text-[12px] font-semibold leading-tight text-[var(--admin-navy)]">Mes billets</span>
              <span className="text-[10px] text-[#5a5c60]">Carnet</span>
            </span>
          </Link>
          <Link
            href="/mon-compte/profil/documents"
            className="flex h-28 flex-col justify-between rounded-2xl border border-[#e5e3dc] bg-white p-3 text-left shadow-sm"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--admin-gold)]/30 bg-[#f8f3eb]">
              <Icon name="description" className="h-[18px] w-[18px] text-[#9e7e51]" />
            </span>
            <span>
              <span className="block text-[12px] font-semibold leading-tight text-[var(--admin-navy)]">Pièces</span>
              <span className="text-[10px] text-[#5a5c60]">Coffre</span>
            </span>
          </Link>
          <a
            href={wa}
            target="_blank"
            rel="noreferrer"
            className="flex h-28 flex-col justify-between rounded-2xl border border-[#e5e3dc] bg-white p-3 text-left shadow-sm"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--admin-navy)] text-[var(--admin-gold)]">
              <Icon name="support_agent" className="h-[18px] w-[18px]" />
            </span>
            <span>
              <span className="block text-[12px] font-semibold leading-tight text-[var(--admin-navy)]">Assistance</span>
              <span className="text-[10px] font-medium text-[#9e7e51]">WhatsApp</span>
            </span>
          </a>
        </div>
      </section>

      {member ? (
        <Link
          href="/mon-compte/transactions"
          className="flex h-11 items-center justify-between rounded-2xl border border-[var(--admin-gold)]/55 bg-white px-4 text-sm font-semibold text-[var(--admin-navy)] shadow-sm"
        >
          Voir les frais de vos voyages
          <Icon name="arrow_forward" className="h-4 w-4 text-[var(--admin-gold-dark)]" />
        </Link>
      ) : (
        <Link
          href="/mon-compte/transactions"
          className={`block rounded-2xl border p-4 shadow-sm ${
            owes ? "border-[var(--admin-gold)] bg-[#f8f3eb]" : "border-[#e5e3dc] bg-white"
          }`}
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">Encours</p>
          <ul className="mt-2 space-y-2">
            {shownBalances.map((row) => (
              <li key={row.currency}>
                <p className="font-display text-2xl font-bold tracking-tight text-[var(--admin-navy)]">
                  {formatMoney(row.value, row.currency)}
                </p>
                <p className="text-xs text-muted">
                  {row.value > 0 ? "Crédit disponible · frais d’agence 10 % déduits" : encoursCaption(row.value)}
                </p>
              </li>
            ))}
          </ul>
        </Link>
      )}
    </div>
  );
}
