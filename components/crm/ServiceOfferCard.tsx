"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AddressSuggest } from "@/components/crm/AddressSuggest";
import { BusyBar } from "@/components/crm/BusyBar";
import { Icon } from "@/components/crm/icons";
import { IssuesList } from "@/components/crm/IssuesList";
import { issuesFromResponse, type BookingIssue } from "@/lib/crm/booking-issues";
import { HIDDEN_PRICE_LABEL, kindIcon } from "@/lib/crm/carnet";
import { addressCity } from "@/lib/crm/address-suggest";
import { extraAgencyStatus, serviceClock, storedTransferAddresses, type ServiceOffer } from "@/lib/crm/extras";
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
  homeAddress,
  detail,
  pricesVisible = true,
}: {
  offer: ServiceOffer;
  existing: CrmBookingItem | null;
  variant: "admin" | "client";
  bookingId: string;
  reference: string;
  price: number;
  currency: string;
  locked: boolean;
  homeAddress?: string | null;
  detail?: string | null;
  pricesVisible?: boolean;
}) {
  const router = useRouter();
  const saved =
    offer.kind === "chauffeur" ? storedTransferAddresses(offer, homeAddress, existing?.details) : { depart: "", arrive: "" };
  const [depart, setDepart] = useState(saved.depart);
  const [arrive, setArrive] = useState(saved.arrive);
  const [busy, setBusy] = useState<"validate" | "cancel" | "confirm" | "save" | null>(null);
  const [gone, setGone] = useState(false);
  const [issues, setIssues] = useState<BookingIssue[]>([]);
  const isAdmin = variant === "admin";
  const clock = serviceClock(offer.whenIso);
  const kindLabel = BOOKING_ITEM_LABELS[offer.kind];
  const confirmed = existing ? extraAgencyStatus(existing) === "confirmed" : false;
  const addressesDirty = depart.trim() !== saved.depart || arrive.trim() !== saved.arrive;
  const statusLabel = !existing
    ? locked
      ? "Jusqu’à 48 h avant le vol"
      : "Non validé"
    : confirmed
      ? "Confirmé"
      : "En attente de confirmation";
  const priceLabel = pricesVisible ? formatMoney(price, currency) : HIDDEN_PRICE_LABEL;

  function addressBody(addresses = false) {
    return {
      kind: offer.kind,
      leg: offer.leg,
      place: offer.place,
      moment: offer.moment,
      depart: offer.kind === "chauffeur" ? depart.trim() : null,
      arrive: offer.kind === "chauffeur" ? arrive.trim() : null,
      address: offer.kind === "chauffeur" ? depart.trim() : null,
      addresses,
    };
  }

  async function request() {
    if (offer.kind === "chauffeur" && (!depart.trim() || !arrive.trim())) {
      setIssues([{ field: "address", message: "Indiquez l’adresse de départ et l’adresse d’arrivée." }]);
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
      body: JSON.stringify(addressBody()),
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
    if (!existing || busy || confirmed) return;
    setBusy("cancel");
    setIssues([]);
    const res = await fetch(
      isAdmin ? `/api/admin/bookings/${bookingId}/extras` : `/api/client/bookings/${reference}/extras`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cancel: true,
          kind: offer.kind,
          leg: offer.leg,
          place: offer.place,
          moment: offer.moment,
        }),
      }
    );
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setIssues(issuesFromResponse(json));
      return;
    }
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
        moment: offer.moment,
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

  async function saveAddresses() {
    if (!existing || busy || confirmed || offer.kind !== "chauffeur") return;
    if (!depart.trim() || !arrive.trim()) {
      setIssues([{ field: "address", message: "Indiquez l’adresse de départ et l’adresse d’arrivée." }]);
      return;
    }
    setBusy("save");
    setIssues([]);
    const res = await fetch(
      isAdmin ? `/api/admin/bookings/${bookingId}/extras` : `/api/client/bookings/${reference}/extras`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addressBody(true)),
      }
    );
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setIssues(issuesFromResponse(json));
      return;
    }
    router.refresh();
  }

  async function confirm() {
    if (!existing || !isAdmin || busy || confirmed) return;
    setBusy("confirm");
    setIssues([]);
    const res = await fetch(`/api/admin/bookings/${bookingId}/extras`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        confirm: true,
        kind: offer.kind,
        leg: offer.leg,
        place: offer.place,
        moment: offer.moment,
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
      if (confirmed) return null;
      return (
        <span className="inline-flex items-center gap-2">
          {offer.kind === "chauffeur" && addressesDirty ? (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void saveAddresses()}
              className="inline-flex h-5 items-center justify-center rounded-full bg-[var(--admin-navy)] px-2.5 text-[11px] font-semibold leading-none text-white disabled:opacity-50"
            >
              {busy === "save" ? "…" : "Enregistrer"}
            </button>
          ) : null}
          {isAdmin ? (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void confirm()}
              className="inline-flex h-5 items-center justify-center rounded-full bg-[var(--admin-navy)] px-2.5 text-[11px] font-semibold leading-none text-white disabled:opacity-50"
            >
              {busy === "confirm" ? "…" : "Confirmer"}
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void cancel()}
            className="inline-flex h-5 items-center justify-center rounded-full bg-[var(--admin-navy)] px-2.5 text-[11px] font-semibold leading-none text-white disabled:opacity-50"
          >
            {busy === "cancel" ? "…" : "Annuler"}
          </button>
        </span>
      );
    }
    if (locked) return null;
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
          ? "w-full min-w-0 rounded-2xl border border-[#e5e3dc] bg-white"
          : "w-full min-w-0 rounded-2xl border border-dashed border-[var(--admin-gold)] bg-[#faf9f6]"
      }
    >
      <div className="flex min-w-0 items-start gap-3 px-3.5 py-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--admin-peach)] text-[var(--admin-navy)]">
          <Icon name={kindIcon(offer.kind)} className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--admin-gold)]">
            {statusLabel}
          </p>
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--aura-blue)]">
            {kindLabel}
            {clock ? ` · ${clock}` : ""}
          </p>
          <p className="break-words text-sm font-semibold leading-snug text-[var(--admin-navy)]">{offer.route}</p>
          {offer.kind === "chauffeur" ? null : (
            <p className="truncate text-xs text-muted">{[detail, offer.flightLine].filter(Boolean).join(" · ")}</p>
          )}
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
      {offer.kind === "chauffeur" ? (
        <div className="grid gap-2 px-3.5 pb-3">
          <AddressSuggest
            label="Départ"
            value={depart}
            onChange={setDepart}
            readOnly={confirmed}
            near={addressCity(saved.depart) || addressCity(homeAddress)}
          />
          <AddressSuggest
            label="Arrivée"
            value={arrive}
            onChange={setArrive}
            readOnly={confirmed}
            near={addressCity(saved.arrive) || addressCity(offer.airport)}
          />
          {offer.flightLine ? <p className="text-xs text-muted">{offer.flightLine}</p> : null}
        </div>
      ) : null}
      {busy ? (
        <div className="px-3.5 pb-3">
          <BusyBar
            label={
              busy === "cancel"
                ? "Annulation…"
                : busy === "confirm"
                  ? "Confirmation…"
                  : busy === "save"
                    ? "Enregistrement…"
                    : "Validation…"
            }
          />
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
