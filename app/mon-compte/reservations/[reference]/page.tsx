import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import {
  BOOKING_STATUS_LABELS,
  type CrmBooking,
  type CrmBookingDocument,
  type CrmBookingItem,
  type CrmBookingTraveler,
  type CrmTravelDocument,
} from "@/lib/crm/types";
import { formatDateFr, formatMoney } from "@/lib/crm/money";
import { ConciergeBanner, StatusChip, bookingStatusTone } from "@/components/crm/ui";
import { bookingCoverUrl } from "@/lib/crm/covers";
import {
  carnetVisible,
  itemPriceLabel,
  unlinkedDocuments,
  whatsappModifyHref,
} from "@/lib/crm/carnet";
import { CarnetItinerary } from "@/components/account/CarnetItinerary";
import { tripDocCoverage } from "@/lib/crm/trip-documents";
import { siteConfig } from "@/lib/site";
import { CoverPhoto } from "@/components/crm/CoverPhoto";
import { FileOpenLink, fileKindIcon } from "@/components/crm/FileOpen";
import { Icon } from "@/components/crm/icons";
import { TripPassportPicker } from "@/components/crm/TripPassportPicker";

type Props = { params: Promise<{ reference: string }> };

export default async function ReservationDetailPage({ params }: Props) {
  const { reference } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  const customer = await ensureCustomerForUser(user);
  if (!customer) redirect("/connexion");

  const { data: booking } = await supabase
    .from("crm_bookings")
    .select("*")
    .eq("customer_id", customer.id)
    .eq("reference", reference)
    .maybeSingle();
  if (!booking) notFound();
  const b = booking as CrmBooking;

  const [{ data: items }, { data: travelers }, { data: docs }, { data: identityDocs }] = await Promise.all([
    supabase
      .from("crm_booking_items")
      .select("*")
      .eq("booking_id", b.id)
      .order("sort_order"),
    supabase.from("crm_booking_travelers").select("*").eq("booking_id", b.id),
    supabase
      .from("crm_booking_documents")
      .select("*")
      .eq("booking_id", b.id)
      .eq("visible_to_client", true),
    supabase.from("crm_travel_documents").select("*").eq("customer_id", customer.id),
  ]);

  const visibleItems = (items || []) as CrmBookingItem[];
  if (!carnetVisible(b, visibleItems)) notFound();

  const insurances = visibleItems.filter((item) => item.kind === "insurance");
  const visibleDocs = (docs || []) as CrmBookingDocument[];
  const extraDocs = unlinkedDocuments(visibleDocs, visibleItems);
  const party = (travelers || []) as CrmBookingTraveler[];
  const coverage = tripDocCoverage(party, (identityDocs || []) as CrmTravelDocument[]);
  const missingPassports = coverage.total > 0 && coverage.ready < coverage.total;
  const modifyHref = whatsappModifyHref(
    siteConfig.whatsappNumber,
    b.reference,
    b.destination
  );
  const cover = bookingCoverUrl(b, 960);

  return (
    <div className="space-y-5">
      <Link
        href="/mon-compte/reservations"
        className="inline-flex text-sm font-semibold text-[var(--aura-blue)]"
      >
        ← Mes réservations
      </Link>

      <article className="relative min-h-[220px] overflow-hidden rounded-[1.5rem] bg-[var(--admin-navy)] text-white shadow-[0_16px_36px_rgba(11,31,58,0.25)]">
        <CoverPhoto src={cover} alt={b.destination || b.title} className="absolute inset-0 h-full w-full object-cover opacity-50" priority />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--admin-navy)] via-[var(--admin-navy)]/70 to-transparent" />
        <div className="relative space-y-3 p-5 pb-6 pt-10">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <StatusChip tone={bookingStatusTone(b.status)}>
              {BOOKING_STATUS_LABELS[b.status]}
            </StatusChip>
            <span className="rounded-full bg-black/35 px-3 py-1 text-[11px] font-bold backdrop-blur">
              {b.reference}
            </span>
          </div>
          <h1 className="font-display text-[1.7rem] font-extrabold leading-tight">
            {b.destination || b.title}
          </h1>
          <p className="text-sm text-white/75">{b.title}</p>
          <p className="text-sm text-white/75">
            {formatDateFr(b.start_date)} — {formatDateFr(b.end_date)}
          </p>
        </div>
      </article>

      {missingPassports ? (
        <Link
          href="/mon-compte/profil/documents"
          className="block rounded-2xl bg-[var(--admin-peach)] px-4 py-3 text-sm text-[var(--admin-navy)]"
        >
          Pièce d’identité manquante pour {coverage.total - coverage.ready} voyageur
          {coverage.total - coverage.ready > 1 ? "s" : ""}. Joindre dans Mon compte, puis cocher ci-dessous.
        </Link>
      ) : null}

      <TripPassportPicker
        variant="client"
        bookingId={b.id}
        travelers={party}
        documents={(identityDocs || []) as CrmTravelDocument[]}
      />

      {b.notes_client ? (
        <p className="aura-card rounded-[1.25rem] bg-white p-4 text-sm leading-relaxed text-[var(--admin-navy)]">
          {b.notes_client}
        </p>
      ) : null}

      <CarnetItinerary booking={b} items={visibleItems} docs={visibleDocs} />

      {extraDocs.length ? (
        <section className="aura-card space-y-3 rounded-[1.35rem] bg-white p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">
            Documents du voyage
          </p>
          <ul className="space-y-2">
            {extraDocs.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2 text-sm text-[var(--admin-navy)]">
                  <Icon
                    name={fileKindIcon(doc.mime_type, doc.file_name)}
                    className="h-5 w-5 shrink-0 text-[var(--admin-gold)]"
                  />
                  <span className="truncate">{doc.file_name || "Document"}</span>
                </span>
                <FileOpenLink
                  path={doc.storage_path}
                  className="inline-flex shrink-0 items-center rounded-full bg-[var(--surface-2)] px-3 py-1.5 text-xs font-semibold text-[var(--admin-navy)] ring-1 ring-[#e5e3dc]"
                >
                  Ouvrir
                </FileOpenLink>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="aura-card space-y-2 rounded-[1.35rem] bg-white p-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">
          Montant du séjour
        </p>
        <p className="font-display text-2xl font-extrabold text-[var(--admin-navy)]">
          {formatMoney(Number(b.total_amount), b.currency)}
        </p>
        {insurances.map((item) => (
          <p key={item.id} className="text-sm text-muted">
            Assurance {item.title}
            {itemPriceLabel(item, b.currency) ? ` · ${itemPriceLabel(item, b.currency)}` : ""}
          </p>
        ))}
      </section>

      <a
        href={modifyHref}
        target="_blank"
        rel="noreferrer"
        className="inline-flex h-12 w-full items-center justify-center rounded-full bg-[var(--admin-navy)] px-5 text-sm font-semibold text-white"
      >
        Demander une modification
      </a>

      <ConciergeBanner />
    </div>
  );
}
