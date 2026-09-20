import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import type { CrmBalance, CrmBookingDocument, CrmBookingItem } from "@/lib/crm/types";
import { formatDateFr, formatEncours, isUpcomingBooking } from "@/lib/crm/money";
import { bookingCoverUrl } from "@/lib/crm/covers";
import { loadVisibleCarnets } from "@/lib/crm/carnet-query";
import { whatsappModifyHref } from "@/lib/crm/carnet";
import { siteConfig } from "@/lib/site";
import { CoverPhoto } from "@/components/crm/CoverPhoto";
import { Icon } from "@/components/crm/icons";
import { CarnetItinerary } from "@/components/account/CarnetItinerary";

export default async function AccountHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  const customer = await ensureCustomerForUser(user);
  if (!customer) redirect("/connexion");

  const [{ data: balances }, bookings] = await Promise.all([
    supabase.from("crm_customer_balances").select("*").eq("customer_id", customer.id),
    loadVisibleCarnets(supabase, customer.id),
  ]);

  const nextTrip = bookings.find((b) => isUpcomingBooking(b.end_date) && b.status !== "cancelled");

  let items: CrmBookingItem[] = [];
  let tripDocs: CrmBookingDocument[] = [];
  if (nextTrip) {
    const [{ data: itemRows }, { data: docRows }] = await Promise.all([
      supabase
        .from("crm_booking_items")
        .select("*")
        .eq("booking_id", nextTrip.id)
        .order("sort_order", { ascending: true }),
      supabase
        .from("crm_booking_documents")
        .select("*")
        .eq("booking_id", nextTrip.id)
        .eq("visible_to_client", true),
    ]);
    items = (itemRows || []) as CrmBookingItem[];
    tripDocs = (docRows || []) as CrmBookingDocument[];
  }

  const primaryBalance = ((balances || []) as CrmBalance[])[0];
  const balanceValue = primaryBalance ? Number(primaryBalance.balance) : 0;
  const currency = primaryBalance?.currency || "EUR";
  const firstName = customer.first_name || customer.email.split("@")[0];
  const whatsappHref = `https://wa.me/${siteConfig.whatsappNumber}`;
  const modifyHref = nextTrip
    ? whatsappModifyHref(siteConfig.whatsappNumber, nextTrip.reference, nextTrip.destination)
    : whatsappHref;
  const cover = nextTrip ? bookingCoverUrl(nextTrip, 960) : null;

  return (
    <div className="space-y-4">
      <section>
        <h1 className="font-display text-[1.7rem] font-bold tracking-tight text-[var(--admin-navy)]">
          Bonjour {firstName}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {nextTrip
            ? "Votre itinéraire, préparé par l’agence."
            : "L’agence prépare le prochain départ dès que vous le souhaitez."}
        </p>
      </section>

      <Link
        href="/mon-compte/transactions"
        className="block rounded-2xl bg-[var(--admin-navy)] p-4 text-white"
      >
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">
          Grand livre
        </p>
        <p className="mt-1 font-display text-xl font-bold">{formatEncours(balanceValue, currency)}</p>
      </Link>

      {nextTrip && cover ? (
        <article className="relative overflow-hidden rounded-2xl border border-[#e5e3dc] bg-[var(--admin-navy)] text-white shadow-xl">
          <CoverPhoto src={cover} alt={nextTrip.destination || nextTrip.title} priority />
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--admin-navy)] via-[var(--admin-navy)]/70 to-black/25" />
          <div className="relative flex flex-col gap-4 p-5">
            <div className="pt-10">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-gold)]">
                <Icon name="flight_takeoff" className="h-[14px] w-[14px]" />
                {formatDateFr(nextTrip.start_date)} — {formatDateFr(nextTrip.end_date)}
              </p>
              <h2 className="mt-1 font-display text-2xl font-bold leading-tight">
                {nextTrip.title || nextTrip.destination || "Prochain séjour"}
              </h2>
              {nextTrip.destination ? (
                <p className="mt-1 line-clamp-2 text-sm text-slate-200">{nextTrip.destination}</p>
              ) : null}
            </div>
            <Link
              href={`/mon-compte/reservations/${nextTrip.reference}`}
              className="flex h-12 items-center justify-between rounded-full bg-white px-5 text-sm font-semibold text-[var(--admin-navy)]"
            >
              <span className="flex items-center gap-2">
                <Icon name="menu_book" className="h-5 w-5 text-[var(--admin-gold)]" />
                Voir mon carnet de voyage
              </span>
              <Icon name="arrow_forward" className="h-5 w-5 text-[var(--admin-gold)]" />
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
            L’agence publiera le carnet ici dès que le dossier sera prêt.
          </p>
        </article>
      )}

      <a
        href={modifyHref}
        target="_blank"
        rel="noreferrer"
        className="inline-flex h-12 w-full items-center justify-center rounded-full bg-[var(--admin-navy)] px-5 text-sm font-semibold text-white"
      >
        {nextTrip ? "Demander une modification" : "Écrire à l’agence"}
      </a>

      {nextTrip ? <CarnetItinerary booking={nextTrip} items={items} docs={tripDocs} /> : null}
    </div>
  );
}
