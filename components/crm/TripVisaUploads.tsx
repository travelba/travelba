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
  bookingId,
  reference,
  travelers,
  documents,
  entries,
}: {
  variant: "admin" | "client";
  bookingId: string;
  reference?: string;
  travelers: CrmBookingTraveler[];
  documents: CrmTravelDocument[];
  entries: { iso: string; name: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const endpoint =
    variant === "admin"
      ? `/api/admin/bookings/${bookingId}/visas`
      : `/api/client/bookings/${reference}/visas`;

  async function upload(files: File[]) {
    const tooLarge = files.find((file) => file.size > MAX_BYTES);
    if (tooLarge) {
      setErrors(["Fichier trop lourd (15 Mo maximum)."]);
      return;
    }
    setBusy(true);
    setErrors([]);
    const form = new FormData();
    for (const file of files) form.append("file", file);
    const res = await fetch(endpoint, { method: "POST", body: form });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    const messages = Array.isArray(json.errors) ? json.errors.filter((row: unknown) => typeof row === "string") : [];
    if (!res.ok) {
      setErrors([json.error || "Envoi impossible"]);
      return;
    }
    if (messages.length) setErrors(messages);
    if (json.saved) router.refresh();
  }

  return (
    <div className="space-y-3 border-t border-[#e5e3dc] pt-3">
      <div>
        <p className="text-sm font-semibold text-[var(--admin-navy)]">Visas reçus</p>
        <p className="text-xs text-muted">
          Déposez un ou plusieurs visas, même ceux arrivés par e-mail. Nous les attribuons au voyageur.
        </p>
      </div>
      <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--admin-gold)] bg-[#faf9f6] px-4 py-5 text-center">
        <span className="text-sm font-semibold text-[var(--admin-navy)]">
          {busy ? "Lecture…" : "Déposer les visas"}
        </span>
        <span className="mt-1 text-xs text-muted">PDF ou photo, plusieurs fichiers possibles</span>
        <input
          type="file"
          accept="image/*,application/pdf,.pdf"
          multiple
          className="sr-only"
          disabled={busy || !travelers.length}
          onChange={(event) => {
            const files = [...(event.target.files || [])];
            event.target.value = "";
            if (files.length) void upload(files);
          }}
        />
      </label>
      {!travelers.length ? (
        <p className="text-sm text-muted">Ajoutez les voyageurs du séjour pour déposer les visas.</p>
      ) : (
        <ul className="space-y-3">
          {travelers.map((traveler) => {
            const visas = tripDocumentsForTraveler(documents, traveler).filter((doc) => doc.doc_type === "visa");
            return (
              <li key={traveler.id}>
                <p className="text-sm font-semibold text-[var(--admin-navy)]">{travelerDisplayName(traveler)}</p>
                <ul className="mt-1 space-y-1">
                  {entries.map((entry) => {
                    const matched = visas.filter((doc) => doc.issuing_country === entry.iso);
                    return (
                      <li key={entry.iso} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="text-muted">{entry.name}</span>
                        {matched.length ? (
                          <span className="inline-flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-[var(--admin-navy)]">Validé</span>
                            {matched.map((doc) =>
                              doc.storage_path ? (
                                <FileOpenLink
                                  key={doc.id}
                                  path={doc.storage_path}
                                  className="font-semibold text-[var(--aura-blue)]"
                                >
                                  {doc.file_name || "Voir le visa"}
                                </FileOpenLink>
                              ) : null
                            )}
                          </span>
                        ) : (
                          <span className="text-muted">En attente</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
      {errors.length ? (
        <ul className="space-y-1">
          {errors.map((error) => (
            <li key={error} className="text-sm text-accent">
              {error}
            </li>
          ))}
        </ul>
      ) : null}
      <BusyBar active={busy} label="Lecture des visas…" />
    </div>
  );
}
