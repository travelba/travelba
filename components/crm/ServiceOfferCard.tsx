"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BusyBar } from "@/components/crm/BusyBar";
import { Icon } from "@/components/crm/icons";
import { IssuesList } from "@/components/crm/IssuesList";
import { issuesFromResponse, type BookingIssue } from "@/lib/crm/booking-issues";
import { kindIcon } from "@/lib/crm/carnet";
import { serviceClock, type ServiceOffer } from "@/lib/crm/extras";
import { formatMoney } from "@/lib/crm/money";
import { BOOKING_ITEM_LABELS, type CrmBookingItem } from "@/lib/crm/types";

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
  const [gone, setGone] = useState(false);
  const [issues, setIssues] = useState<BookingIssue[]>([]);
  const isAdmin = variant === "admin";
  const clock = serviceClock(offer.whenIso);
  const kindLabel = BOOKING_ITEM_LABELS[offer.kind];
  const pickup =
    existing && offer.kind === "chauffeur" && existing.details?.pickup
      ? String(existing.details.pickup)
      : "";
  const subtitle = [
    existing ? "Validé" : locked ? "Jusqu’à 48 h avant le vol" : "Non validé",
    detail,
    pickup,
    offer.flightLine,
  ]
    .filter(Boolean)
    .join(" · ");
  const priceLabel = formatMoney(price, currency);

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

  async function refuse() {
    if (busy || existing || isAdmin) return;
    setGone(true);
    setIssues([]);
    const url = `/api/client/bookings/${reference}/extras`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decline: true,
        kind: offer.kind,
        leg: offer.leg,
        place: offer.place,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setGone(false);
      setIssues(issuesFromResponse(json));
      return;
    }
    router.refresh();
  }

  function controls() {
    const refuseButton =
      !existing && !isAdmin ? (
        <button
          type="button"
          onClick={() => void refuse()}
          className="inline-flex h-5 items-center text-[11px] font-semibold leading-none text-muted"
        >
          Refuser
        </button>
      ) : null;
    const primary = action();
    if (!refuseButton && !primary) return null;
    return (
      <span className="inline-flex items-center gap-2">
        {refuseButton}
        {primary}
      </span>
    );
  }

  function action() {
    if (existing) {
      if (!isAdmin) return null;
      return (
        <button
          type="button"
          className="text-xs font-semibold text-accent"
          disabled={busy !== null}
          onClick={() => void cancel()}
        >
          Annuler
        </button>
      );
    }
    if (locked) {
      if (!whatsappHref) return null;
      return (
        <a
          href={whatsappHref}
          className="text-xs font-semibold text-[var(--admin-navy)] underline"
          target="_blank"
          rel="noreferrer"
        >
          WhatsApp
        </a>
      );
    }
    return (
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => void request()}
        className="inline-flex h-5 items-center justify-center rounded-full bg-[var(--admin-navy)] px-2.5 text-[11px] font-semibold leading-none text-white disabled:opacity-50"
      >
        {busy === "validate" ? "…" : "Valider"}
      </button>
    );
  }

  if (gone) return null;

  return (
    <article
      className={
        existing
          ? "w-full min-w-0 overflow-hidden rounded-2xl border border-[#e5e3dc] bg-white"
          : "w-full min-w-0 overflow-hidden rounded-2xl border border-dashed border-[var(--admin-gold)] bg-[#faf9f6]"
      }
    >
      <div className="flex min-w-0 items-start gap-3 overflow-hidden px-3.5 py-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--admin-peach)] text-[var(--admin-navy)]">
          <Icon name={kindIcon(offer.kind)} className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1 overflow-hidden">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--aura-blue)]">
            {kindLabel}
            {clock ? ` · ${clock}` : ""}
          </p>
          <p className="break-words text-sm font-semibold leading-snug text-[var(--admin-navy)]">{offer.route}</p>
          <p className="flex min-w-0 items-center gap-1 text-xs text-muted" title={subtitle}>
            <span className="shrink-0">{existing ? "Validé" : locked ? "48 h" : "Non validé"}</span>
            {!existing && addressLabel ? (
              <input
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                aria-label={addressLabel}
                placeholder={addressLabel}
                className="min-w-0 flex-1 truncate border-0 bg-transparent p-0 text-xs text-muted outline-none placeholder:text-muted"
              />
            ) : (
              <span className="truncate">{[pickup, detail, offer.flightLine].filter(Boolean).join(" · ")}</span>
            )}
          </p>
          <p className="mt-1 flex items-center justify-between gap-2 sm:hidden">
            <span className="text-sm font-bold text-[var(--admin-navy)]">{priceLabel}</span>
            {controls()}
          </p>
        </div>
        <div className="hidden shrink-0 items-start gap-2 sm:flex">
          <p className="max-w-[7.5rem] text-right text-sm font-bold leading-snug text-[var(--admin-navy)]">{priceLabel}</p>
          {controls()}
        </div>
      </div>
      {busy ? (
        <div className="px-3.5 pb-3">
          <BusyBar label={busy === "cancel" ? "Annulation…" : "Validation…"} />
        </div>
      ) : null}
      {issues.length ? (
        <div className="px-3.5 pb-3">
          <IssuesList issues={issues} />
        </div>
      ) : null}
    </article>
  );
}
