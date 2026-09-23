"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileOpenLink } from "@/components/crm/FileOpen";
import { BusyBar } from "@/components/crm/BusyBar";
import { travelerDisplayName, tripDocumentsForTraveler } from "@/lib/crm/trip-documents";
import type { CrmBookingTraveler, CrmTravelDocument } from "@/lib/crm/types";

const MAX_BYTES = 15 * 1024 * 1024;

export function TripVisaUploads({
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
  const endpoint = variant === "admin" ? "/api/admin/travel-documents" : "/api/client/documents";

  async function upload(traveler: CrmBookingTraveler, file: File) {
    if (file.size > MAX_BYTES) {
      setError("Fichier trop lourd (15 Mo maximum).");
      return;
    }
    setBusyId(traveler.id);
    setError(null);
    const form = new FormData();
    if (customerId) form.set("customer_id", customerId);
    form.set("doc_type", "visa");
    form.set("booking_id", bookingId);
    form.set("traveler_id", traveler.id);
    if (traveler.companion_id) form.set("companion_id", traveler.companion_id);
    form.set("apply_identity", "0");
    form.set("file", file);
    const res = await fetch(endpoint, { method: "POST", body: form });
    const json = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok) {
      setError(json.error || "Envoi impossible");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-2 border-t border-[#e5e3dc] pt-3">
      <p className="text-sm font-semibold text-[var(--admin-navy)]">Visa de chaque voyageur</p>
      {!travelers.length ? (
        <p className="text-sm text-muted">Ajoutez les voyageurs du séjour pour déposer chaque visa.</p>
      ) : (
        <ul className="space-y-3">
          {travelers.map((traveler) => {
            const visa =
              tripDocumentsForTraveler(documents, traveler).find((doc) => doc.doc_type === "visa") || null;
            return (
              <li key={traveler.id} className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--admin-navy)]">
                    {travelerDisplayName(traveler)}
                  </p>
                  {visa?.storage_path ? (
                    <FileOpenLink
                      path={visa.storage_path}
                      className="text-xs font-semibold text-[var(--aura-blue)]"
                    >
                      {visa.file_name || "Voir le visa"}
                    </FileOpenLink>
                  ) : (
                    <p className="text-xs text-muted">Aucun visa déposé</p>
                  )}
                </div>
                <label className="cursor-pointer rounded-full bg-[var(--admin-navy)] px-3 py-1.5 text-xs font-semibold text-white">
                  {busyId === traveler.id ? "…" : visa ? "Remplacer" : "Déposer"}
                  <input
                    type="file"
                    accept="image/*,application/pdf,.pdf"
                    className="sr-only"
                    disabled={busyId !== null}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) void upload(traveler, file);
                    }}
                  />
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {error ? <p className="text-sm text-accent">{error}</p> : null}
      <BusyBar active={busyId !== null} label="Envoi du visa…" />
    </div>
  );
}
