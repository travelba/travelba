"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BusyBar } from "@/components/crm/BusyBar";
import { Icon } from "@/components/crm/icons";
import { IssuesList } from "@/components/crm/IssuesList";
import { issuesFromResponse, type BookingIssue } from "@/lib/crm/booking-issues";
import type { ServiceOffer } from "@/lib/crm/extras";
import { formatDateFr, formatMoney } from "@/lib/crm/money";
import type { CrmBookingItem } from "@/lib/crm/types";

export function ServiceOfferCard({
  offer,
  existing,
  variant,
  bookingId,
  reference,
  price,
  currency,
  locked,
  whatsappHref,
  addressLabel,
  initialAddress,
  detail,
}: {
  offer: ServiceOffer;
  existing: CrmBookingItem | null;
  variant: "admin" | "client";
  bookingId: string;
  reference: string;
  price: number;
  currency: string;
  locked: boolean;
  whatsappHref?: string;
  addressLabel?: string | null;
  initialAddress?: string | null;
  detail?: string | null;
}) {
  const router = useRouter();
  const [address, setAddress] = useState(initialAddress || "");
  const [busy, setBusy] = useState<"validate" | "cancel" | null>(null);
  const [issues, setIssues] = useState<BookingIssue[]>([]);
  const isAdmin = variant === "admin";
  const dateLabel = offer.whenIso ? formatDateFr(String(offer.whenIso).slice(0, 10)) : "";
  const kindLabel = offer.kind === "chauffeur" ? "Transfert" : "Greeter";

  async function request() {
    if (offer.kind === "chauffeur" && !address.trim()) {
      setIssues([{ field: "address", message: "Indiquez l’adresse." }]);
      return;
    }
    setBusy("validate");
    setIssues([]);
    const url =
      variant === "admin"
        ? `/api/admin/bookings/${bookingId}/extras`
        : `/api/client/bookings/${reference}/extras`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: offer.kind,
        leg: offer.leg,
        place: offer.place,
        address: offer.kind === "chauffeur" ? address : null,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setIssues(issuesFromResponse(json));
      return;
    }
    router.refresh();
  }

  async function cancel() {
    if (!existing || !isAdmin) return;
    setBusy("cancel");
    await fetch(`/api/admin/bookings/${bookingId}/items?itemId=${encodeURIComponent(existing.id)}`, {
      method: "DELETE",
    });
    setBusy(null);
    router.refresh();
  }

  return (
    <article
      className={
        existing
          ? "rounded-2xl border border-[#e5e3dc] bg-white p-3.5"
          : "rounded-2xl border border-dashed border-[var(--admin-gold)] bg-[#faf9f6] p-3.5"
      }
    >
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--admin-navy)] text-[var(--admin-gold)]">
          <Icon name={offer.kind === "chauffeur" ? "directions_car" : "verified_user"} className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--aura-blue)]">
            {kindLabel} · {offer.title}
          </p>
          <p className="break-words text-sm font-semibold leading-snug text-[var(--admin-navy)]">{offer.route}</p>
          {offer.flightLine ? (
            <p className="text-[13px] text-[var(--admin-navy)]">
              {offer.flightLine}
              {dateLabel && dateLabel !== "—" ? ` · ${dateLabel}` : ""}
            </p>
          ) : null}
          {detail ? <p className="mt-1 text-xs text-muted">{detail}</p> : null}
          <p className="mt-2 text-sm font-semibold text-[var(--admin-navy)]">
            {formatMoney(price, currency)}
            <span className="font-normal text-muted"> · se rajoute à l’encours</span>
          </p>
        </div>
        <span
          className={
            existing
              ? "shrink-0 rounded-full bg-[var(--admin-gold)]/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--admin-navy)]"
              : "shrink-0 rounded-full border border-dashed border-[var(--admin-gold)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--admin-navy)]"
          }
        >
          {existing ? "Validé" : "Non validé"}
        </span>
      </div>
      {!existing && addressLabel ? (
        <label className="mt-3 flex flex-col gap-1 text-xs font-semibold text-muted">
          {addressLabel}
          <input
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            className="rounded-xl border border-[#e5e3dc] bg-white px-3 py-2 text-sm font-normal text-[var(--admin-navy)]"
          />
        </label>
      ) : null}
      {existing && offer.kind === "chauffeur" && existing.details?.pickup ? (
        <p className="mt-2 text-xs text-muted">{String(existing.details.pickup)}</p>
      ) : null}
      {locked && !existing ? (
        <p className="mt-2 text-xs text-accent">
          Disponible jusqu’à 48 h avant le vol.{" "}
          {whatsappHref ? (
            <a href={whatsappHref} className="font-semibold underline" target="_blank" rel="noreferrer">
              Contacter l’agence
            </a>
          ) : null}
        </p>
      ) : null}
      <div className="mt-3 flex items-center justify-end gap-2">
        {existing ? (
          isAdmin ? (
            <button
              type="button"
              className="text-xs font-semibold text-accent"
              disabled={busy !== null}
              onClick={() => void cancel()}
            >
              Annuler
            </button>
          ) : null
        ) : (
          <button
            type="button"
            disabled={busy !== null || locked}
            onClick={() => void request()}
            className="inline-flex h-10 items-center justify-center rounded-full bg-[var(--admin-navy)] px-5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy === "validate" ? "…" : "Valider"}
          </button>
        )}
      </div>
      {busy ? (
        <div className="mt-2">
          <BusyBar label={busy === "cancel" ? "Annulation…" : "Validation…"} />
        </div>
      ) : null}
      <IssuesList issues={issues} />
    </article>
  );
}
