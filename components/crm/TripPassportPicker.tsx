"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CrmBookingTraveler, CrmTravelDocument } from "@/lib/crm/types";
import { DOC_TYPE_LABELS } from "@/lib/crm/types";
import {
  reusableDocumentsForTraveler,
  travelerDisplayName,
  tripDocumentsForTraveler,
} from "@/lib/crm/trip-documents";
import { formatDateFr } from "@/lib/crm/money";

function isSameDoc(a: CrmTravelDocument, b: CrmTravelDocument) {
  if (a.storage_path && b.storage_path && a.storage_path === b.storage_path) return true;
  return Boolean(a.number && a.number === b.number && a.doc_type === b.doc_type);
}

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
    if (existing && !isSameDoc(existing, source) && pending !== key) {
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

  return (
    <section className="space-y-3 rounded-2xl border border-[#e5e3dc] bg-white p-4">
      <div>
        <p className="font-display text-base font-bold text-[var(--admin-navy)]">
          Passeport pour ce séjour
        </p>
        <p className="mt-1 text-sm text-muted">
          Cochez la pièce utilisée pour chaque voyageur. Le coffre n’est pas modifié.
        </p>
      </div>
      {warn ? <p className="rounded-xl bg-[var(--admin-peach)] px-3 py-2 text-sm">{warn}</p> : null}
      {error ? <p className="text-sm text-accent">{error}</p> : null}
      <ul className="space-y-4">
        {travelers.map((traveler) => {
          const tripDocs = tripDocumentsForTraveler(documents, traveler);
          const attached = tripDocs[0] || null;
          const choices = reusableDocumentsForTraveler(documents, traveler);
          return (
            <li key={traveler.id} className="space-y-2">
              <p className="text-sm font-semibold text-[var(--admin-navy)]">
                {travelerDisplayName(traveler)}
                {traveler.is_account_holder ? " · titulaire" : ""}
              </p>
              {!choices.length && !attached ? (
                <p className="text-xs text-muted">Aucune pièce dans le coffre pour cette personne.</p>
              ) : null}
              {choices.map((doc) => {
                const actuallyChecked = tripDocs.some((row) => isSameDoc(row, doc));
                return (
                  <label key={doc.id} className="flex items-start gap-2 text-sm">
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
                      className="mt-1"
                    />
                    <span>
                      {DOC_TYPE_LABELS[doc.doc_type]} {doc.number || ""}
                      {doc.expires_on ? ` · exp. ${formatDateFr(doc.expires_on)}` : ""}
                    </span>
                  </label>
                );
              })}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
