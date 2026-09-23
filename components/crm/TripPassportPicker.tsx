"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CrmBookingTraveler, CrmTravelDocument } from "@/lib/crm/types";
import { DOC_TYPE_LABELS } from "@/lib/crm/types";
import {
  isSameDocumentPiece,
  reusableDocumentsForTraveler,
  travelerDisplayName,
  tripDocumentsForTraveler,
} from "@/lib/crm/trip-documents";
import { formatDateFr } from "@/lib/crm/money";

export function TripPassportPicker({
  variant,
  customerId,
  bookingId,
  travelers,
  documents,
}: {
  variant: "admin" | "client";
  customerId?: string;
  bookingId: string;
  travelers: CrmBookingTraveler[];
  documents: CrmTravelDocument[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const endpoint = variant === "admin" ? "/api/admin/travel-documents" : "/api/client/documents";

  async function attach(traveler: CrmBookingTraveler, source: CrmTravelDocument) {
    const existing = tripDocumentsForTraveler(documents, traveler)[0];
    const key = `${traveler.id}-${source.id}`;
    if (existing && !isSameDocumentPiece(existing, source) && pending !== key) {
      setPending(key);
      setWarn(
        `Une pièce est déjà cochée pour ${travelerDisplayName(traveler)}. Recochez pour la remplacer.`
      );
      return;
    }
    setBusyId(key);
    setError(null);
    setWarn(null);
    setPending(null);
    const form = new FormData();
    if (customerId) form.set("customer_id", customerId);
    form.set("source_id", source.id);
    form.set("booking_id", bookingId);
    form.set("traveler_id", traveler.id);
    if (traveler.companion_id) form.set("companion_id", traveler.companion_id);
    const res = await fetch(endpoint, { method: "POST", body: form });
    const json = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok) {
      setError(json.error || "Enregistrement impossible");
      return;
    }
    router.refresh();
  }

  async function detach(docId: string) {
    setBusyId(docId);
    setError(null);
    setWarn(null);
    setPending(null);
    const res = await fetch(`${endpoint}?id=${docId}`, { method: "DELETE" });
    setBusyId(null);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error || "Suppression impossible");
      return;
    }
    router.refresh();
  }

  if (!travelers.length) return null;

  const compact = variant === "client";

  return (
    <section
      id="passeport"
      className={`rounded-2xl border border-[#e5e3dc] bg-white ${compact ? "space-y-2 p-3" : "space-y-3 p-4"}`}
    >
      <p className={compact ? "text-sm font-semibold text-[var(--admin-navy)]" : "font-display text-base font-bold text-[var(--admin-navy)]"}>
        Passeport pour ce séjour
      </p>
      {compact ? null : (
        <p className="text-sm text-muted">
          Cochez la pièce utilisée pour chaque voyageur. Le coffre n’est pas modifié.
        </p>
      )}
      {warn ? <p className="rounded-xl bg-[var(--admin-peach)] px-3 py-2 text-sm">{warn}</p> : null}
      {error ? <p className="text-sm text-accent">{error}</p> : null}
      <ul className="space-y-2">
        {travelers.map((traveler) => {
          const tripDocs = tripDocumentsForTraveler(documents, traveler);
          const attached = tripDocs[0] || null;
          const choices = reusableDocumentsForTraveler(documents, traveler);
          const name = travelerDisplayName(traveler);
          return (
            <li key={traveler.id} className="space-y-1">
              {choices.length === 0 ? (
                compact ? (
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-semibold text-[var(--admin-navy)]">{name}</p>
                    <p className="shrink-0 text-xs text-muted">Aucune pièce</p>
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-[var(--admin-navy)]">
                      {name}
                      {traveler.is_account_holder ? " · titulaire" : ""}
                    </p>
                    <p className="text-xs text-muted">Aucune pièce dans le coffre pour cette personne.</p>
                  </>
                )
              ) : (
                choices.map((doc, index) => {
                  const actuallyChecked = tripDocs.some((row) => isSameDocumentPiece(row, doc));
                  const label = [
                    DOC_TYPE_LABELS[doc.doc_type],
                    doc.number,
                    doc.expires_on ? `exp. ${formatDateFr(doc.expires_on)}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <label key={doc.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={actuallyChecked}
                        disabled={busyId != null}
                        onChange={(event) => {
                          if (event.target.checked) {
                            void attach(traveler, doc);
                          } else if (attached) {
                            void detach(attached.id);
                          }
                        }}
                      />
                      <span className="min-w-0 flex-1 truncate font-semibold text-[var(--admin-navy)]">
                        {index === 0
                          ? `${name}${!compact && traveler.is_account_holder ? " · titulaire" : ""}`
                          : ""}
                      </span>
                      <span className="shrink-0 text-xs text-muted">{label}</span>
                    </label>
                  );
                })
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
