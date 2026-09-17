"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DOC_TYPE_LABELS,
  type CrmBookingTraveler,
  type CrmTravelDocument,
} from "@/lib/crm/types";
import { countryName } from "@/lib/crm/countries";
import { documentExpiryStatus } from "@/lib/crm/identity";
import { formatDateFr } from "@/lib/crm/money";
import {
  primaryIdentityDoc,
  reusableDocumentsForTraveler,
  travelerDisplayName,
  travelerInitials,
  tripDocumentsForTraveler,
} from "@/lib/crm/trip-documents";
import { IdentityScan, ScanStatus, type ScanResult } from "@/components/crm/IdentityScan";
import { FileOpenLink, fileKindIcon } from "@/components/crm/FileOpen";
import { StatusChip } from "@/components/crm/ui";

export function TripTravelerPassports({
  variant,
  customerId,
  bookingId,
  travelers,
  tripDocs,
  reusableDocs,
}: {
  variant: "admin" | "client";
  customerId: string;
  bookingId: string;
  travelers: CrmBookingTraveler[];
  tripDocs: CrmTravelDocument[];
  reusableDocs: CrmTravelDocument[];
}) {
  if (!travelers.length) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--admin-gold)]/50 bg-[var(--admin-peach)]/50 px-4 py-6 text-center">
        <span className="material-symbols-outlined text-[28px] text-[var(--admin-gold)]">
          badge
        </span>
        <p className="mt-2 font-display text-sm font-bold text-[var(--admin-navy)]">
          Aucun voyageur sur ce séjour
        </p>
        <p className="mt-1 text-sm text-muted">
          {variant === "admin"
            ? "Ajoutez les personnes du dossier, puis joignez le passeport de chacune pour ce voyage."
            : "Votre conseiller indiquera les voyageurs. Vous déposerez alors chaque pièce ici, pour ce séjour."}
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {travelers.map((traveler) => (
        <li key={traveler.id}>
          <TravelerPassportCard
            variant={variant}
            customerId={customerId}
            bookingId={bookingId}
            traveler={traveler}
            attached={tripDocumentsForTraveler(tripDocs, traveler)}
            reusable={reusableDocumentsForTraveler(reusableDocs, traveler)}
          />
        </li>
      ))}
    </ul>
  );
}

