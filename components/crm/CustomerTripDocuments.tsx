import Link from "next/link";
import type { CrmBooking, CrmBookingTraveler, CrmTravelDocument } from "@/lib/crm/types";
import { DOC_TYPE_LABELS } from "@/lib/crm/types";
import { formatDateFr } from "@/lib/crm/money";
import {
  isVaultDocument,
  primaryIdentityDoc,
  travelerDisplayName,
  travelerInitials,
  tripDocCoverage,
  tripDocumentsForTraveler,
} from "@/lib/crm/trip-documents";
import { FileOpenLink, fileKindIcon } from "@/components/crm/FileOpen";
import { StatusChip } from "@/components/crm/ui";

export function CustomerTripDocuments({
  variant = "admin",
  hrefForBooking = (booking) => `/admin/reservations/${booking.id}`,
  bookings,
  travelers,
  documents,
}: {
  variant?: "admin" | "client";
  hrefForBooking?: (booking: CrmBooking) => string;
  bookings: CrmBooking[];
  travelers: CrmBookingTraveler[];
  documents: CrmTravelDocument[];
}) {
  const vault = documents.filter(isVaultDocument);
  const shell =
    variant === "client"
      ? "aura-card space-y-4 rounded-[1.35rem] bg-white p-4"
      : "admin-af-card space-y-4 rounded-3xl p-5";

  return (
    <section className={shell}>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">
          Dossier par séjour
        </p>
        <h2 className="mt-1 font-display text-lg font-bold text-[var(--admin-navy)]">
          Pièces d’identité par voyage
        </h2>
        <p className="mt-1 text-sm text-muted">
          Un passeport par personne, pour ce séjour — pas une pièce valable pour tous les
          départs.
        </p>
      </div>
      {bookings.length ? (
        <ul className="space-y-3">
          {bookings.map((booking) => {
            const party = travelers.filter((item) => item.booking_id === booking.id);
            const tripDocs = documents.filter((doc) => doc.booking_id === booking.id);
            const coverage = tripDocCoverage(party, tripDocs);
            const missing = party.length === 0 || coverage.ready < coverage.total;
            return (
              <li
                key={booking.id}
                className="rounded-2xl border border-[#e5e3dc] bg-[var(--admin-sky)]/40 px-4 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-[var(--admin-navy)]">
                      {booking.destination || booking.title}
                    </p>
                    <p className="text-xs text-muted">
                      {booking.reference} · {formatDateFr(booking.start_date)}
                      {booking.end_date ? ` → ${formatDateFr(booking.end_date)}` : ""}
                    </p>
                  </div>
                  <StatusChip tone={missing ? "amber" : "gold"}>
                    {party.length
                      ? `${coverage.ready}/${coverage.total} pièce${coverage.total > 1 ? "s" : ""}`
                      : "Voyageurs à poser"}
                  </StatusChip>
                </div>
                <ul className="mt-3 space-y-2">
                  {party.map((traveler) => {
                    const doc = primaryIdentityDoc(
                      tripDocumentsForTraveler(tripDocs, traveler)
                    );
                    return (
                      <li key={traveler.id} className="flex items-center justify-between gap-2">
                        <span className="inline-flex min-w-0 items-center gap-2">
                          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--admin-navy)] text-[10px] font-bold text-[var(--admin-gold)]">
                            {travelerInitials(traveler)}
                          </span>
                          <span className="truncate text-sm text-[var(--admin-navy)]">
                            {travelerDisplayName(traveler)}
                          </span>
                        </span>
                        <span
                          className={`shrink-0 text-xs font-semibold ${
                            doc ? "text-[var(--aura-success,#3d6b4f)]" : "text-amber-800"
                          }`}
                        >
                          {doc
                            ? `${DOC_TYPE_LABELS[doc.doc_type]} ${doc.number || ""}`.trim()
                            : "Manquant"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <Link
                  href={hrefForBooking(booking)}
                  className="mt-3 inline-flex items-center gap-1 rounded-full bg-[var(--admin-navy)] px-3.5 py-1.5 text-xs font-semibold text-white"
                >
                  {missing ? "Joindre les pièces" : "Ouvrir le dossier"}
                  <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-2xl bg-[var(--admin-sky)] px-4 py-5 text-sm text-muted">
          Aucune réservation : les pièces se joindront sur le prochain dossier.
        </p>
      )}

      {vault.length ? (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
            Ancien coffre (non rattaché à un voyage)
          </p>
          <ul className="mt-2 space-y-2">
            {vault.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between gap-3 text-sm">
                <span>
                  {DOC_TYPE_LABELS[doc.doc_type]} {doc.number || ""}
                </span>
                {doc.storage_path ? (
                  <FileOpenLink
                    path={doc.storage_path}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--admin-navy)]"
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      {fileKindIcon(doc.mime_type, doc.file_name)}
                    </span>
                    Ouvrir
                  </FileOpenLink>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
