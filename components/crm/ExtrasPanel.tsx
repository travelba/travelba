"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { IssuesList } from "@/components/crm/IssuesList";
import { issuesFromResponse, type BookingIssue } from "@/lib/crm/booking-issues";
import {
  bookingHasFlight,
  extraAmount,
  extraFlightAt,
  extraHeadsFromBooking,
  extraNoticeOk,
  findExtra,
  formatCustomerAddress,
  returnStay,
  serviceOffers,
  type ExtraKind,
  type ExtraLeg,
  type ServiceOffer,
} from "@/lib/crm/extras";
import { formatDateFr, formatMoney } from "@/lib/crm/money";
import { BusyBar } from "@/components/crm/BusyBar";
import { Icon } from "@/components/crm/icons";
import type { CrmBooking, CrmBookingItem, CrmBookingTraveler, CrmCompanion, CrmCustomer } from "@/lib/crm/types";

export function ExtrasPanel({
  variant,
  booking,
  items,
  travelers,
  holder,
  companions,
  whatsappHref,
}: {
  variant: "admin" | "client";
  booking: CrmBooking;
  items: CrmBookingItem[];
  travelers: CrmBookingTraveler[];
  holder: CrmCustomer;
  companions: CrmCompanion[];
  whatsappHref?: string;
}) {
  const router = useRouter();
  const [address, setAddress] = useState(() => formatCustomerAddress(holder));
  const [returnAddress, setReturnAddress] = useState(() => returnStay(items)?.address || "");
  const [busy, setBusy] = useState<string | null>(null);
  const [issues, setIssues] = useState<BookingIssue[]>([]);
  const now = useMemo(() => new Date(), []);
  if (!bookingHasFlight(items)) return null;
  const headsAt = extraHeadsFromBooking({
    travelers,
    holder,
    companions,
    at: now,
  });
  const chauffeurPrice = extraAmount("chauffeur");
  const greeterPrice = extraAmount("greeter", headsAt.adults, headsAt.children);
  const isAdmin = variant === "admin";
  const offers = serviceOffers(items);
  const transfers = offers.filter((offer) => offer.kind === "chauffeur");
  const greeters = offers.filter((offer) => offer.kind === "greeter");
  const stay = returnStay(items);

  async function request(kind: ExtraKind, leg: ExtraLeg) {
    setBusy(`${kind}:${leg}`);
    setIssues([]);
    const url =
      variant === "admin"
        ? `/api/admin/bookings/${booking.id}/extras`
        : `/api/client/bookings/${booking.reference}/extras`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind,
        leg,
        address: kind === "chauffeur" && leg === "arrival" ? returnAddress : address,
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

  async function cancel(itemId: string) {
    if (variant !== "admin") return;
    setBusy(`cancel:${itemId}`);
    await fetch(`/api/admin/bookings/${booking.id}/items?itemId=${encodeURIComponent(itemId)}`, {
      method: "DELETE",
    });
    setBusy(null);
    router.refresh();
  }

  function card(offer: ServiceOffer) {
    const existing = findExtra(items, offer.kind, offer.leg) as CrmBookingItem | null;
    const at = extraFlightAt(items, offer.leg, booking.start_date || booking.end_date);
    const windowOk = extraNoticeOk(at, now);
    const locked = !isAdmin && !windowOk;
    const price =
      offer.kind === "chauffeur"
        ? formatMoney(chauffeurPrice, booking.currency)
        : formatMoney(greeterPrice, booking.currency);
    const dateLabel = offer.whenIso ? formatDateFr(String(offer.whenIso).slice(0, 10)) : "";
    return (
      <article
        key={`${offer.kind}-${offer.leg}`}
        className="rounded-2xl border border-[#e5e3dc] bg-[#faf9f6] p-4"
      >
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--admin-navy)] text-[var(--admin-gold)]">
            <Icon
              name={offer.kind === "chauffeur" ? "directions_car" : "verified_user"}
              className="h-5 w-5"
            />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-base font-bold text-[var(--admin-navy)]">{offer.title}</p>
            <p className="mt-0.5 text-sm font-semibold text-[var(--admin-navy)]">{offer.route}</p>
            {offer.kind === "chauffeur" && offer.airport ? (
              <p className="text-[13px] text-muted">Aéroport {offer.airport}</p>
            ) : null}
            {offer.flightLine ? (
              <p className="text-[13px] text-[var(--admin-navy)]">
                {offer.flightLine}
                {dateLabel && dateLabel !== "—" ? ` · ${dateLabel}` : ""}
              </p>
            ) : null}
            <p className="mt-2 text-sm font-semibold text-[var(--admin-navy)]">
              {price}
              <span className="font-normal text-muted"> · se rajoute à l’encours</span>
            </p>
            {offer.kind === "greeter" ? (
              <p className="mt-1 text-xs text-muted">
                {headsAt.adults} adulte{headsAt.adults > 1 ? "s" : ""} · {headsAt.children} enfant
                {headsAt.children > 1 ? "s" : ""}
                {headsAt.missingBirth
                  ? ` · ${headsAt.missingBirth} sans date de naissance (compté adulte)`
                  : ""}
              </p>
            ) : null}
            {locked ? (
              <p className="mt-2 text-xs text-accent">
                Disponible jusqu’à 48 h avant le vol.{" "}
                {whatsappHref ? (
                  <a href={whatsappHref} className="font-semibold underline" target="_blank" rel="noreferrer">
                    Contacter l’agence
                  </a>
                ) : null}
              </p>
            ) : null}
          </div>
        </div>
        <div className="mt-3 flex items-center justify-end gap-2">
          {existing ? (
            <>
              <span className="rounded-full bg-[var(--admin-gold)]/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--admin-navy)]">
                Validé
              </span>
              {isAdmin ? (
                <button
                  type="button"
                  className="text-xs font-semibold text-accent"
                  disabled={busy !== null}
                  onClick={() => void cancel(existing.id)}
                >
                  Annuler
                </button>
              ) : null}
            </>
          ) : (
            <button
              type="button"
              disabled={busy !== null || locked}
              onClick={() => {
                if (offer.kind === "chauffeur" && offer.leg === "arrival" && !returnAddress.trim()) {
                  setIssues([{ field: "address", message: "Indiquez l’adresse de retour." }]);
                  return;
                }
                void request(offer.kind, offer.leg);
              }}
              className="inline-flex h-10 items-center justify-center rounded-full bg-[var(--admin-navy)] px-5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy === `${offer.kind}:${offer.leg}` ? "…" : "Valider"}
            </button>
          )}
        </div>
        {busy === `${offer.kind}:${offer.leg}` || (existing && busy === `cancel:${existing.id}`) ? (
          <div className="mt-2">
            <BusyBar label={busy?.startsWith("cancel") ? "Annulation…" : "Validation…"} />
          </div>
        ) : null}
      </article>
    );
  }

  return (
    <section className="space-y-3">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">
          Services de l’agence
        </p>
        <h2 className="mt-1 font-display text-lg font-bold text-[var(--admin-navy)]">À la carte</h2>
        <p className="mt-1 text-sm text-muted">Une sélection des services à la carte</p>
      </div>
      {transfers.length ? (
        <div className="space-y-2">
          <div>
            <h3 className="font-display text-base font-bold text-[var(--admin-navy)]">Transfert</h3>
            <p className="mt-1 text-sm text-muted">
              Prise en charge 2 h 30 avant le départ du vol, jusqu’à l’aéroport.
            </p>
          </div>
          {transfers.map((offer) => (
            <div key={`${offer.kind}-${offer.leg}`} className="space-y-2">
              {offer.leg === "arrival" ? (
                <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
                  Adresse de retour (hôtel ou hébergement)
                  <input
                    value={returnAddress}
                    onChange={(event) => setReturnAddress(event.target.value)}
                    placeholder="Hôtel, adresse"
                    className="rounded-xl border border-[#e5e3dc] bg-white px-3 py-2 text-sm font-normal text-[var(--admin-navy)]"
                  />
                  {stay ? (
                    <span className="font-normal text-muted">Repris de la réservation : {stay.address}</span>
                  ) : (
                    <span className="font-normal text-muted">Aucune réservation d’hôtel sur ce voyage.</span>
                  )}
                </label>
              ) : (
                <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
                  Adresse de prise en charge
                  <input
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                    className="rounded-xl border border-[#e5e3dc] bg-white px-3 py-2 text-sm font-normal text-[var(--admin-navy)]"
                  />
                </label>
              )}
              {card(offer)}
            </div>
          ))}
        </div>
      ) : null}
      {greeters.length ? (
        <div className="space-y-2">
          <div>
            <h3 className="font-display text-base font-bold text-[var(--admin-navy)]">
              Accueil VIP et Fastpass à l’aéroport
            </h3>
            <p className="mt-1 text-sm text-muted">
              Accueil VIP et fastpass à l’aéroport d’arrivée, à l’heure d’atterrissage du vol.
            </p>
          </div>
          {greeters.map(card)}
        </div>
      ) : null}
      <IssuesList issues={issues} />
    </section>
  );
}
