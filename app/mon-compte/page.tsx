import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import {
  BOOKING_STATUS_LABELS,
  type CrmBalance,
  type CrmBooking,
  type CrmBookingItem,
  type CrmBookingTraveler,
  type CrmTravelDocument,
} from "@/lib/crm/types";
import { formatDateFr, isUpcomingBooking } from "@/lib/crm/money";
import { tripDocCoverage } from "@/lib/crm/trip-documents";
import { bookingCoverUrl } from "@/lib/crm/covers";
import { loadVisibleCarnets } from "@/lib/crm/carnet-query";
import { siteConfig } from "@/lib/site";

function daysUntil(date: string | null) {
  if (!date) return null;
  const start = new Date(`${date}T12:00:00`);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.ceil((start.getTime() - today.getTime()) / 86_400_000);
}

export default async function AccountHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  const customer = await ensureCustomerForUser(user);
  if (!customer) redirect("/connexion");

  const [{ data: balances }, { data: docs }, bookings] =
    await Promise.all([
      supabase
        .from("crm_customer_balances")
        .select("*")
        .eq("customer_id", customer.id),
      supabase
        .from("crm_travel_documents")
        .select("*")
        .eq("customer_id", customer.id),
      loadVisibleCarnets(supabase, customer.id),
    ]);

  const nextTrip = bookings.find((b) => isUpcomingBooking(b.end_date) && b.status !== "cancelled");

  let items: CrmBookingItem[] = [];
  let travelers: CrmBookingTraveler[] = [];
  if (nextTrip) {
    const [{ data: itemRows }, { data: travelerRows }] = await Promise.all([
      supabase
        .from("crm_booking_items")
        .select("*")
        .eq("booking_id", nextTrip.id)
        .order("sort_order", { ascending: true }),
      supabase.from("crm_booking_travelers").select("*").eq("booking_id", nextTrip.id),
    ]);
    items = (itemRows || []) as CrmBookingItem[];
    travelers = (travelerRows || []) as CrmBookingTraveler[];
  }

  const flight = items.find((i) => i.kind === "flight");
  const hotel = items.find((i) => i.kind === "hotel");
  const primaryBalance = ((balances || []) as CrmBalance[])[0];
  const balanceValue = primaryBalance ? Number(primaryBalance.balance) : 0;
  const remainingDue = Math.max(0, -balanceValue);
  const firstName =
    customer.first_name || customer.email.split("@")[0];
  const jMinus = daysUntil(nextTrip?.start_date ?? null);
  const party: CrmBookingTraveler[] = travelers.length
    ? travelers
    : nextTrip
      ? [
          {
            id: "holder",
            booking_id: nextTrip.id,
            companion_id: null,
            is_account_holder: true,
            first_name: customer.first_name,
            last_name: customer.last_name,
            created_at: "",
          },
        ]
      : [];
  const coverage = tripDocCoverage(party, (docs || []) as CrmTravelDocument[]);
  const depositDone = remainingDue <= 0;
  const flightsDone = Boolean(flight);
  const docsDone = nextTrip ? coverage.total > 0 && coverage.ready === coverage.total : true;
  const tripDocsHref = "/mon-compte/profil/documents";
  const prepScore = [depositDone, flightsDone, docsDone].filter(Boolean).length;
  const prepPct = Math.round((prepScore / 3) * 100);
  const whatsappHref = `https://wa.me/${siteConfig.whatsappNumber}`;
  const cover = nextTrip ? bookingCoverUrl(nextTrip, 1200) : null;

  return (
    <div className="space-y-4">
      <section className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--admin-navy)] text-[var(--admin-gold)]">
              <span className="material-symbols-outlined text-[16px]">explore</span>
            </span>
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">
              {siteConfig.name} · Espace membre
            </span>
          </span>
        </div>
        <h1 className="mt-1 font-display text-[1.7rem] font-bold tracking-tight text-[var(--admin-navy)]">
          Bonjour {firstName}
        </h1>
        <p className="text-sm text-muted">
          {nextTrip
            ? "Votre itinéraire sur-mesure prend vie avec sérénité."
            : "Votre conciergerie prépare le prochain départ dès que vous le souhaitez."}
        </p>
      </section>

      {nextTrip && cover ? (
        <article className="relative overflow-hidden rounded-2xl border border-[#e5e3dc] bg-[var(--admin-navy)] text-white shadow-xl">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${cover})` }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--admin-navy)] via-[var(--admin-navy)]/70 to-black/25" />
          <div className="relative flex flex-col gap-4 p-5">
            <div className="flex items-center justify-between gap-2">
              {jMinus != null && jMinus >= 0 ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--admin-gold)]/30 bg-white/95 px-3 py-1 text-[12px] font-semibold text-[var(--admin-navy)]">
                  <span className="material-symbols-outlined text-[15px] text-[var(--admin-gold)]">
                    timer
                  </span>
                  <span className="font-bold">J - {jMinus}</span>
                  <span className="font-normal text-muted">avant l&apos;envol</span>
                </span>
              ) : (
                <StatusMini>{BOOKING_STATUS_LABELS[nextTrip.status]}</StatusMini>
              )}
            </div>
            <div className="pt-8">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-gold)]">
                <span className="material-symbols-outlined text-[14px]">flight_takeoff</span>
                {formatDateFr(nextTrip.start_date)} — {formatDateFr(nextTrip.end_date)}
              </p>
              <h2 className="mt-1 font-display text-2xl font-bold leading-tight">
                {nextTrip.title || nextTrip.destination || "Prochain séjour"}
              </h2>
              {nextTrip.destination ? (
                <p className="mt-1 line-clamp-2 text-sm text-slate-200">
                  {nextTrip.destination}
                </p>
              ) : null}
            </div>
            <Link
              href={`/mon-compte/reservations/${nextTrip.reference}`}
              className="flex h-12 items-center justify-between rounded-full bg-white px-5 text-sm font-semibold text-[var(--admin-navy)]"
            >
              <span className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px] text-[var(--admin-gold)]">
                  menu_book
                </span>
                Voir mon carnet de voyage
              </span>
              <span className="material-symbols-outlined text-[20px] text-[var(--admin-gold)]">
                arrow_forward
              </span>
            </Link>
          </div>
        </article>
      ) : (
        <article className="rounded-2xl border border-[#e5e3dc] bg-white p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">
            Prochaine destination
          </p>
          <h2 className="mt-2 font-display text-xl font-bold text-[var(--admin-navy)]">
            Aucun voyage planifié
          </h2>
          <p className="mt-1 text-sm text-muted">
            Votre conciergerie {siteConfig.shortName} peut préparer votre prochain dossier.
          </p>
          <a
            href={whatsappHref}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex h-12 items-center rounded-full bg-[var(--admin-navy)] px-5 text-sm font-semibold text-white"
          >
            Contacter la conciergerie
          </a>
        </article>
      )}

      {nextTrip ? (
        <section className="flex flex-col gap-3 rounded-2xl border border-[#e5e3dc] bg-[var(--surface-2)] p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-[var(--admin-gold)]">
                task_alt
              </span>
              <span className="text-sm font-semibold text-[var(--admin-navy)]">
                Préparatifs du séjour
              </span>
            </div>
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
            <PrepChip
              icon="verified"
              title="Acompte"
              detail={depositDone ? "Validé" : "En attente"}
              filled={depositDone}
            />
            <PrepChip
              icon="flight"
              title={flight?.confirmation_ref || "Vols"}
              detail={flightsDone ? "Confirmés" : "À confirmer"}
              filled={flightsDone}
            />
            <PrepChip
              icon="description"
              title="Passeports"
              detail={
                docsDone
                  ? `${coverage.ready} validé${coverage.ready > 1 ? "s" : ""}`
                  : coverage.total
                    ? `${coverage.ready}/${coverage.total}`
                    : "À déposer"
              }
              filled={docsDone}
              href={tripDocsHref}
            />
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-3 rounded-2xl border border-[#e5e3dc] bg-white p-4">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
            Votre Travel Designer
          </span>
          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-[var(--admin-navy)]">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--admin-gold)]" />
            Disponible 24/7
          </span>
        </div>
        <div>
          <h3 className="font-display text-base font-semibold text-[var(--admin-navy)]">
            Conciergerie {siteConfig.shortName}
          </h3>
          <p className="text-sm text-muted">Ligne VIP directe</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <a
            href={`tel:${siteConfig.whatsappNumber}`}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[#e5e3dc] bg-[var(--surface-2)] text-xs font-semibold text-[var(--admin-navy)]"
          >
            Appel Direct
          </a>
          <a
            href={whatsappHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[var(--admin-navy)] text-xs font-semibold text-white"
          >
            Concierge Chat
          </a>
        </div>
      </section>

      {(flight || hotel) && nextTrip ? (
        <section className="space-y-2.5">
          <h3 className="font-display text-xl font-semibold text-[var(--admin-navy)]">
            Mises à jour prioritaires
          </h3>
          {flight ? (
            <article className="flex items-start gap-3 rounded-2xl border border-[#e5e3dc] bg-white p-3.5">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--admin-gold)]/30 bg-[var(--admin-peach)] text-[var(--admin-navy)]">
                <span className="material-symbols-outlined text-[20px]">airlines</span>
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <p className="truncate text-sm font-semibold text-[var(--admin-navy)]">
                    {flight.title || "Vol"}
                  </p>
                  <span className="rounded-full border border-[var(--admin-gold)]/30 bg-[var(--admin-peach)] px-2.5 py-0.5 text-[10px] font-semibold text-[#533e1c]">
                    {flight.confirmation_ref || "Confirmé"}
                  </span>
                </div>
                <p className="mt-0.5 text-[13px] text-muted">
                  {flight.supplier || flight.confirmation_ref || nextTrip.reference}
                </p>
              </div>
            </article>
          ) : null}
          {hotel ? (
            <article className="flex items-start gap-3 rounded-2xl border border-[#e5e3dc] bg-white p-3.5">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--admin-gold)]/30 bg-[var(--admin-peach)] text-[var(--admin-gold)]">
                <span className="material-symbols-outlined text-[20px]">hotel</span>
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <p className="truncate text-sm font-semibold text-[var(--admin-navy)]">
                    {hotel.title || "Hébergement"}
                  </p>
                  <span className="text-[10px] font-bold text-[#9e7e51]">Voucher prêt</span>
                </div>
                <p className="mt-0.5 text-[13px] text-muted">
                  {hotel.supplier || hotel.confirmation_ref || "Hébergement confirmé"}
                </p>
              </div>
            </article>
          ) : null}
        </section>
      ) : null}

      <section className="space-y-3 pb-2">
        <h3 className="font-display text-xl font-semibold text-[var(--admin-navy)]">
          Services & Documents
        </h3>
        <div className="grid grid-cols-3 gap-2.5">
          <Link
            href="/mon-compte/reservations"
            className="flex h-28 flex-col justify-between rounded-2xl border border-[#e5e3dc] bg-white p-3 text-left"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--admin-gold)]/30 bg-[var(--admin-peach)]">
              <span className="material-symbols-outlined text-[18px]">airplane_ticket</span>
            </span>
            <span>
              <span className="block text-xs font-semibold text-[var(--admin-navy)]">Mes Billets</span>
              <span className="text-[10px] text-muted">Dossier voyage</span>
            </span>
          </Link>
          <Link
            href={tripDocsHref}
            className="flex h-28 flex-col justify-between rounded-2xl border border-[#e5e3dc] bg-white p-3 text-left"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--admin-gold)]/30 bg-[var(--admin-peach)] text-[#9e7e51]">
              <span className="material-symbols-outlined text-[18px]">badge</span>
            </span>
            <span>
              <span className="block text-xs font-semibold text-[var(--admin-navy)]">Pièces d’identité</span>
              <span className="text-[10px] text-muted">Passeports</span>
            </span>
          </Link>
          <a
            href={whatsappHref}
            target="_blank"
            rel="noreferrer"
            className="flex h-28 flex-col justify-between rounded-2xl border border-[#e5e3dc] bg-white p-3 text-left"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--admin-navy)] text-[var(--admin-gold)]">
              <span className="material-symbols-outlined text-[18px]">support_agent</span>
            </span>
            <span>
              <span className="block text-xs font-semibold text-[var(--admin-navy)]">Assistance</span>
              <span className="text-[10px] font-medium text-[#9e7e51]">Urgences 24/7</span>
            </span>
          </a>
        </div>
      </section>
    </div>
  );
}

function StatusMini({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-[var(--admin-gold)]/30 bg-white/95 px-3 py-1 text-[11px] font-semibold text-[var(--admin-navy)]">
      {children}
    </span>
  );
}

function PrepChip({
  icon,
  title,
  detail,
  filled,
  href,
}: {
  icon: string;
  title: string;
  detail: string;
  filled: boolean;
  href?: string;
}) {
  const body = (
    <>
      <span
        className={`material-symbols-outlined text-[18px] ${
          filled ? "text-[var(--admin-gold)]" : "text-muted"
        }`}
        style={filled ? { fontVariationSettings: "'FILL' 1" } : undefined}
      >
        {icon}
      </span>
      <span className="mt-1 truncate text-[10px] font-semibold text-[var(--admin-navy)]">
        {title}
      </span>
      <span className="text-[10px] text-muted">{detail}</span>
    </>
  );
  const className =
    "flex flex-col items-center rounded-xl border border-[#e5e3dc] bg-white p-2.5 text-center";
  if (href) {
    return (
      <Link href={href} className={className}>
        {body}
      </Link>
    );
  }
  return <div className={className}>{body}</div>;
}