function TravelerPassportCard({
  variant,
  customerId,
  bookingId,
  traveler,
  attached,
  reusable,
}: {
  variant: "admin" | "client";
  customerId: string;
  bookingId: string;
  traveler: CrmBookingTraveler;
  attached: CrmTravelDocument[];
  reusable: CrmTravelDocument[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [replacing, setReplacing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const current = primaryIdentityDoc(attached);
  const previous = primaryIdentityDoc(reusable);
  const status = current ? documentExpiryStatus(current.expires_on) : null;
  const showDrop = !current || replacing;
  const endpoint = variant === "admin" ? "/api/admin/travel-documents" : "/api/client/documents";
  const scanEndpoint =
    variant === "admin" ? "/api/admin/travel-documents/scan" : "/api/client/documents/scan";

  async function post(body: FormData) {
    setBusy(true);
    setError(null);
    body.set("customer_id", customerId);
    body.set("booking_id", bookingId);
    body.set("traveler_id", traveler.id);
    if (traveler.companion_id) body.set("companion_id", traveler.companion_id);
    const res = await fetch(endpoint, { method: "POST", body });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error || "Enregistrement impossible");
      return;
    }
    setScan(null);
    setReplacing(false);
    router.refresh();
  }

  async function reuse() {
    if (!previous) return;
    const body = new FormData();
    body.set("source_id", previous.id);
    await post(body);
  }

  async function saveScan() {
    if (!scan?.file) return;
    const body = new FormData();
    body.set("file", scan.file);
    body.set("doc_type", scan.identity?.doc_type || "passport");
    body.set("number", scan.identity?.number || "");
    body.set("issuing_country", scan.identity?.issuing_country || "");
    body.set("expires_on", scan.identity?.expires_on || "");
    body.set("first_name", scan.identity?.first_name || "");
    body.set("last_name", scan.identity?.last_name || "");
    body.set("birth_date", scan.identity?.birth_date || "");
    body.set("nationality", scan.identity?.nationality || "");
    body.set("sex", scan.identity?.sex || "");
    body.set("apply_identity", traveler.is_account_holder || traveler.companion_id ? "1" : "0");
    await post(body);
  }

  async function attachFile(file: File | undefined) {
    if (!file) return;
    const body = new FormData();
    body.set("file", file);
    body.set("doc_type", "passport");
    await post(body);
  }

  return (
    <article
      className={
        current
          ? "rounded-2xl border border-[#e5e3dc] bg-white p-4"
          : "rounded-2xl border border-dashed border-[var(--admin-gold)]/70 bg-[var(--admin-peach)]/40 p-4"
      }
    >
      <div className="flex items-start gap-3">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--admin-navy)] font-display text-sm font-bold text-[var(--admin-gold)]">
          {travelerInitials(traveler)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-display text-base font-bold text-[var(--admin-navy)]">
                {travelerDisplayName(traveler)}
              </p>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                {traveler.is_account_holder ? "Titulaire" : "Voyageur"} · pièce de ce séjour
              </p>
            </div>
            {current && status ? (
              <StatusChip tone={status.tone}>{status.label}</StatusChip>
            ) : (
              <StatusChip tone="amber">À joindre</StatusChip>
            )}
          </div>
        </div>
      </div>

      {current ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--admin-sky)] px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--admin-navy)]">
              {DOC_TYPE_LABELS[current.doc_type]} {current.number || ""}
            </p>
            <p className="text-xs text-muted">
              Joint à ce voyage
              {current.expires_on ? ` · exp. ${formatDateFr(current.expires_on)}` : ""}
              {current.issuing_country ? ` · ${countryName(current.issuing_country)}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {current.storage_path ? (
              <FileOpenLink
                path={current.storage_path}
                className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[var(--admin-navy)] ring-1 ring-[#e5e3dc]"
              >
                <span className="material-symbols-outlined text-[16px]">
                  {fileKindIcon(current.mime_type, current.file_name)}
                </span>
                Ouvrir
              </FileOpenLink>
            ) : null}
            <button
              type="button"
              onClick={() => setReplacing((value) => !value)}
              className="rounded-full px-3 py-1.5 text-xs font-semibold text-[var(--admin-navy)] underline-offset-2 hover:underline"
            >
              {replacing ? "Annuler" : "Remplacer"}
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">
          Photographiez ou déposez le passeport utilisé pour {travelerDisplayName(traveler)}{" "}
          sur ce séjour.
        </p>
      )}

      {showDrop ? (
        <div className="mt-3 space-y-3">
          <IdentityScan
            compact
            endpoint={scanEndpoint}
            title="Page d’identité"
            onResult={setScan}
          />
          {scan ? <ScanStatus identity={scan.identity} warning={scan.warning} /> : null}
          <div className="flex flex-wrap gap-2">
            {scan?.file ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveScan()}
                className="rounded-full bg-[var(--admin-navy)] px-4 py-2 text-sm font-semibold text-white"
              >
                {busy ? "Enregistrement…" : "Joindre à ce voyage"}
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="rounded-full bg-white px-3.5 py-2 text-xs font-semibold text-[var(--admin-navy)] ring-1 ring-[#e5e3dc]"
            >
              Déposer un fichier
            </button>
            {!current && previous ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void reuse()}
                className="rounded-full bg-[var(--admin-peach)] px-3.5 py-2 text-xs font-semibold text-[var(--admin-navy)]"
              >
                Reprendre {DOC_TYPE_LABELS[previous.doc_type]} {previous.number || ""}
              </button>
            ) : null}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,.pdf,application/pdf"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              void attachFile(file);
            }}
          />
        </div>
      ) : null}
      {error ? <p className="mt-2 text-sm text-accent">{error}</p> : null}
    </article>
  );
}
